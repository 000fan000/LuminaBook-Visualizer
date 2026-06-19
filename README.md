# LuminaBook Reader

LuminaBook is a bilingual great-books reader for people reading across languages. The core idea is to upload a source book, generate a mother-language translation, and place original and translation side by side so compressed, ambiguous, or culturally loaded meanings remain visible.

The current prototype includes:

- Upload TXT, text-based PDF, or EPUB files.
- Choose or type the reader's mother language.
- Configure an OpenAI-compatible endpoint, API key, model, and system prompt.
- Generate left/right page translation for the active segment or the next five segments.
- Render contextual commentary, key terms, and reflection prompts returned by the LLM.

## Run Locally

Prerequisites: Node.js

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the web app:
   ```bash
   npm run dev
   ```

3. Build the web app:
   ```bash
   npm run build
   ```

## Run as a macOS App

The project now includes an Electron shell while keeping the web version intact.

Start the Electron app in development:

```bash
npm run dev:mac
```

Package a local macOS app bundle:

```bash
npm run package:mac
```

Create distributable macOS artifacts:

```bash
npm run make:mac
```

The desktop app uses Electron's main process and `safeStorage` for LLM profile persistence when available. The web app still uses browser storage.

## Roadmap

See [roadmap.md](./roadmap.md) for the staged macOS app plan, including secure profile storage, native file dialogs, packaging, signing, notarization, and auto-update.

## Notes on API Keys

The API key is entered in the app because the prototype supports user-configured OpenAI-compatible endpoints. In the web app, browser clients still hold user-entered secrets locally. For production web distribution, proxy model calls through a backend so browser clients do not directly expose secrets.

For the Electron app, LLM profiles are routed through a preload bridge and persisted by the main process instead of writing profile state directly to renderer `localStorage`.

## Update Log

### 2026-06-19

- Added a macOS app roadmap in [roadmap.md](./roadmap.md).
- Added Electron Forge + Vite configuration.
- Added Electron main and preload entrypoints.
- Added a typed `window.luminabook` preload bridge.
- Added a renderer platform adapter for desktop-only capabilities.
- Routed Electron LLM profile persistence through the main process with `safeStorage` support.
- Kept the existing Vite web app workflow unchanged.
- Added `dev:mac`, `package:mac`, and `make:mac` npm scripts.
