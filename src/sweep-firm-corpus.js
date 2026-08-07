#!/usr/bin/env node
// Sweeps a filesystem subtree for candidate prior-art assets matching bounded
// keywords, packages them as corpus-management-team knowledge forms, and
// runs the team's own deterministic analyzeForms pipeline over them. A shared
// base filename is recorded as unresolved evidence; model output cannot settle
// identity and no private inference harness is embedded in this settlement.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, relative, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeForms } from "./lib/knowledge-forms.mjs";
import { requestCoordinationReadout } from "./lib/coordination-readout.mjs";
import { createSemanticRecordJournal } from "@red-cup-engineering/semantic-record-journal-service";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
import { CORPUS_KNOWLEDGE_CONTRACT } from "./law.mjs";

const NODE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set([".git", "node_modules", "data"]);
const DEFAULT_MAX_FILES = 200;
const DEFAULT_MAX_TERRITORIES = 64;
const ACTOR = "urn:ame:corpus-management-team";
const TERRITORY_MARKERS = new Set(["package.json", "Cargo.toml", "lakefile.lean", "lean-toolchain", "pyproject.toml", "go.mod"]);

function arg(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function args(flag) {
  const out = [];
  process.argv.forEach((value, index) => { if (value === flag) out.push(process.argv[index + 1]); });
  return out;
}

function now() {
  return arg("--now") ?? new Date().toISOString();
}

function schemaFor(path) {
  const ext = extname(path).toLowerCase();
  if (path.toLowerCase().endsWith(".schema.json")) return "urn:schema:json-schema";
  if (ext === ".md") return "urn:schema:document";
  if ([".mts", ".ts", ".js", ".mjs", ".cjs"].includes(ext)) return "urn:schema:source-module";
  return "urn:schema:file";
}

function slugOf(path) {
  const name = basename(path).replace(/\.schema\.json$/i, "").replace(extname(path), "");
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function sha256File(path) {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function observedMaterial(root, files) {
  const entries = files.map((file) => {
    const stat = statSync(file);
    return Object.freeze({ path: relative(root, file), bytes: stat.size, sha256: sha256File(file) });
  });
  const body = { type: "BoundedTerritoryMaterialSet", root, entries };
  return Object.freeze({ type: body.type, materialId: identifyJsonSemanticContent({ objectKind: "corpus-management.bounded-territory-material-set", value: body, witnessRoot: EMPTY_WITNESS_ROOT }).id, entries,
    totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) });
}

function extensionCounts(files) {
  const counts = {};
  for (const file of files) {
    const ext = extname(file).toLowerCase() || "[none]";
    counts[ext] = (counts[ext] ?? 0) + 1;
  }
  return counts;
}

function packageMarker(root, name) {
  const path = join(root, name);
  return existsSync(path) && statSync(path).isFile() ? name : null;
}

function territoryKindFromMarkers(markers) {
  if (markers.includes("package.json")) return "node-package";
  if (markers.includes("Cargo.toml")) return "rust-package";
  if (markers.includes("lakefile.lean") || markers.includes("lean-toolchain")) return "proof-corpus";
  if (markers.includes("pyproject.toml")) return "python-package";
  if (markers.includes("go.mod")) return "go-package";
  return "knowledge-vault";
}

function discoverTerritoryRoots(root, maximum) {
  const packageRoots = [];
  const unownedDocuments = new Map();
  const stack = [root];
  while (stack.length) {
    const directory = stack.pop();
    let entries;
    try { entries = readdirSync(directory, { withFileTypes: true }); } catch { continue; }
    const names = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
    const markers = [...TERRITORY_MARKERS].filter((name) => names.has(name));
    if (markers.length) packageRoots.push({ root: directory, markers: markers.sort(), kind: territoryKindFromMarkers(markers) });
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name) || entry.isSymbolicLink()) continue;
      const full = join(directory, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && [".md", ".txt", ".rst"].includes(extname(entry.name).toLowerCase())) {
        const relativePath = relative(root, full);
        const first = relativePath.split(/[\\/]/u)[0];
        const region = first ? join(root, first) : root;
        unownedDocuments.set(region, (unownedDocuments.get(region) ?? 0) + 1);
      }
    }
  }
  packageRoots.sort((left, right) => left.root.localeCompare(right.root));
  const owned = (candidate) => packageRoots.some((entry) => candidate === entry.root || candidate.startsWith(`${entry.root}/`));
  const knowledgeRoots = [...unownedDocuments]
    .filter(([candidate, count]) => count > 0 && !owned(candidate))
    .map(([candidate, documentCount]) => ({ root: candidate, markers: [], kind: "knowledge-vault", documentCount }));
  const territories = [...packageRoots, ...knowledgeRoots].sort((left, right) => left.root.localeCompare(right.root));
  return { territories: territories.slice(0, maximum), totalFound: territories.length, truncated: territories.length > maximum };
}

