# Deployment and Storage Considerations

This note assumes that Chinese users include users in mainland China, rather than only Chinese-speaking users outside mainland China.

## Current Architecture

LuminaBook currently supports both a Vite web application and an Electron macOS application.

- The interface includes English and Simplified Chinese translations.
- Uploaded books are stored locally in IndexedDB.
- LLM evaluation records are stored locally in IndexedDB.
- The Electron app stores LLM profiles through the main process and uses Electron `safeStorage` when encryption is available.
- The web app stores user-supplied model credentials in browser storage and calls OpenAI-compatible endpoints directly.

This local-first architecture is a useful starting point for serving both markets because private books, translations, and annotations do not need to cross national borders.

## Publishing Approaches

| Approach | US experience | Mainland China experience | Cost and complexity | Recommended use |
| --- | --- | --- | --- | --- |
| Global static web hosting, such as Vercel or standard Cloudflare | Excellent | Latency and availability can be unpredictable | Low | Prototype or demo |
| Hong Kong or Singapore hosting | Good | Often better than a US origin, but still inconsistent | Low to medium | Initial web release |
| Separate US and mainland China deployments | Excellent | Best reliability | High | Mature product with sustained mainland demand |
| Signed Electron download | Excellent | Good when the installer and selected model endpoint are reachable | Medium | Initial production release |
| Mac App Store | Good discovery and managed updates | Distribution depends on Apple's storefront and review policies | Medium to high | Additional release channel |

### Global Web Deployment

A single global static deployment is the simplest web release. It should work well for US users, but it should not promise reliable mainland China performance. Cross-border routing and third-party resources can introduce substantial latency or intermittent failures.

The current `index.html` loads Tailwind from `cdn.tailwindcss.com` and fonts from Google Fonts. These should be bundled with the application before production publishing so the initial render does not depend on third-party resources that may be slow or unreachable.

The production web application should also proxy managed LLM calls through a backend. Browser clients should not receive application-owned API keys. The existing direct-call model can remain available for users who explicitly bring their own compatible endpoint and key, with a clear security explanation.

### Hong Kong or Singapore Deployment

An origin in Hong Kong or Singapore is a practical intermediate option. It does not provide the performance guarantees of a mainland deployment, but it avoids the immediate operational burden of establishing mainland infrastructure and can improve access compared with a US-only origin.

This is a suitable location for an initial Chinese-language website and a mirror of signed desktop installers. Actual performance should be tested from multiple mainland networks before making reliability claims.

### Singapore Hosting Recommendation

Use **Alibaba Cloud International in Singapore** for the first cross-market deployment. The recommended service layout is:

- **Alibaba Cloud OSS, Singapore region:** origin storage for the built Vite application and signed Electron release artifacts.
- **Alibaba Cloud CDN, Global (Excluding Chinese Mainland):** HTTPS delivery through worldwide offshore points of presence.
- **Alibaba Cloud DNS or the existing DNS provider:** custom-domain records for the website and release downloads.
- **A Singapore Function Compute or ECS service later:** only if the product adds an application-managed LLM proxy or account API.

Select the CDN acceleration region `Global (Excluding Chinese Mainland)`. This setting does not use mainland CDN nodes. Alibaba documents that mainland visitors are instead routed to nearby offshore nodes such as Hong Kong, Japan, or Singapore. This still crosses the mainland network boundary, so performance is best effort, but it avoids representing the deployment as an ICP-backed mainland service.

Use separate hostnames so their policies can evolve independently:

- `app.example.com` for the static Vite application.
- `downloads.example.com` for notarized DMG and ZIP artifacts.
- `api.example.com` for a future regional backend.

Configure immutable, long-lived caching for hashed Vite assets, short caching for `index.html` and release metadata, HTTPS-only access, access logging, and object versioning. Configure the CDN root and unknown application routes to return `index.html` so client-side navigation works correctly.

Do not enable Alibaba CDN's `Global` or `Chinese Mainland Only` acceleration region until the domain has the required ICP filing. Alibaba's official documentation states that mainland CDN acceleration requires an ICP-filed domain.

#### Singapore Provider Comparison

