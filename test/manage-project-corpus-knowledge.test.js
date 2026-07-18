import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "src/manage-project-corpus-knowledge.js");
const WRAPPER = join(ROOT, "lib/management/skills/managing-project-corpus-knowledge/scripts/manage-project-corpus-knowledge.js");
const NOW = "2099-07-17T12:00:00.000Z";
function cleanup() { for (const type of ["events", "eavt"]) rmSync(join(ROOT, "data/journals", type, "2099"), { recursive: true, force: true }); }
test.beforeEach(cleanup); test.after(cleanup);
function canonical(v) { if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`; if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`; return JSON.stringify(v); }
function digest(v) { return `sha256:${createHash("sha256").update(canonical(v)).digest("hex")}`; }
function fixture() {
  const forms = [{ id: "task-a", type: "Task", schema: "urn:schema:project-task", provenance: { source: "urn:customer:alpha" }, goal: [{ type: "form-exists", form: "artifact-a" }], dependsOn: [] }];
  const corpusDigest = digest(forms);
  return { "@context": "https://www.w3.org/ns/activitystreams", id: "urn:activity:cmt-offer-1", type: "Offer", actor: "urn:ame:project-management-team", target: "urn:ame:corpus-management-team", object: { type: "ManageProjectCorpusKnowledge", contract: "project-management-team-hires-corpus-management-team", project: "urn:project:alpha", corpus: { digest: corpusDigest, forms }, capability: { id: "urn:cap:cmt-1", type: "Capability", issuer: "urn:ame:project-management-team", holder: "urn:ame:corpus-management-team", invocationTarget: "urn:ame:corpus-management-team", allowedActions: ["observe-corpus", "analyze-knowledge-forms", "emit-advice"], attenuation: { corpusDigest, customerTerritoryMutation: false, localEffects: ["append-own-ledger", "emit-activitystreams"] }, capTP: { target: "urn:ame:corpus-management-team", method: "manageProjectCorpusKnowledge" } } } };
}
function run(input, script = CLI, extra = []) { return spawnSync(process.execPath, [script, "--now", NOW, ...extra], { input: JSON.stringify(input), encoding: "utf8" }); }
function lines(path) { return readFileSync(path, "utf8").trim().split("\n").map(JSON.parse); }

test("admits an ActivityStreams offer, preserves the snapshot, and emits linked MAPE plus exact EAVT", () => {
  const input = fixture(), before = canonical(input);
  const result = run(input);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(canonical(input), before);
  const output = JSON.parse(result.stdout), stages = output.object.loop.stages;
  assert.equal(output.type, "Accept");
  assert.equal(stages.analyze.predecessors[0], stages.monitor.id);
  assert.equal(stages.plan.predecessors[0], stages.analyze.id);
  assert.equal(stages.execute.predecessors[0], stages.plan.id);
  assert.ok(stages.execute.knowledgeRefs.includes(input.object.corpus.digest));
  const validateStage = new Ajv2020({ strict: false }).compile(JSON.parse(readFileSync(join(ROOT, "lib/schemas/mape-stage.schema.json"), "utf8")));
  for (const value of Object.values(stages)) assert.equal(validateStage(value), true, JSON.stringify(validateStage.errors));
  const eavt = lines(join(ROOT, "data/journals/eavt/2099/07/17/2099-07-17-corpus-management-team-eavt.jsonl"));
  assert.equal(eavt.length, 7);
  for (const row of eavt) assert.deepEqual(Object.keys(row).sort(), ["a", "e", "t", "v"]);
  const events = lines(join(ROOT, "data/journals/events/2099/07/17/2099-07-17-corpus-management-team-events.jsonl"));
  assert.equal(events[0].specversion, "1.0");
  assert.equal(events[0].data.activityId, input.id);
  assert.equal("object" in events[0].data, false);
  const evidenceSchema = JSON.parse(readFileSync(join(ROOT, "lib/schemas/evidence-wireforms.schema.json"), "utf8"));
  const validateEvent = new Ajv2020({ strict: false, formats: { "date-time": true } }).compile(evidenceSchema.$defs.cloudEventNotification);
  const validateEavt = new Ajv2020({ strict: false }).compile(evidenceSchema.$defs.eavt);
  assert.equal(validateEvent(events[0]), true, JSON.stringify(validateEvent.errors));
  for (const row of eavt) assert.equal(validateEavt(row), true, JSON.stringify(validateEavt.errors));
});

