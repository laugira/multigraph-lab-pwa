# MultiGraph Lab (PWA)

Browser-only version of **MultiGraph Lab** — no backend. Data is stored in the browser (`localStorage`). Installable as a PWA.

Public URLs (target):

- `https://dynalgo.fr`
- `https://www.dynalgo.fr`

The Ktor/backend project remains in [`../ws_app`](../ws_app) for local development only.

---

## Quick start (local)

```bash
cd multigraph-lab-pwa
npm install
npm run dev
```

Open the URL shown by Vite (usually `http://localhost:5173/multigraph-lab-pwa/`).

Production build for **custom domain** (dynalgo.fr):

```bash
npm run build:production-domain
```

Test build for **GitHub project pages** (before DNS):

```bash
npm run build
```

---

## Deployment checklist

### 1. GitHub repository

Create a public repo, e.g. `laugira/multigraph-lab-pwa`, then:

```bash
cd multigraph-lab-pwa
git init
git add .
git commit -m "Initial PWA: MultiGraph Lab offline"
git remote add origin git@github.com:laugira/multigraph-lab-pwa.git
git push -u origin main
```

### 2. GitHub Pages (Actions)

The workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) publishes `dist/` on each push to `main`.

In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Test URL (until custom domain):

`https://laugira.github.io/multigraph-lab-pwa/`

### 3. Verify on GitHub URL

- App loads, empty graph
- Create entity / link
- Reload page — data persists
- PWA install prompt (Chrome / Edge)

### 4. OVH DNS (zone dynalgo.fr)

| Type  | Sub-domain | Target                    |
|-------|------------|---------------------------|
| A     | `@`        | `185.199.108.153`         |
| A     | `@`        | `185.199.109.153`         |
| A     | `@`        | `185.199.110.153`         |
| A     | `@`        | `185.199.111.153`         |
| CNAME | `www`      | `laugira.github.io.`      |

Verify current GitHub IPs in [GitHub documentation](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site#configuring-an-apex-domain).

### 5. Custom domain on GitHub

1. **Settings → Pages → Custom domain**: `dynalgo.fr`
2. Enable **www** if offered (or add `www.dynalgo.fr`)
3. Wait for DNS check
4. Enable **Enforce HTTPS**
5. Update workflow env `VITE_BASE: /` in `.github/workflows/deploy.yml` (or use `npm run build:production-domain` in CI)
6. Push to `main` and redeploy

### 6. Test final domain

- `https://dynalgo.fr`
- `https://www.dynalgo.fr`
- Install PWA from browser menu

---

## Architecture

| Layer | Role |
|-------|------|
| `public/js/app.js` | UI ported from ws_app (legacy JS) |
| `src/store/graphStore.ts` | Offline API (`/entities`, `/graph`, …) |
| `src/offline-fetch.ts` | Intercepts `fetch` for API and i18n paths |
| `vite-plugin-pwa` | Manifest + service worker |

---

## License

Same project family as Dynalgo MultiGraph Lab.
