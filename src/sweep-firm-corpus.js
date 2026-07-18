#!/usr/bin/env node
// Sweeps a filesystem subtree for candidate prior-art assets matching bounded
// keywords, packages them as corpus-management-team knowledge forms, and
// runs the team's own real analyzeForms pipeline over them. When two or more
// candidates share a base filename (an "ambiguous name-match"), it makes one
// real, contracted call to anthropic-inference-team's run-one-exchange.mjs
// harness to judge which is canonical, instead of guessing or building a new
// inference path.
import { mkdtempSync, mkdirSync, appendFileSync, existsSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, relative, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { canonical, analyzeForms } from "./lib/knowledge-forms.mjs";

const NODE_ID = "corpus-management-team";
const NODE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set([".git", "node_modules"]);
const DEFAULT_MAX_FILES = 200;
const INFERENCE_HARNESS_SUFFIX = "lib/emsenn/services/561-group/services/red-cup-engineering/services/logical-inference-service-section/services/anthropic-inference-team/run-one-exchange.mjs";

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

function findRepoRoot(startDir) {
  let dir = startDir;
  while (true) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
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

function buildPacket(slug, peers) {
  const prompt = [
    `These ${peers.length} file paths all share the base name "${slug}" inside one firm's repository:`,
    ...peers.map((p, i) => `${i + 1}. ${p}`),
    "",
    "Reply with ONLY a JSON object, no prose: {\"canonical\": \"<one path exactly as given, or null>\", \"distinct\": true|false, \"note\": \"<one short sentence>\"}",
    "\"distinct\" is true if these are actually different artifacts that happen to share a name, false if one supersedes the others as the same evolving asset."
  ].join("\n");
  return { model: "claude-opus-4-8", messages: [{ role: "user", content: prompt }], "max-tokens": 400 };
}

function resolveHarness() {
  const explicit = arg("--inference-harness");
  if (explicit) return existsSync(explicit) ? explicit : null;
  const repoRootArg = arg("--repo-root");
  const repoRoot = repoRootArg ?? findRepoRoot(NODE_ROOT);
  if (!repoRoot) return null;
  const candidate = join(repoRoot, INFERENCE_HARNESS_SUFFIX);
  return existsSync(candidate) ? candidate : null;
}

function runInference(harnessPath, packet, live) {
  const dir = mkdtempSync(join(tmpdir(), "sweep-firm-corpus-"));
  const packetPath = join(dir, "packet.json");
  try {
    writeFileSync(packetPath, JSON.stringify(packet));
    const flags = live ? [] : ["--dry-run"];
    const result = spawnSync(process.execPath, [harnessPath, packetPath, ...flags], { encoding: "utf8" });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function judge(slug, peers, harnessPath, live) {
  if (!harnessPath) return { mode: "skipped", reason: "no anthropic-inference-team harness resolved", canonical: null, distinct: null, note: null };
  const packet = buildPacket(slug, peers);
  const outcome = runInference(harnessPath, packet, live);
  if (!live) {
    let parsed;
    try { parsed = JSON.parse(outcome.stdout); } catch { parsed = null; }
    return { mode: "dry-run", packetValid: parsed?.["packet-valid"] ?? null, canonical: null, distinct: null, note: "dry-run only verifies the harness is reachable; it renders no real verdict" };
  }
  if (outcome.status === 3) return { mode: "live", canonical: null, distinct: null, note: "anthropic-inference-team's bounded-pilot cap was reached; group left unresolved" };
  let record;
  try { record = JSON.parse(outcome.stdout); } catch { return { mode: "live", canonical: null, distinct: null, note: `harness produced unparseable output: ${outcome.stderr || outcome.stdout}` }; }
  if (record.outcome !== "completion") return { mode: "live", canonical: null, distinct: null, note: `harness settled to a refusal: ${record.refusal?.grounds ?? "unknown"}` };
  let verdict;
  try { verdict = JSON.parse(record.completion.text); } catch { return { mode: "live", canonical: null, distinct: null, note: `model reply was not JSON: ${record.completion.text.slice(0, 200)}` }; }
  return { mode: "live", canonical: peers.includes(verdict.canonical) ? verdict.canonical : null, distinct: verdict.distinct ?? null, note: verdict.note ?? null };
}

function assembleForms(bySlug, root, harnessPath, live) {
  const forms = [];
  const groupSummaries = [];
  for (const [slug, peers] of bySlug) {
    const ambiguous = peers.length > 1;
    let verdict = null;
    if (ambiguous) verdict = judge(slug, peers, harnessPath, live);
    groupSummaries.push({ slug, peers, ambiguous, verdict });
    for (const peer of peers) {
      const claims = [];
      if (ambiguous) {
        claims.push({ entity: slug, attribute: "is-canonical", value: true, charge: "held" });
        if (verdict?.canonical) claims.push({ entity: slug, attribute: "is-canonical", value: true, charge: peer === verdict.canonical ? "held" : "denied" });
      }
      forms.push({
        id: peer,
        schema: schemaFor(peer),
        provenance: { source: peer, slug, peers: peers.filter((p) => p !== peer) },
        claims
      });
    }
  }
  return { forms, groupSummaries };
}

function appendJsonl(path, values) {
  mkdirSync(dirname(path), { recursive: true });
  for (const value of values) appendFileSync(path, `${JSON.stringify(value)}\n`, "utf8");
}

function witnessSweep(instant, result) {
  const day = instant.slice(0, 10);
  const [year, month, date] = day.split("-");
  appendJsonl(join(NODE_ROOT, "data/sweeps", year, month, date, `${day}-${NODE_ID}-sweeps.jsonl`), [
    { time: instant, root: result.root, terms: result.terms, fileCount: result.fileCount, ambiguousGroups: result.ambiguousGroups, inferenceMode: result.inference.mode }
  ]);
}

const root = arg("--root");
const terms = args("--term");
if (!root || !existsSync(root) || !statSync(root).isDirectory()) {
  process.stdout.write(`${JSON.stringify({ type: "Refusal", reason: "--root must name an existing directory" }, null, 2)}\n`);
  process.exitCode = 2;
} else if (!terms.length) {
  process.stdout.write(`${JSON.stringify({ type: "Refusal", reason: "at least one --term keyword is required to bound the sweep" }, null, 2)}\n`);
  process.exitCode = 2;
} else {
  const instant = now();
  const live = process.argv.includes("--live");
  const maxFiles = Number(arg("--max-files") ?? DEFAULT_MAX_FILES);
  const { files, totalFound, truncated, droppedCount } = walk(resolve(root), terms, maxFiles);
  if (truncated) process.stderr.write(`note: ${totalFound} files matched, only the first ${maxFiles} were swept; ${droppedCount} dropped (raise --max-files to include them)\n`);
  const harnessPath = resolveHarness();
  const bySlug = group(files, resolve(root));
  const { forms, groupSummaries } = assembleForms(bySlug, resolve(root), harnessPath, live);
  const issues = analyzeForms(forms);
  const ambiguousGroups = groupSummaries.filter((g) => g.ambiguous).length;
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
    inference: { mode: harnessPath ? (live ? "live" : "dry-run") : "skipped", harness: harnessPath },
    groups: groupSummaries,
    forms,
    issues
  };
  witnessSweep(instant, result);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
