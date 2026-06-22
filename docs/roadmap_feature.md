# LuminaBook Feature Roadmap

LuminaBook should evolve from a bilingual reader into a deep nonfiction reading workspace: a place where readers translate difficult texts, reconstruct arguments, connect concepts across books, preserve interpretation over time, and export material into writing systems.

The feature direction in `NETX_STEP.md` is not primarily about better page turning. It is about helping serious readers think with philosophy, political theory, sociology, history, and other dense nonfiction. The product should feel closer to a scholarly annotation system, research notebook, personal index, and AI reading assistant embedded directly in the reading surface.

## Current Reader Foundation

The current app already has useful pieces to build on:

- Library: TXT, PDF, and EPUB ingestion, local IndexedDB book storage, editable bibliographic metadata, cover extraction, and shelf metadata export.
- Reading surface: original and translation side by side, table of contents navigation, bookmarks, reading progress, source/translation themes, PDF rendering, and segment-based navigation.
- Translation and guide: per-segment LLM translation, page guide, commentary, key terms, reflection prompts, and anchored annotation cards.
- Reader objects: highlights, knowledge cards, reader notes, LLM note responses, and a passage-scoped reading agent.
- Model infrastructure: provider profiles, platform-funded model option, custom OpenAI-compatible endpoints, evaluation records, and usage/quota APIs.
- Desktop direction: Electron shell, secure profile storage, platform adapter, and future native open/save flows.

The next roadmap should preserve this foundation and promote the existing local objects into durable scholarly objects: typed annotations, concepts, links, argument nodes, citations, and review prompts.

## Product Principles

- Treat highlights as knowledge objects, not colored paint.
- Keep source text, translation, interpretation, and citations visible together.
- Prefer reader-controlled structure over opaque AI automation.
- Use AI to suggest, summarize, compare, and challenge, but make every generated object inspectable and editable.
- Optimize for cumulative understanding across months and years, not session metrics or gamified streaks.
- Make export first-class so reading naturally becomes writing.

## Feature Epics

### 1. Atomic Highlighting and Annotation

Current foundation: `Highlight`, `KnowledgeCard`, and `ReaderNote` already store selected text by book, segment, side, and timestamp.

Roadmap:

- Add typed annotation categories: claim, thesis, definition, example, evidence, objection, assumption, term, citation, question, and synthesis.
- Let a single selected passage become a highlight, note, concept card, argument node, or citation source.
- Allow annotations at phrase, sentence, paragraph, page, and segment level.
- Add user tags, color semantics, status, and optional confidence.
- Support linking one annotation to another within the same book.
- Keep AI definitions as editable knowledge cards rather than final answers.

Key data additions:

- `Annotation` as the shared base object for highlights, notes, cards, and argument references.
- `AnnotationType`, `AnnotationTag`, and stable source locator fields.
- Migration path from current `Highlight` and `KnowledgeCard` records.

### 2. Bidirectional Links Between Books

Current foundation: all reader objects already include `bookId`, `bookTitle`, `segmentId`, and `segmentIndex`, and the library can open a saved book at a segment.

Roadmap:

- Add explicit links between annotations, passages, concepts, and notes.
- Support relationship labels such as supports, contradicts, defines, revises, echoes, applies, and compares.
- Show backlinks from either side of a relationship.
- Add navigation from a link directly to the target book and segment.
- Let the reading agent reference linked passages when answering questions.

Key data additions:

- `KnowledgeLink` with source object, target object, relation type, label, note, and creation timestamp.
- Link panel on the reader guide view and book detail view.

### 3. Concept Extraction and Personal Index

Current foundation: translations already return `keyTerms`, and knowledge cards can store selected terms with explanations.

Roadmap:

- Extract concepts from each segment, starting with translated `keyTerms` and reader-created knowledge cards.
- Let users accept, rename, merge, split, and ignore suggested concepts.
- Build a concept detail page with all occurrences, user highlights, notes, linked books, and AI summaries.
- Track concept aliases across languages and translations.
- Add library-wide search and filtering by concept, author, book, and tag.

