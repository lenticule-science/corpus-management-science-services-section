import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import test from "node:test";
import { querySettlementRecords } from "@lenticule-science/rwil-rdf-projection-service/client";
import { startRwilProviderProcess } from "@lenticule-science/rwil-rdf-projection-service/test-provider";
import { CORPUS_KNOWLEDGE_CONTRACT } from "../src/law.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "src/sweep-firm-corpus.js");
const NOW = "2099-07-17T12:00:00.000Z";

let rwil, dataRoot;
test.before(async () => { rwil = await startRwilProviderProcess(); });
test.after(async () => { await rwil.close(); });
test.beforeEach(() => { dataRoot = mkdtempSync(join(tmpdir(), "corpus-sweep-rwil-")); });
test.afterEach(() => { rmSync(dataRoot, { recursive: true, force: true }); });

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

function run(extraArgs, environment = {}) {
  return spawnSync(process.execPath, [CLI, "--now", NOW, ...extraArgs], { encoding: "utf8", env: { ...process.env, RWIL_RDF_AGENT: rwil.agentCardUrl, CORPUS_MANAGEMENT_DATA_ROOT: dataRoot, ...environment } });
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
    assert.match(output.material.materialId, /^ni:\/\/\/sha-256;/u);
    assert.equal(output.material.entries.length, 3);
    const gadget = output.forms.find((f) => f.id.endsWith("gadget.schema.json"));
    assert.deepEqual(gadget.claims, []);
    assert.deepEqual(gadget.provenance.peers, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("emits a content-addressed, proposal-only territory recognition without forming an enterprise", () => {
  const dir = fixture();
  try {
    const result = run(["--root", dir, "--term", "schema.json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.match(output.territoryRecognition.proposalId, /^ni:\/\/\/sha-256;/u);
    assert.equal(output.territoryRecognition.disposition, "advisory-proposal-only");
    assert.equal(output.territoryRecognition.enterpriseFormed, false);
    assert.equal(output.territoryRecognition.territoryMutated, false);
    assert.equal(output.territoryRecognition.providerSelected, false);
    assert.equal(output.territoryRecognition.spendAuthorized, false);
    assert.equal(output.territoryRecognition.candidates[0].kind, "unclassified-material");
    assert.match(output.formationLeadCandidate.candidateId, /^ni:\/\/\/sha-256;/u);
    assert.deepEqual(output.formationLeadCandidate.missingCapabilities, ["territory-recognition-review"]);
    assert.equal(output.formationLeadCandidate.transportAuthenticated, false);
    assert.equal(output.formationLeadCandidate.enterpriseFormed, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("leaves an ambiguous name-match at FOUR-bottom without invoking a model", () => {
  const dir = fixture();
  try {
    const result = run(["--root", dir, "--term", "widget"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.fileCount, 2);
    assert.equal(output.ambiguousGroups, 1);
    assert.deepEqual(
      {
        h0rank: output.coordination.h0rank,
        h1rank: output.coordination.h1rank,
        coordinationFree: output.coordination.coordinationFree,
        landauerBits: output.coordination.landauerBits,
        coordinationCost: output.coordination.coordinationCost,
      },
      { h0rank: 1, h1rank: 0, coordinationFree: true, landauerBits: 0, coordinationCost: 0 },
    );
    assert.match(output.coordination.request, /^ni:\/\/\/sha-256;/u);
    assert.match(output.coordination.result, /^ni:\/\/\/sha-256;/u);
    assert.equal(output.inference.mode, "not-performed");
    const widgetGroup = output.groups.find((g) => g.slug === "widget");
    assert.equal(widgetGroup.verdict.mode, "unresolved");
    assert.deepEqual(widgetGroup.verdict.outcome, { positiveEvidence: false, negativeEvidence: false });
    assert.equal(widgetGroup.verdict.canonical, null);
    for (const form of output.forms.filter((f) => f.provenance.slug === "widget")) {
      assert.deepEqual(form.claims, []);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fails closed when the contracted mathematical readout provider is unavailable", () => {
  const dir = fixture();
  try {
    const result = run(
      ["--root", dir, "--term", "widget"],
      { CORPUS_MATHEMATICAL_READOUT_AGENT_URL: "http://127.0.0.1:1/.well-known/agent-card.json" },
    );
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /fetch failed|ECONNREFUSED/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("obsolete inference flags cannot create evidence or change the deterministic assay", () => {
  const dir = fixture();
  try {
    const result = run(["--root", dir, "--term", "widget", "--inference-harness", "/no/such/harness.mjs"]);
    const output = JSON.parse(result.stdout);
    assert.equal(output.inference.mode, "not-performed");
    assert.equal(output.groups.find((g) => g.slug === "widget").verdict.mode, "unresolved");
    assert.equal(output.issues.length, 0, "no evidence exists to contest");
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

test("witnesses the sweep through the account-bound RWIL provider", async () => {
  const dir = fixture();
  try {
    run(["--root", dir, "--term", "widget"]);
    const records = await querySettlementRecords(`${CORPUS_KNOWLEDGE_CONTRACT}.sweeps`);
    assert.equal(records.length, 1);
    assert.equal(records[0].ambiguousGroups, 1);
    assert.match(records[0].territoryRecognition, /^ni:\/\/\/sha-256;/u);
    assert.match(records[0].formationLeadCandidate, /^ni:\/\/\/sha-256;/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
