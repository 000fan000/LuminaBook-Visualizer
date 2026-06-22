# LuminaBook Design System

LuminaBook is a quiet working environment for serious reading. The interface should help readers move between source text, translation, annotations, notes, and book metadata without feeling like a dashboard or a social product.

The current product scope is local-first reading: a library, a bilingual reader, LLM translation, guide notes, highlights, knowledge cards, bookmarks, metadata, and model configuration. The design system should stay simple enough to implement consistently in the existing React/Tailwind code.

## Design Position

LuminaBook should feel like:

- A refined reading desk.
- A scholarly notebook.
- A bilingual edition with margin notes.
- A calm tool for slow thinking.

LuminaBook should not feel like:

- A generic SaaS dashboard.
- A gamified reading tracker.
- A decorative bookshelf simulator.
- A chat app with a reader bolted on.
- A dense admin console, except inside explicit admin/config screens.

## Core Principles

- Text is the product. Layout, controls, and color must keep attention on the book.
- The UI should be quiet by default and precise on demand.
- Reader-created objects should feel durable: annotations, notes, cards, concepts, links, and citations are intellectual records.
- AI output should be visually distinct from source text and user notes.
- Controls should use familiar icons and compact labels; long explanations belong in documentation, not the app chrome.
- Avoid nested cards. Use panels, pages, lists, and thin separators.
- Prefer fewer stronger patterns over many custom component variants.

## Visual Language

### Shape

- Default radius: `6px`.
- Small controls: `4px`.
- Large reader pages and dialogs: `6px`.
- Avoid pill shapes except transient floating controls or compact status chips.
- Avoid decorative blobs, gradients, and ornamental backgrounds.

### Borders and Shadows

- Use borders to define structure.
- Use shadows only for layered surfaces:
  - Dialogs.
  - Popovers.
  - Floating selection toolbar.
  - Reader page sheets.
- Reader page shadow should be soft and low contrast.
- Avoid shadow stacks on cards inside panels.

### Density

- Library: medium density, scannable.
- Reader: generous line height, minimal chrome.
- Guide/annotation panes: compact but readable.
- Config/admin: denser, form-oriented, no decorative hero treatment.

## Color System

Use an Apple-like neutral system: light gray application chrome, white layered surfaces, restrained separators, and a small set of clear system accents. The reader can keep a barely warm page option, but the default product tone should be cooler, lighter, and more precise than the current paper-heavy palette.

### Base Tokens

- App background: `#f5f5f7`
- Reader background: `#ffffff`
- Reader soft paper option: `#fbfaf7`
- Elevated surface: `#ffffff`
- Soft panel background: `#f9fafb`
- Inset/control background: `#f2f2f7`
- Primary text: `#1d1d1f`
- Secondary text: `#3a3a3c`
- Muted text: `#6e6e73`
- Hairline border: `#d2d2d7`
- Strong border: `#8e8e93`
- Primary action: `#007aff`
- Primary action hover: `#0066cc`
- Primary action text: `#ffffff`

### Accent Tokens

- Highlight: system yellow
  - Background: `#fff7cc`
  - Border: `#ffd60a`
  - Text: `#5c4300`
- Knowledge/card/concept: system blue
  - Background: `#e8f2ff`
  - Border: `#0a84ff`
  - Text: `#004a99`
- Context/system note: system mint
  - Background: `#e7f8f2`
  - Border: `#00c7be`
  - Text: `#006a64`
- Reflection/question: system purple
  - Background: `#f3edff`
  - Border: `#bf5af2`
  - Text: `#5e2a7e`
- Success: system green `#34c759`
- Warning: system orange `#ff9500`
- Error: system red `#ff3b30`

### Color Rules

- Do not let one accent dominate a full screen.
- Use yellow only for reader highlights and explicit warnings.
- Use blue for primary actions, knowledge cards, concepts, definitions, and saved explanations.
- Use purple only for reflective prompts and open questions.
- Keep destructive states red only at the point of risk.
- Avoid gradients, saturated fills, and large colored panels.
- Prefer tint backgrounds plus a single accent border over solid accent cards.

