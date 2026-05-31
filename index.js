'use strict';

const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const cheerio = require('cheerio');
const NodeCache = require('node-cache');

const BASE    = 'https://ijavtorrent.com';
const PUB     = (process.env.PUBLIC_URL || 'https://ijav-stremio.onrender.com').replace(/\/$/, '');
const CACHE   = new NodeCache({ stdTTL: 0 });
const TIMEOUT = 8_000;
const UA      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const MANIFEST = {
  id: 'community.ijav.magnets',
  version: '1.0.0',
  name: 'iJAV Torrents',
  description: 'Magnet links for JAV from ijavtorrent.com — browse by category or search by code.',
  logo: `${BASE}/favicon.ico`,
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie'],
  idPrefixes: ['ijav:'],
  catalogs: [
    { type: 'movie', id: 'ijav-latest',      name: '🆕 Latest JAV Torrents',    extra: [{ name: 'search', isRequired: false }, { name: 'skip' }], extraSupported: ['search', 'skip'] },
    { type: 'movie', id: 'ijav-uncensored',  name: '🔓 Uncensored',             extra: [{ name: 'skip' }], extraSupported: ['skip'] },
    { type: 'movie', id: 'ijav-censored',    name: '📼 Censored',               extra: [{ name: 'skip' }], extraSupported: ['skip'] },
    { type: 'movie', id: 'ijav-4k',          name: '🎬 4K',                     extra: [{ name: 'skip' }], extraSupported: ['skip'] },
  ],
};

// Catalog ID → site path
const CAT_PATH = {
  'ijav-latest':     '/',
  'ijav-uncensored': '/category/uncensored/',
  'ijav-censored':   '/category/censored/',
  'ijav-4k':         '/category/4k/',
};

// ─── HTTP ─────────────────────────────────────────────────────────────────────

async function get(url, ttl = 600) {
  const hit = CACHE.get(url);
  if (hit) return hit;
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': UA, Referer: BASE },
    timeout: TIMEOUT,
    maxRedirects: 5,
  });
  CACHE.set(url, data, ttl);
  return data;
}

function safe(fn, fallback) {
  return Promise.race([fn(), new Promise(r => setTimeout(() => r(fallback), TIMEOUT))]);
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

function slugToId(href = '') {
  const slug = href.replace(/\/$/, '').split('/').pop();
  return slug && slug.length > 2 ? slug : null;
}

function parseGrid(html) {
  const $ = cheerio.load(html);
  const items = [];
  const seen  = new Set();

  // Try common blog/torrent site selectors
  const SELS = ['article', '.post', '.item', '.entry', 'div.movie', 'div.video', '.torrent-item', 'li.post'];
  let $els = $([]);
  for (const s of SELS) { $els = $(s); if ($els.length >= 2) break; }

  // Fallback: any anchor with an img inside
  if ($els.length < 2) {
    $('a:has(img)').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (!href.startsWith(BASE) && !href.startsWith('/')) return;
      const id = slugToId(href);
      if (!id || seen.has(id)) return;
      seen.add(id);
      const poster = $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';
      const name   = $(el).find('img').attr('alt') || $(el).attr('title') || id.toUpperCase();
      items.push({ id: `ijav:${id}`, type: 'movie', name: name.trim(), poster, posterShape: 'poster' });
    });
    return items;
  }

  $els.each((_, el) => {
    const $el  = $(el);
    const href = $el.find('a').first().attr('href') || '';
    const id   = slugToId(href);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const $img  = $el.find('img').first();
    const poster = $img.attr('data-src') || $img.attr('data-lazy-src') || $img.attr('src') || '';
    const name   = $el.find('h1,h2,h3,.title,.entry-title').first().text().trim()
                || $img.attr('alt') || id.toUpperCase();
    items.push({ id: `ijav:${id}`, type: 'movie', name, poster, posterShape: 'poster' });
  });

  return items;
}

function parseMagnets(html) {
  const $       = cheerio.load(html);
  const magnets = [];
  const seen    = new Set();

  function add(uri, label) {
    if (!uri || !uri.startsWith('magnet:') || seen.has(uri)) return;
    seen.add(uri);
    const hashM = uri.match(/xt=urn:btih:([a-fA-F0-9]{40}|[A-Z2-7]{32})/i);
    const dn    = (uri.match(/[?&]dn=([^&]+)/) || [])[1];
    const title = label || (dn ? decodeURIComponent(dn.replace(/\+/g, ' ')) : 'Torrent');
    if (hashM) {
      magnets.push({ name: '🧲 iJAV', title, infoHash: hashM[1].toLowerCase() });
    } else {
      magnets.push({ name: '🧲 iJAV', title, url: uri });
    }
  }

  // <a href="magnet:...">
  $('a[href^="magnet:"]').each((_, el) => add($(el).attr('href'), $(el).text().trim()));

  // inline script sweep
  $('script:not([src])').each((_, el) => {
    const src = $(el).html() || '';
    const RE  = /magnet:\?xt=urn:btih:[a-fA-F0-9]{32,40}[^\s'"<>]*/gi;
    let m;
    while ((m = RE.exec(src)) !== null) add(m[0], 'Torrent');
  });

  // .torrent file links as last resort
  if (magnets.length === 0) {
    $('a[href$=".torrent"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const url  = href.startsWith('http') ? href : `${BASE}${href}`;
      if (!seen.has(url)) { seen.add(url); magnets.push({ name: '🧲 iJAV', title: 'Torrent File', url }); }
    });
  }

  return magnets;
}

