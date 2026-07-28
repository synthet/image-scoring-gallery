#!/usr/bin/env python3
"""Unit tests for gallery compiled agent_skills harnesses (no network)."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts" / "agent_skills"


def _load(name: str):
    path = SCRIPTS / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def release_bump():
    return _load("release_bump")


@pytest.fixture(scope="module")
def validate_implementation():
    return _load("validate_implementation")


@pytest.fixture(scope="module")
def verification_before_completion():
    return _load("verification_before_completion")


def test_bump_math(release_bump):
    assert release_bump._bump("7.28.0", "patch") == "7.28.1"
    assert release_bump._bump("7.28.0", "minor") == "7.29.0"
    assert release_bump._bump("7.28.0", "major") == "8.0.0"


def test_classify_feature_minor(release_bump):
    bucket = release_bump.UnreleasedBucket(
        added=["**Feature**: grid boxes"],
        changed=[],
        fixed=[],
        removed=[],
        deprecated=[],
        security=[],
        other=[],
        raw="",
    )
    level, _, needs_llm = release_bump._classify(bucket)
    assert level == "minor"
    assert needs_llm is False


def test_classify_empty_needs_llm(release_bump):
    bucket = release_bump.UnreleasedBucket(
        added=[],
        changed=[],
        fixed=[],
        removed=[],
        deprecated=[],
        security=[],
        other=[],
        raw="",
    )
    level, _, needs_llm = release_bump._classify(bucket)
    assert level == "patch"
    assert needs_llm is True


def test_parse_unreleased_sections(release_bump):
    text = """# Changelog

## [Unreleased]

### Added
- **A**: one

### Fixed
- **B**: two

## [7.0.0] - 2026-01-01

### Changed
- old
"""
    bucket = release_bump._parse_unreleased(text)
    assert bucket.added == ["**A**: one"]
    assert bucket.fixed == ["**B**: two"]
    assert bucket.bullet_count == 2


def test_promote_changelog(release_bump, tmp_path: Path, monkeypatch):
    changelog = tmp_path / "CHANGELOG.md"
    changelog.write_text(
        "# Changelog\n\n## [Unreleased]\n\n### Added\n\n- **Feat**: x\n\n"
        "## [1.0.0] - 2026-01-01\n\n### Fixed\n\n- old\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(release_bump, "CHANGELOG_PATH", changelog)
    plan = release_bump.ReleasePlan(
        current="1.0.0",
        next_version="1.1.0",
        level="minor",
        rationale="test",
        unreleased_bullets=1,
        needs_llm_judgment=False,
        date="2026-07-26",
        branch="main",
        needs_human_confirm_branch=False,
    )
    out = release_bump._promote_changelog(changelog.read_text(encoding="utf-8"), plan)
    assert "## [Unreleased]" in out
    assert "## [1.1.0] - 2026-07-26" in out
    assert "**Feat**: x" in out
    assert out.index("## [Unreleased]") < out.index("## [1.1.0]")


def test_needs_human_confirm_branch(release_bump):
    assert release_bump._needs_human_confirm_branch("main") is False
    assert release_bump._needs_human_confirm_branch("master") is False
    assert release_bump._needs_human_confirm_branch("fix/eslint-wave") is True


def test_parse_criteria(validate_implementation):
    spec = """
# Spec

- AC-1: Overlay shows when toggle on
- AC-2: Menu enabled in grid
"""
    criteria = validate_implementation.parse_criteria(spec)
    assert [c.id for c in criteria] == ["AC-1", "AC-2"]
    assert "Overlay" in criteria[0].text


def test_render_report_unknown(validate_implementation):
    criteria = [
        validate_implementation.Criterion(id="AC-1", text="done thing"),
    ]
    md = validate_implementation.render_report("demo", criteria)
    assert "Unknown" in md
    assert "Overall: 0 verified" in md


def test_verification_catalog_keys(verification_before_completion):
    keys = set(verification_before_completion.CLAIM_PROOF_CATALOG)
    assert "tests_pass" in keys
    assert "tsc_renderer" in keys
    assert "tsc_electron" in keys
    assert "assets_synced" in keys
    assert set(verification_before_completion.SUITE_ORDER) <= keys


def test_read_version_from_package(release_bump, tmp_path: Path, monkeypatch):
    pkg = tmp_path / "package.json"
    pkg.write_text(json.dumps({"name": "t", "version": "9.1.2"}), encoding="utf-8")
    monkeypatch.setattr(release_bump, "PACKAGE_PATH", pkg)
    assert release_bump._read_version() == "9.1.2"
