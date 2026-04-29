# One Cloud Utopia — Frontend Architecture Recommendation

_A short, opinionated brief. Read once, decide, move on._

---

## TL;DR — What to adopt

| Layer | Recommendation | Why |
|---|---|---|
| **Framework** | **React 18 + Vite + TypeScript** | Largest talent pool, best tooling, fastest cold dev loop. Vite beats CRA/Webpack on every axis. |
| **Routing** | **TanStack Router** (or React Router v6 if you want boring-and-stable) | Type-safe routes, search-param parsing, lazy loading out of the box. |
| **Data layer** | **TanStack Query** (server state) + **Zustand** (tiny client state) | Stop hand-rolling `api.js` + cache invalidation. Query handles polling (perfect for your instance-state loop), retries, and stale-while-revalidate for free. |
| **Styling** | **Tailwind CSS v4** + **CSS variables** for tokens | Utility-first scales better than your current 4300-line `styles.css`. Variables keep theming (light/dark) one-line. |
| **Components** | **shadcn/ui** (copy-in, not a dependency) + **Radix primitives** | Accessible, unstyled, you own the code. Perfect for the premium aesthetic we're building. |
| **Icons** | **lucide-react** (already in your brief) | One library, tree-shaken, 1000+ icons. |
| **Forms** | **React Hook Form** + **Zod** | Replaces your inline `oninput` validation. Type-safe, small, fast. |
| **Charts** | **Recharts** or **Visx** | For Analytics page — the donut + cost bars you have today. |
| **Build** | **Vite** with `@vitejs/plugin-react` + `vite-plugin-checker` | Sub-second HMR. |
| **Auth** | **Amazon Cognito** via **aws-amplify v6** (modular) or **amazon-cognito-identity-js** (your current lib) | Keep your existing Cognito user pool — only the client wrapper changes. |
| **Testing** | **Vitest** + **Playwright** | Same config as Vite. |
| **Lint/Format** | **ESLint 9** + **Prettier** + **TypeScript strict** | Non-negotiable for a team. |

---

## Hosting — keep what works, layer CDN smarts on top

You already have **S3 + CloudFront**. That's the correct pattern. Don't touch it. What to change:

1. **Build output** goes to `dist/` → sync to S3 → CloudFront invalidation. Automate with **GitHub Actions** (`aws s3 sync` + `aws cloudfront create-invalidation`).
2. Add **long cache headers** (`Cache-Control: public, max-age=31536000, immutable`) for hashed `assets/*.js`/`*.css`. `index.html` stays `no-cache`. Vite's default output supports this without extra config.
3. Enable **Brotli** on CloudFront (it's a checkbox). ~20% smaller than gzip.
4. Add an `_headers` / CloudFront Function for `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`.
5. Route `/*` → `/index.html` for SPA fallback (CloudFront custom error response, 404/403 → 200 /index.html).

**Do you need Next.js / SSR?** **No.** Your app is a signed-in control plane — not SEO-sensitive, no public marketing pages. SPA on S3+CloudFront is the lowest-cost, highest-performance option for your shape.

---

## Project structure

```
/src
  /app                  # entry, providers, router config
    main.tsx
    App.tsx
    routes.tsx
  /features             # feature-first, NOT component-first
    /instances
      api.ts            # TanStack Query hooks (useInstances, useStartInstance)
      types.ts          # Zod schemas + inferred types
      InstanceTable.tsx
      InstanceDetail.tsx
    /billing
    /analytics
    /audit
    /vendors
    /customers
    /accounts
    /users
    /auth
  /components           # shared, presentational only
    /ui                 # shadcn primitives (button, card, dialog…)
    AppShell.tsx
    Sidebar.tsx
    Topbar.tsx
    StatCard.tsx
  /lib
    cognito.ts          # auth wrapper
    api-client.ts       # fetch wrapper, auth-token injection
    format.ts           # currency, date, bytes
    cn.ts               # tailwind classnames helper
  /styles
    tokens.css          # CSS variables (colors, spacing, radii)
    globals.css
  /hooks
  /types
```

**Why feature-first?** Your app has clearly bounded domains (Vendors, Customers, Instances, Billing). Co-locating API calls + types + components by feature means you can delete or extract any feature as one folder. This matters at scale.

---

## Migration plan — incremental, not big-bang

Don't rewrite in one PR. Do it in four:

1. **PR 1 — Scaffold.** Stand up Vite/React/TS/Tailwind/shadcn alongside the existing site. Build the `AppShell`, `Sidebar`, `Topbar`, theme system. Deploy to `app-v2.onecloudutopia.com` on a separate CloudFront behavior. Port **only the login flow**. Validate end-to-end with Cognito.
2. **PR 2 — Read-only screens.** Port Dashboard, Instances (read), Audit, Analytics. These are lowest-risk — no mutations. Share the `api-client.ts` with the old site's endpoints.
3. **PR 3 — Mutations.** Port Instances (start/stop), Accounts, Users, Backups. One feature folder per PR is fine.
4. **PR 4 — Finance module.** Port Vendors, Customers, Billing, Fin Settings, Alerts. Flip the DNS. Retire old bundle.

**Feature flag it.** Cookie-based toggle so you can ship v2 to yourself first, then 10% of users, then 100%.

---

## Performance targets

With this stack + CloudFront:

- **Initial JS** (gzipped): < 150 KB  (React + Router + shell)
- **Route bundles** (lazy): < 50 KB each
- **First Contentful Paint**: < 1.0 s on 4G
- **Time to Interactive**: < 2.0 s on 4G
- **Lighthouse Performance**: 95+

Key levers: route-level code splitting (`React.lazy` + `Suspense`), `<link rel="preconnect">` to your API Gateway, image optimization via `vite-plugin-image-optimizer`, and `@tanstack/react-query` deduping your current polling.

---

## What I'd **not** do

- ❌ Next.js / Remix / SvelteKit — SSR you don't need; extra complexity.
- ❌ Redux / MobX — Zustand + Query cover 100% of your state shape.
- ❌ A component library like MUI / Ant / Chakra — they force their aesthetic. shadcn gives you accessibility without the opinions.
- ❌ Storybook on day one — add it once you have 20+ components.
- ❌ Micro-frontends — you're one product, one team. Module federation is a tax, not a benefit, at your size.

---

## Summary

Ship a **React + Vite + TypeScript SPA** on your existing **S3 + CloudFront**, styled with **Tailwind + shadcn/ui**, state managed by **TanStack Query + Zustand**, structured feature-first. Migrate incrementally behind a subdomain. Aim for < 150 KB initial JS and < 1 s FCP.

This is the widely-adopted 2026 stack for internal SaaS control planes — Vercel, Linear, Cal.com, Cursor, and most new Stripe surfaces all look like this under the hood.