Key data additions:

- `Concept`, `ConceptAlias`, `ConceptOccurrence`, and concept-to-annotation links.
- Background extraction queue for translated or newly imported segments.

### 4. Argument Mapping

Current foundation: the right guide pane already groups commentary, highlights, knowledge cards, and note responses for the active segment.

Roadmap:

- Add argument nodes: thesis, claim, evidence, assumption, objection, reply, implication, and unresolved question.
- Let users create nodes from selected text or from AI suggestions.
- Support parent-child structure for reconstructing chapter and book arguments.
- Provide a compact outline view beside the reader and a full argument map view per book.
- Add AI actions: identify the main claim, list assumptions, find objections, compare arguments, and explain structure using only the current book context.

Key data additions:

- `ArgumentMap`, `ArgumentNode`, `ArgumentEdge`, and source annotation references.
- Export argument maps to Markdown outline and graph formats.

### 5. Progressive Reading History

Current foundation: bookmarks, notes, highlights, knowledge cards, and reading progress already carry timestamps.

Roadmap:

- Record interpretation changes as note revisions instead of overwriting meaning.
- Add timeline views for a book, concept, and reader note.
- Show when an idea first appeared, how often it recurs, and how the reader's notes changed.
- Preserve AI responses as dated artifacts tied to the exact prompt, passage, and model profile.

Key data additions:

- `NoteRevision`, `InterpretationSnapshot`, and optional `LlmArtifact` references.
- Append-only history for important scholarly objects.

### 6. Context-Aware AI Reading Assistant

Current foundation: the reading agent is passage-scoped and can see the active segment plus translation. Note response and selection definition flows already exist.

Roadmap:

- Expand AI context from current segment to chapter, previous translated segments, accepted concepts, user notes, and linked passages.
- Add constrained prompts: use only concepts introduced so far, explain this paragraph in book context, identify assumptions, compare with selected author or linked passage, and generate counterarguments.
- Let AI propose annotations, concept links, and argument nodes, but require user acceptance.
- Add source-grounded answers with visible citations to book segments and notes.
- Add per-feature cost/latency controls so context expansion remains predictable.

Key data additions:

- `ReadingContextPack` builder for active segment, nearby segments, notes, concepts, and links.
- Accepted/rejected AI suggestion records to improve future prompts.

### 7. Reading Graph and Knowledge Graph

Current foundation: current objects already form a light implicit graph: books, segments, highlights, notes, cards, key terms, and bookmarks.

Roadmap:

- Create a graph view with books, authors, concepts, annotations, and argument nodes.
- Start with filterable list and adjacency views before building a visual graph canvas.
- Show why two objects are connected: shared concept, manual link, argument relation, citation, or AI-suggested relation.
- Allow graph traversal back into the reader.

Key data additions:

- Reuse `KnowledgeLink` for manual edges.
- Derived graph index for concept co-occurrence and annotation references.

### 8. Citation and Export Workflow

Current foundation: book metadata is editable and exportable; PDF/text segments include page labels when available.

Roadmap:

- Preserve citation metadata on every annotation: page, segment, edition fields, file name, source type, author, title, publisher, year, and language.
- Export selected objects to Markdown, Obsidian, Logseq, Roam-style blocks, Zotero notes, CSV, and JSON.
- Support book-level export, concept-level export, argument map export, and writing bundle export.
- Add native save dialogs for desktop exports when the Electron platform adapter is ready.

Key data additions:

- `CitationLocator` embedded in annotations and links.
- Export adapters by target format.

### 9. Comparative Reading Mode

Current foundation: library navigation can switch books, and the reader already supports two panes for original and translation.

Roadmap:

- Open two books, chapters, or passages side by side.
- Compare shared concepts, conflicting claims, references, and reader notes.
- Let users create cross-book links directly from comparison mode.
- Add AI comparison only after the system can pass both source contexts with citations.