| Service | Strengths | Limitations | Decision |
| --- | --- | --- | --- |
| Alibaba Cloud OSS Singapore + CDN | Explicit offshore CDN mode; nearby routing for mainland visitors; global edge delivery for US users; clearer path to later Alibaba China services | More CDN and SPA rewrite configuration than a frontend-only platform | **Recommended** |
| AWS Amplify Hosting in `ap-southeast-1` | Very simple Git-based Vite deployment; managed HTTPS and CloudFront; easy future AWS API integration | AWS China is a separate environment; standard global delivery does not make mainland access reliable | Best fallback for engineering simplicity |
| AWS S3 Singapore + CloudFront | Strong infrastructure control; good for large desktop artifacts and future APIs | More IAM, cache, invalidation, and deployment work than Amplify | Use when AWS infrastructure control is required |
| Cloudflare Pages | Excellent developer workflow and global static delivery | It is not a Singapore-pinned origin; standard service does not provide mainland China Network access | Good prototype host, not the selected Singapore architecture |
| Singapore VPS | Full server control | Patching, security, scaling, TLS, CDN, and deployment operations become the team's responsibility | Avoid for this static application |

AWS Amplify Hosting is the fallback if the team prioritizes the lowest operational effort over the China-oriented path. Amplify is available in Singapore and deploys static sites through CloudFront with managed HTTPS and custom-domain support. It is a sound US and international host, but it should still be described as best effort for mainland visitors.

#### Price Comparison

Price snapshot: **2026-06-20**. All amounts are approximate monthly list prices in USD before tax. Promotional credits and negotiated resource plans are excluded.

The estimates use two representative workloads:

| Assumption | Pilot | Growth |
| --- | ---: | ---: |
| Stored web and release artifacts | 5 GB | 20 GB |
| Data delivered to users | 100 GB/month | 1,000 GB/month |
| Static HTTPS requests | 1 million/month | 5 million/month |
| Approximate 200 MB Electron downloads represented by the bandwidth | 500 | 5,000 |

The Alibaba estimate conservatively models half of delivery at the published North America first-tier rate of `$0.07/GB` and half at the Asia Pacific 1 rate of `$0.081/GB`, producing a blended rate of `$0.0755/GB`. Actual Alibaba CDN charges depend on visitor IP regions, selected acceleration region, cache behavior, and resource plans.

| Provider architecture | Relevant list pricing | Pilot estimate | Growth estimate |
| --- | --- | ---: | ---: |
| **Alibaba Cloud OSS Singapore + CDN** | OSS Standard LRS example rate `$0.0173/GB-month`; blended CDN assumption `$0.0755/GB`; static HTTPS requests `$0.008/10,000` | **$8.44** | **$79.85** |
| **AWS Amplify Hosting Singapore** | Storage `$0.023/GB-month`; data served `$0.15/GB` | **$15.12** | **$150.46** |
| **Cloudflare Pages + R2 Standard** | Pages static requests are free and unlimited; R2 includes 10 GB storage and 10 million Class B reads monthly; additional storage `$0.015/GB-month`; R2 egress is free | **$0.00** within the published free tier | **$0.15** if reads remain within the free tier |

Calculation details:

- Alibaba pilot: `5 x $0.0173 + 100 x $0.0755 + 1,000,000 / 10,000 x $0.008 = $8.44`.
- Alibaba growth: `20 x $0.0173 + 1,000 x $0.0755 + 5,000,000 / 10,000 x $0.008 = $79.85`.
- AWS pilot: `5 x $0.023 + 100 x $0.15 = $15.12` before any account-specific free allowance or credit.
- AWS growth: `20 x $0.023 + 1,000 x $0.15 = $150.46` before any account-specific free allowance or credit.
- Cloudflare pilot: Pages static hosting is free, and 5 GB of R2 storage fits within the 10 GB monthly free tier.
- Cloudflare growth: Pages static hosting and R2 egress remain free; 10 GB of the 20 GB stored exceeds the R2 storage allowance, so `10 x $0.015 = $0.15`. The estimate assumes fewer than 10 million billable R2 Class B reads.

These estimates exclude domain registration, DNS products that are not free, build minutes, cache misses and origin traffic, log storage, WAF or bot protection, support plans, database services, API compute, LLM charges, and cross-region replication. Electron artifacts cannot be stored directly as Cloudflare Pages assets because Pages limits individual files to 25 MiB; they must use R2 or another object store.

