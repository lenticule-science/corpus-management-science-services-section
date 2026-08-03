#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CORPUS_KNOWLEDGE_CONTRACT, PROJECT_CORPUS_SEAM_CONTRACT } from "./law.mjs";
import Ajv2020 from "ajv/dist/2020.js";
import { createSemanticRecordJournal } from "@red-cup-engineering/semantic-record-journal-service";
import { canonical, digest, contentId, analyzeForms } from "./lib/knowledge-forms.mjs";

const NODE_ID = "corpus-management-team";
const ACTOR = `urn:ame:${NODE_ID}`;
const CONTEXT = "https://www.w3.org/ns/activitystreams";
const SERVICE_CONTRACT = CORPUS_KNOWLEDGE_CONTRACT;
const BILATERAL_CONTRACT = PROJECT_CORPUS_SEAM_CONTRACT;
const NODE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const validateOfferSchema = new Ajv2020({ allErrors: true, strict: false }).compile(JSON.parse(readFileSync(join(NODE_ROOT, "lib/schemas/activity-offer.schema.json"), "utf8")));

function arg(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function now() {
  return arg("--now") ?? new Date().toISOString();
}

function inputValue() {
  const path = arg("--input");
  return JSON.parse(path ? readFileSync(resolve(path), "utf8") : readFileSync(0, "utf8"));
}

function store() {
  const journal = createSemanticRecordJournal({ root: NODE_ROOT, objectKind: "corpus-management.record" });
  return { record: ({ category, recordedAt, record }) => journal.record({ category, recordedAt, record, charge: { support: true, refutation: false }, ...(category.endsWith(".eavt") ? { relation: { subject: record.e, predicate: record.a, object: record.v } } : {}) }) };
}
async function witness(activity, outcome, instant, stageIds = []) {
  const provider = store();
  const activityDigest = digest(activity);
  const notificationData = {
    activityId: typeof activity?.id === "string" ? activity.id : "urn:activity:unidentified",
    activityDigest,
    outcome,
    contract: [SERVICE_CONTRACT, BILATERAL_CONTRACT].includes(activity?.object?.contract) ? activity.object.contract : SERVICE_CONTRACT,
    stageIds,
    note: "ActivityStreams value referenced, not wrapped; this CloudEvent is a node-local router notification"
  };
  const cloudEvent = {
    specversion: "1.0",
    id: contentId({ source: ACTOR, type: `org.emsenn.${NODE_ID}.${outcome}`, notificationData }),
    source: ACTOR,
    type: `org.emsenn.${NODE_ID}.${outcome}`,
    subject: notificationData.activityId,
    time: instant,
    datacontenttype: "application/json",
    data: notificationData
  };
  const transaction = cloudEvent.id;
  const eavt = [
    { e: notificationData.activityId, a: "activity/digest", v: activityDigest, t: transaction },
    { e: notificationData.activityId, a: "activity/outcome", v: outcome, t: transaction },
    { e: notificationData.activityId, a: "contract/id", v: notificationData.contract, t: transaction },
    ...stageIds.map((id) => ({ e: notificationData.activityId, a: "mape/stage", v: id, t: transaction }))
  ];
  const contract = notificationData.contract;
  await provider.record({ category: `${contract}.activitystreams`, recordedAt: instant, record: activity });
  await provider.record({ category: `${contract}.events`, recordedAt: instant, record: cloudEvent });
  for (const row of eavt) await provider.record({ category: `${contract}.eavt`, recordedAt: instant, record: row });
}

function rejection(activity, reason) {
  return {
    "@context": CONTEXT,
    id: contentId({ actor: ACTOR, inReplyTo: activity?.id ?? null, reason }),
    type: "Reject",
    actor: ACTOR,
    target: typeof activity?.actor === "string" ? activity.actor : "urn:actor:unidentified",
    inReplyTo: typeof activity?.id === "string" ? activity.id : "urn:activity:unidentified",
    object: { type: "Refusal", reason, contract: [SERVICE_CONTRACT, BILATERAL_CONTRACT].includes(activity?.object?.contract) ? activity.object.contract : SERVICE_CONTRACT }
  };
}

async function refuse(activity, reason, instant) {
  const output = rejection(activity, reason);
  await witness(activity ?? {}, "activity.rejected", instant);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exitCode = 2;
}

function validateActivity(activity) {
  if (!validateOfferSchema(activity)) return `schema-invalid ActivityStreams Offer: ${validateOfferSchema.errors.map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ")}`;
  if (!activity || typeof activity !== "object" || Array.isArray(activity)) return "request must be a JSON object";
  if (activity["@context"] !== CONTEXT || activity.type !== "Offer") return "membrane accepts an ActivityStreams 2.0 Offer value";
  if (typeof activity.id !== "string" || typeof activity.actor !== "string") return "Offer requires string id and actor";
  if (activity.target !== ACTOR) return `Offer target must be ${ACTOR}`;
  const object = activity.object;
  if (!object || object.type !== "ManageProjectCorpusKnowledge") return "Offer object must be ManageProjectCorpusKnowledge";
  if (![SERVICE_CONTRACT, BILATERAL_CONTRACT].includes(object.contract)) return "Offer must name the public corpus service contract or the PMT bilateral refinement";
  if (object.contract === BILATERAL_CONTRACT && activity.actor !== "urn:ame:project-management-team") return "the bilateral PMT contract admits Project Management Team as actor";
  if (typeof object.project !== "string" || !object.project) return "Offer requires a project identifier";
  if (!object.corpus || !Array.isArray(object.corpus.forms)) return "corpus.forms must be an array";
  const actual = digest(object.corpus.forms);
  if (object.corpus.digest !== actual) return `corpus digest mismatch: expected ${actual}`;
  return validateCapability(object.capability, object.corpus.digest);
}

function validateCapability(capability, corpusDigest) {
  if (!capability || capability.type !== "Capability" || typeof capability.id !== "string") return "executable request requires an OCap-shaped Capability";
  if (capability.holder !== ACTOR || capability.invocationTarget !== ACTOR) return "capability holder and invocationTarget must be this membrane";
  const required = ["observe-corpus", "analyze-knowledge-forms", "emit-advice"];
  if (!Array.isArray(capability.allowedActions) || required.some((action) => !capability.allowedActions.includes(action))) return "capability does not delegate the required bounded actions";
  const attenuation = capability.attenuation;
  if (!attenuation || attenuation.corpusDigest !== corpusDigest) return "capability attenuation must bind the supplied corpus digest";
  if (attenuation.customerTerritoryMutation !== false) return "capability must explicitly forbid customer-territory mutation";
  const effects = attenuation.localEffects;
  const allowed = new Set(["append-own-ledger", "emit-activitystreams"]);
  if (!Array.isArray(effects) || effects.some((effect) => !allowed.has(effect))) return "capability requests an effect outside this node's local membrane";
  if (!capability.capTP || capability.capTP.target !== ACTOR || capability.capTP.method !== "manageProjectCorpusKnowledge") return "capability requires a CapTP-shaped target and method attenuation";
  return null;
}

function validatePricing(pricing) {
  if (pricing === undefined) return null;
  if (pricing?.denomination === "landauer-bit" && pricing.kind === "rank-leg") return "CoordinationRequired: rank-leg pricing requires the unfulfilled Obsmetrologia enterprise-observation/coordination-measurement capability derived in scripts/EnterpriseObservationContractRevision4DesignScratch.lean; no callable Obsmetrologia service or incidence-derived receipt is installed";
  if (pricing?.denomination === "landauer-bit" && pricing.kind === "full-cocone") return "CoordinationRequired: full PricedNerve pricing lacks independently derived top, mass, mint, jump, causal, and rank-leg receipts";
  if (pricing?.denomination === "landauer-bit" && pricing.kind === "physical-kTln2") return "CoordinationRequired: the physical kT ln 2 weld is not installed";
  return "pricing denomination is not admitted by this service";
}

function stage(loopId, name, predecessors, knowledgeRefs, evidence) {
  const body = { type: "MAPEStage", loopId, stage: name, predecessors, knowledgeRefs, evidence };
  return { id: contentId(body), ...body };
}

let activity;
const instant = now();
if (arg("--data-root") !== undefined || arg("--test-data-root") !== undefined) {
  const output = rejection({}, "filesystem authority is fixed to this node's own data membrane; data-root overrides are refused");
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exitCode = 2;
}
if (!process.exitCode) try {
  activity = inputValue();
} catch (error) {
  await refuse({}, `invalid JSON input: ${error.message}`, instant);
}

if (!process.exitCode) {
  const invalid = validateActivity(activity) ?? validatePricing(activity.object.pricing);
  if (invalid) {
    await refuse(activity, invalid, instant);
  } else {
    const corpus = activity.object.corpus;
    const contract = activity.object.contract;
    const knowledgeRefs = [activity.id, corpus.digest, contract, activity.object.capability.id];
    const loopId = contentId({ contract, offer: activity.id, corpus: corpus.digest });
    const monitor = stage(loopId, "monitor", [], knowledgeRefs, {
      sourceOfferDigest: digest(activity),
      corpusDigest: corpus.digest,
      formCount: corpus.forms.length,
      customerTerritoryMutation: false
    });
    const issues = analyzeForms(corpus.forms);
    const analyze = stage(loopId, "analyze", [monitor.id], knowledgeRefs, {
      issueCount: issues.length,
      issues,
      actionSelected: false
    });
    const plan = stage(loopId, "plan", [analyze.id], knowledgeRefs, {
      diagnosis: analyze.id,
      proposedAdvice: issues.map((issue) => ({ issue, effect: "advice-only", customerTerritoryMutation: false })),
      diagnosisRevised: false
    });
    const execute = stage(loopId, "execute", [plan.id], knowledgeRefs, {
      plan: plan.id,
      emittedAdviceCount: issues.length,
      privilegedMutation: false,
      customerTerritoryMutation: false
    });
    const resultBody = {
      type: "CorpusManagementResult",
      contract,
      project: activity.object.project,
      corpusDigest: corpus.digest,
      disposition: issues.length ? "coordination-required" : "settled",
      coordinationRequired: issues,
      loop: { id: loopId, policy: "knowledge-form-mape-v1", stages: { monitor, analyze, plan, execute } }
    };
    const resultId = contentId(resultBody);
    const output = {
      "@context": CONTEXT,
      id: contentId({ actor: ACTOR, inReplyTo: activity.id, resultId }),
      type: "Accept",
      actor: ACTOR,
      target: activity.actor,
      inReplyTo: activity.id,
      object: { id: resultId, ...resultBody }
    };
    await witness(activity, "activity.admitted", instant, [monitor.id, analyze.id, plan.id, execute.id]);
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  }
}
