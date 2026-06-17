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

2. Start the app:
   ```bash
   npm run dev
   ```

The API key is entered in the app because the prototype supports user-configured OpenAI-compatible endpoints. For production, proxy model calls through a backend so browser clients do not directly expose secrets.
