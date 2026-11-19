---
name: "ARCHIVAL POLICY"
---

# Archival Policy for RRPR Corpus

**Purpose**: This document defines when and how research content moves from active to archived status within the Relationing Research Program Repository.

**Last Updated**: 2025-11-09  
**Status**: Canonical

---

## Core Principle

**Archive when expressed better**: Research stays active until superseded by a clearer, more complete, or more canonical expression of the same ideas. The repository prioritizes signal over history.

---

## Status Lifecycle

Documents progress through these states:

```
draft → working → canonical
  ↓       ↓          ↓
      archived
```

### Status Definitions

**`draft`**: Initial exploration, incomplete ideas, work-in-progress
- May have gaps, inconsistencies, or incomplete citations
- Subject to substantial revision or abandonment
- Not referenced by other active documents

**`working`**: Actively developed research with established direction
- Core ideas are stable but refinement continues
- May be cited by other documents
- Undergoes iterative improvement

**`canonical`**: Definitive expression of concepts
- Best available articulation of the ideas
- Stable content, minimal changes expected
- Preferred citation target for these concepts
- Located in appropriate directory (`internal-theory/` for foundational work)

**`archived`**: Superseded by better expression
- Historical value preserved
- No longer maintained or updated
- Replaced by canonical version
- Still accessible via git history or archive directory

---

## Archival Criteria

### When to Archive

A document should be archived when:

1. **Superseded by Synthesis**: Multiple drafts have been consolidated into a canonical synthesis
   - Example: 3 exploratory papers on reflexive existence → 1 canonical treatise

2. **Expressed Better Elsewhere**: The same ideas are presented more clearly/completely in another document
   - Original has pedagogical issues, gaps, or confusion
   - Newer version has better formalism, examples, or clarity

3. **Conceptual Evolution**: The approach was abandoned in favor of a superior framework
   - Early category-theoretic approach → refined topos-theoretic formulation

4. **Redundancy Within Thread**: Iterative versions where later iterations strictly improve on earlier ones
   - `describing-X.md` → `X.md` (removed verbose prefix, improved content)

### When NOT to Archive

Keep documents active when they:

1. **Offer Distinct Perspectives**: Different angles on the same concept, each with unique value
   - `locating-stability-dynamics-in-cognitive-systems.md` vs `stability-dynamics-in-cognitive-systems.md` (14% similarity, different approaches)

2. **Serve Different Purposes**: Same topic, different document types
   - Theorem statement vs proof vs commentary vs application

3. **Represent Current Exploration**: Work-in-progress that hasn't reached synthesis yet
   - Active drafts without a canonical replacement

4. **Define Unique Terms**: Even if deprecated, if it's the definitional source for a term still in use

---

## Archival Methods

### Method 1: Status Field (Preferred)

Set `status = "archived"` in TOML frontmatter:

```toml
+++
id = "early-draft-reflexive-existence"
title = "Early Draft: Reflexive Existence"
status = "archived"
superseded_by = "proposing-a-reflexive-existence"
+++
```

**Advantages**:
- Preserves git history
- Allows querying archived vs active via knowledge graph
- Can still reference via id+branch+commit
- Supports "why was this archived?" via `superseded_by` field

### Method 2: Physical Archive Directory

Move file to `archive/YYYY-MM-DD-reason/`:

```
archive/2025-11-09-superseded-by-canonical/
  ├─ early-reflexive-existence-draft-1.md
  ├─ early-reflexive-existence-draft-2.md
  └─ README.md (explains archival reason)
```

**Use when**:
- Removing clutter from main corpus
- File will never be referenced again
- Keeping for historical record only

---

## Frontmatter Extensions for Archival

### New Fields

**`superseded_by`** (string): ID of document that replaces this one
```toml
superseded_by = "canonical-relationing-treatise"
```

**`supersedes`** (list of strings): IDs of documents this one replaces
```toml
supersedes = ["draft-1", "draft-2", "early-exploration"]
```

**`archival_reason`** (string): Why this was archived
```toml
archival_reason = "Consolidated into canonical synthesis"
```

**`archival_date`** (date): When archived
```toml
archival_date = "2025-11-09"
```

---

## Predicate Extensions

### New Graph Edges

**`supersedes`**: Links canonical document to superseded drafts
- Domain: RelCell (canonical)
- Range: RelCell (archived)
- Category: RELATIONAL

**`superseded_by`**: Inverse of `supersedes`
- Domain: RelCell (archived)
- Range: RelCell (canonical)
- Category: RELATIONAL

**`builds_on`**: Indicates conceptual dependency (not necessarily archival)
- Domain: RelCell
- Range: RelCell
- Category: RELATIONAL
- Note: Distinct from `supersedes` - can build on active documents

---

## Research Thread Management

### Identifying Threads

Research threads are sequences of iterative work on the same concept:

1. **Same topic** (overlapping keywords, titles)
2. **Temporal sequence** (date_created progression)
3. **Content similarity** (30-95% overlap)
4. **Conceptual lineage** (each builds on previous)

### Thread Resolution Patterns

**Pattern 1: Consolidation**
```
[draft-1] ──superseded_by──→ ┐
[draft-2] ──superseded_by──→ ├─→ [canonical-synthesis]
[draft-3] ──superseded_by──→ ┘
```

**Pattern 2: Evolution**
```
[early-approach] ──builds_on──→ [refined-approach] ──supersedes──→ [canonical]
```

**Pattern 3: Divergence** (keep both)
```
[shared-origin] ──builds_on──→ [perspective-A] (active)
                ──builds_on──→ [perspective-B] (active)
```

---

## Implementation Workflow

### For Each Potential Archive Candidate:

1. **Identify thread**: Find related documents
2. **Determine canonical**: Which is the "best expression"?
   - Most complete
   - Clearest formalism
   - Best integrated with corpus
   - Most cited by others
3. **Check uniqueness**: Does candidate offer anything canonical doesn't?
4. **Set status**: `status = "archived"` if superseded
5. **Link metadata**: Add `superseded_by`, `archival_reason`, `archival_date`
6. **Update canonical**: Add `supersedes = [...]` listing what it replaces
7. **Verify graph**: Ensure `supersedes`/`superseded_by` edges exist

---

## Query Examples

### Find All Archived Documents
```python
# Via database
SELECT path, title FROM document_metadata 
WHERE status = 'archived'
ORDER BY archival_date DESC
```

### Find Canonical Version of Archived Doc
```python
# Follow superseded_by edge
SELECT target.path, target.title 
FROM edges 
JOIN relcells target ON edges.object_id = target.id
WHERE predicate = 'superseded_by' AND subject_id = <archived_doc_id>
```

### Find All Superseded Drafts for a Canonical Doc
```python
# Follow supersedes edges
SELECT source.path, source.title
FROM edges
JOIN relcells source ON edges.subject_id = source.id  
WHERE predicate = 'superseded_by' AND object_id = <canonical_doc_id>
```

---

## Related Documents

- `docs/CORPUS_STYLE_GUIDE.md` - Frontmatter schema
- `docs/REDUNDANCY_REPORT.md` - Initial duplicate analysis
- `rsc/schema.py` - DocumentStatus enum
- `rsc/predicates.py` - Predicate definitions
