import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { ConfirmationRequiredError, ConfirmTokenError, PolicyError } from "./errors.js";
import {
    canonicalJson,
    check,
    ELEVATED_ENV,
    issueToken,
    requirements,
    resetTokenKeyCache,
    TOKEN_TTL_SECONDS,
    verifyToken,
} from "./policy.js";

const read = { action_id: "ipc.db.get-images", tier: "read" };
const write = { action_id: "ipc.app.set-gallery-mode", tier: "write" };
const destructive = { action_id: "ipc.db.delete-image", tier: "destructive" };

describe("driftara policy", () => {
    beforeEach(() => {
        process.env.DRIFTARA_TOKEN_SECRET = "test-secret";
        delete process.env[ELEVATED_ENV];
        resetTokenKeyCache();
    });
    afterEach(() => {
        delete process.env.DRIFTARA_TOKEN_SECRET;
        delete process.env.DRIFTARA_TOKEN_KEY_FILE;
        delete process.env[ELEVATED_ENV];
        resetTokenKeyCache();
    });

    it("read runs without confirmation", () => {
        check(read, {}, { dryRun: false, confirmed: false });
    });

    it("write needs confirmed", () => {
        assert.throws(() => check(write, { mode: "db" }, { dryRun: false, confirmed: false }), ConfirmationRequiredError);
        check(write, { mode: "db" }, { dryRun: false, confirmed: true });
    });

    it("dry run passes for every tier", () => {
        for (const rec of [read, write, destructive]) check(rec, { id: 1 }, { dryRun: true, confirmed: false });
    });

    it("rejects an unknown tier", () => {
        assert.throws(() => check({ action_id: "x", tier: "nuclear" }, {}, { dryRun: true, confirmed: true }), PolicyError);
    });

    it("destructive gates in order: confirmed, elevated env, token", () => {
        const args = { id: 7 };
        assert.throws(() => check(destructive, args, { dryRun: false, confirmed: false }), ConfirmationRequiredError);
        assert.throws(
            () => check(destructive, args, { dryRun: false, confirmed: true }),
            (err: unknown) => err instanceof PolicyError && err.details.policy === "elevated_env",
        );
        process.env[ELEVATED_ENV] = "1";
        assert.throws(() => check(destructive, args, { dryRun: false, confirmed: true }), ConfirmTokenError);
        const { confirm_token } = issueToken(destructive.action_id, args);
        check(destructive, args, { dryRun: false, confirmed: true, confirmToken: confirm_token });
    });

    it("token is bound to the arguments and the action id", () => {
        const { confirm_token } = issueToken("ipc.db.delete-image", { id: 7 });
        assert.throws(() => verifyToken("ipc.db.delete-image", { id: 8 }, confirm_token), ConfirmTokenError);
        assert.throws(() => verifyToken("ipc.db.delete-folder", { id: 7 }, confirm_token), ConfirmTokenError);
        assert.throws(() => verifyToken("ipc.db.delete-image", { id: 7 }, "garbage"), ConfirmTokenError);
        assert.throws(() => verifyToken("ipc.db.delete-image", { id: 7 }, "abc.def"), ConfirmTokenError);
        verifyToken("ipc.db.delete-image", { id: 7 }, confirm_token);
    });

    it("token argument binding ignores key order", () => {
        const { confirm_token } = issueToken("a", { x: 1, y: { b: 2, a: 1 } });
        verifyToken("a", { y: { a: 1, b: 2 }, x: 1 }, confirm_token);
    });

    it("token format and TTL boundary", () => {
        const now = 1_800_000_000;
        const t = issueToken("a", { k: 1 }, now);
        assert.equal(t.ttl_seconds, TOKEN_TTL_SECONDS);
        assert.equal(t.expires_at, now + 600);
        assert.match(t.confirm_token, /^\d+\.[0-9a-f]{40}$/);
        verifyToken("a", { k: 1 }, t.confirm_token, now + TOKEN_TTL_SECONDS - 1);
        verifyToken("a", { k: 1 }, t.confirm_token, now + TOKEN_TTL_SECONDS);
        assert.throws(() => verifyToken("a", { k: 1 }, t.confirm_token, now + TOKEN_TTL_SECONDS + 1), /expired/);
    });

    it("a key file survives a cache reset (a later CLI process can confirm)", () => {
        delete process.env.DRIFTARA_TOKEN_SECRET;
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "driftara-key-"));
        process.env.DRIFTARA_TOKEN_KEY_FILE = path.join(dir, "sub", "confirm.key");
        try {
            const { confirm_token } = issueToken("a", { k: 1 });
            assert.ok(fs.existsSync(process.env.DRIFTARA_TOKEN_KEY_FILE));
            assert.match(fs.readFileSync(process.env.DRIFTARA_TOKEN_KEY_FILE, "utf-8"), /^[0-9a-f]{64}$/);
            resetTokenKeyCache();
            verifyToken("a", { k: 1 }, confirm_token);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it("a different secret rejects the token", () => {
        const { confirm_token } = issueToken("a", { k: 1 });
        process.env.DRIFTARA_TOKEN_SECRET = "other-secret";
        assert.throws(() => verifyToken("a", { k: 1 }, confirm_token), ConfirmTokenError);
    });

    it("requirements() matches vexlum", () => {
        assert.deepEqual(requirements("read"), { confirmed: false, confirm_token: false, env: null });
        assert.deepEqual(requirements("write"), { confirmed: true, confirm_token: false, env: null });
        assert.deepEqual(requirements("destructive"), { confirmed: true, confirm_token: true, env: `${ELEVATED_ENV}=1` });
    });

    it("canonical JSON matches Python json.dumps(sort_keys=True)", () => {
        assert.equal(canonicalJson({ b: [1, "é"], a: null, c: true }), '{"a": null, "b": [1, "\\u00e9"], "c": true}');
    });
});