**Price conclusion:** Cloudflare Pages plus R2 is dramatically cheaper on published usage pricing, especially for installer bandwidth, but it is not a Singapore-pinned deployment and ordinary Cloudflare service does not solve mainland reliability. Alibaba Cloud is the preferred balance for this project's US/mainland audience: in this model it costs about half as much as Amplify at bandwidth-heavy usage while providing the explicitly offshore CDN mode. AWS Amplify remains the easiest operational choice, but its `$0.15/GB` delivery charge becomes expensive when desktop downloads grow.

### Mainland China Deployment

A public website hosted in mainland China generally requires an ICP filing. Commercial services may require additional licensing, and public security filing requirements may also apply. Provider onboarding commonly requires appropriate Chinese entity and domain documentation.

Mainland cloud environments may be operationally separate from their global equivalents. For example, AWS China uses separate accounts and credentials from global AWS. A mainland deployment should therefore be treated as a separate production environment, not simply another region in the existing global account.

Cloudflare's mainland China Network is not equivalent to ordinary Cloudflare hosting. It requires an Enterprise plan, a separate China Network subscription, ICP documentation, and content review through its local partner.

These requirements should be confirmed with qualified legal and operational advisers before launch. This document is an engineering planning note, not legal advice.

### Electron Distribution

The fastest credible production path is a directly distributed Electron app:

1. Sign the application with an Apple Developer ID certificate.
2. Enable the hardened runtime and define required entitlements.
3. Submit the DMG or ZIP to Apple's notarization service.
4. Staple and verify the notarization ticket.
5. Publish the same version through US and Alibaba Cloud Singapore download origins.
6. Add a verified update mechanism whose metadata and artifacts are reachable from both markets.

Direct distribution keeps books and reading history on the user's device and allows users to select a locally reachable OpenAI-compatible model provider.

## Storage Approaches

| Storage model | Benefits | Risks and limitations |
| --- | --- | --- |
| Local-only storage | Private, inexpensive, offline-capable, and avoids cross-border data transfer | No synchronization; browser data can be cleared; backups are manual |
| Single US backend | Simplest account and synchronization architecture | Mainland latency and cross-border handling of Chinese user data |
| Single mainland China backend | Strong mainland performance | Poorer fit for US users and greater China operating requirements |
| Dual regional storage | Strong performance and a clearer data-residency posture | Two deployments, region-aware identity, migrations, and support burden |
| Encrypted user-controlled backup | Retains local-first privacy while improving portability | Less seamless than automatic synchronization |

### Local-First Storage

Local-first storage should remain the default for the initial release. Books, translations, highlights, annotations, and evaluation records can remain on the device. This reduces infrastructure cost and avoids transferring user-uploaded book content without a clear need.

Before adding cloud synchronization, the application should provide:

- A complete library export and import format.
- Optional encryption for exported archives.
- Clear backup and restore instructions.
- Storage-health and quota warnings for the web version.
- A documented migration strategy for IndexedDB schema changes.

For Electron, long-term library storage may eventually move from renderer-managed IndexedDB to an explicitly managed application data directory. That would improve backup visibility, atomic migration control, and recovery tooling while preserving offline behavior.

### Single Global Backend

A US-hosted backend is reasonable for an early account system aimed primarily at US and non-mainland users. It could use a relational database for accounts and metadata and object storage for encrypted book files.

It should not silently become the storage location for mainland user content. Before accepting uploads from mainland users, the product must define its consent, retention, deletion, data-export, and cross-border-transfer policies.

### Dual Regional Storage

If cloud synchronization becomes important in both markets, use region-pinned storage:

- US users use a US identity, database, API, and object-storage deployment.
- Mainland users use a mainland identity, database, API, and object-storage deployment.
- A user's home region is selected during account creation and is not changed implicitly.
- Private books, translations, prompts, annotations, and logs remain in the home region.
- Cross-region movement requires an explicit, audited migration workflow.
- Public assets, release metadata, and non-personal product configuration may be replicated separately.

Automatic cross-border replication should not be enabled for private user objects merely because the cloud provider supports it. Technical replication capability does not establish legal permission to transfer the data.

## Model and API Routing

The app already supports user-configured OpenAI-compatible endpoints, including presets for OpenAI, OpenRouter, DeepSeek, and local Ollama. This is helpful because model availability and network reachability differ by market.

Recommended behavior:

