/**
 * scraper.js
 *
 * MissAV scraper — mirrors the extraction logic of the MissAV CS3 plugin
 * (https://raw.githubusercontent.com/phisher98/CXXX/builds/MissAV.cs3)
 *
 * Handles:
 *  - Dynamic dm-prefix discovery  (e.g. /dm265/en)
 *  - Catalog / search / meta / stream fetching
 *  - HLS + MP4 stream extraction (inline scripts, JWPlayer, <source> tags, API fallback)
 *  - In-memory caching to minimise repeat requests
 */

'use strict';

const axios   = require('axios');
const cheerio = require('cheerio');
const NodeCache = require('node-cache');

// ─── Constants ────────────────────────────────────────────────────────────────

const SITE_ROOT      = 'https://missav.ws';
const ITEMS_PER_PAGE = 36;

const CACHE = new NodeCache({ stdTTL: 0 });
const TTL = {
  prefix:  1800,   // 30 min — prefix rarely changes
  catalog:  600,   // 10 min
  meta:    3600,   // 1 h
  stream:   300,   //  5 min — stream URLs are short-lived
};

/** Browser-like headers (same UA the CS3 plugin uses) */
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language':      'en-US,en;q=0.9',
  'Accept-Encoding':      'gzip, deflate, br',
  Connection:             'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest':       'document',
  'Sec-Fetch-Mode':       'navigate',
  'Sec-Fetch-Site':       'none',
  'Sec-CH-UA':            '"Chromium";v="124", "Google Chrome";v="124"',
  'Sec-CH-UA-Mobile':     '?0',
  'Sec-CH-UA-Platform':   '"Windows"',
};

// ─── Genre / actress URL slug maps ────────────────────────────────────────────

const GENRE_SLUG = {
  Uncensored:       '/uncensored',
  Censored:         '/censored',
  'Uncensored Leak':'/uncensored-leak',
  '4K':             '/4k',
  Amateur:          '/tags/amateur',
  Cosplay:          '/tags/cosplay',
  Solo:             '/tags/solo',
  Lesbian:          '/tags/lesbian',
  'Big Tits':       '/tags/big-tits',
  'Small Tits':     '/tags/small-tits',
  Busty:            '/tags/busty',
  Creampie:         '/tags/creampie',
  Blowjob:          '/tags/blowjob',
  Handjob:          '/tags/handjob',
  Anal:             '/tags/anal',
  Squirting:        '/tags/squirting',
  Gangbang:         '/tags/gangbang',
  Orgy:             '/tags/orgy',
  Masturbation:     '/tags/masturbation',
  Toys:             '/tags/toys',
  MILF:             '/tags/milf',
  Schoolgirl:       '/tags/schoolgirl',
  'Office Lady':    '/tags/office-lady',
  Nurse:            '/tags/nurse',
  Maid:             '/tags/maid',
  Idol:             '/tags/idol',
  Model:            '/tags/model',
  Chinese:          '/tags/chinese',
  Korean:           '/tags/korean',
  Thai:             '/tags/thai',
  Bondage:          '/tags/bondage',
  Swimsuit:         '/tags/swimsuit',
  Lingerie:         '/tags/lingerie',
  Pantyhose:        '/tags/pantyhose',
  Outdoor:          '/tags/outdoor',
  Hotel:            '/tags/hotel',
};

const ACTRESS_SLUG = {
  'Most Popular': '/actresses?sort=most_viewed',
  Newest:         '/actresses?sort=newest',
  'Yua Mikami':   '/actresses/yua-mikami',
  'Eimi Fukada':  '/actresses/eimi-fukada',
  'Minami Kojima':'/actresses/minami-kojima',
  Rion:           '/actresses/rion',
  Julia:          '/actresses/julia',
  'Mia Khalifa':  '/actresses/mia-khalifa',
  'Ai Mukai':     '/actresses/ai-mukai',
  Aika:           '/actresses/aika',
};

module.exports = {
  ITEMS_PER_PAGE,
  GENRE_SLUG,
  ACTRESS_SLUG,
  fetchCatalog,
  fetchSearch,
  fetchMeta,
  fetchStreams,
};

