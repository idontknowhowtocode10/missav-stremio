'use strict';

const axios     = require('axios');
const cheerio   = require('cheerio');
const NodeCache = require('node-cache');

// ─── Constants ────────────────────────────────────────────────────────────────

const SITE_ROOT      = 'https://missav.ws';
const ITEMS_PER_PAGE = 36;

const CACHE = new NodeCache({ stdTTL: 0 });
const TTL = {
  prefix:  1800,  // 30 min
  catalog:  600,  // 10 min
  meta:    3600,  //  1 h
  magnet:  1800,  // 30 min — magnets are stable unlike HLS URLs
};

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language':           'en-US,en;q=0.9',
  Connection:                  'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

const CATALOG_PATH = {
  'missav-magnets-new':        '/new',
  'missav-magnets-hot':        '/today-hot',
  'missav-magnets-uncensored': '/uncensored-leak',
};

module.exports = {
  ITEMS_PER_PAGE,
  CATALOG_PATH,
  fetchCatalog,
  fetchSearch,
  fetchMeta,
  fetchMagnets,
};

// ─── dm-prefix discovery ──────────────────────────────────────────────────────

async function discoverPrefix() {
  const cached = CACHE.get('dm_prefix');
  if (cached) return cached;

  try {
    const resp = await axios.get(`${SITE_ROOT}/`, {
      headers: HEADERS,
      maxRedirects: 10,
      timeout: 15_000,
      validateStatus: () => true,
    });

    const finalUrl =
      resp.request?.res?.responseUrl ||
      resp.request?.responseURL ||
      resp.config?.url || '';

    let match = finalUrl.match(/\/(dm\d+)\/en/);

    if (!match) {
      const $ = cheerio.load(resp.data || '');
      $('a[href]').each((_, el) => {
        if (match) return;
        const m = ($(el).attr('href') || '').match(/\/(dm\d+)\/en/);
        if (m) match = m;
      });
    }

    if (match) {
      const prefix = `/${match[1]}/en`;
      CACHE.set('dm_prefix', prefix, TTL.prefix);
      console.log('[MissAV Magnets] Prefix:', prefix);
      return prefix;
    }
  } catch (err) {
    console.warn('[MissAV Magnets] Prefix discovery failed:', err.message);
  }

  for (const fb of ['/dm265/en', '/dm19/en', '/en']) {
    try {
      const r = await axios.get(`${SITE_ROOT}${fb}/new`, {
        headers: HEADERS, timeout: 8_000, validateStatus: s => s < 500,
      });
      if (r.status === 200) {
        CACHE.set('dm_prefix', fb, TTL.prefix);
        return fb;
      }
    } catch (_) {}
  }

  return '/en';
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function fetchPage(url, ttl = TTL.catalog) {
  const cached = CACHE.get(url);
  if (cached) return cached;
  const { data } = await axios.get(url, {
    headers: { ...HEADERS, Referer: SITE_ROOT },
    timeout: 15_000,
    maxRedirects: 10,
  });
  CACHE.set(url, data, ttl);
  return data;
}

// ─── HTML parsers ─────────────────────────────────────────────────────────────

function codeFromHref(href = '') {
  const parts = href.split('/').filter(Boolean);
  const last  = parts[parts.length - 1] || '';
  return /^[a-z0-9]+-\d+$/i.test(last) ? last : null;
}

function parseVideoGrid(html) {
  const $    = cheerio.load(html);
  const metas = [];
  const seen   = new Set();

  function addMeta(code, name, poster) {
    const id = `missav:${code}`;
    if (!code || seen.has(id)) return;
    seen.add(id);
    metas.push({ id, type: 'movie', name: name || code.toUpperCase(), poster, posterShape: 'poster' });
  }

  // Try structured selectors first
  let $items = $([]);
  for (const sel of ['div.thumbnail', 'div.group', 'li.group', '[x-data] .group']) {
    $items = $(sel);
    if ($items.length) break;
  }

  if ($items.length) {
    $items.each((_, el) => {
      const $el   = $(el);
      const href  = $el.find('a[href]').first().attr('href') || '';
      const code  = codeFromHref(href);
      if (!code) return;
      const title =
        $el.find('a[title]').attr('title') ||
        $el.find('img').attr('alt')        ||
        code.toUpperCase();
      const $img  = $el.find('img').first();
      const poster =
        $img.attr('data-src') || $img.attr('data-lazy-src') ||
        $img.attr('src')      || '';
      addMeta(code, title, poster);
    });
    if (metas.length) return metas;
  }

  // Fallback: scan anchors
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!/\/en\/[a-z0-9]+-\d+\/?$/i.test(href)) return;
    const code  = codeFromHref(href);
    const title = $(el).attr('title') || $(el).find('img').attr('alt') || code?.toUpperCase() || '';
    const poster = $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';
    addMeta(code, title, poster);
  });

  return metas;
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function fetchCatalog(categoryPath, skip = 0) {
  const prefix = await discoverPrefix();
  const page   = Math.floor(skip / ITEMS_PER_PAGE) + 1;
  const base   = `${SITE_ROOT}${prefix}${categoryPath}`;
  const url    = page > 1 ? `${base}?page=${page}` : base;
  const html   = await fetchPage(url);
  return parseVideoGrid(html);
}

