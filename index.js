'use strict';

const express  = require('express');
const cors     = require('cors');
const manifest = require('./src/manifest');
const {
  ITEMS_PER_PAGE,
  CATALOG_PATH,
  fetchCatalog,
  fetchSearch,
  fetchMeta,
  fetchMagnets,
} = require('./src/scraper');

const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://missav-magnets.onrender.com').replace(/\/$/, '');

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ─── Landing page ─────────────────────────────────────────────────────────────

app.get('/', (_req, res) => {
  const host = PUBLIC_URL.replace(/^https?:\/\//, '');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>MissAV Magnets — Stremio Addon</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:'Segoe UI',sans-serif;max-width:600px;margin:80px auto;padding:0 24px;background:#0d0d0d;color:#eee}
    h1{font-size:2rem;margin-bottom:4px;color:#3dd68c}
    .sub{color:#888;margin-bottom:32px}
    .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:20px 24px;margin-bottom:20px}
    .label{font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;color:#555;margin-bottom:8px}
    code{display:block;background:#0a0a0a;padding:10px 14px;border-radius:6px;font-size:13px;word-break:break-all;color:#7ec8e3}
    .btn{display:inline-block;margin-top:16px;padding:12px 28px;background:#3dd68c;color:#000;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px}
    .btn:hover{background:#5ae6a0}
    .badge{display:inline-block;background:#1e2e26;border:1px solid #2a4a38;border-radius:4px;padding:3px 10px;font-size:12px;color:#3dd68c;margin:3px}
    footer{margin-top:40px;font-size:12px;color:#444;text-align:center}
  </style>
</head>
<body>
  <h1>🧲 MissAV Magnets</h1>
  <p class="sub">Stremio Addon — magnet / torrent streams from MissAV.ws</p>

  <div class="card">
    <div class="label">Manifest URL</div>
    <code>${PUBLIC_URL}/manifest.json</code>
    <br/>
    <a class="btn" href="stremio://${host}/manifest.json">▶ Install in Stremio</a>
  </div>

  <div class="card">
    <div class="label">Catalogs</div>
    <span class="badge">🧲 New Releases</span>
    <span class="badge">🔥 Today's Hot</span>
    <span class="badge">🔓 Uncensored Leak</span>
  </div>

  <div class="card">
    <div class="label">How it works</div>
    <p style="font-size:14px;color:#aaa;margin:0">
      Scrapes MissAV.ws for magnet links on each video page and returns them
      as native Stremio torrent streams (infoHash-based). No HLS, no servers —
      pure peer-to-peer playback via Stremio's built-in torrent engine.
    </p>
  </div>

  <footer>Pair with the <strong>MissAV</strong> addon for HLS streams + this for magnets.</footer>
</body>
</html>`);
});

// ─── Manifest ─────────────────────────────────────────────────────────────────

app.get('/manifest.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(manifest);
});

// ─── Catalog ──────────────────────────────────────────────────────────────────

app.get('/catalog/:type/:id/:extra?.json', async (req, res) => {
  try {
    const { id }  = req.params;
    const extra   = parseExtra(req.params.extra || '');
    const skip    = parseInt(extra.skip || '0', 10);
    const search  = extra.search || '';

    if (search) {
      const metas = await fetchSearch(search, skip);
      return res.json({ metas });
    }

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

// ─── Stream — magnet only ─────────────────────────────────────────────────────

app.get('/stream/:type/:id.json', async (req, res) => {
  try {
    const code    = req.params.id.replace(/^missav:/, '');
    const streams = await fetchMagnets(code);
    res.json({ streams });
  } catch (err) {
    console.error('[Stream error]', err.message);
    res.json({ streams: [] });
  }
});

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', addon: manifest.name, version: manifest.version });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseExtra(raw) {
  const out = {};
  if (!raw) return out;
  decodeURIComponent(raw).split('&').forEach(pair => {
    const [k, ...v] = pair.split('=');
    if (k) out[k] = v.join('=');
  });
  return out;
}

// ─── Start ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 7001;
app.listen(PORT, () => {
  console.log(`\n🧲 MissAV Magnets addon running`);
  console.log(`   Port    : ${PORT}`);
  console.log(`   Public  : ${PUBLIC_URL}`);
  console.log(`   Manifest: ${PUBLIC_URL}/manifest.json\n`);
});
