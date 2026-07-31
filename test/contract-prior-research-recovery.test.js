import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import test from "node:test";
import { querySettlementRecords } from "@lenticule-science/witness-journal-rdf-projection-service/client";
import { startRwilProviderProcess } from "@lenticule-science/witness-journal-rdf-projection-service/test-provider";
import { PRIOR_RESEARCH_CONTRACT } from "../src/law.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROVIDER = join(ROOT, "src/contract-prior-research-recovery.js");
const SOURCE_LMT = resolve(ROOT, "../../../leader-movement-team");
const NOW = "2099-07-17T12:00:00.000Z";
const CONTEXT = "https://www.w3.org/ns/activitystreams";
const LEADER = "urn:leader:emsenn";
const LMT = "urn:ame:leader-movement-team";
// LMT forms a Leader-charge before it will run any leader-addressed activity through
// run-leader-movement.js. Absence of a hired die is that die's own lawful refusal
// (see leader-charge-client.mjs); these tests carry that absence as a typed skip
// rather than asserting against a Reject the fixture cannot lawfully avoid.
const LEADER_CHARGE_GRANTED = typeof process.env.LEADER_CHARGE_AGENT === "string" && process.env.LEADER_CHARGE_AGENT.length > 0;
const LEADER_CHARGE_MISSING_REASON = "no hired Leader-charge die: LEADER_CHARGE_AGENT must name the hired Leader-charge die's signed A2A 1.0 Agent Card";
const skipWithoutLeaderCharge = LEADER_CHARGE_GRANTED ? {} : { skip: LEADER_CHARGE_MISSING_REASON };

let rwil; let base; let fixtureRoot; let lmtRoot; let dataRoot;
test.before(async () => { rwil = await startRwilProviderProcess(); });
test.after(async () => { await rwil.close(); });
test.beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "cmt-recovery-contract-")); fixtureRoot = join(base, "territory"); lmtRoot = join(base, "leader-movement-team"); dataRoot = join(base, "provider-rwil");
  mkdirSync(join(fixtureRoot, "current"), { recursive: true }); mkdirSync(join(fixtureRoot, "assets", "legacy"), { recursive: true }); mkdirSync(join(fixtureRoot, ".git", "modules"), { recursive: true });
  writeFileSync(join(fixtureRoot, "package.json"), `${JSON.stringify({ name: "@fixture/territory", "x-agentic-metro-enterprise": { "node-id": "fixture-territory" } })}\n`);
  writeFileSync(join(fixtureRoot, "current", "koios-runtime.md"), "Koios News owns a source cycle.\nFresh Web evidence enters the newswire.\n");
  writeFileSync(join(fixtureRoot, "assets", "legacy", "distal-bypass.md"), "Distal bypass preserves a useful prior result.\n");
  writeFileSync(join(fixtureRoot, ".git", "modules", "koios.news.pack"), "Koios repository internals are not corpus evidence.\n");
  cpSync(SOURCE_LMT, lmtRoot, { recursive: true, filter: (path) => !path.startsWith(join(SOURCE_LMT, "data")) });
});
test.afterEach(() => { rmSync(base, { recursive: true, force: true }); });

function executionEnvironment() { return { ...process.env, RWIL_RDF_AGENT: rwil.agentCardUrl, CORPUS_MANAGEMENT_DATA_ROOT: dataRoot }; }

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
  return spawnSync(process.execPath, [join(lmtRoot, "src/run-leader-movement.js"), "--now", NOW, "--provider-root", ROOT], { input: JSON.stringify(value), encoding: "utf8", timeout: 120000, env: executionEnvironment() });
}
function providerResult(execution) {
  const output = JSON.parse(execution.stdout);
  return output.object.result.object;
}
function runProvider(operation, value) {
  return spawnSync(process.execPath, [PROVIDER, "--operation", operation, "--now", NOW], { input: JSON.stringify(value), encoding: "utf8", timeout: 120000, env: executionEnvironment() });
}

test("advertises terms rather than silently inferring an unbounded filesystem sweep", () => {
  const solicitation = { "@context": CONTEXT, id: "urn:solicitation:missing", type: "Offer", actor: LMT, target: "urn:ame:corpus-management-team", object: { type: "ServiceSolicitation", sourceActivity: { id: "urn:leader:missing", object: { type: "Note", content: "recover prior research" } } } };
  const execution = spawnSync(process.execPath, [PROVIDER, "--operation", "solicit-service", "--now", NOW], { input: JSON.stringify(solicitation), encoding: "utf8", env: executionEnvironment() });
  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  const output = JSON.parse(execution.stdout); assert.equal(output.type, "Question"); assert.ok(output.object.missing.includes("terms(2..160 character strings)"));
});

test("LMT discovers CMT but cannot invoke filesystem recovery without a Leader grant", skipWithoutLeaderCharge, () => {
  const execution = runLeader(activity("grant-required", false));
  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  const output = JSON.parse(execution.stdout); assert.equal(output.type, "Question"); assert.equal(output.object.type, "ResourceGrantRequired");
  assert.deepEqual(output.object.offers[0].effects, ["filesystem-read"]);
});