async function fetchSearch(query, skip = 0) {
  const prefix  = await discoverPrefix();
  const page    = Math.floor(skip / ITEMS_PER_PAGE) + 1;
  const encoded = encodeURIComponent(query.trim());
  const base    = `${SITE_ROOT}${prefix}/search/${encoded}`;
  const url     = page > 1 ? `${base}?page=${page}` : base;
  const html    = await fetchPage(url);
  return parseVideoGrid(html);
}

async function fetchMeta(code) {
  const cacheKey = `meta:${code}`;
  const cached   = CACHE.get(cacheKey);
  if (cached) return cached;

  const prefix = await discoverPrefix();
  const url    = `${SITE_ROOT}${prefix}/${code}`;
  const html   = await fetchPage(url, TTL.meta);
  const $      = cheerio.load(html);

  const title =
    $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    code.toUpperCase();

  const poster =
    $('meta[property="og:image"]').attr('content') ||
    $('video').attr('poster') || '';

  const tags = [];
  $('a[href*="/tags/"]').each((_, el) => { const t = $(el).text().trim(); if (t) tags.push(t); });

  const actresses = [];
  $('a[href*="/actresses/"]').each((_, el) => { const a = $(el).text().trim(); if (a) actresses.push(a); });

  const releaseDate = $('time').first().attr('datetime') || '';

  const meta = {
    id:          `missav:${code}`,
    type:        'movie',
    name:        title,
    poster,
    posterShape: 'poster',
    background:  poster,
    description: [
      actresses.length ? `Actress: ${actresses.join(', ')}` : '',
      tags.length      ? `Tags: ${tags.slice(0, 8).join(' · ')}` : '',
      '🧲 Magnet / torrent streams available',
    ].filter(Boolean).join('\n'),
    releaseInfo: releaseDate ? releaseDate.slice(0, 4) : undefined,
    cast:        actresses,
    genres:      tags.slice(0, 5),
    links:       [{ name: 'MissAV', category: 'Source', url }],
  };

  CACHE.set(cacheKey, meta, TTL.meta);
  return meta;
}

/**
 * Magnet extraction strategies (in priority order):
 *
 *  1. <a href="magnet:..."> on the video page (most common)
 *  2. Inline <script> regex — some pages embed the magnet in JS
 *  3. /api/magnet/{code}  — undocumented but used by some mirrors
 *  4. Torrent info-hash extraction from any magnet found
 *
 * Returns an array of Stremio stream objects:
 *   { name, title, infoHash }      — native torrent (preferred)
 *   { name, title, url }           — fallback if full magnet needed
 */