Key data additions:

- `ComparisonSession` with selected books, segments, focus concepts, and generated suggestions.
- Cross-book link creation flow using `KnowledgeLink`.

### 10. Return to Important Ideas

Current foundation: timestamps, notes, highlights, and knowledge cards are already available locally.

Roadmap:

- Surface forgotten highlights, unresolved questions, stale notes, recurring concepts, and contradictions.
- Add review queues by concept, book, author, and annotation type.
- Generate synthesis prompts, such as "bureaucracy across 17 books," from accepted concepts and links.
- Avoid streaks and speed metrics; focus on retention, revision, and synthesis.

Key data additions:

- `ReviewItem`, review state, snooze dates, and synthesis prompts.
- Signals from unresolved questions, old annotations, concept recurrence, and manual importance.

## Phased Implementation Plan

### Phase 1: Normalize Reader Objects

Target outcome: current highlights, cards, and notes become a coherent annotation system without disrupting the reader.

- Add shared annotation types and citation locator fields.
- Migrate existing `Highlight`, `KnowledgeCard`, and `ReaderNote` into a compatible shape.
- Add annotation type selection when creating a highlight or card.
- Show annotations consistently in the guide pane.
- Add local export of annotations as JSON and Markdown.

### Phase 2: Links and Concept Index

Target outcome: readers can connect ideas across passages and browse a personal concept index.

- Add manual bidirectional links between annotations and passages.
- Add concept objects seeded from key terms and knowledge cards.
- Add accept/merge/rename concept workflows.
- Add a concept detail view with occurrences, notes, highlights, and linked books.
- Add library-wide search across annotations, concepts, and metadata.

### Phase 3: Argument Reconstruction

Target outcome: the app helps readers reconstruct reasoning, not just collect excerpts.

- Add argument node creation from selected text.
- Add per-book argument outline view.
- Add AI-assisted argument extraction for the current segment or chapter.
- Add source references and editable node labels.
- Export argument maps to Markdown.

### Phase 4: Context-Aware AI

Target outcome: the reading assistant uses the reader's actual book, notes, concepts, and links.

- Build a `ReadingContextPack` layer.
- Add prompt modes for context-limited explanation, assumption finding, comparison, and synthesis.
- Add citation-backed AI responses.
- Add accept/reject flows for AI-suggested concepts, links, and argument nodes.

### Phase 5: Comparative and Graph Views

Target outcome: cross-book thinking becomes a first-class workflow.

- Add side-by-side comparative reading sessions.
- Add cross-book link creation from comparison mode.
- Add list-based graph exploration for books, concepts, annotations, and links.
- Add visual graph only after data quality and navigation are solid.

### Phase 6: Review and Writing Workflow

Target outcome: reading accumulates into durable thinking and writing material.

- Add review queues for important ideas, unresolved notes, and recurring concepts.
- Add synthesis generation from selected concepts or books.
- Add Markdown, Obsidian, Logseq, Roam, Zotero-note, CSV, and JSON exports.
- Add desktop-native save flows through the platform adapter.

## Suggested Immediate Slice

The smallest useful next implementation should be:

1. Create a unified `Annotation` model while keeping the existing UI working.
2. Add annotation type selection for highlights: claim, definition, objection, evidence, question, and term.
3. Add a basic annotation list in the guide pane grouped by type.
4. Add Markdown export for the active book's annotations with citation metadata.
5. Seed concepts from accepted key terms and knowledge cards.

This creates the substrate for links, concepts, argument maps, AI suggestions, and export without requiring a large UI rewrite.

## Explicit Non-Goals

Do not prioritize:

- Page-turn animation polish.
- Decorative book realism.
- Social feeds.
- Reading streaks.
- Speed metrics.
- Gamification.

These can be pleasant, but they do not address the core bottleneck for dense nonfiction: understanding arguments, connecting ideas, retaining concepts, and turning reading into original thought.
