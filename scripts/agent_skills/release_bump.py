#!/usr/bin/env python3
"""Compiled release-bump harness for image-scoring-gallery (Driftara Gallery).

Deterministic steps for /release and changelog-commit-push:
  - read package.json version + CHANGELOG Unreleased
  - compute next semver (majority rule or --level)
  - report git branch (needs_human_confirm_branch when not main/master)
  - optionally rewrite package.json + CHANGELOG.md

LLM judgment stays outside: only needed when Unreleased is empty/ambiguous.
Commit/push stay human-gated. Never commit/push/tag from this script.

Usage (repo root):
  python scripts/agent_skills/release_bump.py inspect
  python scripts/agent_skills/release_bump.py plan [--level major|minor|patch]
  python scripts/agent_skills/release_bump.py apply --level patch
  python scripts/agent_skills/release_bump.py apply --level minor --date 2026-07-26
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PACKAGE_PATH = ROOT / "package.json"
CHANGELOG_PATH = ROOT / "CHANGELOG.md"

SECTION_RE = re.compile(
    r"^## \[([^\]]+)\](?:\s*[-—]\s*(\d{4}-\d{2}-\d{2}))?\s*$", re.MULTILINE
)
HEADING_RE = re.compile(r"^###\s+(\w+)", re.MULTILINE)

BREAKING_HINTS = re.compile(
    r"\b(breaking|removed api|removed ipc|incompatible|migration requires|"
    r"requires operator|breaking change)\b",
    re.I,
)

DEFAULT_RELEASE_BRANCHES = frozenset({"main", "master"})


@dataclass
class UnreleasedBucket:
    added: list[str]
    changed: list[str]
    fixed: list[str]
    removed: list[str]
    deprecated: list[str]
    security: list[str]
    other: list[str]
    raw: str

    @property
    def bullet_count(self) -> int:
        return sum(
            len(x)
            for x in (
                self.added,
                self.changed,
                self.fixed,
                self.removed,
                self.deprecated,
                self.security,
                self.other,
            )
        )


@dataclass
class ReleasePlan:
    current: str
    next_version: str
    level: str
    rationale: str
    unreleased_bullets: int
    needs_llm_judgment: bool
    date: str
    branch: str
    needs_human_confirm_branch: bool


def _read_version() -> str:
    data = json.loads(PACKAGE_PATH.read_text(encoding="utf-8"))
    ver = data.get("version")
    if not isinstance(ver, str) or not re.fullmatch(r"\d+\.\d+\.\d+", ver):
        raise SystemExit(f"Could not parse semver version in {PACKAGE_PATH}")
    return ver


def _write_version(next_version: str) -> None:
    text = PACKAGE_PATH.read_text(encoding="utf-8")
    new_text, n = re.subn(
        r'("version"\s*:\s*")(\d+\.\d+\.\d+)(")',
        rf"\g<1>{next_version}\g<3>",
        text,
        count=1,
    )
    if n != 1:
        raise SystemExit("Failed to rewrite package.json version")
    PACKAGE_PATH.write_text(new_text, encoding="utf-8", newline="\n")


def _bump(version: str, level: str) -> str:
    major, minor, patch = (int(x) for x in version.split("."))
    if level == "major":
        return f"{major + 1}.0.0"
    if level == "minor":
        return f"{major}.{minor + 1}.0"
    if level == "patch":
        return f"{major}.{minor}.{patch + 1}"
    raise SystemExit(f"Unknown level: {level}")


def _parse_unreleased(changelog: str) -> UnreleasedBucket:
    matches = list(SECTION_RE.finditer(changelog))
    if not matches or matches[0].group(1).lower() != "unreleased":
        return UnreleasedBucket([], [], [], [], [], [], [], "")

    start = matches[0].end()
    end = matches[1].start() if len(matches) > 1 else len(changelog)
    raw = changelog[start:end].strip("\n")

    buckets: dict[str, list[str]] = {
        "Added": [],
        "Changed": [],
        "Fixed": [],
        "Removed": [],
        "Deprecated": [],
        "Security": [],
        "other": [],
    }
    current = "other"
    for line in raw.splitlines():
        hm = HEADING_RE.match(line.strip())
        if hm:
            name = hm.group(1)
            current = name if name in buckets else "other"
            continue
        if line.strip().startswith("- "):
            buckets[current].append(line.strip()[2:].strip())

    release_bullets = (
        buckets["Added"]
        + buckets["Changed"]
        + buckets["Fixed"]
        + buckets["Removed"]
        + buckets["Deprecated"]
        + buckets["Security"]
    )
    return UnreleasedBucket(
        added=buckets["Added"],
        changed=buckets["Changed"],
        fixed=buckets["Fixed"],
        removed=buckets["Removed"],
        deprecated=buckets["Deprecated"],
        security=buckets["Security"],
        other=buckets["other"] if release_bullets else [],
        raw=raw,
    )


def _classify(bucket: UnreleasedBucket) -> tuple[str, str, bool]:
    """Return (level, rationale, needs_llm_judgment)."""
    text_blob = "\n".join(
        bucket.added
        + bucket.changed
        + bucket.fixed
        + bucket.removed
        + bucket.deprecated
        + bucket.security
        + bucket.other
    )
    if BREAKING_HINTS.search(text_blob) or bucket.removed:
        return ("major", "Breaking/removed signals in Unreleased", False)

    feature = len(bucket.added)
    fix = len(bucket.fixed)
    changed = len(bucket.changed)

    if feature == 0 and fix == 0 and changed == 0 and not bucket.security:
        return (
            "patch",
            "Unreleased has no Added/Fixed/Changed bullets — default patch; "
            "confirm against git history if this is wrong",
            True,
        )

    if feature >= fix and feature >= 1:
        return ("minor", f"feature({feature}) >= fix({fix})", False)
    if fix > feature:
        return ("patch", f"fix({fix}) > feature({feature})", False)
    if changed and feature == 0 and fix == 0:
        return ("patch", "Changed-only Unreleased → patch", False)
    if bucket.security:
        return ("patch", "Security entries without Added → patch", False)
    return ("patch", "fallback patch", True)


def _git_short_status() -> str:
    try:
        out = subprocess.check_output(
            ["git", "status", "--short"],
            cwd=ROOT,
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except (OSError, subprocess.CalledProcessError):
        return "(git status unavailable)"
    return out.strip() or "(clean)"


def _git_branch() -> str:
    try:
        out = subprocess.check_output(
            ["git", "branch", "--show-current"],
            cwd=ROOT,
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except (OSError, subprocess.CalledProcessError):
        return "(unknown)"
    return out.strip() or "(detached)"


def _needs_human_confirm_branch(branch: str) -> bool:
    return branch not in DEFAULT_RELEASE_BRANCHES and not branch.startswith("(")


def build_plan(level: str | None, when: str) -> ReleasePlan:
    current = _read_version()
    changelog = CHANGELOG_PATH.read_text(encoding="utf-8")
    bucket = _parse_unreleased(changelog)
    branch = _git_branch()
    if level:
        chosen = level
        rationale = f"operator override --level {level}"
        needs_llm = False
    else:
        chosen, rationale, needs_llm = _classify(bucket)
    return ReleasePlan(
        current=current,
        next_version=_bump(current, chosen),
        level=chosen,
        rationale=rationale,
        unreleased_bullets=bucket.bullet_count,
        needs_llm_judgment=needs_llm,
        date=when,
        branch=branch,
        needs_human_confirm_branch=_needs_human_confirm_branch(branch),
    )


def _promote_changelog(changelog: str, plan: ReleasePlan) -> str:
    matches = list(SECTION_RE.finditer(changelog))
    if not matches or matches[0].group(1).lower() != "unreleased":
        raise SystemExit("CHANGELOG.md missing ## [Unreleased] as first section")

    unreleased_hdr = matches[0]
    next_hdr = matches[1] if len(matches) > 1 else None
    body_start = unreleased_hdr.end()
    body_end = next_hdr.start() if next_hdr else len(changelog)
    body = changelog[body_start:body_end]

    kept_lines: list[str] = []
    pending_heading: str | None = None
    pending_bullets: list[str] = []

    def flush() -> None:
        nonlocal pending_heading, pending_bullets
        if pending_heading and pending_bullets:
            kept_lines.append(pending_heading)
            kept_lines.extend(pending_bullets)
            kept_lines.append("")
        pending_heading = None
        pending_bullets = []

    for line in body.splitlines():
        if HEADING_RE.match(line.strip()):
            flush()
            pending_heading = line.rstrip()
            continue
        if line.strip().startswith("- "):
            pending_bullets.append(line.rstrip())
            continue
        if line.strip() == "":
            continue
        if pending_heading:
            pending_bullets.append(line.rstrip())
        else:
            kept_lines.append(line.rstrip())
    flush()

    new_section = f"## [{plan.next_version}] - {plan.date}\n"
    if kept_lines:
        new_section += "\n" + "\n".join(kept_lines).rstrip() + "\n"
    else:
        new_section += "\n### Changed\n\n- Release housekeeping.\n"

    fresh_unreleased = "## [Unreleased]\n\n"
    prefix = changelog[: unreleased_hdr.start()]
    suffix = changelog[body_end:]
    return prefix + fresh_unreleased + new_section + "\n" + suffix.lstrip("\n")


def apply_plan(plan: ReleasePlan) -> None:
    _write_version(plan.next_version)
    changelog = CHANGELOG_PATH.read_text(encoding="utf-8")
    CHANGELOG_PATH.write_text(
        _promote_changelog(changelog, plan), encoding="utf-8", newline="\n"
    )


def cmd_inspect(_: argparse.Namespace) -> int:
    current = _read_version()
    changelog = CHANGELOG_PATH.read_text(encoding="utf-8")
    bucket = _parse_unreleased(changelog)
    level, rationale, needs_llm = _classify(bucket)
    branch = _git_branch()
    needs_branch = _needs_human_confirm_branch(branch)
    payload = {
        "current_version": current,
        "suggested_level": level,
        "rationale": rationale,
        "needs_llm_judgment": needs_llm,
        "branch": branch,
        "needs_human_confirm_branch": needs_branch,
        "unreleased": asdict(bucket),
        "git_status": _git_short_status().splitlines(),
        "version_path": str(PACKAGE_PATH.relative_to(ROOT)),
        "changelog_path": str(CHANGELOG_PATH.relative_to(ROOT)),
        "next_actions": [
            "If needs_human_confirm_branch: stop and confirm with the user "
            "before apply/commit (not main/master)",
            "If needs_llm_judgment: classify git log since last tag, then "
            "`plan --level …`",
            "Review `plan` output, then `apply --level …` (no commit/push)",
            "Commit/push only when the user explicitly asks",
        ],
    }
    print(json.dumps(payload, indent=2))
    return 0


def cmd_plan(args: argparse.Namespace) -> int:
    plan = build_plan(args.level, args.date)
    print(json.dumps(asdict(plan), indent=2))
    if plan.needs_human_confirm_branch:
        print(
            f"\n# note: needs_human_confirm_branch — current branch is {plan.branch!r}",
            file=sys.stderr,
        )
    if plan.needs_llm_judgment and not args.level:
        print(
            "\n# note: needs_llm_judgment — pass --level after reviewing git history",
            file=sys.stderr,
        )
    return 0


def cmd_apply(args: argparse.Namespace) -> int:
    if not args.level:
        raise SystemExit("apply requires explicit --level (major|minor|patch)")
    plan = build_plan(args.level, args.date)
    if args.dry_run:
        print(json.dumps({**asdict(plan), "dry_run": True}, indent=2))
        return 0
    if plan.needs_human_confirm_branch and not args.allow_non_main_branch:
        raise SystemExit(
            f"Refusing apply on branch {plan.branch!r} "
            "(not main/master). Confirm with the user, then re-run with "
            "--allow-non-main-branch"
        )
    apply_plan(plan)
    print(
        json.dumps(
            {
                **asdict(plan),
                "applied": True,
                "files": [
                    str(PACKAGE_PATH.relative_to(ROOT)),
                    str(CHANGELOG_PATH.relative_to(ROOT)),
                ],
                "commit_hint": f"chore: release v{plan.next_version}",
                "human_gate": "Do not commit/push unless the user asked",
            },
            indent=2,
        )
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--date",
        default=date.today().isoformat(),
        help="Release date for changelog heading (YYYY-MM-DD)",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_inspect = sub.add_parser("inspect", help="Read version + Unreleased state")
    p_inspect.set_defaults(func=cmd_inspect)

    p_plan = sub.add_parser("plan", help="Compute next version without writing")
    p_plan.add_argument(
        "--level", choices=("major", "minor", "patch"), default=None
    )
    p_plan.set_defaults(func=cmd_plan)

    p_apply = sub.add_parser("apply", help="Write package.json + CHANGELOG.md")
    p_apply.add_argument(
        "--level", choices=("major", "minor", "patch"), required=True
    )
    p_apply.add_argument(
        "--dry-run", action="store_true", help="Show plan only"
    )
    p_apply.add_argument(
        "--allow-non-main-branch",
        action="store_true",
        help="After human confirmation, allow apply on a non-main branch",
    )
    p_apply.set_defaults(func=cmd_apply)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