async function fetchMagnets(code) {
  const cacheKey = `magnets:${code}`;
  const cached   = CACHE.get(cacheKey);
  if (cached) return cached;

  const prefix  = await discoverPrefix();
  const pageUrl = `${SITE_ROOT}${prefix}/${code}`;
  const html    = await fetchPage(pageUrl, TTL.magnet);
  const $       = cheerio.load(html);

  const streams = [];
  const seenHash = new Set();

  function addMagnet(magnetUri, label = 'Torrent') {
    if (!magnetUri || !magnetUri.startsWith('magnet:')) return;

    // Extract info hash from xt=urn:btih:<hash>
    const hashMatch = magnetUri.match(/xt=urn:btih:([a-fA-F0-9]{40}|[A-Z2-7]{32})/i);
    const infoHash  = hashMatch ? hashMatch[1].toLowerCase() : null;

    if (infoHash) {
      if (seenHash.has(infoHash)) return;
      seenHash.add(infoHash);
      // Extract display name from &dn= for the title
      const dnMatch = magnetUri.match(/[&?]dn=([^&]+)/);
      const dn      = dnMatch ? decodeURIComponent(dnMatch[1].replace(/\+/g, ' ')) : code.toUpperCase();
      streams.push({
        name:  '🧲 MissAV Magnets',
        title: `${label}\n${dn}`,
        infoHash,
        // Pass full magnet so Stremio can pick trackers
        behaviorHints: { notWebReady: false },
        // Full magnet as fallback URL for clients that prefer it
        externalUrl: magnetUri,
      });
    } else {
      // No hash — pass raw magnet URL
      if (seenHash.has(magnetUri)) return;
      seenHash.add(magnetUri);
      streams.push({
        name:  '🧲 MissAV Magnets',
        title: `${label}\n${code.toUpperCase()}`,
        url:   magnetUri,
      });
    }
  }

  // ── Strategy 1: <a href="magnet:..."> links ────────────────────────────────
  $('a[href^="magnet:"]').each((_, el) => {
    const href  = $(el).attr('href') || '';
    const label = $(el).text().trim() || 'Torrent';
    addMagnet(href, label);
  });

  // ── Strategy 2: magnet URIs embedded in inline scripts ────────────────────
  $('script:not([src])').each((_, el) => {
    const src = $(el).html() || '';
    const RE  = /magnet:\?xt=urn:btih:[a-fA-F0-9]{40}[^\s'"<>]*/gi;
    let m;
    while ((m = RE.exec(src)) !== null) {
      addMagnet(m[0], 'Torrent (script)');
    }
  });

  // ── Strategy 3: /api/magnet/{code} endpoint ───────────────────────────────
  if (streams.length === 0) {
    try {
      const apiUrl = `${SITE_ROOT}/api/magnet/${code}`;
      const { data } = await axios.get(apiUrl, {
        headers: { ...HEADERS, Accept: 'application/json', Referer: pageUrl },
        timeout: 8_000,
        validateStatus: s => s < 500,
      });

      // Response may be { magnet: "magnet:..." } or an array
      const candidates = Array.isArray(data)
        ? data.map(d => d.magnet || d.url || d).filter(String)
        : [data?.magnet || data?.url].filter(Boolean);

      for (const uri of candidates) addMagnet(uri, 'API Torrent');
    } catch (_) {}
  }

  // ── Strategy 4: check torrent file links and derive magnet ────────────────
  if (streams.length === 0) {
    $('a[href$=".torrent"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const full = href.startsWith('http') ? href : `${SITE_ROOT}${href}`;
      // Return as a URL stream — Stremio can handle .torrent URLs
      if (seenHash.has(full)) return;
      seenHash.add(full);
      streams.push({
        name:  '🧲 MissAV Magnets',
        title: `Torrent File\n${code.toUpperCase()}`,
        url:   full,
      });
    });
  }

  if (streams.length === 0) {
    console.warn(`[MissAV Magnets] No magnets found for ${code}`);
  } else {
    console.log(`[MissAV Magnets] ${streams.length} magnet(s) found for ${code}`);
  }

  CACHE.set(cacheKey, streams, TTL.magnet);
  return streams;
}