## Typography

### Font Roles

- Reader body: serif.
- UI chrome: sans.
- Code, file names, model ids: mono.

### Type Scale

- App title: `20px`, semibold.
- Screen heading: `32px-48px`, semibold, only on library/empty states.
- Panel heading: `16px-18px`, semibold.
- Section label: `11px`, uppercase, semibold.
- UI body: `14px`.
- Secondary/help text: `12px`.
- Reader body: `17px-19px`.
- Reader line height: `1.75-1.95`.
- Guide body: `14px`, line height `1.5-1.65`.

### Typography Rules

- Do not use negative letter spacing.
- Avoid viewport-scaled type.
- Uppercase labels should be short and sparse.
- Long scholarly text should never appear in small sans-serif blocks unless it is metadata or a list preview.
- Reader text needs stable line height and paragraph spacing controls.

## Layout System

### App Shell

- Max content width: `1280px`.
- Page horizontal padding: `20px` mobile, `24px` desktop.
- Header height: `56px` in reader, flexible on library.
- Footer controls in reader should stay compact and persistent.

### Library

Purpose: choose, import, inspect, and manage books.

Pattern:

- Top bar with brand, shelf export, account/config.
- Compact intro copy.
- Inset shelf panel containing upload tile and book tiles.
- Book tiles expose progress, metadata, recent bookmarks, and core actions.

Rules:

- Keep book covers/tile proportions stable.
- Avoid making every book tile a large card with heavy content.
- Metadata editing can use dialogs or popovers.
- Empty library should guide import, not market the product.

### Reader

Purpose: deep reading with source and translation visible together.

Pattern:

- Sticky top bar: back, title/TOC, model selector, bookmark, translate, account.
- Two page sheets on desktop.
- Single-column stack on narrow screens.
- Persistent bottom bar: previous/next, progress, batch translate.
- Floating reading agent, closed by default.

Rules:

- Source and translation pages should have equal visual weight.
- Page controls sit in the page header, not in the text body.
- The guide mode replaces translation in the right pane; it should not become a third permanent column yet.
- Keep reader actions icon-first where meaning is familiar: bookmark, highlight, card, format, previous, next.

### Guide Pane

Purpose: collect interpretation around the current passage.

Pattern:

- Page remark.
- Highlights.
- Knowledge cards.
- Note response.
- Future: links, concepts, argument nodes.

Rules:

- Group by object type.
- Use thin top borders between groups.
- Keep deletion and object actions small and aligned right.
- Do not make every annotation a visually heavy card.

### Config Dialog

Purpose: model setup, language setup, profile management, and logs.

Pattern:

- Centered modal.
- Two-column top setup area.
- Profile list and profile editor.
- Availability and evaluation logs below.

Rules:

- Config screens may be denser than reader screens.
- Use forms and lists, not marketing copy.
- Show provider locks and daily credit states as plain status panels.
- Do not expose raw technical logs in the primary reader flow.

## Component Rules

### Buttons

Primary:

- System blue background.
- White text.
- Used for main actions: translate, save, test, send.

Secondary:

- White or light gray background.
- Neutral border.
- Used for export, save new, navigation, configuration.

Icon Button:

- Square, usually `32px` or `36px`.
- Use lucide icons.
- Always include `title` and accessible label when icon-only.

Destructive:

- Neutral by default.
- Red only on hover or confirmation states.
- Use sparingly.

### Inputs

- Height: `40px`.
- Radius: `6px`.
- Background: white or soft gray.
- Border: neutral.
- Focus ring: system blue at low opacity.
- Labels: `12px`, medium, secondary text.
- Help text: `12px`, muted.

### Tabs and Segmented Controls

- Use for switching mutually exclusive modes, such as Translation/Guide.
- Keep labels short.
- Active state uses system blue fill or white raised fill inside gray controls.
- Avoid tab sets nested inside cards.