function filesWithinTerritory(territory, allRoots, maximum) {
  const nested = allRoots.filter((candidate) => candidate !== territory && candidate.startsWith(`${territory}/`));
  const files = [], stack = [territory];
  while (stack.length && files.length <= maximum) {
    const directory = stack.pop();
    let entries;
    try { entries = readdirSync(directory, { withFileTypes: true }); } catch { continue; }
    entries.sort((left, right) => right.name.localeCompare(left.name));
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name) || entry.isSymbolicLink()) continue;
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!nested.includes(full)) stack.push(full);
      } else if (entry.isFile()) files.push(full);
      if (files.length > maximum) break;
    }
  }
  files.sort();
  return { files: files.slice(0, maximum), truncated: files.length > maximum };
}

// This is a material classifier, not an authority classifier.  Its output is
// deliberately proposal-only: a receiver still decides whether a recognized
// region becomes a settlement, which provider to hire, and what it may do.
function recognizeTerritory(root, material, terms) {
  const counts = extensionCounts(material.entries.map((entry) => entry.path));
  const markers = [packageMarker(root, "package.json"), packageMarker(root, "Cargo.toml"), packageMarker(root, "lakefile.lean"), packageMarker(root, "lean-toolchain"), packageMarker(root, "pyproject.toml"), packageMarker(root, "go.mod")].filter(Boolean);
  const candidates = [];
  if (markers.includes("package.json")) candidates.push({ kind: "node-package", evidence: ["package.json"], nextCapability: "package-stewardship-and-release-advice" });
  if (markers.includes("Cargo.toml")) candidates.push({ kind: "rust-package", evidence: ["Cargo.toml"], nextCapability: "cargo-package-stewardship-and-verification" });
  if (markers.includes("lakefile.lean") || markers.includes("lean-toolchain") || (counts[".lean"] ?? 0) > 0) candidates.push({ kind: "proof-corpus", evidence: markers.filter((item) => item === "lakefile.lean" || item === "lean-toolchain").concat((counts[".lean"] ?? 0) > 0 ? [`${counts[".lean"]} .lean files`] : []), nextCapability: "proof-corpus-verification-and-indexing" });
  if (markers.includes("pyproject.toml")) candidates.push({ kind: "python-package", evidence: ["pyproject.toml"], nextCapability: "python-package-stewardship-and-release" });
  if (markers.includes("go.mod")) candidates.push({ kind: "go-package", evidence: ["go.mod"], nextCapability: "go-package-stewardship-and-release" });
  const documents = (counts[".md"] ?? 0) + (counts[".txt"] ?? 0) + (counts[".rst"] ?? 0);
  if (documents > 0) candidates.push({ kind: "knowledge-vault", evidence: [`${documents} document files`, ...terms.map((term) => `bounded term:${term}`)], nextCapability: "corpus-indexing-research-recovery-and-publication-advice" });
  if (/(?:^|[\\/])(?:archive|archives|legacy)(?:[\\/]|$)/iu.test(root)) candidates.push({ kind: "archive", evidence: ["territory-path archive marker"], nextCapability: "archive-preservation-and-cataloguing-advice" });
  if (!candidates.length) candidates.push({ kind: "unclassified-material", evidence: ["no recognized package, proof, document, or archive marker in bounded observation"], nextCapability: "territory-recognition-review" });
  const proposalBody = { type: "TerritoryRecognitionProposal", territory: root, material: material.materialId, markers, extensionCounts: counts,
    candidates, disposition: "advisory-proposal-only", enterpriseFormed: false, territoryMutated: false, providerSelected: false, spendAuthorized: false };
  return Object.freeze({ proposalId: identifyJsonSemanticContent({ objectKind: "corpus-management.territory-recognition-proposal", value: proposalBody, witnessRoot: EMPTY_WITNESS_ROOT }).id, ...proposalBody });
}