- Keep provider choice explicit and configurable.
- Offer region-appropriate presets without silently changing providers.
- Test each preset from both target markets.
- Do not send book content to a provider until the user has selected it and accepted the relevant privacy disclosure.
- Keep application-owned provider credentials on a regional backend, never in browser bundles.
- Preserve local-model support for users who do not want uploaded content sent to a hosted model.

## Recommended Rollout

### Phase 1: Local-First Desktop Release

- Bundle Tailwind and fonts locally.
- Complete Electron signing, hardened runtime configuration, and Apple notarization.
- Publish release artifacts from a US origin and an Alibaba Cloud OSS Singapore mirror.
- Keep books, translations, annotations, and evaluation records local.
- Add encrypted library export and import.
- Verify model-provider reachability from both markets.

### Phase 2: Web Release

- Publish the static web application through Alibaba Cloud OSS Singapore and CDN configured as `Global (Excluding Chinese Mainland)`.
- Treat mainland availability as best effort.
- Add a backend proxy only for application-managed model access.
- Retain bring-your-own-endpoint mode for advanced users.
- Add a strict Content Security Policy and remove production dependencies on third-party asset CDNs.

### Phase 3: Regional Cloud Synchronization

- Proceed only when user demand justifies two operational environments.
- Establish separate US and mainland data planes.
- Pin accounts and private content to a home region.
- Implement consent, deletion, export, retention, auditing, and explicit migration workflows.
- Replicate only public release assets by default.

## Current Recommendation

Use a local-first, signed and notarized Electron application as the primary initial product. Serve the Singapore deployment from Alibaba Cloud International using OSS plus CDN configured as `Global (Excluding Chinese Mainland)`, and retain a US release origin if desired for redundancy. Keep the web version as a lightweight or best-effort channel for mainland users until demand justifies ICP filing and a separate regional deployment.

Do not build automatic cloud synchronization yet. First make local data portable and recoverable through encrypted export and import. If synchronization later becomes necessary, adopt region-pinned US and mainland storage rather than a single cross-border database.

## References

- [Apple: Signing Mac Software with Developer ID](https://developer.apple.com/developer-id/)
- [Apple: Distributing software on macOS](https://developer.apple.com/macos/distribution/)
- [AWS: Amazon Web Services in China](https://www.amazonaws.cn/en/about-aws/china/)
- [AWS: ICP Recordal](https://www.amazonaws.cn/en/support/icp/)
- [Microsoft: Data sovereignty and China regulations](https://learn.microsoft.com/en-us/azure/china/overview-sovereignty-and-regulations)
- [Cloudflare: China Network](https://developers.cloudflare.com/china-network/)
- [Cloudflare: China Network onboarding](https://developers.cloudflare.com/china-network/get-started/)
- [Alibaba Cloud: Cross-region replication for Object Storage Service](https://www.alibabacloud.com/help/en/oss/user-guide/cross-region-replication-overview/)
- [Alibaba Cloud: Host static websites and single-page applications with OSS](https://www.alibabacloud.com/help/en/oss/overview-71/)
- [Alibaba Cloud: CDN service limits and acceleration regions](https://www.alibabacloud.com/help/en/cdn/product-overview/limits)
- [Alibaba Cloud: Accelerate OSS content with CDN](https://www.alibabacloud.com/help/en/cdn/use-cases/accelerate-the-retrieval-of-resources-from-an-oss-bucket-in-the-alibaba-cloud-cdn-console)
- [Alibaba Cloud: CDN data-transfer pricing](https://www.alibabacloud.com/help/en/cdn/product-overview/billing-rules-of-basic-services)
- [Alibaba Cloud: Static HTTPS request pricing](https://www.alibabacloud.com/help/en/cdn/product-overview/billing-of-https-requests-for-static-content)
- [Alibaba Cloud: OSS billing overview](https://www.alibabacloud.com/help/en/oss/billing-overview)
- [AWS: Amplify endpoints and Singapore availability](https://docs.aws.amazon.com/general/latest/gr/amplify.html)
- [AWS: Deploy a static website to Amplify Hosting from S3](https://docs.aws.amazon.com/amplify/latest/userguide/deploy-website-from-s3.html)
- [AWS: Amplify pricing](https://aws.amazon.com/amplify/pricing/)
- [Cloudflare: Pages Functions and static asset pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- [Cloudflare: R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare: Pages limits](https://developers.cloudflare.com/pages/platform/limits/)

Last reviewed: 2026-06-20
