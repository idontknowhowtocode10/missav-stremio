/**
 * index.js — MissAV Stremio Addon
 *
 * CS3 source: https://raw.githubusercontent.com/phisher98/CXXX/builds/MissAV.cs3
 * Version:    9
 *
 * Run:     node index.js
 * Install: https://missav-stremio.onrender.com/manifest.json
 */

'use strict';

const express  = require('express');
const cors     = require('cors');
const manifest = require('./src/manifest');

// Public base URL — used for the install button and stremio:// link
// Override via PUBLIC_URL env var if self-hosting elsewhere
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://missav-stremio.onrender.com').replace(/\/$/, '');
const {
  ITEMS_PER_PAGE,
  GENRE_SLUG,
  ACTRESS_SLUG,
  fetchCatalog,
  fetchSearch,
  fetchMeta,
  fetchStreams,
} = require('./src/scraper');

// ─── Catalog ID → base path ──────────────────────────────────────────────────

const CATALOG_PATH = {
  'missav-new':             '/new',
  'missav-today-hot':       '/today-hot',
  'missav-weekly-hot':      '/weekly-hot',
  'missav-monthly-hot':     '/monthly-hot',
  'missav-uncensored-leak': '/uncensored-leak',
};

// ─── Express setup ───────────────────────────────────────────────────────────

const app = express();
// Trust Render's reverse proxy so req.protocol returns 'https'
app.set('trust proxy', 1);
app.use(cors());
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ─── Landing page ─────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  const base = PUBLIC_URL;
  const host = base.replace(/^https?:\/\//, '');  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>MissAV Stremio Addon</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:'Segoe UI',sans-serif;max-width:640px;margin:80px auto;padding:0 24px;background:#0d0d0d;color:#eee}
    h1{color:#e5a00d;font-size:2rem;margin-bottom:4px}
    .sub{color:#888;margin-bottom:32px;font-size:.95rem}
    .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:20px 24px;margin-bottom:20px}
    .label{font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;color:#666;margin-bottom:6px}
    code{display:block;background:#0a0a0a;padding:10px 14px;border-radius:6px;font-size:14px;word-break:break-all;color:#7ec8e3}
    .btn{display:inline-block;margin-top:16px;padding:12px 26px;background:#7b5ea7;color:#fff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;transition:background .2s}
    .btn:hover{background:#9b7ec7}
    .badge{display:inline-block;background:#2a2a2a;border-radius:4px;padding:2px 8px;font-size:12px;color:#aaa;margin-right:6px}
    footer{margin-top:40px;font-size:12px;color:#444;text-align:center}
    a{color:#7b5ea7}
  </style>
</head>
<body>
  <h1>🎬 MissAV</h1>
  <p class="sub">Stremio Addon &mdash; v${manifest.version} &mdash; based on the <a href="https://raw.githubusercontent.com/phisher98/CXXX/builds/MissAV.cs3" target="_blank">MissAV CS3</a> source by phisher98</p>

  <div class="card">
    <div class="label">Manifest URL — paste this into Stremio</div>
    <code>${base}/manifest.json</code>
    <br/>
    <a class="btn" href="stremio://${host}/manifest.json">▶ Install in Stremio</a>
  </div>

  <div class="card">
    <div class="label">Catalogs</div>
    <span class="badge">🆕 New Releases</span>
    <span class="badge">🔥 Today's Hot</span>
    <span class="badge">📅 Weekly Hot</span>
    <span class="badge">📆 Monthly Hot</span>
    <span class="badge">🔓 Uncensored Leak</span>
    <span class="badge">🏷 Genre</span>
    <span class="badge">⭐ Actresses</span>
  </div>

  <div class="card">
    <div class="label">Health</div>
    <code><a href="/health" style="color:#7ec8e3">${base}/health</a></code>
  </div>

  <footer>Install the manifest URL in Stremio → Add Addon (Community tab or paste URL).</footer>
</body>
</html>`);
});

// ─── Manifest ─────────────────────────────────────────────────────────────────

app.get('/manifest.json', (_req, res) => {
  // Strip internal fields before sending to Stremio
  const { cs3Source, ...stremioManifest } = manifest;
  res.setHeader('Content-Type', 'application/json');
  res.json(stremioManifest);
});

// ─── Catalog ──────────────────────────────────────────────────────────────────

app.get('/catalog/:type/:id/:extra?.json', async (req, res) => {
  try {
    const { id }  = req.params;
    const extra   = parseExtra(req.params.extra || '');
    const skip    = parseInt(extra.skip  || '0', 10);
    const search  = extra.search || '';
    const genre   = extra.genre  || '';

    // Global search — works across all catalog IDs
    if (search) {
      const metas = await fetchSearch(search, skip);
      return res.json({ metas });
    }

    // Genre catalog
    if (id === 'missav-genre') {
      const path  = genre
        ? (GENRE_SLUG[genre] || `/tags/${slugify(genre)}`)
        : '/tags';
      const metas = await fetchCatalog(path, skip);
      return res.json({ metas });
    }

    // Actress catalog
    if (id === 'missav-actress') {
      const path  = genre
        ? (ACTRESS_SLUG[genre] || `/actresses/${slugify(genre)}`)
        : '/actresses?sort=most_viewed';
      const metas = await fetchCatalog(path, skip);
      return res.json({ metas });
    }

    // Standard category catalogs
    const basePath = CATALOG_PATH[id] || '/new';
    const metas    = await fetchCatalog(basePath, skip);
    res.json({ metas });

  } catch (err) {
    console.error('[Catalog error]', err.message);
    res.json({ metas: [] });
  }
});

// ─── Meta ─────────────────────────────────────────────────────────────────────

app.get('/meta/:type/:id.json', async (req, res) => {
  try {
    const code = req.params.id.replace(/^missav:/, '');
    const meta = await fetchMeta(code);
    res.json({ meta });
  } catch (err) {
    console.error('[Meta error]', err.message);
    res.json({ meta: null });
  }
});

// ─── Stream ───────────────────────────────────────────────────────────────────

app.get('/stream/:type/:id.json', async (req, res) => {
  try {
    const code    = req.params.id.replace(/^missav:/, '');
    const streams = await fetchStreams(code);
    res.json({ streams });
  } catch (err) {
    console.error('[Stream error]', err.message);
    res.json({ streams: [] });
  }
});

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status:  'ok',
    addon:   manifest.name,
    version: manifest.version,
    cs3:     manifest.cs3Source?.url,
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse Stremio "extra" segment: "search=foo&skip=36" → { search, skip } */
function parseExtra(raw) {
  const out = {};
  if (!raw) return out;
  decodeURIComponent(raw).split('&').forEach((pair) => {
    const [k, ...v] = pair.split('=');
    if (k) out[k] = v.join('=');
  });
  return out;
}

/** "Big Tits" → "big-tits" */
function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// ─── Start ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║           MissAV Stremio Addon — Running             ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  CS3 Source  : https://github.com/phisher98/CXXX     ║`);
  console.log(`║  Version     : 9 (manifest v${manifest.version})                 ║`);
  console.log(`║  Port        : ${PORT}                                   ║`);
  console.log(`║  Public URL  : ${PUBLIC_URL} ║`);
  console.log(`║  Manifest    : ${PUBLIC_URL}/manifest.json ║`);
  console.log('╚══════════════════════════════════════════════════════╝\n');
});