function formationLeadCandidate(recognition, instant) {
  const requiredCapabilities = [...new Set(recognition.candidates.map((candidate) => candidate.nextCapability))];
  const body = {
    type: "FounderEnterpriseFormationMarketLeadCandidate", supplier: ACTOR, sourceActivity: recognition.proposalId,
    sourceGap: recognition.material, customer: ACTOR, lot: recognition.proposalId, observedAt: instant,
    requiredCapabilities, missingCapabilities: requiredCapabilities, maximumCustomerBounty: { amount: 0, unit: "relative-resolution-milliquanta-v1" },
    transportAuthenticated: false, founderDecisionRequired: true, enterpriseFormationAuthorized: false, enterpriseFormed: false,
    formationProviderPreselected: false, customerMutation: false, spendAuthorized: false,
    nextBoundary: "treaty-mapped-activitypub-formation-lead-or-refusal",
  };
  return Object.freeze({ candidateId: identifyJsonSemanticContent({ objectKind: "corpus-management.formation-lead-candidate", value: body, witnessRoot: EMPTY_WITNESS_ROOT }).id, ...body });
}

function walk(root, terms, maxFiles) {
  const hits = [];
  const stack = [root];
  const lowerTerms = terms.map((t) => t.toLowerCase());
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        const rel = relative(root, full).toLowerCase();
        if (lowerTerms.some((term) => rel.includes(term))) hits.push(full);
      }
    }
  }
  hits.sort();
  const truncated = hits.length > maxFiles;
  return { files: truncated ? hits.slice(0, maxFiles) : hits, totalFound: hits.length, truncated, droppedCount: truncated ? hits.length - maxFiles : 0 };
}

function group(files, root) {
  const bySlug = new Map();
  for (const file of files) {
    const slug = slugOf(file);
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(relative(root, file));
  }
  return bySlug;
}

// Identity stays unsettled — a shared name is not evidence of semantic
// identity — but the collision's coordination structure is measured rather
// than shrugged at: how many directories the shared name bridges, and how
// many pairwise overlaps that contributes to the sweep's cover nerve.
function judge(peers) {
  const directories = [...new Set(peers.map((peer) => dirname(peer)))];
  return { mode: "unresolved", outcome: { positiveEvidence: false, negativeEvidence: false }, canonical: null, distinct: null,
    coordination: { directories: directories.length, bridgingPairs: (directories.length * (directories.length - 1)) / 2 },
    note: "a shared name is not evidence of semantic identity" };
}

// The sweep's shared-name groups form a cover of the swept directories: each
// slug group is a patch over every directory holding one of its peers. The
// cover nerve prices that structure — h0rank counts independent clusters,
// h1rank counts the coordination cycles any consolidation would have to
// erase, landauerBits prices that erasure — computed by the cover-nerve
// readout seated at the mathematical-readout-exchange die.
function assembleForms(bySlug, root) {
  const forms = [];
  const groupSummaries = [];
  for (const [slug, peers] of bySlug) {
    const ambiguous = peers.length > 1;
    let verdict = null;
    if (ambiguous) verdict = judge(peers);
    groupSummaries.push({ slug, peers, ambiguous, verdict });
    for (const peer of peers) {
      forms.push({
        id: peer,
        schema: schemaFor(peer),
        provenance: { source: peer, slug, peers: peers.filter((p) => p !== peer) },
        claims: []
      });
    }
  }
  return { forms, groupSummaries };
}

async function witnessSweep(instant, result) { createSemanticRecordJournal({ root: NODE_ROOT, objectKind: "corpus-management.record" }).record({ category: `${CORPUS_KNOWLEDGE_CONTRACT}.sweeps`, recordedAt: instant, record: { type: "FirmCorpusSweepWitness", law: CORPUS_KNOWLEDGE_CONTRACT, time: instant, root: result.root, terms: result.terms, fileCount: result.fileCount, ambiguousGroups: result.ambiguousGroups, coordination: result.coordination, material: result.material.materialId, territoryRecognition: result.territoryRecognition.proposalId, formationLeadCandidate: result.formationLeadCandidate.candidateId, inferenceMode: result.inference.mode }, charge: { support: true, refutation: false } }); }

