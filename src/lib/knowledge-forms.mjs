import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";

const semantic = (value) => identifyJsonSemanticContent({ objectKind: "corpus-management.knowledge-form", value, witnessRoot: EMPTY_WITNESS_ROOT });
export function canonical(value) { return semantic(value).bytes.toString("base64"); }

export function digest(value) { return semantic(value).id; }

export function contentId(value) { return digest(value); }

export function analyzeForms(forms) {
  const issues = [];
  const seen = new Set();
  const charges = new Map();
  forms.forEach((form, index) => {
    const locus = typeof form?.id === "string" && form.id ? form.id : `form-index:${index}`;
    if (!form || typeof form !== "object" || Array.isArray(form)) {
      issues.push({ type: "ill-typed-form", locus });
      return;
    }
    if (typeof form.id !== "string" || !form.id) issues.push({ type: "missing-identifier", locus });
    else if (seen.has(form.id)) issues.push({ type: "duplicate-identifier", locus: form.id });
    else seen.add(form.id);
    if (typeof form.schema !== "string" || !form.schema) issues.push({ type: "missing-schema-address", locus });
    if (!form.provenance || typeof form.provenance !== "object") issues.push({ type: "missing-provenance", locus });
    for (const claim of Array.isArray(form.claims) ? form.claims : []) {
      if (!claim || typeof claim.entity !== "string" || typeof claim.attribute !== "string" || !["held", "denied"].includes(claim.charge)) {
        issues.push({ type: "ill-typed-claim", locus });
        continue;
      }
      const key = canonical([claim.entity, claim.attribute, claim.value]);
      if (!charges.has(key)) charges.set(key, new Set());
      charges.get(key).add(claim.charge);
    }
  });
  for (const [locus, values] of charges) if (values.size > 1) issues.push({ type: "contested-claim", locus: digest(locus) });
  return issues.sort((a, b) => canonical(a).localeCompare(canonical(b)));
}
