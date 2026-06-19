# LuminaBook macOS App Roadmap

This roadmap keeps the existing Vite/React web app as the shared product surface and adds Electron as a thin macOS shell. The goal is one codebase with platform adapters for the small number of behaviors that should differ between browser and desktop.

## Architecture Direction

- Keep React, book parsing, PDF rendering, reading state, and LLM request shaping shared.
- Keep the web version available through the existing Vite build.
- Add Electron only for native app lifecycle, secure secret storage, native file dialogs, packaging, signing, notarization, and updates.
- Keep renderer code browser-safe. Do not expose Node.js, `fs`, or arbitrary IPC to React.
- Use a narrow preload bridge for desktop capabilities, with explicit channel names and sender validation in the main process.

## Phase 1: Electron Shell Prototype

Target outcome: the current app runs as a macOS desktop window while the web app still runs normally.

- Add Electron entrypoints:
  - `electron/main.ts` for app lifecycle, window creation, app menu, and IPC handlers.
  - `electron/preload.ts` for a narrow `window.luminabook` bridge.
- Add Electron Forge with the Vite plugin.
- Add desktop scripts:
  - `npm run dev:mac`
  - `npm run package:mac`
  - `npm run make:mac`
- Preserve existing web scripts:
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
- Use secure BrowserWindow defaults:
  - `nodeIntegration: false`
  - `contextIsolation: true`
  - `sandbox: true`
  - preload only exposes typed functions.

## Phase 2: Platform Adapter Layer

Target outcome: web and desktop share business logic but use different implementations for platform behavior.

- Add `platform/index.ts` as the renderer-facing adapter.
- Use browser fallbacks when Electron is unavailable.
- Keep these features behind the adapter:
  - app version and platform detection
  - profile storage
  - future native open/save dialogs
  - future desktop export flows
- Continue using IndexedDB for the initial desktop book library to reduce migration risk.

## Phase 3: Secure LLM Profile Secrets

Target outcome: API keys are no longer persisted in renderer `localStorage` in the Electron app.

- Store LLM profiles through Electron IPC when running on desktop.
- Encrypt desktop profile data in the main process using Electron `safeStorage` when available.
- Store encrypted data under Electron `app.getPath('userData')`.
- Keep web persistence in `localStorage`.
- Migrate existing web-style profiles into desktop storage on first desktop launch.
- Avoid exporting API keys by default in a later hardening pass.

## Phase 4: Native File UX

Target outcome: desktop users get native macOS file open/save flows without breaking web upload/download.

- Add native open dialogs for TXT, PDF, and EPUB.
- Return safe file metadata and bytes to the renderer.
- Reuse `parseBookFile` after reconstructing `File` objects in the renderer.
- Add native save dialogs for JSON and CSV exports.
- Keep drag/drop and browser file input support.

## Phase 5: Packaging

Target outcome: local `.app`, ZIP, and DMG artifacts can be produced.

- Add app bundle metadata:
  - app name: `LuminaBook Reader`
  - bundle id: `com.luminabook.reader`
  - product name and icon
- Configure macOS makers:
  - ZIP for simple distribution and update feeds
  - DMG for manual installation
- Keep packaged assets minimal and avoid bundling dev-only files.

## Phase 6: Signing and Notarization

Target outcome: macOS can launch the app without Gatekeeper warnings for public distribution.

- Add hardened runtime entitlements.
- Configure Apple Developer ID signing.
- Add notarization credentials through CI secrets.
- Verify notarized DMG and ZIP artifacts on a clean macOS account.

## Phase 7: Auto-Update

Target outcome: users can receive desktop updates from the same release pipeline.

- Use signed macOS builds before enabling auto-update.
- Publish update artifacts through GitHub Releases, S3, or another static host.
- Add update checks in the Electron main process.
- Surface update states in the UI only when needed.

## Phase 8: CI Release Flow

Target outcome: every release can build both web and macOS artifacts from one commit.

- Run typecheck and web build.
- Build and package the macOS app.
- Sign and notarize macOS artifacts.
- Publish web build and desktop release artifacts.
- Keep release notes explicit about data migrations and storage changes.

## Immediate Implementation Slice

The first implementation pass should cover:

1. Write this roadmap.
2. Add the Electron shell and Forge/Vite configuration.
3. Add a typed preload bridge.
4. Add a renderer platform adapter.
5. Move desktop LLM profile persistence through the bridge with encrypted main-process storage.
6. Verify the web build still works.
7. Verify the desktop dev app starts.

Later phases should avoid large rewrites unless a specific platform boundary requires it.
