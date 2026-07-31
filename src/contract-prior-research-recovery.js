#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, readdirSync, readSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { PRIOR_RESEARCH_CONTRACT } from "./law.mjs";
import { canonical, contentId, digest } from "./lib/knowledge-forms.mjs";
import { createSettlementStore, querySettlementRecords } from "@lenticule-science/witness-journal-rdf-projection-service/client";

const CONTEXT = "https://www.w3.org/ns/activitystreams";
const NODE_ID = "corpus-management-team";
const ACTOR = `urn:ame:${NODE_ID}`;
const LMT_ACTOR = "urn:ame:leader-movement-team";
const CONTRACT = PRIOR_RESEARCH_CONTRACT;
const NODE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MAX_FILES = 80;
const DEFAULT_MAX_BYTES = 24_000;
const DEFAULT_MAX_MATCHES = 6;
const MAX_FILES = 500;
const MAX_BYTES = 128_000;
const MAX_MATCHES = 20;
const RG_MAX_BUFFER = 32 * 1024 * 1024;

function arg(flag) { const index = process.argv.indexOf(flag); return index === -1 ? undefined : process.argv[index + 1]; }
function operation() { return arg("--operation") ?? "solicit-service"; }
function now() { return arg("--now") ?? new Date().toISOString(); }
function input() { return JSON.parse(readFileSync(arg("--input-file") ?? 0, "utf8")); }
function attachments(note) { return Array.isArray(note?.attachment) ? note.attachment : note?.attachment === undefined ? [] : [note.attachment]; }
function response(type, source, object) {
  return { "@context": CONTEXT, id: contentId({ actor: ACTOR, type, inReplyTo: source?.id ?? null, object }), type, actor: ACTOR, target: source?.actor ?? LMT_ACTOR, inReplyTo: source?.id ?? "urn:activity:unidentified", object };
}
function emit(value, code = 0) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  const outputFile = arg("--output-file");
  if (outputFile === undefined) process.stdout.write(serialized);
  else writeFileSync(outputFile, serialized, "utf8");
  process.exitCode = code;
}
function dataRoot() { return resolve(process.env.CORPUS_MANAGEMENT_DATA_ROOT ?? join(NODE_ROOT, "data")); }
function store() { return createSettlementStore({ settlementRoot: NODE_ROOT, agentUrl: process.env.RWIL_RDF_AGENT }); }
async function append(type, value, instant) { return store().record({ category: `${CONTRACT}.${type}`, recordedAt: instant, record: value }); }
async function witness(activity, outcome, instant, details = {}) {
  const body = { source: ACTOR, type: `org.emsenn.${NODE_ID}.${outcome}`, subject: activity?.id ?? "urn:activity:unidentified", time: instant, data: { activityDigest: digest(activity ?? null), contract: CONTRACT, ...details } };
  const event = { specversion: "1.0", id: contentId(body), ...body, datacontenttype: "application/json" };
  await append("activitystreams", activity ?? {}, instant); await append("events", event, instant); await append("eavt", { e: body.subject, a: "activity/outcome", v: outcome, t: event.id }, instant); return event;
}
async function reject(source, reason, instant, details = {}) {
  const value = response("Reject", source, { type: "Refusal", contract: CONTRACT, reason, ...details });
  await witness(source, "activity.rejected", instant, { reason }); emit(value, 2);
}
function integer(value, fallback, maximum) {
  return Number.isInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
}
function normalizedRequest(sourceActivity) {
  const supplied = attachments(sourceActivity?.object).find((item) => item?.type === "PriorResearchRecoveryRequest" || item?.type === "PriorResearchProjectionRequest");
  if (!supplied) return null;
  if (supplied.type === "PriorResearchProjectionRequest") return {
    kind: "projection",
    sourceResultId: supplied.sourceResultId,
    contextualBundleDigest: supplied.contextualBundleDigest,
    gapBundleDigest: supplied.gapBundleDigest,
    terms: Array.isArray(supplied.terms) ? [...new Set(supplied.terms.map((term) => typeof term === "string" ? term.trim() : term).filter(Boolean))] : supplied.terms,
    maxFiles: integer(supplied.maxFiles, DEFAULT_MAX_MATCHES, MAX_FILES),
    executionMode: supplied.executionMode ?? "live"
  };
  return {
    kind: "recovery",
    terms: Array.isArray(supplied.terms) ? [...new Set(supplied.terms.map((term) => typeof term === "string" ? term.trim() : term).filter(Boolean))] : supplied.terms,
    roots: Array.isArray(supplied.roots) ? [...new Set(supplied.roots.map((root) => typeof root === "string" ? resolve(root) : root))] : supplied.roots,
    maxFiles: integer(supplied.maxFiles, DEFAULT_MAX_FILES, MAX_FILES),
    maxBytesPerFile: integer(supplied.maxBytesPerFile, DEFAULT_MAX_BYTES, MAX_BYTES),
    maxMatchesPerFile: integer(supplied.maxMatchesPerFile, DEFAULT_MAX_MATCHES, MAX_MATCHES),
    executionMode: supplied.executionMode ?? "live"
  };
}
function requestProblems(request, checkFilesystem = false) {
  const problems = [];
  if (!request || !Array.isArray(request.terms) || request.terms.length === 0 || request.terms.some((term) => typeof term !== "string" || term.length < 2 || term.length > 160)) problems.push("terms(2..160 character strings)");
  if (request?.kind === "projection") {
    if (typeof request.sourceResultId !== "string" || !request.sourceResultId.startsWith("ni:///sha-256;")) problems.push("sourceResultId(ni)");
    if (typeof request.contextualBundleDigest !== "string" || !request.contextualBundleDigest.startsWith("ni:///sha-256;")) problems.push("contextualBundleDigest(ni)");
    if (typeof request.gapBundleDigest !== "string" || !request.gapBundleDigest.startsWith("ni:///sha-256;")) problems.push("gapBundleDigest(ni)");
  } else if (!request || !Array.isArray(request.roots) || request.roots.length === 0 || request.roots.some((root) => typeof root !== "string" || !isAbsolute(root))) problems.push("roots(absolute paths)");
  if (!request || !["dry-run", "live"].includes(request.executionMode)) problems.push("executionMode(dry-run|live)");
  if (request?.kind !== "projection" && checkFilesystem && Array.isArray(request?.roots)) for (const root of request.roots) {
    try { if (!existsSync(root) || !statSync(root).isDirectory()) problems.push(`unreadable-root:${root}`); } catch { problems.push(`unreadable-root:${root}`); }
  }
  return [...new Set(problems)];
}
function recognizes(sourceActivity) {
  if (normalizedRequest(sourceActivity)) return true;
  return typeof sourceActivity?.object?.content === "string" && /recover|collect|find|inventory|prior (?:art|research)|corpus/iu.test(sourceActivity.object.content);
}
async function solicit(activity, instant) {
  if (activity?.["@context"] !== CONTEXT || activity.type !== "Offer" || activity.target !== ACTOR || activity.object?.type !== "ServiceSolicitation") {
    await reject(activity, "solicitation must be an ActivityStreams Offer<ServiceSolicitation> addressed to this provider", instant); return;
  }
  const sourceActivity = activity.object.sourceActivity;
  if (!recognizes(sourceActivity)) { await reject(activity, "source intent does not request prior-research recovery", instant); return; }
  const request = normalizedRequest(sourceActivity);
  const missing = requestProblems(request);
  if (missing.length) {
    const question = response("Question", activity, { type: "ServiceTermsRequired", contract: CONTRACT, sourceActivity: sourceActivity?.id, missing });
    await witness(activity, "terms.requested", instant, { missing }); emit(question); return;
  }
  const effects = request.executionMode === "live" && request.kind === "recovery" ? ["filesystem-read"] : [];
  const object = {
    type: "ExecutableServiceOffer", contract: CONTRACT, sourceActivity: sourceActivity.id,
    intentSignature: "urn:service-intent:recover-digest-bound-prior-research",
    request, requestDigest: digest(request),
    scope: request.kind === "projection"
      ? { sourceResultId: request.sourceResultId, contextualBundleDigest: request.contextualBundleDigest, gapBundleDigest: request.gapBundleDigest, terms: request.terms, maxFiles: request.maxFiles }
      : { roots: request.roots, terms: request.terms, maxFiles: request.maxFiles, maxBytesPerFile: request.maxBytesPerFile, maxMatchesPerFile: request.maxMatchesPerFile },
    operation: "invoke-service", effects, requirements: effects.map((effect) => ({ type: "ResourceGrant", effect })),
    evidence: ["digest-bound-contextual-bundle", "explicit-gap-bundle", "provider-local-recovery-record", "no-customer-write"]
  };
  const offer = response("Offer", activity, object);
  await witness(activity, "offer.emitted", instant, { offer: offer.id, requestDigest: object.requestDigest }); emit(offer);
}
function validateInvocation(activity) {
  if (activity?.["@context"] !== CONTEXT || activity.type !== "Accept" || activity.target !== ACTOR) return "invocation must be an ActivityStreams Accept addressed to this provider";
  const contract = activity.object;
  if (contract?.type !== "ServiceContract" || contract.contract !== CONTRACT) return `invocation must accept ${CONTRACT}`;
  const offer = contract.offer;
  if (offer?.type !== "Offer" || offer.actor !== ACTOR || offer.object?.type !== "ExecutableServiceOffer") return "ServiceContract must carry this provider's executable Offer";
  const request = offer.object.request;
  if (offer.object.requestDigest !== digest(request)) return "accepted request does not match the provider offer digest";
  const changedTerms = requestProblems(request, request.executionMode === "live");
  if (changedTerms.length) return `accepted request no longer satisfies provider terms: ${changedTerms.join(", ")}`;
  const capability = contract.capability;
  if (capability?.type !== "Capability" || capability.holder !== ACTOR || capability.invocationTarget !== ACTOR) return "accepted contract requires a capability held by this provider";
  if (capability.parentOffer !== offer.id || capability.attenuation?.requestDigest !== offer.object.requestDigest) return "capability is not attenuated to the accepted offer and request";
  if (canonical(capability.attenuation?.providerScope) !== canonical(offer.object.scope)) return "capability does not preserve the provider-authored recovery scope";
  if (!Array.isArray(capability.allowedActions) || !capability.allowedActions.includes("invoke-service")) return "capability does not grant invoke-service";
  for (const effect of offer.object.effects ?? []) if (!capability.allowedActions.includes(effect)) return `capability does not grant required effect ${effect}`;
  return null;
}
function rgExclusions() {
  return ["--glob", "!.git/**", "--glob", "!**/.git/**", "--glob", "!node_modules/**", "--glob", "!**/node_modules/**", "--glob", "!data/**", "--glob", "!**/data/**"];
}
function probablyText(path) {
  let descriptor;
  try {
    descriptor = openSync(path, "r"); const sample = Buffer.alloc(8192); const count = readSync(descriptor, sample, 0, sample.length, 0);
    return !sample.subarray(0, count).includes(0);
  } catch { return false; } finally { if (descriptor !== undefined) closeSync(descriptor); }
}
function rgPaths(args) {
  const result = spawnSync("rg", args, { encoding: "utf8", maxBuffer: RG_MAX_BUFFER });
  if (result.error) throw result.error;
  if (![0, 1].includes(result.status)) throw new Error(`rg exited ${result.status}: ${(result.stderr || "").trim()}`);
  return result.stdout.split("\n").filter(Boolean).map((path) => resolve(path));
}
function candidateFiles(request) {
  const allFiles = rgPaths(["--files", "--hidden", ...rgExclusions(), "--", ...request.roots]);
  const candidates = new Map();
  const add = (path, term) => {
    if (!candidates.has(path)) candidates.set(path, new Set());
    candidates.get(path).add(term);
  };
  for (const term of request.terms) {
    const contentArgs = ["-l", "-i", "-F", "--hidden", ...rgExclusions(), "-e", term, "--", ...request.roots];
    for (const path of rgPaths(contentArgs)) add(path, term);
  }
  for (const path of allFiles) {
    const lower = path.toLowerCase();
    for (const term of request.terms) if (lower.includes(term.toLowerCase()) && probablyText(path)) add(path, term);
  }
  const statusBonus = { current: 3, experimental: 1, legacy: 0 };
  return [...candidates].map(([path, matched]) => ({ path, indexedTerms: [...matched].sort(), indexScore: matched.size * 10 + statusBonus[statusOf(path)] }))
    .sort((a, b) => b.indexScore - a.indexScore || a.path.localeCompare(b.path));
}
function ownerOf(path, roots, cache) {
  let cursor = dirname(path);
  while (true) {
    if (cache.has(cursor)) return cache.get(cursor);
    const manifest = join(cursor, "package.json");
    if (existsSync(manifest)) try {
      const pkg = JSON.parse(readFileSync(manifest, "utf8")); const nodeId = pkg?.["x-agentic-metro-enterprise"]?.["node-id"];
      if (typeof nodeId === "string") { const value = { nodeId, root: cursor, package: pkg.name ?? null }; cache.set(cursor, value); return value; }
    } catch { /* malformed manifests are not authority evidence */ }
    const parent = dirname(cursor);
    if (parent === cursor || roots.includes(cursor)) break;
    cursor = parent;
  }
  const root = roots.filter((candidate) => path === candidate || path.startsWith(`${candidate}${sep}`)).sort((a, b) => b.length - a.length)[0] ?? null;
  return { nodeId: null, root, package: null };
}
function statusOf(path) {
  const normalized = path.split(sep).join("/").toLowerCase();
  if (normalized.includes("/_archive/") || normalized.includes("/assets/legacy/")) return "legacy";
  if (normalized.includes("/experimental.")) return "experimental";
  return "current";
}
function fileDigest(bytes) { return `ni:///sha-256;${createHash("sha256").update(bytes).digest("base64url")}`; }
function sourceRecord(path, indexedTerms, request, ownerCache) {
  const bytes = readFileSync(path); const text = bytes.subarray(0, request.maxBytesPerFile).toString("utf8");
  const lines = text.split(/\r?\n/u); const terms = request.terms.map((term) => [term, term.toLowerCase()]);
  const snippets = [];
  for (let index = 0; index < lines.length && snippets.length < request.maxMatchesPerFile; index += 1) {
    const matchedTerms = terms.filter(([, lower]) => lines[index].toLowerCase().includes(lower)).map(([term]) => term);
    if (matchedTerms.length) {
      const start = Math.max(0, index - 2); const end = Math.min(lines.length, index + 3);
      snippets.push({ line: index + 1, matchedTerms, text: lines.slice(start, end).join("\n").slice(0, 1800) });
    }
  }
  const pathTerms = terms.filter(([, lower]) => path.toLowerCase().includes(lower)).map(([term]) => term);
  const matchedTerms = [...new Set([...indexedTerms, ...pathTerms, ...snippets.flatMap((snippet) => snippet.matchedTerms)])].sort();
  const owner = ownerOf(path, request.roots, ownerCache); const status = statusOf(path);
  const score = matchedTerms.length * 10 + snippets.length * 2 + (status === "current" ? 3 : status === "experimental" ? 1 : 0);
  return {
    path, relativeToRoot: owner.root ? relative(owner.root, path) : null, digest: fileDigest(bytes), byteSize: bytes.length,
    excerptTruncated: bytes.length > request.maxBytesPerFile, owner, status, matchedTerms, snippets, score
  };
}
function selectCandidates(candidates, request) {
  const selected = new Map();
  for (const term of request.terms) {
    if (selected.size >= request.maxFiles) break;
    const candidate = candidates.find((item) => item.indexedTerms.includes(term));
    if (candidate) selected.set(candidate.path, candidate);
  }
  for (const candidate of candidates) {
    if (selected.size >= request.maxFiles) break;
    selected.set(candidate.path, candidate);
  }
  return [...selected.values()];
}
function recover(request, instant) {
  const matched = candidateFiles(request); const selected = selectCandidates(matched, request); const gaps = []; const sources = []; const ownerCache = new Map();
  for (const candidate of selected) try { sources.push(sourceRecord(candidate.path, candidate.indexedTerms, request, ownerCache)); } catch (error) { gaps.push({ type: "unreadable-source", path: candidate.path, reason: error.message }); }
  sources.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  for (const term of request.terms) if (!sources.some((source) => source.matchedTerms.includes(term))) {
    const omittedMatches = matched.filter((candidate) => candidate.indexedTerms.includes(term)).length;
    gaps.push(omittedMatches ? { type: "term-not-admitted", term, matchingCandidates: omittedMatches } : { type: "unmatched-term", term });
  }
  if (matched.length > selected.length) gaps.push({ type: "candidate-truncation", matched: matched.length, admitted: selected.length, omitted: matched.length - selected.length });
  for (const source of sources) if (source.excerptTruncated) gaps.push({ type: "excerpt-truncation", path: source.path, byteSize: source.byteSize, admittedBytes: request.maxBytesPerFile });
  const contextualBundle = { type: "ContextualBundle", roots: request.roots, terms: request.terms, sourceCount: sources.length, sources };
  const gapBundle = { type: "GapBundle", gapCount: gaps.length, gaps };
  const resultBody = { type: "PriorResearchRecoveryResult", contract: CONTRACT, recoveredAt: instant, requestDigest: digest(request), contextualBundle, contextualBundleDigest: digest(contextualBundle), gapBundle, gapBundleDigest: digest(gapBundle), filesystemReads: sources.length, customerTerritoryMutation: false };
  return { id: contentId(resultBody), ...resultBody };
}
async function recoveryById(request) {
  for (const candidate of await querySettlementRecords(`${CONTRACT}.recoveries`)) {
      if (candidate.id !== request.sourceResultId) continue;
      // This is the provider's own append-only recovery record. Its bundle
      // digests and content-addressed result ID were computed when the record
      // was formed; reparsing and canonically reserializing a multi-megabyte
      // bundle on every rental would turn inventory lookup into a new sweep.
      // Match the exact stored identifiers here. The smaller projected value
      // receives fresh digests and the customer verifies those independently.
      if (candidate.contextualBundleDigest !== request.contextualBundleDigest) throw new Error("source recovery contextual bundle digest does not match the requested immutable value");
      if (candidate.gapBundleDigest !== request.gapBundleDigest) throw new Error("source recovery gap bundle digest does not match the requested immutable value");
      return candidate;
  }
  throw new Error("no provider-owned recovery matches the requested result id and digests");
}
function projectExistingRecovery(request, instant) {
  const sourceRecovery = recoveryById(request);
  const terms = request.terms.map((term) => [term, term.toLowerCase()]);
  const candidates = sourceRecovery.contextualBundle.sources.map((source) => {
    const haystack = [source.path, source.relativeToRoot, ...(source.matchedTerms ?? []), ...(source.snippets ?? []).flatMap((snippet) => [snippet.text, ...(snippet.matchedTerms ?? [])])].filter(Boolean).join("\n").toLowerCase();
    const matchedTerms = terms.filter(([, lower]) => haystack.includes(lower)).map(([term]) => term);
    return { source, matchedTerms };
  }).filter(({ matchedTerms }) => matchedTerms.length > 0).sort((left, right) => right.matchedTerms.length - left.matchedTerms.length || (right.source.score ?? 0) - (left.source.score ?? 0) || left.source.path.localeCompare(right.source.path));
  const selected = candidates.slice(0, request.maxFiles).map(({ source, matchedTerms }) => ({ ...source, projectionMatchedTerms: matchedTerms }));
  const gaps = [];
  for (const [term] of terms) if (!selected.some((source) => source.projectionMatchedTerms.includes(term))) gaps.push(candidates.some((candidate) => candidate.matchedTerms.includes(term)) ? { type: "term-not-admitted", term, matchingCandidates: candidates.filter((candidate) => candidate.matchedTerms.includes(term)).length } : { type: "unmatched-term", term });
  if (candidates.length > selected.length) gaps.push({ type: "candidate-truncation", matched: candidates.length, admitted: selected.length, omitted: candidates.length - selected.length });
  const contextualBundle = { type: "ContextualBundle", sourceRecovery: sourceRecovery.id, terms: request.terms, sourceCount: selected.length, sources: selected };
  const gapBundle = { type: "GapBundle", sourceRecoveryGapBundleDigest: sourceRecovery.gapBundleDigest, gapCount: gaps.length, gaps };
  const resultBody = { type: "PriorResearchProjectionResult", contract: CONTRACT, projectedAt: instant, requestDigest: digest(request), sourceRecovery: sourceRecovery.id, sourceContextualBundleDigest: sourceRecovery.contextualBundleDigest, sourceGapBundleDigest: sourceRecovery.gapBundleDigest, contextualBundle, contextualBundleDigest: digest(contextualBundle), gapBundle, gapBundleDigest: digest(gapBundle), filesystemReads: 0, customerTerritoryMutation: false };
  return { id: contentId(resultBody), ...resultBody };
}
async function invoke(activity, instant) {
  const invalid = validateInvocation(activity);
  if (invalid) { await reject(activity, invalid, instant); return; }
  const offer = activity.object.offer; const request = offer.object.request;
  if (request.executionMode === "dry-run") {
    const object = { type: "PriorResearchRecoveryResult", contract: CONTRACT, disposition: "ready", sourceActivity: offer.object.sourceActivity, requestDigest: offer.object.requestDigest, dryRun: true, observations: { filesystemReads: 0, recordsWritten: 0 } };
    await witness(activity, "contract.validated", instant, { requestDigest: object.requestDigest }); emit(response("Accept", activity, object)); return;
  }
  let result;
  try { result = request.kind === "projection" ? projectExistingRecovery(request, instant) : recover(request, instant); } catch (error) { await reject(activity, "recovery failed before producing a digest-bound result", instant, { diagnostic: error.message }); return; }
  await append(request.kind === "projection" ? "projections" : "recoveries", result, instant);
  await witness(activity, "contract.completed", instant, { result: result.id, contextualBundleDigest: result.contextualBundleDigest, gapBundleDigest: result.gapBundleDigest });
  emit(response("Accept", activity, { ...result, sourceActivity: offer.object.sourceActivity, dryRun: false }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const instant = now(); let activity;
  try { activity = input(); } catch (error) { await reject({}, `invalid JSON input: ${error.message}`, instant); }
  if (activity !== undefined) {
    if (operation() === "solicit-service") await solicit(activity, instant);
    else if (operation() === "invoke-service") await invoke(activity, instant);
    else await reject(activity, `unknown provider operation ${operation()}`, instant);
  }
}