test("replay is deterministic and the projected skill wrapper is executable", () => {
  const input = fixture(), a = run(input), b = run(input, WRAPPER);
  assert.equal(a.status, 0); assert.equal(b.status, 0); assert.equal(a.stdout, b.stdout);
});

test("returns CoordinationRequired while the rank-leg measurement dependency is unfulfilled", () => {
  const input = fixture(); input.object.pricing = { kind: "rank-leg", denomination: "landauer-bit" };
  const result = run(input);
  assert.equal(result.status, 2); assert.equal(JSON.parse(result.stdout).type, "Reject");
  assert.match(JSON.parse(result.stdout).object.reason, /EnterpriseObservationContractRevision4DesignScratch\.lean/);
});

test("an outsider contracts the CMT directly under its public service contract", () => {
  const input = fixture();
  input.actor = "urn:ame:outside-contractor";
  input.object.contract = "managing-project-corpus-knowledge";
  input.object.capability.issuer = input.actor;
  const result = run(input);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.target, input.actor);
  assert.equal(output.object.contract, "managing-project-corpus-knowledge");
});

test("concurrent appends preserve every complete JSONL row", async () => {
  const encoded = JSON.stringify(fixture()), count = 8;
  await Promise.all(Array.from({ length: count }, () => new Promise((ok, fail) => {
    const child = spawn(process.execPath, [CLI, "--now", NOW], { stdio: ["pipe", "ignore", "pipe"] }); let error = "";
    child.stderr.on("data", (chunk) => { error += chunk; }); child.on("exit", (code) => code === 0 ? ok() : fail(new Error(error || `exit ${code}`))); child.stdin.end(encoded);
  })));
  assert.equal(lines(join(ROOT, "data/journals/events/2099/07/17/2099-07-17-corpus-management-team-events.jsonl")).length, count);
  assert.equal(lines(join(ROOT, "data/journals/eavt/2099/07/17/2099-07-17-corpus-management-team-eavt.jsonl")).length, count * 7);
});

test("refuses filesystem authority overrides and schema-invalid extra fields", () => {
  const override = run(fixture(), CLI, ["--data-root", "/tmp/foreign"]);
  assert.equal(override.status, 2); assert.match(JSON.parse(override.stdout).object.reason, /fixed to this node/);
  const input = fixture(); input.object.extra = true;
  const invalid = run(input); assert.equal(invalid.status, 2); assert.match(JSON.parse(invalid.stdout).object.reason, /schema-invalid/);
});

test("local value ledger conforms to its node-local schema", () => {
  const schema = JSON.parse(readFileSync(join(ROOT, "lib/schemas/win-win-value-ledger.schema.json"), "utf8"));
  const ledger = JSON.parse(readFileSync(join(ROOT, "content/books/value-ledger.json"), "utf8"));
  assert.equal(new Ajv2020({ strict: false }).compile(schema)(ledger), true);
  for (const key of schema.required) assert.ok(key in ledger);
  for (const [key, rule] of Object.entries(schema.properties)) if ("const" in rule) assert.equal(ledger[key], rule.const);
  const dependencySchema = JSON.parse(readFileSync(join(ROOT, "lib/schemas/unfulfilled-capability-dependency.schema.json"), "utf8"));
  const dependency = JSON.parse(readFileSync(join(ROOT, "content/capability-dependencies/obsmetrologia-enterprise-observation-coordination-measurement.json"), "utf8"));
  assert.equal(new Ajv2020({ strict: false }).compile(dependencySchema)(dependency), true);
  for (const key of dependencySchema.required) assert.ok(key in dependency);
  for (const [key, rule] of Object.entries(dependencySchema.properties)) if ("const" in rule) assert.equal(dependency[key], rule.const);
});
