/**
 * index.js  –  MissAV Stremio Addon
 *
 * Run:   node index.js
 * Then install in Stremio: http://localhost:7000/manifest.json
 */

const express = require('express');
const cors = require('cors');
const manifest = require('./src/manifest');
const {
  fetchCatalog,
  fetchSearch,
  fetchMeta,
  fetchStreams,
} = require('./src/scraper');

// ─── Genre → MissAV URL slug mapping ────────────────────────────────────────
const GENRE_SLUG = {
  Uncensored: '/uncensored',
  Censored: '/censored',
  'Uncensored Leak': '/uncensored-leak',
  '4K': '/4k',
  Amateur: '/tags/amateur',
  Cosplay: '/tags/cosplay',
  Solo: '/tags/solo',
  Lesbian: '/tags/lesbian',
  'Big Tits': '/tags/big-tits',
  'Small Tits': '/tags/small-tits',
  Busty: '/tags/busty',
  Creampie: '/tags/creampie',
  Blowjob: '/tags/blowjob',
  Handjob: '/tags/handjob',
  Anal: '/tags/anal',
  Squirting: '/tags/squirting',
  Gangbang: '/tags/gangbang',
  Orgy: '/tags/orgy',
  Masturbation: '/tags/masturbation',
  Toys: '/tags/toys',
  MILF: '/tags/milf',
  Schoolgirl: '/tags/schoolgirl',
  'Office Lady': '/tags/office-lady',
  Nurse: '/tags/nurse',
  Maid: '/tags/maid',
  Idol: '/tags/idol',
  Model: '/tags/model',
  Chinese: '/tags/chinese',
  Korean: '/tags/korean',
  Thai: '/tags/thai',
  Bondage: '/tags/bondage',
  Swimsuit: '/tags/swimsuit',
  Lingerie: '/tags/lingerie',
  Pantyhose: '/tags/pantyhose',
  Outdoor: '/tags/outdoor',
  Hotel: '/tags/hotel',
};

// Actress → MissAV URL slug mapping
const ACTRESS_SLUG = {
  'Most Popular': '/actresses?sort=most_viewed',
  Newest: '/actresses?sort=newest',
  'Yua Mikami': '/actresses/yua-mikami',
  'Eimi Fukada': '/actresses/eimi-fukada',
  'Minami Kojima': '/actresses/minami-kojima',
  Rion: '/actresses/rion',
  Julia: '/actresses/julia',
  'Mia Khalifa': '/actresses/mia-khalifa',
  'Ai Mukai': '/actresses/ai-mukai',
  Aika: '/actresses/aika',
};

// Catalog ID → base URL path mapping
const CATALOG_PATH = {
  'missav-new': '/new',
  'missav-today-hot': '/today-hot',
  'missav-weekly-hot': '/weekly-hot',
  'missav-monthly-hot': '/monthly-hot',
  'missav-uncensored-leak': '/uncensored-leak',
};

// ─── Express app ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ─── Root install page ────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>MissAV Stremio Addon</title>
  <style>
    body{font-family:sans-serif;max-width:600px;margin:80px auto;padding:0 20px;background:#111;color:#eee}
    h1{color:#e5a00d}
    code{background:#222;padding:4px 10px;border-radius:4px;font-size:15px}
    .btn{display:inline-block;margin-top:20px;padding:12px 24px;background:#7b5ea7;color:#fff;text-decoration:none;border-radius:6px;font-size:16px}
    .btn:hover{background:#9b7ec7}
    .url{word-break:break-all}
  </style>
</head>
<body>
  <h1>🎬 MissAV Stremio Addon</h1>
  <p>The addon is running! Install it in Stremio:</p>
  <p class="url"><code>${base}/manifest.json</code></p>
  <a class="btn" href="stremio://${req.get('host')}/manifest.json">▶ Install in Stremio</a>
  <p style="margin-top:30px;color:#888;font-size:13px">Or in Stremio → Search Addons → paste the URL above.</p>
</body>
</html>`);
});

// ─── Manifest ────────────────────────────────────────────────────────────────
app.get('/manifest.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(manifest);
});

// ─── Catalog handler ─────────────────────────────────────────────────────────
app.get('/catalog/:type/:id/:extra?.json', async (req, res) => {
  try {
    const { id } = req.params;
    const extra = parseExtra(req.params.extra || '');
    const skip = parseInt(extra.skip || '0', 10);
    const search = extra.search || '';
    const genre = extra.genre || '';

    let metas = [];

    // ── Search (applies to all catalogs) ──
    if (search) {
      metas = await fetchSearch(search, skip);
      return res.json({ metas });
    }

    // ── Genre catalog ──
    if (id === 'missav-genre') {
      const path = genre ? (GENRE_SLUG[genre] || `/tags/${slugify(genre)}`) : '/tags';
      metas = await fetchCatalog(path, skip);
      return res.json({ metas });
    }

    // ── Actress catalog ──
    if (id === 'missav-actress') {
      if (search) {
        metas = await fetchSearch(search, skip);
      } else {
        const path = genre
          ? (ACTRESS_SLUG[genre] || `/actresses/${slugify(genre)}`)
          : '/actresses?sort=most_viewed';
        metas = await fetchCatalog(path, skip);
      }
      return res.json({ metas });
    }

    // ── Standard category catalogs ──
    const basePath = CATALOG_PATH[id] || '/new';
    metas = await fetchCatalog(basePath, skip);
    res.json({ metas });
  } catch (err) {
    console.error('Catalog error:', err.message);
    res.json({ metas: [] });
  }
});

// ─── Meta handler ────────────────────────────────────────────────────────────
app.get('/meta/:type/:id.json', async (req, res) => {
  try {
    const { id } = req.params;
    // id is like "missav:abw-123"
    const code = id.replace(/^missav:/, '');
    const meta = await fetchMeta(code);
    res.json({ meta });
  } catch (err) {
    console.error('Meta error:', err.message);
    res.json({ meta: null });
  }
});

// ─── Stream handler ──────────────────────────────────────────────────────────
app.get('/stream/:type/:id.json', async (req, res) => {
  try {
    const { id } = req.params;
    const code = id.replace(/^missav:/, '');
    const streams = await fetchStreams(code);
    res.json({ streams });
  } catch (err) {
    console.error('Stream error:', err.message);
    res.json({ streams: [] });
  }
});

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', addon: manifest.name }));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse Stremio "extra" URL segment: "search=foo&skip=36"
 */
function parseExtra(raw) {
  const out = {};
  if (!raw) return out;
  const decoded = decodeURIComponent(raw);
  decoded.split('&').forEach((pair) => {
    const [k, ...v] = pair.split('=');
    if (k) out[k] = v.join('=');
  });
  return out;
}

/** Convert "Big Tits" → "big-tits" */
function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// ─── Start server ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║           MissAV Stremio Addon – Running             ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Local:   http://localhost:${PORT}/manifest.json       ║`);
  console.log(`║  Install: http://localhost:${PORT}/manifest.json       ║`);
  console.log('╚══════════════════════════════════════════════════════╝\n');
  console.log('Paste the Install URL into Stremio → Add Addon.\n');
});