// ─── Prefix discovery ─────────────────────────────────────────────────────────

/**
 * MissAV redirects / → /dm<N>/en (or /en).
 * We discover and cache that prefix so every URL is correct.
 */
async function discoverPrefix() {
  const cached = CACHE.get('dm_prefix');
  if (cached) return cached;

  // Step 1 – follow the root redirect
  try {
    const resp = await axios.get(`${SITE_ROOT}/`, {
      headers: { ...HEADERS, Referer: SITE_ROOT },
      maxRedirects: 10,
      timeout: 15_000,
      validateStatus: () => true,
    });

    const finalUrl =
      resp.request?.res?.responseUrl ||
      resp.request?.responseURL ||
      resp.config?.url || '';

    let match = finalUrl.match(/\/(dm\d+)\/en/);

    // Step 2 – scan inline links if the redirect URL didn't reveal it
    if (!match) {
      const $ = cheerio.load(resp.data || '');
      $('a[href]').each((_, el) => {
        if (match) return;
        const href = $(el).attr('href') || '';
        const m = href.match(/\/(dm\d+)\/en/);
        if (m) match = m;
      });
    }

    if (match) {
      const prefix = `/${match[1]}/en`;
      console.log('[MissAV] Discovered prefix:', prefix);
      CACHE.set('dm_prefix', prefix, TTL.prefix);
      return prefix;
    }
  } catch (err) {
    console.warn('[MissAV] Prefix discovery error:', err.message);
  }

  // Step 3 – try known common prefixes
  for (const fallback of ['/dm265/en', '/dm19/en', '/en']) {
    try {
      const r = await axios.get(`${SITE_ROOT}${fallback}/new`, {
        headers: HEADERS,
        timeout: 8_000,
        validateStatus: (s) => s < 500,
      });
      if (r.status === 200) {
        console.log('[MissAV] Using fallback prefix:', fallback);
        CACHE.set('dm_prefix', fallback, TTL.prefix);
        return fallback;
      }
    } catch (_) { /* try next */ }
  }

  console.warn('[MissAV] Could not discover prefix — defaulting to /en');
  return '/en';
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function fetchPage(url, ttl = TTL.catalog) {
  const hit = CACHE.get(url);
  if (hit) return hit;

  const { data } = await axios.get(url, {
    headers: { ...HEADERS, Referer: SITE_ROOT },
    timeout: 15_000,
    maxRedirects: 10,
  });

  CACHE.set(url, data, ttl);
  return data;
}

// ─── HTML parsers ─────────────────────────────────────────────────────────────

/** Extract the video-code from a href like /dm265/en/abc-123 */
function codeFromHref(href = '') {
  const parts = href.split('/').filter(Boolean);
  const last  = parts[parts.length - 1] || '';
  return /^[a-z0-9]+-\d+$/i.test(last) ? last : null;
}

/**
 * Parse a MissAV video-grid page into Stremio meta stubs.
 * Tries several CSS selectors in priority order, then falls back
 * to scanning all <a> tags — matching the CS3 plugin's resilience.
 */
function parseVideoGrid(html) {
  const $     = cheerio.load(html);
  const metas = [];
  const seen  = new Set();

  function addMeta(code, name, poster) {
    const id = `missav:${code}`;
    if (!code || seen.has(id)) return;
    seen.add(id);
    metas.push({
      id,
      type:        'movie',
      name:        name || code.toUpperCase(),
      poster:      poster || '',
      posterShape: 'poster',
    });
  }

  // ── Structured selectors (highest confidence) ──────────────────────────────
  const SELECTORS = ['div.thumbnail', 'div.group', 'li.group', '[x-data] .group'];

  let $items = $([]);
  for (const sel of SELECTORS) {
    $items = $(sel);
    if ($items.length > 0) break;
  }

  if ($items.length > 0) {
    $items.each((_, el) => {
      const $el  = $(el);
      const href = $el.find('a[href]').first().attr('href') || '';
      const code = codeFromHref(href);
      if (!code) return;

      const title =
        $el.find('a[title]').attr('title') ||
        $el.find('img').attr('alt')        ||
        $el.find('p, span').last().text().trim() ||
        code.toUpperCase();

      const $img  = $el.find('img').first();
      const poster =
        $img.attr('data-src') || $img.attr('data-lazy-src') ||
        $img.attr('src')      || '';

      addMeta(code, title, poster);
    });

    if (metas.length > 0) return metas;
  }

  // ── Fallback — scan every anchor for video-code patterns ──────────────────
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!/\/en\/[a-z0-9]+-\d+\/?$/i.test(href)) return;

    const code  = codeFromHref(href);
    const title =
      $(el).attr('title')       ||
      $(el).find('img').attr('alt') ||
      code?.toUpperCase()       || '';
    const poster =
      $(el).find('img').attr('data-src') ||
      $(el).find('img').attr('src')      || '';

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

  console.log('[MissAV] Catalog URL:', url);
  const html = await fetchPage(url);
  return parseVideoGrid(html);
}

