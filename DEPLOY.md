# Deploy LuminaBook to Cloudflare Pages

This guide deploys the Vite web application to Cloudflare Pages. It does not package or publish the Electron macOS application.

## Prerequisites

- A Cloudflare account.
- Access to the GitHub repository.
- Node.js and npm for local builds or direct uploads.
- A custom domain in Cloudflare DNS, if a custom domain is required.

## Verify the Production Build

Install dependencies and build the application:

```bash
npm install
npm run build
```

Vite writes the production site to `dist/`. Test that build locally with:

```bash
npm run preview
```

The build currently produces a static single-page application. Cloudflare Pages automatically applies SPA fallback routing when the deployment does not contain a top-level `404.html`, so no additional redirects file is required.

## Option 1: GitHub Deployment

Git integration is the recommended workflow because pushes and pull requests receive automatic deployments.

1. Sign in to the Cloudflare dashboard.
2. Open **Workers & Pages**.
3. Select **Create application**, then **Pages** and **Connect to Git**.
4. Authorize GitHub if prompted.
5. Select `000fan000/LuminaBook-Visualizer`.
6. Enter the following build settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework preset | `Vite` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |

7. Leave application API-key environment variables unset.
8. Select **Save and Deploy**.

Cloudflare assigns a production URL similar to:

```text
https://luminabook-visualizer.pages.dev
```

After setup:

- A push to `main` creates a production deployment.
- Other enabled branches create preview deployments.
- Pull requests can receive deployment status checks and preview URLs.

### Account Environment

To enable email accounts and daily funded credits, configure the public build variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Configure these values as encrypted Pages Function variables rather than public build variables:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
PLATFORM_LLM_ENDPOINT
PLATFORM_LLM_API_KEY
PLATFORM_LLM_MODEL
PLATFORM_LLM_INPUT_USD_PER_MILLION
PLATFORM_LLM_OUTPUT_USD_PER_MILLION
```

The pricing variables are optional and power estimated cost reporting in the admin dashboard.

Apply the Supabase migration and follow the complete setup in [ACCOUNT_SYSTEM.md](./ACCOUNT_SYSTEM.md).

## Option 2: Direct Upload with Wrangler

Use Direct Upload when deployment should be controlled locally or by an external CI system.

Authenticate Wrangler:

```bash
npx wrangler login
```

Build the site:

```bash
npm run build
```

Create the Pages project on the first deployment:

```bash
npx wrangler pages project create luminabook-visualizer
```

Deploy the contents of `dist/`:

```bash
npx wrangler pages deploy dist --project-name=luminabook-visualizer
```

Deploy a preview associated with another branch:

```bash
npx wrangler pages deploy dist \
  --project-name=luminabook-visualizer \
  --branch=preview-branch
```

Choose the project workflow deliberately. A project created for Direct Upload cannot later be converted to Git integration. A Git-integrated Pages project can disable automatic builds and accept Wrangler deployments, but it cannot use dashboard drag-and-drop uploads.

## Custom Domain

After the first successful deployment:

1. Open the Pages project in Cloudflare.
2. Select **Custom domains**.
3. Select **Set up a custom domain**.
4. Enter the desired hostname, such as `app.example.com`.
5. Follow the DNS prompts and wait for TLS certificate activation.

Use a separate hostname such as `downloads.example.com` for Electron DMG or ZIP artifacts. Cloudflare Pages limits individual site assets to 25 MiB, so desktop installers should be stored in Cloudflare R2 or another object-storage service instead of the Pages deployment.

## API-Key Safety

Do not configure `GEMINI_API_KEY`, an OpenAI key, or another private provider key as a Pages build variable for the current frontend.

The Vite configuration defines `process.env.GEMINI_API_KEY` at build time. Any value supplied there can be compiled into JavaScript downloaded by every visitor. The current web application should continue to accept user-provided credentials locally. Application-owned credentials require a server-side proxy, such as a Cloudflare Worker, with the key stored as a Worker secret.

## China Reliability

Ordinary Cloudflare Pages does not provide the Cloudflare China Network. The site may be reachable from mainland China, but latency and availability are best effort.

Before relying on the web deployment for mainland users:

- Bundle Tailwind instead of loading `cdn.tailwindcss.com` at runtime.
- Self-host the Google font files currently referenced by `index.html`.
- Test the deployed site from several mainland networks and provinces.
- Test every configured LLM endpoint separately from the site itself.

Cloudflare China Network is a separate Enterprise service with ICP and local-partner requirements. It is not enabled by deploying a project to Pages.

## Post-Deployment Checks

Verify the following on the production URL:

- The English and Simplified Chinese interfaces load.
- Refreshing a client-side route returns the application rather than a 404 page.
- TXT, EPUB, and text-based PDF uploads work.
- Books persist after a browser restart.
- Translation calls reach the selected provider.
- No private API key appears in browser source files or network responses.
- Browser developer tools show no missing scripts, fonts, workers, or PDF assets.
- Response headers use HTTPS and do not expose unexpected environment values.

## Rollback

Cloudflare Pages retains previous deployments. To roll back:

1. Open the Pages project.
2. Open **Deployments**.
3. Select a previously verified production deployment.
4. Use the rollback or production-promotion action available in the dashboard.

For Git deployments, follow the rollback with a source-code revert or corrective commit so the next automatic deployment does not reintroduce the problem.

## References

- [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/)
- [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Cloudflare Pages serving and SPA behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/)
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)

Last reviewed: 2026-06-20