async function witnessTerritories(instant, result) {
  const dataRoot = resolve(process.env.CORPUS_MANAGEMENT_DATA_ROOT ?? join(NODE_ROOT, "data"));
  const category = `${CORPUS_KNOWLEDGE_CONTRACT}.territories`;
  const provider = createSemanticRecordJournal({ root: NODE_ROOT, objectKind: "corpus-management.record" });
  const known = new Set(provider.query({ category }).map(({ record }) => `${record.territory}\u0000${record.material?.materialId}`));
  let appended = 0;
  for (const territory of result.territories) {
    const key = `${territory.territory}\u0000${territory.material.materialId}`;
    if (known.has(key)) continue;
    provider.record({ category, recordedAt: instant, record: territory, charge: { support: true, refutation: false } });
    known.add(key); appended += 1;
  }
  return appended;
}

const root = arg("--root");
const terms = args("--term");
if (!root || !existsSync(root) || !statSync(root).isDirectory()) {
  process.stdout.write(`${JSON.stringify({ type: "Refusal", reason: "--root must name an existing directory" }, null, 2)}\n`);
  process.exitCode = 2;
} else if (!terms.length && !process.argv.includes("--discover-territories")) {
  process.stdout.write(`${JSON.stringify({ type: "Refusal", reason: "at least one --term keyword is required to bound the sweep" }, null, 2)}\n`);
  process.exitCode = 2;
} else {
  const instant = now();
  const maxFiles = Number(arg("--max-files") ?? DEFAULT_MAX_FILES);
  if (process.argv.includes("--discover-territories")) {
    const maximumTerritories = Number(arg("--max-territories") ?? DEFAULT_MAX_TERRITORIES);
    const discovery = discoverTerritoryRoots(resolve(root), maximumTerritories);
    const allRoots = discovery.territories.map((entry) => entry.root);
    const territories = discovery.territories.map((entry) => {
      const bounded = filesWithinTerritory(entry.root, allRoots, maxFiles);
      const material = observedMaterial(entry.root, bounded.files);
      const territoryRecognition = recognizeTerritory(entry.root, material, []);
      return Object.freeze({ type: "DiscoveredInformationalTerritory", territory: entry.root, kind: entry.kind, markers: entry.markers,
        material, territoryRecognition, formationLeadCandidate: formationLeadCandidate(territoryRecognition, instant),
        observation: { fileCount: bounded.files.length, truncated: bounded.truncated }, observedAt: instant });
    });
    const result = { type: "FirmTerritoryDiscoveryResult", root: resolve(root), scannedAt: instant, territoryCount: territories.length,
      totalFound: discovery.totalFound, truncated: discovery.truncated, territories };
    result.appendedTerritories = await witnessTerritories(instant, result);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(0);
  }
  const { files, totalFound, truncated, droppedCount } = walk(resolve(root), terms, maxFiles);
  if (truncated) process.stderr.write(`note: ${totalFound} files matched, only the first ${maxFiles} were swept; ${droppedCount} dropped (raise --max-files to include them)\n`);
  const bySlug = group(files, resolve(root));
  const { forms, groupSummaries } = assembleForms(bySlug, resolve(root));
  const issues = analyzeForms(forms);
  const ambiguousGroups = groupSummaries.filter((g) => g.ambiguous).length;
  const coordination = await requestCoordinationReadout(groupSummaries);
  const material = observedMaterial(resolve(root), files);
  const territoryRecognition = recognizeTerritory(resolve(root), material, terms);
  const lead = formationLeadCandidate(territoryRecognition, instant);
  const result = {
    type: "FirmCorpusSweepResult",
    root: resolve(root),
    terms,
    scannedAt: instant,
    fileCount: files.length,
    totalFound,
    truncated,
    droppedCount,
    groupCount: groupSummaries.length,
    ambiguousGroups,
    coordination,
    inference: { mode: "not-performed", reason: "model output cannot settle a corpus identity claim" },
    material,
    territoryRecognition,
    formationLeadCandidate: lead,
    groups: groupSummaries,
    forms,
    issues
  };
  await witnessSweep(instant, result);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