async function fetchSearch(query, skip = 0) {
  const prefix  = await discoverPrefix();
  const page    = Math.floor(skip / ITEMS_PER_PAGE) + 1;
  const encoded = encodeURIComponent(query.trim());
  const base    = `${SITE_ROOT}${prefix}/search/${encoded}`;
  const url     = page > 1 ? `${base}?page=${page}` : base;

  console.log('[MissAV] Search URL:', url);
  const html = await fetchPage(url);
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
    $('h1').first().text().trim()                     ||
    $('meta[property="og:title"]').attr('content')    ||
    code.toUpperCase();

  const poster =
    $('meta[property="og:image"]').attr('content')    ||
    $('video').attr('poster')                         || '';

  // Tags
  const tags = [];
  $('a[href*="/tags/"]').each((_, el) => {
    const t = $(el).text().trim();
    if (t) tags.push(t);
  });

  // Actresses
  const actresses = [];
  $('a[href*="/actresses/"], a[href*="/actress/"]').each((_, el) => {
    const a = $(el).text().trim();
    if (a) actresses.push(a);
  });

  const releaseDate =
    $('meta[property="video:release_date"]').attr('content') ||
    $('time').first().attr('datetime')                        || '';

  const studio =
    $('a[href*="/makers/"], a[href*="/label/"]').first().text().trim() || '';

  const description = [
    actresses.length ? `Actress: ${actresses.join(', ')}` : '',
    studio             ? `Studio: ${studio}`              : '',
    tags.length        ? `Tags: ${tags.slice(0, 10).join(' · ')}` : '',
  ].filter(Boolean).join('\n');

  const meta = {
    id:          `missav:${code}`,
    type:        'movie',
    name:        title,
    poster,
    posterShape: 'poster',
    background:  poster,
    description,
    releaseInfo: releaseDate ? releaseDate.slice(0, 4) : undefined,
    cast:        actresses,
    genres:      tags.slice(0, 5),
    links:       [{ name: 'MissAV', category: 'Source', url }],
  };

  CACHE.set(cacheKey, meta, TTL.meta);
  return meta;
}

/**
 * Stream extraction — mirrors the CS3 plugin's multi-strategy approach:
 *   1. Regex patterns on inline <script> tags (JWPlayer, HLS vars, etc.)
 *   2. <video><source> elements
 *   3. JSON API endpoint  /api/v1/video/{code}
 *   4. /api/v2/source/{code}  (newer endpoint some CS3 forks use)
 */
