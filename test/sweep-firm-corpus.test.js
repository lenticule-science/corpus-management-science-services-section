import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import test from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "src/sweep-firm-corpus.js");
const NOW = "2099-07-17T12:00:00.000Z";

function cleanupWitness() {
  rmSync(join(ROOT, "data/journals/sweeps/2099"), { recursive: true, force: true });
}
test.beforeEach(cleanupWitness);
test.after(cleanupWitness);

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "sweep-firm-corpus-fixture-"));
  mkdirSync(join(dir, "dup-a"), { recursive: true });
  mkdirSync(join(dir, "dup-b"), { recursive: true });
  writeFileSync(join(dir, "irrelevant.txt"), "not a match");
  writeFileSync(join(dir, "dup-a", "widget.schema.json"), "{}");
  writeFileSync(join(dir, "dup-b", "widget.schema.json"), "{}");
  writeFileSync(join(dir, "dup-a", "gadget.schema.json"), "{}");
  return dir;
}

function run(extraArgs) {
  return spawnSync(process.execPath, [CLI, "--now", NOW, ...extraArgs], { encoding: "utf8" });
}

test("refuses a missing --root", () => {
  const result = run(["--root", "/no/such/path", "--term", "widget"]);
  assert.equal(result.status, 2);
  assert.match(JSON.parse(result.stdout).reason, /existing directory/);
});

test("refuses with no --term", () => {
  const dir = fixture();
  try {
    const result = run(["--root", dir]);
    assert.equal(result.status, 2);
    assert.match(JSON.parse(result.stdout).reason, /--term/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("finds bounded matches, groups by base name, and leaves an unambiguous file with no claims", () => {
  const dir = fixture();
  try {
    const result = run(["--root", dir, "--term", "schema.json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.fileCount, 3);
    assert.equal(output.truncated, false);
    const gadget = output.forms.find((f) => f.id.endsWith("gadget.schema.json"));
    assert.deepEqual(gadget.claims, []);
    assert.deepEqual(gadget.provenance.peers, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("flags an ambiguous name-match and makes one real dry-run call to anthropic-inference-team's harness", () => {
  const dir = fixture();
  try {
    const result = run(["--root", dir, "--term", "widget"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.fileCount, 2);
    assert.equal(output.ambiguousGroups, 1);
    assert.equal(output.inference.mode, "dry-run");
    assert.ok(output.inference.harness.endsWith("anthropic-inference-team/run-one-exchange.mjs"), output.inference.harness);
    const widgetGroup = output.groups.find((g) => g.slug === "widget");
    assert.equal(widgetGroup.verdict.mode, "dry-run");
    assert.equal(widgetGroup.verdict.packetValid, true);
    assert.equal(widgetGroup.verdict.canonical, null, "a dry-run must never fabricate a verdict");
    for (const form of output.forms.filter((f) => f.provenance.slug === "widget")) {
      assert.deepEqual(form.claims, [{ entity: "widget", attribute: "is-canonical", value: true, charge: "held" }]);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("re-runs the team's own analyzeForms pipeline over the swept forms, contesting a resolved verdict", () => {
  const dir = fixture();
  try {
    const result = run(["--root", dir, "--term", "widget", "--inference-harness", "/no/such/harness.mjs"]);
    const output = JSON.parse(result.stdout);
    assert.equal(output.inference.mode, "skipped");
    assert.equal(output.groups.find((g) => g.slug === "widget").verdict.mode, "skipped");
    assert.equal(output.issues.length, 0, "no contest without a resolved verdict");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("respects --max-files and reports what it dropped rather than truncating silently", () => {
  const dir = fixture();
  try {
    const result = run(["--root", dir, "--term", "schema.json", "--max-files", "1"]);
    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.truncated, true);
    assert.equal(output.fileCount, 1);
    assert.equal(output.totalFound, 3);
    assert.equal(output.droppedCount, 2);
    assert.match(result.stderr, /dropped/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("witnesses the sweep to this node's own append-only data pool", () => {
  const dir = fixture();
  try {
    run(["--root", dir, "--term", "widget"]);
    const lines = readFileSync(join(ROOT, "data/journals/sweeps/2099/07/17/2099-07-17-corpus-management-team-sweeps.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].ambiguousGroups, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
