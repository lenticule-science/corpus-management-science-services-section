---
name: "CONTROLLED VOCABULARIES"
---

# Controlled Vocabularies for RRPR Metadata

**Purpose**: Defines canonical values for topics, disciplines, and RRPR modality tags used in frontmatter metadata. Ensures consistency, enables meaningful aggregation queries, and maintains semantic coherence across the corpus.

**Last Updated**: 2025-11-09  
**Status**: Canonical

---

## Core Principle

**Controlled vocabularies enable graph queries**: Using standardized metadata values allows the knowledge graph to answer questions like "Show all topos theory documents" or "Find all papers applying the differentiation modality."

---

## Topics

Topics are **specific subjects** addressed in documents. They are granular and domain-specific.

### Canonical Topics

**Current corpus usage** (extracted 2025-11-09): 12 unique topics in potential use.  
**Anticipated additions**: 5 topics marked (anticipated) for future corpus development.

#### Relationing Theory
- `relationing` - Core relationing framework and philosophy
- `differentiation` - Primitive act of being; distinguishing regions (anticipated)
- `recognition` - Regions produced by distinctions (anticipated)
- `relation` - Connections and dependencies between regions (anticipated)
- `stabilization` - Reflexive stability and fixation (anticipated)
- `existence` - Philosophical/mathematical foundations of being

#### Mathematics
- `category-theory` - Categories, functors, natural transformations
- `topos-theory` - Toposes, sheaves, geometric logic
- `homotopy-theory` - Homotopy types, ∞-categories
- `logic` - Formal logic systems
- `geometry` - Geometric structures and spaces
- `modality` - Modal operators and logics
- `posets` - Partially ordered sets
- `algebra` - Algebraic structures (anticipated)
- `topology` - Topological spaces and continuity (anticipated)
- `information-theory` - Information, entropy, coding theory (anticipated)

#### Research Operations
- `meta` - Meta-research, methodology, infrastructure
- `planning` - Research planning and roadmaps
- `backlog` - Incomplete ideas and future work
- `bibliography` - Citation management and references (anticipated)

### Usage Rules

1. **Multiple topics allowed**: Documents can have multiple topics
2. **Lowercase, hyphenated**: All topic IDs use `lowercase-with-hyphens`
3. **Specific over general**: Prefer specific topics (e.g., `topos-theory` > `mathematics`)
4. **Consult this list**: Before adding a new topic, check if existing one suffices

### Adding New Topics

**When to add:**
- New mathematical subdomain introduced
- New RRPR concept developed
- New research operation type emerges

**Process:**
1. Check if existing topic covers the concept
2. Propose new topic ID (lowercase-hyphenated)
3. Add to this document with description
4. Update all relevant documents' frontmatter
5. Commit with message: `vocab: Add topic '{new-topic}'`

---

## Disciplines

Disciplines are **broad academic fields**. They classify the document's primary intellectual tradition.

### Canonical Disciplines

**Current corpus usage** (extracted 2025-11-09): 2 unique disciplines in active use.  
**Anticipated additions**: 4 disciplines marked (anticipated) for future corpus development.

- `mathematics` - Mathematical research and formalism
- `philosophy` - Philosophical inquiry and conceptual analysis
- `physics` - Physical sciences and modeling (anticipated)
- `computer-science` - Computation, algorithms, information theory (anticipated)
- `indigenous-studies` - Indigenous knowledge systems and epistemology (anticipated)
- `cultural-studies` - Cultural analysis and critique (anticipated)

### Usage Rules

1. **One or two disciplines**: Typically one primary, optionally one secondary
2. **Lowercase, hyphenated**: Format: `lowercase-with-hyphens`
3. **Interdisciplinary work**: List both disciplines if equally foundational

### Examples

```toml
# Pure mathematics
disciplines = ["mathematics"]

# Philosophy of mathematics
disciplines = ["philosophy", "mathematics"]

# Relationing bridging Lakota cosmology and category theory
disciplines = ["indigenous-studies", "mathematics"]

# Computational physics
disciplines = ["physics", "computer-science"]
```

### Adding New Disciplines

**When to add:**
- Document draws on new academic tradition
- New interdisciplinary bridge emerges

**Process:**
1. Verify it's a discipline (broad field), not a topic (specific subject)
2. Add to this list with description
3. Update relevant documents
4. Commit with message: `vocab: Add discipline '{new-discipline}'`

---

## RRPR Modality Tags

**Modality tags** annotate which aspects of the Relationing framework a document primarily engages.

### The Four Modalities

Based on **Proposing Relationing** (Section 2: "The Relational ∞-Topos Modality"):

#### 1. Differentiation
**Tag:** `modality:differentiation`

**Description:** Primitive act of being; the fundamental operation of distinguishing regions, making distinctions, creating boundaries.

**Applied to documents that:**
- Define what it means to "be" or "exist"
- Analyze the act of distinction-making
- Explore boundary creation
- Investigate primitive operations

**Example:**
```toml
rrpr_modalities = ["differentiation"]
```

#### 2. Recognition
**Tag:** `modality:recognition`

**Description:** Regions produced by distinctions; the stabilization of differentiated entities into identifiable, persistent structures.

**Applied to documents that:**
- Define types, categories, or classes
- Classify or categorize entities
- Establish identity conditions
- Formalize "what something is"

**Example:**
```toml
rrpr_modalities = ["recognition"]
```

