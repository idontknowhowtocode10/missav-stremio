# 🎬 MissAV Stremio Addon

A Node.js Stremio addon for MissAV — browse, search, and stream JAV content directly in Stremio.

**Live on Render:** `https://missav-stremio.onrender.com/manifest.json`

**Based on the MissAV CS3 source by phisher98:**
```
url:          https://raw.githubusercontent.com/phisher98/CXXX/builds/MissAV.cs3
version:      9
name:         MissAV
internalName: MissAV
```

---

## Install in Stremio

Paste this URL into Stremio → Add Addon:
```
https://missav-stremio.onrender.com/manifest.json
```

Or open the landing page and click **▶ Install in Stremio**:
```
https://missav-stremio.onrender.com/
```

---

## Deploy to Render

1. Push this folder to a GitHub repo
2. In [Render](https://render.com) → **New Web Service** → connect the repo
3. Render auto-detects `render.yaml` — just click **Deploy**

The `render.yaml` sets:
- **Build:** `npm install`
- **Start:** `node index.js`
- **`PUBLIC_URL`:** `https://missav-stremio.onrender.com`

> ℹ️ Render free-tier services sleep after 15 min of inactivity. The first request after sleep takes ~30 s to wake up. Upgrade to a paid plan to keep it always-on.

---

## Features

- **Catalogs** — New Releases, Today's Hot, Weekly Hot, Monthly Hot, Uncensored Leak
- **Genre browser** — 35+ genre/tag categories (Uncensored, 4K, Amateur, Cosplay, MILF, …)
- **Actress browser** — most-viewed actresses with named shortcuts
- **Full search** — works across all catalogs
- **Pagination** — infinite scroll via `skip`
- **HLS + MP4 streams** — multi-strategy extraction matching the CS3 plugin
- **Smart caching** — minimises repeat requests (prefix 30 min, catalog 10 min, stream 5 min)
- **Auto prefix discovery** — dynamically finds the current `/dm<N>/en` path

---

## Local development

```bash
npm install
npm run dev        # nodemon auto-reload

# open http://localhost:7000
```

Override the public URL for local testing:
```bash
PUBLIC_URL=http://localhost:7000 npm start
```

---

## Stream extraction strategies

Mirrors the CS3 plugin's multi-strategy approach:

1. **Inline script regex** — JWPlayer `setup({})`, HLS variable assignments, bare URLs
2. **`<video><source>`** elements
3. **`/api/v1/video/{code}`** — JSON API endpoint
4. **`/api/v2/source/{code}`** — newer POST endpoint used by CS3 forks

---

## Troubleshooting

**No streams?** MissAV rotates stream URLs frequently. The stream cache TTL is short (5 min). Wait and retry.

**Wrong dm-prefix?** The prefix cache expires every 30 min. Redeploy to force rediscovery.


A Node.js Stremio addon for MissAV — browse, search, and stream JAV content directly in Stremio.

**Based on the MissAV CS3 source by phisher98:**
```
url:          https://raw.githubusercontent.com/phisher98/CXXX/builds/MissAV.cs3
version:      9
name:         MissAV
internalName: MissAV
```

---

## Features

- **Catalogs** — New Releases, Today's Hot, Weekly Hot, Monthly Hot, Uncensored Leak
- **Genre browser** — 35+ genre/tag categories (Uncensored, 4K, Amateur, Cosplay, MILF, …)
- **Actress browser** — most-viewed actresses with named shortcuts
- **Full search** — works across all catalogs
- **Pagination** — infinite scroll via `skip`
- **HLS + MP4 streams** — multi-strategy extraction matching the CS3 plugin
- **Smart caching** — minimises repeat requests (prefix 30 min, catalog 10 min, stream 5 min)
- **Auto prefix discovery** — dynamically finds the current `/dm<N>/en` path

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Run the addon

```bash
npm start
# or for auto-reload during development:
npm run dev
```

The server starts on **port 7000** by default.  
Set `PORT=<number>` to change it.

### 3. Install in Stremio

Open the landing page in your browser:
```
http://localhost:7000
```

Then either:
- Click **▶ Install in Stremio**, or
- In Stremio → **Add Addon** → paste `http://localhost:7000/manifest.json`

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Landing page with install button |
| `GET` | `/manifest.json` | Stremio manifest |
| `GET` | `/catalog/movie/:id/:extra?.json` | Catalog results |
| `GET` | `/meta/movie/:id.json` | Video metadata |
| `GET` | `/stream/movie/:id.json` | Stream URLs |
| `GET` | `/health` | Health check |

---

## Stream Extraction Strategies

Mirrors the CS3 plugin's multi-strategy approach:

1. **Inline script regex** — JWPlayer `setup({})`, HLS variable assignments, bare URLs
2. **`<video><source>`** elements
3. **`/api/v1/video/{code}`** — JSON API endpoint
4. **`/api/v2/source/{code}`** — newer POST endpoint (used by some CS3 forks)

---

## Deploy to a Server (optional)

To make the addon accessible outside localhost, deploy to any Node.js host and set `PORT` via environment variable. Then install using your server's public URL.

```bash
PORT=8080 node index.js
```

---

## Troubleshooting

**No streams returned?**
MissAV rotates its stream URLs frequently. The stream cache TTL is intentionally short (5 min). If streams stop working, wait a few minutes and try again.

**Wrong dm-prefix?**
The prefix cache expires every 30 minutes. You can restart the server to force rediscovery immediately.

**Port already in use?**
```bash
PORT=7001 npm start
```
