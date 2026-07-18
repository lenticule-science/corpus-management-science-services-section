import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import test from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROVIDER = join(ROOT, "src/contract-prior-research-recovery.js");
const SOURCE_LMT = resolve(ROOT, "../../../leader-movement-team");
const NOW = "2099-07-17T12:00:00.000Z";
const CONTEXT = "https://www.w3.org/ns/activitystreams";
const LEADER = "urn:leader:emsenn";
const LMT = "urn:ame:leader-movement-team";

let base; let fixtureRoot; let lmtRoot;
function cleanupProviderEvidence() {
  for (const type of ["events", "eavt", "recoveries"]) rmSync(join(ROOT, "data", type, "2099"), { recursive: true, force: true });
}
test.beforeEach(() => {
  cleanupProviderEvidence(); base = mkdtempSync(join(tmpdir(), "cmt-recovery-contract-")); fixtureRoot = join(base, "territory"); lmtRoot = join(base, "leader-movement-team");
  mkdirSync(join(fixtureRoot, "current"), { recursive: true }); mkdirSync(join(fixtureRoot, "assets", "legacy"), { recursive: true }); mkdirSync(join(fixtureRoot, ".git", "modules"), { recursive: true });
  writeFileSync(join(fixtureRoot, "package.json"), `${JSON.stringify({ name: "@fixture/territory", "x-agentic-metro-enterprise": { "node-id": "fixture-territory" } })}\n`);
  writeFileSync(join(fixtureRoot, "current", "koios-runtime.md"), "Koios News owns a source cycle.\nFresh Web evidence enters the newswire.\n");
  writeFileSync(join(fixtureRoot, "assets", "legacy", "distal-bypass.md"), "Distal bypass preserves a useful prior result.\n");
  writeFileSync(join(fixtureRoot, ".git", "modules", "koios.news.pack"), "Koios repository internals are not corpus evidence.\n");
  cpSync(SOURCE_LMT, lmtRoot, { recursive: true, filter: (path) => !path.startsWith(join(SOURCE_LMT, "data")) });
});
test.afterEach(() => { cleanupProviderEvidence(); rmSync(base, { recursive: true, force: true }); });

function activity(id, grant = true, overrides = {}) {
  const request = {
    type: "PriorResearchRecoveryRequest", roots: [fixtureRoot], terms: ["Koios", "distal bypass", "missing theorem"],
    maxFiles: 10, maxBytesPerFile: 48, maxMatchesPerFile: 3, executionMode: "live", ...overrides
  };
  const attachment = [request];
  if (grant) attachment.push({ type: "ResourceGrant", id: `urn:grant:${id}`, effects: ["filesystem-read"], maxRuntimeMs: 120000 });
  return { "@context": CONTEXT, id: `urn:leader:${id}`, type: "Create", actor: LEADER, target: LMT, object: { type: "Note", content: "Recover our prior Koios research into a digest-bound packet.", attachment } };
}
function runLeader(value) {
  return spawnSync(process.execPath, [join(lmtRoot, "src/run-leader-movement.js"), "--now", NOW, "--provider-root", ROOT], { input: JSON.stringify(value), encoding: "utf8", timeout: 120000 });
}
function providerResult(execution) {
  const output = JSON.parse(execution.stdout);
  return output.object.result.object;
}

test("advertises terms rather than silently inferring an unbounded filesystem sweep", () => {
  const solicitation = { "@context": CONTEXT, id: "urn:solicitation:missing", type: "Offer", actor: LMT, target: "urn:ame:corpus-management-team", object: { type: "ServiceSolicitation", sourceActivity: { id: "urn:leader:missing", object: { type: "Note", content: "recover prior research" } } } };
  const execution = spawnSync(process.execPath, [PROVIDER, "--operation", "solicit-service", "--now", NOW], { input: JSON.stringify(solicitation), encoding: "utf8" });
  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  const output = JSON.parse(execution.stdout); assert.equal(output.type, "Question"); assert.ok(output.object.missing.includes("terms(2..160 character strings)"));
});

test("LMT discovers CMT but cannot invoke filesystem recovery without a Leader grant", () => {
  const execution = runLeader(activity("grant-required", false));
  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  const output = JSON.parse(execution.stdout); assert.equal(output.type, "Question"); assert.equal(output.object.type, "ResourceGrantRequired");
  assert.deepEqual(output.object.offers[0].effects, ["filesystem-read"]);
});

test("LMT contracts a bounded recovery and receives source-bound context plus explicit gaps", () => {
  const sourcePath = join(fixtureRoot, "current", "koios-runtime.md"); const before = readFileSync(sourcePath);
  const execution = runLeader(activity("recover"));
  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  const output = JSON.parse(execution.stdout); assert.equal(output.type, "Accept"); assert.equal(output.object.provider, "urn:ame:corpus-management-team");
  const result = providerResult(execution); assert.equal(result.type, "PriorResearchRecoveryResult"); assert.equal(result.dryRun, false); assert.equal(result.customerTerritoryMutation, false);
  const source = result.contextualBundle.sources.find((item) => item.path === sourcePath); assert.ok(source); assert.equal(source.owner.nodeId, "fixture-territory"); assert.equal(source.status, "current");
  assert.equal(source.digest, `sha256:${createHash("sha256").update(before).digest("hex")}`); assert.deepEqual(readFileSync(sourcePath), before);
  assert.ok(result.contextualBundle.sources.some((item) => item.status === "legacy"));
  assert.equal(result.contextualBundle.sources.some((item) => item.path.includes("/.git/")), false);
  assert.ok(result.gapBundle.gaps.some((gap) => gap.type === "unmatched-term" && gap.term === "missing theorem"));
  assert.ok(result.gapBundle.gaps.some((gap) => gap.type === "excerpt-truncation" && gap.path === sourcePath));
  assert.ok(existsSync(join(ROOT, "data/recoveries/2099/07/17/2099-07-17-corpus-management-team-recoveries.jsonl")));
});

test("candidate limits become a gap rather than a silent loss", () => {
  writeFileSync(join(fixtureRoot, "current", "koios-second.md"), "Koios second source.\n");
  const execution = runLeader(activity("truncation", true, { terms: ["Koios"], maxFiles: 1, maxBytesPerFile: 1000 }));
  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  const result = providerResult(execution); assert.equal(result.contextualBundle.sourceCount, 1);
  assert.ok(result.gapBundle.gaps.some((gap) => gap.type === "candidate-truncation" && gap.omitted >= 1));
});

test("a term that exists only beyond the cap is distinguished from an absent term", () => {
  writeFileSync(join(fixtureRoot, "current", "rare.md"), "A rare theorem has one witness.\n");
  const execution = runLeader(activity("term-cap", true, { terms: ["Koios", "rare theorem", "absent theorem"], maxFiles: 1, maxBytesPerFile: 1000 }));
  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  const gaps = providerResult(execution).gapBundle.gaps;
  assert.ok(gaps.some((gap) => gap.type === "term-not-admitted" && gap.term === "rare theorem"));
  assert.ok(gaps.some((gap) => gap.type === "unmatched-term" && gap.term === "absent theorem"));
});