#### 3. Relation
**Tag:** `modality:relation`

**Description:** Connections, dependencies, and transformations between recognized entities; the network of interactions.

**Applied to documents that:**
- Map dependencies between concepts
- Define morphisms, functions, transformations
- Analyze relational structures
- Explore networks and graphs

**Example:**
```toml
rrpr_modalities = ["relation"]
```

#### 4. Stabilization
**Tag:** `modality:stabilization`

**Description:** Reflexive fixation; systems achieving equilibrium, closure, or self-consistency through feedback.

**Applied to documents that:**
- Prove stability theorems
- Analyze fixed points or equilibria
- Study self-referential or reflexive structures
- Investigate conservation laws

**Example:**
```toml
rrpr_modalities = ["stabilization"]
```

### Usage Rules

1. **Optional field**: Not all documents need modality tags (e.g., planning docs, bibliographies)
2. **Multiple allowed**: A document can engage multiple modalities
3. **Primary focus**: Tag modalities that are **substantively developed**, not just mentioned
4. **RITM pattern**: Documents about the full cycle can tag all four

### Examples

**Topos theory document (recognition + relation):**
```toml
rrpr_modalities = ["recognition", "relation"]
topics = ["topos-theory", "relationing"]
```

**Category theory formalizing types (recognition + relation):**
```toml
rrpr_modalities = ["recognition", "relation"]
topics = ["category-theory", "relationing"]
```

**Full RITM exposition (all four):**
```toml
rrpr_modalities = ["differentiation", "recognition", "relation", "stabilization"]
topics = ["relationing", "modality"]
```

---

## Frontmatter Integration

### Full Example

```toml
+++
id = "deriving-a-reflexive-infinity-topos"
title = "Deriving a Reflexive ∞-Topos from Relationing Primitives"
author = "virtual:author.aragorn"
created_on = "2024-01-15"
document_type = "paper"

# Topical classification
topics = ["relationing", "topos-theory", "homotopy-theory"]
disciplines = ["mathematics", "philosophy"]

# RRPR framework alignment
rrpr_modalities = ["recognition", "relation"]

# Relational metadata
depends_on = ["proposing-relationing"]
cites_internal = ["proposing-relationing"]
defines = []

[cites_external](../../../../../../../../../../../../../public-services-section/services/personal-services-section/services/emsenn-services-section/lib/preservation/emsenn-archive-org/research/operations/engineering/triage/content/speculative/computing/from-sloppyresearch/docs/cites_external)
key = "lurie:2009:higher-topos-theory"
authors = ["Jacob Lurie"]
title = "Higher Topos Theory"
year = 2009
venue = "Princeton University Press"
+++
```

### Validation

Documents **should** be validated against these vocabularies:
- `topics` must be from canonical list or proposed extension
- `disciplines` must be from canonical list
- `rrpr_modalities` must be from the four modalities

**Validation script:** `scripts/validate_vocabularies.py`

---

## Querying by Vocabulary

### Find All Topos Theory Documents

```sql
SELECT r.path, dm.title
FROM relcells r
JOIN edges e ON r.id = e.subject_id
JOIN document_metadata dm ON r.id = dm.relcell_id
WHERE e.predicate = 'has_topic' AND e.object_literal = 'topos-theory'
ORDER BY dm.created_on DESC
```

### Find All Documents Using Stabilization Modality

```sql
SELECT r.path, dm.title
FROM relcells r
JOIN document_metadata dm ON r.id = dm.relcell_id
WHERE EXISTS (
    SELECT 1 FROM json_each(dm.extra, '$.rrpr_modalities')
    WHERE json_each.value = 'stabilization'
)
ORDER BY r.path
```

### Find Interdisciplinary Mathematics-Philosophy Works

```sql
SELECT r.path, dm.title
FROM relcells r
JOIN document_metadata dm ON r.id = dm.relcell_id
WHERE EXISTS (
    SELECT 1 FROM json_each(dm.extra, '$.disciplines')
    WHERE json_each.value = 'mathematics'
)
AND EXISTS (
    SELECT 1 FROM json_each(dm.extra, '$.disciplines')
    WHERE json_each.value = 'philosophy'
)
ORDER BY r.path
```

---

## Implementation Notes

### Storage in Database

**Topics and disciplines** generate `has_topic` and `has_discipline` edges:
```
(document) --[has_topic]--> "topos-theory"
(document) --[has_discipline]--> "mathematics"
```

**RRPR modalities** are stored in `document_metadata.extra` JSON field:
```json
{
  "rrpr_modalities": ["differentiation", "recognition"]
}
```

Future enhancement could create modality edges:
```
(document) --[engages_modality]--> "virtual:modality.differentiation"
```

### Ingestor Updates Required

`rsc/ingestor.py` must:
1. Parse `topics`, `disciplines`, `rrpr_modalities` from frontmatter
2. Validate against canonical vocabularies (warn on non-canonical values)
3. Emit `has_topic`, `has_discipline` edges
4. Store `rrpr_modalities` in `extra` field

---

## Related Documents

- `docs/CORPUS_STYLE_GUIDE.md` - Frontmatter format standards
- `docs/RELATIONING_ARCHITECTURE.md` - RRPR framework concepts
- `internal-theory/proposing-relationing.md` - Source for RITM modalities
- `rsc/predicates.py` - Predicate definitions
- `rsc/schema.py` - Metadata schema
