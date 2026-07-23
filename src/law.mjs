import { readFileSync } from "node:fs";
import { compileRmlLaw } from "@emsenn/rmn-semantic-conformance/law";

const compile = (name) => compileRmlLaw(readFileSync(new URL(`../content/contracts/${name}.rml`, import.meta.url), "utf8"));
export const CORPUS_KNOWLEDGE_LAW = compile("managing-project-corpus-knowledge");
export const PRIOR_RESEARCH_LAW = compile("recovering-prior-research");
export const PROJECT_CORPUS_SEAM_LAW = compile("project-management-team-hires-corpus-management-team");
export const CORPUS_KNOWLEDGE_CONTRACT = CORPUS_KNOWLEDGE_LAW.id;
export const PRIOR_RESEARCH_CONTRACT = PRIOR_RESEARCH_LAW.id;
export const PROJECT_CORPUS_SEAM_CONTRACT = PROJECT_CORPUS_SEAM_LAW.id;
