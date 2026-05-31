'use strict';

const express  = require('express');
const cors     = require('cors');
const manifest = require('./src/manifest');
const {
  ITEMS_PER_PAGE,
  GENRE_SLUG,
  ACTRESS_SLUG,
  warmUp,
  fetchCatalog,
  fetchSearch,
  fetchMeta,
  fetchStreams,
} = require('./src/scraper');

const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://missav-stremio.onrender.com').replace(/\/$/, '');

// Hard timeout so Stremio never hangs waiting — return empty before Stremio gives up
const HANDLER_TIMEOUT_MS = 8_000;

function withTimeout(promise, fallback) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(fallback), HANDLER_TIMEOUT_MS)),
  ]);
}

const CATALOG_PATH = {
  'missav-new':             '/new',
  'missav-today-hot':       '/today-hot',
  'missav-weekly-hot':      '/weekly-hot',
  'missav-monthly-hot':     '/monthly-hot',
  'missav-uncensored-leak': '/uncensored-leak',
};

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
    .btn{display:inline-block;margin-top:16px;padding:12px 26px;background:#7b5ea7;color:#fff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600}
    .btn:hover{background:#9b7ec7}
    .badge{display:inline-block;background:#2a2a2a;border-radius:4px;padding:2px 8px;font-size:12px;color:#aaa;margin-right:6px}
    footer{margin-top:40px;font-size:12px;color:#444;text-align:center}
    a{color:#7b5ea7}
  </style>
</head>
<body>
  <h1>🎬 MissAV</h1>
  <p class="sub">Stremio Addon — v${manifest.version}</p>
  <div class="card">
    <div class="label">Manifest URL</div>
    <code>${PUBLIC_URL}/manifest.json</code>
    <br/>
    <a class="btn" href="stremio://${host}/manifest.json">▶ Install in Stremio</a>
  </div>
  <div class="card">
    <div class="label">Catalogs</div>
    <span class="badge">🆕 New</span>
    <span class="badge">🔥 Today's Hot</span>
    <span class="badge">📅 Weekly</span>
    <span class="badge">📆 Monthly</span>
    <span class="badge">🔓 Uncensored Leak</span>
    <span class="badge">🏷 Genre</span>
    <span class="badge">⭐ Actresses</span>
  </div>
  <footer>Paste the manifest URL into Stremio → Add Addon.</footer>
</body>
</html>`);
});

// ─── Manifest ─────────────────────────────────────────────────────────────────

app.get('/manifest.json', (_req, res) => {
  const { cs3Source, ...stremioManifest } = manifest;
  res.setHeader('Content-Type', 'application/json');
  res.json(stremioManifest);
});

// ─── Catalog ──────────────────────────────────────────────────────────────────

app.get('/catalog/:type/:id/:extra?.json', async (req, res) => {
  try {
    const { id } = req.params;
    const extra  = parseExtra(req.params.extra || '');
    const skip   = parseInt(extra.skip || '0', 10);
    const search = extra.search || '';
    const genre  = extra.genre  || '';

    let work;
    if (search) {
      work = fetchSearch(search, skip);
    } else if (id === 'missav-genre') {
      const path = genre ? (GENRE_SLUG[genre] || `/tags/${slugify(genre)}`) : '/tags';
      work = fetchCatalog(path, skip);
    } else if (id === 'missav-actress') {
      const path = genre ? (ACTRESS_SLUG[genre] || `/actresses/${slugify(genre)}`) : '/actresses?sort=most_viewed';
      work = fetchCatalog(path, skip);
    } else {
      work = fetchCatalog(CATALOG_PATH[id] || '/new', skip);
    }

    const metas = await withTimeout(work, []);
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
    const meta = await withTimeout(fetchMeta(code), null);
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
    const streams = await withTimeout(fetchStreams(code), []);
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

function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// ─── Debug — shows raw fetch result so we can diagnose empty catalogs ────────

app.get('/debug', async (_req, res) => {
  try {
    const axios   = require('axios');
    const cheerio = require('cheerio');

    const HEADERS = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Connection: 'keep-alive',
    };

    // 1. Follow root redirect to find real prefix
    let finalUrl = '';
    let status   = 0;
    let html     = '';
    try {
      const r = await axios.get('https://missav.ws/', {
        headers: HEADERS, maxRedirects: 10, timeout: 10_000,
        validateStatus: () => true,
      });
      status   = r.status;
      finalUrl = r.request?.res?.responseUrl || r.request?.responseURL || r.config?.url || '';
      html     = r.data || '';
    } catch (e) {
      return res.json({ error: e.message });
    }

    const prefixMatch = finalUrl.match(/\/(dm\d+)\/en/) ||
      (html.match(/href="(\/(dm\d+)\/en\/[^"]+)"/) || [])[1]?.match(/\/(dm\d+)\/en/);
    const prefix = prefixMatch ? `/${prefixMatch[1]}/en` : '/en';

    // 2. Fetch /new with discovered prefix
    let newStatus = 0, newHtml = '';
    const newUrl = `https://missav.ws${prefix}/new`;
    try {
      const r2 = await axios.get(newUrl, { headers: { ...HEADERS, Referer: 'https://missav.ws' }, timeout: 10_000, validateStatus: () => true });
      newStatus = r2.status;
      newHtml   = r2.data || '';
    } catch (e) {
      newHtml = `FETCH ERROR: ${e.message}`;
    }

    // 3. Check what selectors match
    const $ = cheerio.load(newHtml);
    const selectorResults = {};
    for (const sel of ['div.thumbnail','div.group','li.group','.grid > div','.grid > li','div[class*="thumbnail"]','a[href*="/en/"]']) {
      selectorResults[sel] = $(sel).length;
    }

    // 4. Sample anchors with /en/ in href
    const sampleLinks = [];
    $('a[href*="/en/"]').slice(0, 10).each((_, el) => {
      sampleLinks.push($(el).attr('href'));
    });

    // 5. Detect Cloudflare block
    const isCFBlock = newHtml.includes('cf-browser-verification') ||
                      newHtml.includes('Enable JavaScript and cookies') ||
                      newHtml.includes('Checking your browser') ||
                      newStatus === 403 || newStatus === 503;

    res.json({
      rootRedirect:    { status, finalUrl },
      prefix,
      newPageFetch:    { url: newUrl, status: newStatus, cloudflareBlocked: isCFBlock },
      htmlLength:      newHtml.length,
      htmlSnippet:     newHtml.slice(0, 1500),
      selectorMatches: selectorResults,
      sampleLinks,
    });
  } catch (err) {
    res.json({ error: err.message, stack: err.stack });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 7000;
app.listen(PORT, async () => {
  console.log(`[MissAV] Server listening on port ${PORT}`);
  console.log(`[MissAV] Public URL: ${PUBLIC_URL}`);
  // Kick off warm-up in the background — don't block server start
  warmUp().catch(err => console.warn('[MissAV] Warm-up failed:', err.message));
});