function parseMeta(html, id) {
  const $ = cheerio.load(html);
  const title   = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || id.toUpperCase();
  const poster  = $('meta[property="og:image"]').attr('content') || $('article img').first().attr('src') || '';
  const desc    = $('meta[property="og:description"]').attr('content') || $('article p').first().text().trim() || '';
  return { id: `ijav:${id}`, type: 'movie', name: title, poster, posterShape: 'poster', background: poster, description: desc };
}

function pageUrl(path, skip) {
  const page = Math.floor((skip || 0) / 20) + 1;
  const sep  = path.includes('?') ? '&' : '?';
  return `${BASE}${path}${page > 1 ? `${sep}page=${page}` : ''}`;
}

// ─── Express ──────────────────────────────────────────────────────────────────

const app = express();
app.set('trust proxy', 1);
app.use(cors());

// Landing
app.get('/', (_req, res) => {
  const host = PUB.replace(/^https?:\/\//, '');
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>iJAV Torrents</title>
<style>*{box-sizing:border-box}body{font-family:sans-serif;max-width:560px;margin:60px auto;padding:0 20px;background:#111;color:#eee}
h1{color:#e5a00d}code{display:block;background:#000;padding:10px;border-radius:6px;color:#7ec8e3;word-break:break-all;font-size:13px}
.btn{display:inline-block;margin-top:14px;padding:11px 24px;background:#e5a00d;color:#000;border-radius:7px;text-decoration:none;font-weight:700}
p{color:#999;font-size:14px}</style></head><body>
<h1>🧲 iJAV Torrents</h1>
<p>Stremio addon — magnet links from <a href="${BASE}" style="color:#e5a00d">ijavtorrent.com</a></p>
<code>${PUB}/manifest.json</code>
<br><a class="btn" href="stremio://${host}/manifest.json">▶ Install in Stremio</a>
<p style="margin-top:24px">Catalogs: Latest · Uncensored · Censored · 4K · Search by JAV code</p>
</body></html>`);
});

// Manifest
app.get('/manifest.json', (_req, res) => res.json(MANIFEST));

// Catalog
app.get('/catalog/:type/:id/:extra?.json', async (req, res) => {
  try {
    const extra  = Object.fromEntries((decodeURIComponent(req.params.extra || '')).split('&').filter(Boolean).map(p => p.split('=')));
    const skip   = parseInt(extra.skip || '0', 10);
    const search = extra.search || '';
    let url;
    if (search) {
      url = `${BASE}/?s=${encodeURIComponent(search)}`;
    } else {
      url = pageUrl(CAT_PATH[req.params.id] || '/', skip);
    }
    const metas = await safe(() => get(url).then(parseGrid), []);
    res.json({ metas });
  } catch { res.json({ metas: [] }); }
});

// Meta
app.get('/meta/:type/:id.json', async (req, res) => {
  try {
    const id   = req.params.id.replace(/^ijav:/, '');
    const html = await safe(() => get(`${BASE}/${id}/`, 3600), null);
    const meta = html ? parseMeta(html, id) : null;
    res.json({ meta });
  } catch { res.json({ meta: null }); }
});

// Stream
app.get('/stream/:type/:id.json', async (req, res) => {
  try {
    const id      = req.params.id.replace(/^ijav:/, '');
    const html    = await safe(() => get(`${BASE}/${id}/`, 1800), null);
    const streams = html ? parseMagnets(html) : [];
    res.json({ streams });
  } catch { res.json({ streams: [] }); }
});

// Debug
app.get('/debug', async (_req, res) => {
  try {
    const html = await axios.get(BASE, { headers: { 'User-Agent': UA }, timeout: 8_000, validateStatus: () => true });
    const $    = cheerio.load(html.data);
    const sels = {};
    for (const s of ['article', '.post', '.item', '.entry', 'div.movie', 'a:has(img)']) sels[s] = $(s).length;
    const links = [];
    $('a[href]').slice(0, 15).each((_, el) => links.push($(el).attr('href')));
    res.json({ status: html.status, htmlLen: (html.data || '').length, sels, links, snippet: (html.data || '').slice(0, 1000) });
  } catch (e) { res.json({ error: e.message }); }
});

// Health
app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
  console.log(`iJAV Torrents addon: ${PUB}/manifest.json`);
});