async function fetchStreams(code) {
  const cacheKey = `stream:${code}`;
  const cached   = CACHE.get(cacheKey);
  if (cached) return cached;

  const prefix = await discoverPrefix();
  const pageUrl = `${SITE_ROOT}${prefix}/${code}`;
  const html    = await fetchPage(pageUrl, TTL.stream);
  const $       = cheerio.load(html);
  const streams = [];
  const seen    = new Set();

  function addStream(url, label = 'Stream') {
    if (!url || seen.has(url)) return;
    seen.add(url);
    const isHLS = url.includes('.m3u8');
    streams.push({
      name:  'MissAV',
      title: label,
      url,
      behaviorHints: { notWebReady: false },
      ...(isHLS ? {} : {}),
    });
  }

  // ── Strategy 1: inline script regex sweep ─────────────────────────────────
  const PATTERNS = [
    // JWPlayer / generic assignments  file: "...", source: "..."
    /(?:source|file|src|hlsUrl|videoUrl|streamUrl|hls)\s*[=:]\s*['"]([^'"]+\.(?:m3u8|mp4)[^'"]*)['"]/gi,
    // JSON-style  "hls": "..."
    /"(?:hls|mp4|source|file|src|url|stream)"\s*:\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/gi,
    // Bare URLs
    /https?:\/\/[^\s'"<>]+\.m3u8[^\s'"<>]*/gi,
    /https?:\/\/[^\s'"<>]+\.mp4[^\s'"<>]*/gi,
  ];

  $('script:not([src])').each((_, el) => {
    const src = $(el).html() || '';

    // JWPlayer setup({ ... }) — extract file/sources block
    const jwMatch = src.match(/jwplayer\([^)]*\)\.setup\((\{[\s\S]*?\})\)/);
    if (jwMatch) {
      const block = jwMatch[1];
      const urlMatch = block.match(/['"](?:file|src|hls|mp4)['"]\s*:\s*['"]([^'"]+)['"]/gi);
      if (urlMatch) {
        urlMatch.forEach((m) => {
          const u = m.match(/['"]([^'"]+\.(?:m3u8|mp4)[^'"]*)['"]$/);
          if (u) addStream(u[1], u[1].includes('.m3u8') ? 'HLS' : 'MP4');
        });
      }
    }

    for (const pat of PATTERNS) {
      pat.lastIndex = 0;
      let m;
      while ((m = pat.exec(src)) !== null) {
        const found = m[1] || m[0];
        if (found) {
          const label = found.includes('.m3u8') ? 'HLS' : 'MP4';
          addStream(found.trim(), label);
        }
      }
    }
  });

  // ── Strategy 2: <video><source> ───────────────────────────────────────────
  $('video source').each((_, el) => {
    const src = $(el).attr('src');
    if (src) addStream(src, 'Video');
  });

  // ── Strategy 3: /api/v1/video/{code} ─────────────────────────────────────
  if (streams.length === 0) {
    try {
      const apiUrl = `${SITE_ROOT}/api/v1/video/${code}`;
      const { data } = await axios.get(apiUrl, {
        headers: { ...HEADERS, Accept: 'application/json', Referer: pageUrl },
        timeout: 8_000,
      });
      const sources = data?.sources || data?.data?.sources || [];
      for (const s of sources) {
        const u = s.src || s.url || s.file || '';
        if (u) addStream(u, s.label || (u.includes('.m3u8') ? 'HLS' : 'MP4'));
      }
    } catch (_) { /* endpoint may not exist */ }
  }

  // ── Strategy 4: /api/v2/source/{code}  (CS3-fork endpoint) ───────────────
  if (streams.length === 0) {
    try {
      const apiUrl = `${SITE_ROOT}/api/v2/source/${code}`;
      const { data } = await axios.post(
        apiUrl,
        { r: pageUrl, d: 'missav.ws' },
        {
          headers: {
            ...HEADERS,
            Accept:       'application/json',
            'Content-Type': 'application/json',
            Referer:      pageUrl,
            'X-Requested-With': 'XMLHttpRequest',
          },
          timeout: 8_000,
        },
      );
      const sources = data?.data || [];
      for (const s of sources) {
        const u = s.file || s.src || s.url || '';
        if (u) addStream(u, s.label || (u.includes('.m3u8') ? 'HLS' : 'MP4'));
      }
    } catch (_) { /* endpoint may not exist */ }
  }

  if (streams.length === 0) {
    console.warn(`[MissAV] No streams found for ${code}`);
  }

  CACHE.set(cacheKey, streams, TTL.stream);
  return streams;
}