test("LMT contracts a bounded recovery and receives source-bound context plus explicit gaps", skipWithoutLeaderCharge, async () => {
  const sourcePath = join(fixtureRoot, "current", "koios-runtime.md"); const before = readFileSync(sourcePath);
  const execution = runLeader(activity("recover"));
  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  const output = JSON.parse(execution.stdout); assert.equal(output.type, "Accept"); assert.equal(output.object.provider, "urn:ame:corpus-management-team");
  const result = providerResult(execution); assert.equal(result.type, "PriorResearchRecoveryResult"); assert.equal(result.dryRun, false); assert.equal(result.customerTerritoryMutation, false);
  const source = result.contextualBundle.sources.find((item) => item.path === sourcePath); assert.ok(source); assert.equal(source.owner.nodeId, "fixture-territory"); assert.equal(source.status, "current");
  assert.equal(source.digest, `ni:///sha-256;${createHash("sha256").update(before).digest("base64url")}`); assert.deepEqual(readFileSync(sourcePath), before);
  assert.ok(result.contextualBundle.sources.some((item) => item.status === "legacy"));
  assert.equal(result.contextualBundle.sources.some((item) => item.path.includes("/.git/")), false);
  assert.ok(result.gapBundle.gaps.some((gap) => gap.type === "unmatched-term" && gap.term === "missing theorem"));
  assert.ok(result.gapBundle.gaps.some((gap) => gap.type === "excerpt-truncation" && gap.path === sourcePath));
  assert.equal((await querySettlementRecords(`${PRIOR_RESEARCH_CONTRACT}.recoveries`)).length, 1);
});

test("candidate limits become a gap rather than a silent loss", skipWithoutLeaderCharge, () => {
  writeFileSync(join(fixtureRoot, "current", "koios-second.md"), "Koios second source.\n");
  const execution = runLeader(activity("truncation", true, { terms: ["Koios"], maxFiles: 1, maxBytesPerFile: 1000 }));
  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  const result = providerResult(execution); assert.equal(result.contextualBundle.sourceCount, 1);
  assert.ok(result.gapBundle.gaps.some((gap) => gap.type === "candidate-truncation" && gap.omitted >= 1));
});

test("a term that exists only beyond the cap is distinguished from an absent term", skipWithoutLeaderCharge, () => {
  writeFileSync(join(fixtureRoot, "current", "rare.md"), "A rare theorem has one witness.\n");
  const execution = runLeader(activity("term-cap", true, { terms: ["Koios", "rare theorem", "absent theorem"], maxFiles: 1, maxBytesPerFile: 1000 }));
  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  const gaps = providerResult(execution).gapBundle.gaps;
  assert.ok(gaps.some((gap) => gap.type === "term-not-admitted" && gap.term === "rare theorem"));
  assert.ok(gaps.some((gap) => gap.type === "unmatched-term" && gap.term === "absent theorem"));
});

test("projects one existing recovery into a bounded issue packet without rereading source territory", skipWithoutLeaderCharge, async () => {
  const sourcePath = join(fixtureRoot, "current", "koios-runtime.md");
  const recoveryExecution = runLeader(activity("projection-source", true, { maxBytesPerFile: 1000 }));
  assert.equal(recoveryExecution.status, 0, recoveryExecution.stderr || recoveryExecution.stdout);
  const recovery = providerResult(recoveryExecution);
  const original = recovery.contextualBundle.sources.find((source) => source.path === sourcePath);
  assert.ok(original);
  writeFileSync(sourcePath, "The source territory changed after the contracted recovery.\n");
  const projectionRequest = { type: "PriorResearchProjectionRequest", sourceResultId: recovery.id, contextualBundleDigest: recovery.contextualBundleDigest, gapBundleDigest: recovery.gapBundleDigest, terms: ["source cycle", "missing projection term"], maxFiles: 2, executionMode: "live" };
  const source = { "@context": CONTEXT, id: "urn:koios:projection-source", type: "Create", actor: "urn:ame:koios-news", target: "urn:ame:corpus-management-team", object: { type: "Note", content: "Project cached prior research for one issue.", attachment: [projectionRequest] } };
  const solicitation = { "@context": CONTEXT, id: "urn:koios:projection-solicitation", type: "Offer", actor: source.actor, target: source.target, object: { type: "ServiceSolicitation", sourceActivity: source } };
  const offered = runProvider("solicit-service", solicitation);
  assert.equal(offered.status, 0, offered.stderr || offered.stdout);
  const offer = JSON.parse(offered.stdout);
  assert.deepEqual(offer.object.effects, []);
  const capability = { type: "Capability", holder: source.target, invocationTarget: source.target, parentOffer: offer.id, allowedActions: ["invoke-service"], attenuation: { requestDigest: offer.object.requestDigest, providerScope: offer.object.scope } };
  const accepted = { "@context": CONTEXT, id: "urn:koios:projection-accept", type: "Accept", actor: source.actor, target: source.target, object: { type: "ServiceContract", contract: PRIOR_RESEARCH_CONTRACT, offer, capability } };
  const projected = runProvider("invoke-service", accepted);
  assert.equal(projected.status, 0, projected.stderr || projected.stdout);
  const result = JSON.parse(projected.stdout).object;
  assert.equal(result.type, "PriorResearchProjectionResult");
  assert.equal(result.filesystemReads, 0);
  assert.equal(result.sourceRecovery, recovery.id);
  assert.equal(result.contextualBundle.sources[0].digest, original.digest);
  assert.match(result.contextualBundle.sources[0].snippets.map((snippet) => snippet.text).join("\n"), /source cycle/i);
  assert.ok(result.gapBundle.gaps.some((gap) => gap.type === "unmatched-term" && gap.term === "missing projection term"));
  assert.equal((await querySettlementRecords(`${PRIOR_RESEARCH_CONTRACT}.projections`)).length, 1);
});