### Popovers and Dialogs

- Popovers: for formatting, quick object actions, metadata snippets.
- Dialogs: for config, metadata editing, export setup, destructive confirmation.
- Use one clear title, one close icon, and a limited action row.

### Status Messages

- Success: small green or neutral text.
- Error: red text with alert icon when appropriate.
- Loading: spinner plus short verb phrase.
- Avoid persistent banners unless user action is blocked.

## Scholarly Object Styling

Use consistent object identity so the reader learns the system.

- Highlight: yellow mark, short excerpt.
- Knowledge card: blue mark, excerpt plus explanation.
- Concept: blue outline or chip, canonical label plus aliases.
- Note: neutral ruled notebook treatment.
- AI annotation: distinct type label and source anchor.
- Reflection/question: purple accent.
- Link/backlink: neutral row with relation label.
- Argument node: neutral outline with type badge.
- Citation: compact monospace or secondary text, never a large card.

Object rows should include:

- Type.
- Short title or excerpt.
- Source location.
- Timestamp only when useful.
- Small actions on hover or at row end.

## AI Design Rules

- AI is a reading assistant, not the center of the product.
- AI-generated content must be visually distinct from user notes and source text.
- AI suggestions should be accepted, edited, or rejected before becoming durable objects.
- AI answers should show source anchors when possible.
- Avoid oversized chat surfaces in the main reader.
- Keep starter prompts short and task-specific.

## Interaction Patterns

### Text Selection

Selection toolbar actions:

- Highlight.
- Define/save as knowledge card.
- Future: create note, create argument node, link to concept.

Rules:

- Toolbar should appear near selected text.
- Keep it compact and dark.
- Do not obscure the selected passage.

### Navigation

- Reader navigation is segment-based.
- TOC opens from title area.
- Bookmarks return directly to a segment.
- Future links should navigate to the exact segment and highlight the target.

### Progressive Disclosure

- Library shows book-level state.
- Reader shows current passage state.
- Guide shows passage knowledge.
- Concept/link/argument views show cross-book structure.

Do not surface cross-book complexity before the reader creates or accepts data objects that justify it.

## Responsive Behavior

- Desktop: two reader pages side by side.
- Tablet: preserve two panes only if readable width remains adequate.
- Mobile: source and translation stack vertically; sticky controls remain compact.
- Dialogs should fit within `92vh` and scroll internally.
- Button text may hide on small screens if icon remains clear.
- Text must never overflow buttons or chips.

## Implementation Tokens

Prefer these Tailwind patterns when cleaning up the current codebase:

- Page background: `bg-[#f5f5f7]`
- Reader paper: `bg-white`
- Reader soft paper option: `bg-[#fbfaf7]`
- Soft field: `bg-[#f9fafb]`
- Inset control: `bg-[#f2f2f7]`
- Primary text: `text-zinc-950`
- Secondary text: `text-zinc-700`
- Muted text: `text-zinc-500`
- Border: `border-zinc-300`
- Divider: `border-zinc-200`
- Primary button: `bg-[#007aff] text-white hover:bg-[#0066cc]`
- Secondary button: `border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50`
- Focus: `focus:ring-2 focus:ring-[#007aff]/30 focus:border-[#007aff]`
- Reader page: `rounded-md border border-zinc-200 bg-white shadow-[0_18px_50px_rgba(0,0,0,0.08)]`

## Near-Term Cleanup Targets

- Reduce large library hero text once the library has more data objects to browse.
- Normalize page sheet radius and button radius to one small-radius system.
- Convert repeated annotation/highlight/card rows into shared object row components.
- Add explicit object type styles before introducing concepts and links.
- Keep the guide pane simple before adding graph or comparison views.
- Move export and metadata flows toward consistent dialogs.

## Non-Goals

- No decorative gradients.
- No animated page-turn focus.
- No social/feed UI.
- No gamification layer.
- No dense analytics dashboard in the main reader.
- No full visual graph until concepts, links, and citations are reliable.
