'use strict';

const axios     = require('axios');
const cheerio   = require('cheerio');
const NodeCache = require('node-cache');

// ─── Constants ────────────────────────────────────────────────────────────────

const SITE_ROOT      = 'https://missav.ws';
const ITEMS_PER_PAGE = 36;

const CACHE = new NodeCache({ stdTTL: 0 });
const TTL = {
  prefix:  1800,
  catalog:  600,
  meta:    3600,
  stream:   300,
};

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language':           'en-US,en;q=0.9',
  'Accept-Encoding':           'gzip, deflate, br',
  Connection:                  'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest':            'document',
  'Sec-Fetch-Mode':            'navigate',
  'Sec-Fetch-Site':            'none',
  'Sec-CH-UA':                 '"Chromium";v="124", "Google Chrome";v="124"',
  'Sec-CH-UA-Mobile':          '?0',
  'Sec-CH-UA-Platform':        '"Windows"',
};

// Non-video page slugs — never treat these as a video code
const NON_VIDEO_SLUGS = new Set([
  'new', 'hot', 'today-hot', 'weekly-hot', 'monthly-hot',
  'search', 'tags', 'actresses', 'actress', 'makers', 'maker',
  'labels', 'label', 'channels', 'channel', 'genres', 'genre',
  'uncensored', 'censored', 'uncensored-leak', '4k', 'en',
]);

// ─── Slug maps ────────────────────────────────────────────────────────────────

const GENRE_SLUG = {
  Uncensored:        '/uncensored',
  Censored:          '/censored',
  'Uncensored Leak': '/uncensored-leak',
  '4K':              '/4k',
  Amateur:           '/tags/amateur',
  Cosplay:           '/tags/cosplay',
  Solo:              '/tags/solo',
  Lesbian:           '/tags/lesbian',
  'Big Tits':        '/tags/big-tits',
  'Small Tits':      '/tags/small-tits',
  Busty:             '/tags/busty',
  Creampie:          '/tags/creampie',
  Blowjob:           '/tags/blowjob',
  Handjob:           '/tags/handjob',
  Anal:              '/tags/anal',
  Squirting:         '/tags/squirting',
  Gangbang:          '/tags/gangbang',
  Orgy:              '/tags/orgy',
  Masturbation:      '/tags/masturbation',
  Toys:              '/tags/toys',
  MILF:              '/tags/milf',
  Schoolgirl:        '/tags/schoolgirl',
  'Office Lady':     '/tags/office-lady',
  Nurse:             '/tags/nurse',
  Maid:              '/tags/maid',
  Idol:              '/tags/idol',
  Model:             '/tags/model',
  Chinese:           '/tags/chinese',
  Korean:            '/tags/korean',
  Thai:              '/tags/thai',
  Bondage:           '/tags/bondage',
  Swimsuit:          '/tags/swimsuit',
  Lingerie:          '/tags/lingerie',
  Pantyhose:         '/tags/pantyhose',
  Outdoor:           '/tags/outdoor',
  Hotel:             '/tags/hotel',
};

const ACTRESS_SLUG = {
  'Most Popular':  '/actresses?sort=most_viewed',
  Newest:          '/actresses?sort=newest',
  'Yua Mikami':    '/actresses/yua-mikami',
  'Eimi Fukada':   '/actresses/eimi-fukada',
  'Minami Kojima': '/actresses/minami-kojima',
  Rion:            '/actresses/rion',
  Julia:           '/actresses/julia',
  'Mia Khalifa':   '/actresses/mia-khalifa',
  'Ai Mukai':      '/actresses/ai-mukai',
  Aika:            '/actresses/aika',
};

module.exports = {
  ITEMS_PER_PAGE,
  GENRE_SLUG,
  ACTRESS_SLUG,
  warmUp,
  fetchCatalog,
  fetchSearch,
  fetchMeta,
  fetchStreams,
};

// ─── Prefix discovery ─────────────────────────────────────────────────────────

async function discoverPrefix() {
  const cached = CACHE.get('dm_prefix');
  if (cached) return cached;

  try {
    const resp = await axios.get(`${SITE_ROOT}/`, {
      headers: { ...HEADERS, Referer: SITE_ROOT },
      maxRedirects: 10,
      timeout: 8_000,
      validateStatus: () => true,
    });

    const finalUrl =
      resp.request?.res?.responseUrl ||
      resp.request?.responseURL      ||
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
      console.log('[MissAV] Prefix discovered:', prefix);
      return prefix;
    }
  } catch (err) {
    console.warn('[MissAV] Prefix discovery error:', err.message);
  }

  // Try fallbacks in parallel
  const results = await Promise.allSettled(
    ['/dm265/en', '/dm19/en', '/en'].map(fb =>
      axios.get(`${SITE_ROOT}${fb}/new`, {
        headers: HEADERS, timeout: 5_000, validateStatus: s => s < 500,
      }).then(r => ({ fb, ok: r.status === 200 }))
    )
  );

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.ok) {
      CACHE.set('dm_prefix', r.value.fb, TTL.prefix);
      console.log('[MissAV] Fallback prefix:', r.value.fb);
      return r.value.fb;
    }
  }

  return '/en';
}

async function warmUp() {
  console.log('[MissAV] Warming up...');
  try {
    const prefix = await discoverPrefix();
    const url    = `${SITE_ROOT}${prefix}/new`;
    const { data } = await axios.get(url, {
      headers: { ...HEADERS, Referer: SITE_ROOT },
      timeout: 8_000, maxRedirects: 10,
    });
    CACHE.set(url, data, TTL.catalog);

    // Log a sample of what was parsed so we can see if selectors work
    const sample = parseVideoGrid(data);
    console.log(`[MissAV] Warm-up OK. Prefix: ${prefix}. Sample items: ${sample.length}`);
    if (sample.length > 0) {
      console.log('[MissAV] First item:', JSON.stringify(sample[0]));
    } else {
      console.warn('[MissAV] WARNING: parseVideoGrid returned 0 items on warm-up — selector mismatch likely');
    }
  } catch (err) {
    console.warn('[MissAV] Warm-up failed:', err.message);
  }
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function fetchPage(url, ttl = TTL.catalog) {
  const hit = CACHE.get(url);
  if (hit) return hit;

  const { data } = await axios.get(url, {
    headers: { ...HEADERS, Referer: SITE_ROOT },
    timeout: 8_000,
    maxRedirects: 10,
  });

  CACHE.set(url, data, ttl);
  return data;
}

// ─── Code extraction ──────────────────────────────────────────────────────────

/**
 * Extract a video code from a MissAV href.
 * MissAV codes: ssis-001, fc2-ppv-1234567, heyzo-2345, 1pondo-010121_001
 * Rules:
 *   - Take the last path segment
 *   - Must contain at least one hyphen
 *   - Must not be a known non-video slug
 *   - Last segment after final hyphen should be numeric (JAV convention)
 *     OR the whole thing looks like a valid code (alphanumeric + hyphens)
 */
function codeFromHref(href = '') {
  try {
    // Strip query string / hash
    const clean = href.split('?')[0].split('#')[0];
    const parts = clean.split('/').map(p => p.trim()).filter(Boolean);
    const last  = parts[parts.length - 1] || '';

    if (!last || !last.includes('-')) return null;
    if (NON_VIDEO_SLUGS.has(last)) return null;

    // Must be alphanumeric + hyphens only (no dots, slashes, etc.)
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/i.test(last)) return null;

    // Last token after final hyphen should be digits OR whole thing is valid
    const tokens = last.split('-');
    const lastToken = tokens[tokens.length - 1];
    if (!/^\d+$/.test(lastToken) && tokens.length < 2) return null;

    return last.toLowerCase();
  } catch (_) {
    return null;
  }
}

// ─── HTML parser ──────────────────────────────────────────────────────────────

function parseVideoGrid(html) {
  const $     = cheerio.load(html);
  const metas = [];
  const seen  = new Set();

  function addMeta(code, name, poster) {
    if (!code) return;
    const id = `missav:${code}`;
    if (seen.has(id)) return;
    seen.add(id);
    metas.push({
      id,
      type:        'movie',
      name:        name || code.toUpperCase(),
      poster:      poster || '',
      posterShape: 'poster',
    });
  }

  // ── Strategy A: video-grid item selectors (try many) ──────────────────────
  // MissAV uses Tailwind — items are typically <div class="...group...">
  // or <li> wrappers. Try all known patterns.
  const ITEM_SELECTORS = [
    'div.thumbnail',
    'div.group',
    'li.group',
    // Tailwind: any block-level element with a child anchor + img
    'div[class*="thumbnail"]',
    'div[class*="video"]',
    'li[class*="video"]',
    // Alpine.js x-data wrapper children
    '[x-data] > div > div',
    // Generic grid items: direct children of a grid container
    '.grid > div',
    '.grid > li',
    'ul.grid > li',
    'div.grid > div',
  ];

  for (const sel of ITEM_SELECTORS) {
    const $items = $(sel);
    if ($items.length < 3) continue; // too few — wrong selector

    let found = 0;
    $items.each((_, el) => {
      const $el   = $(el);
      const $a    = $el.find('a[href]').first();
      const href  = $a.attr('href') || '';
      const code  = codeFromHref(href);
      if (!code) return;

      const title =
        $a.attr('title')                             ||
        $el.find('a[title]').first().attr('title')   ||
        $el.find('img').first().attr('alt')          ||
        $el.find('p').first().text().trim()          ||
        $el.find('span').last().text().trim()        ||
        code.toUpperCase();

      const $img  = $el.find('img').first();
      const poster =
        $img.attr('data-src')      ||
        $img.attr('data-lazy-src') ||
        $img.attr('data-srcset')?.split(' ')[0] ||
        $img.attr('src')           || '';

      addMeta(code, title.trim(), poster);
      found++;
    });

    if (found > 0) {
      console.log(`[MissAV] Selector "${sel}" matched ${found} items`);
      return metas;
    }
  }

  // ── Strategy B: scan ALL anchors for video-page hrefs ─────────────────────
  console.log('[MissAV] Falling back to anchor scan');
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';

    // Must look like a video page: contains /en/ and a code-like segment
    if (!/\/en\//i.test(href)) return;

    const code = codeFromHref(href);
    if (!code) return;

    const $el   = $(el);
    const title =
      $el.attr('title')                          ||
      $el.find('img').attr('alt')                ||
      $el.text().trim()                          ||
      code.toUpperCase();

    const poster =
      $el.find('img').attr('data-src')           ||
      $el.find('img').attr('data-lazy-src')      ||
      $el.find('img').attr('src')                || '';

    addMeta(code, title.trim() || code.toUpperCase(), poster);
  });

  console.log(`[MissAV] Anchor scan found ${metas.length} items`);
  return metas;
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function fetchCatalog(categoryPath, skip = 0) {
  const prefix = await discoverPrefix();
  const page   = Math.floor(skip / ITEMS_PER_PAGE) + 1;
  const base   = `${SITE_ROOT}${prefix}${categoryPath}`;
  const url    = page > 1 ? `${base}?page=${page}` : base;
  console.log('[MissAV] Fetching catalog:', url);
  const html = await fetchPage(url);
  const results = parseVideoGrid(html);
  console.log(`[MissAV] Catalog returned ${results.length} items`);
  return results;
}

async function fetchSearch(query, skip = 0) {
  const prefix  = await discoverPrefix();
  const page    = Math.floor(skip / ITEMS_PER_PAGE) + 1;
  const encoded = encodeURIComponent(query.trim());
  const base    = `${SITE_ROOT}${prefix}/search/${encoded}`;
  const url     = page > 1 ? `${base}?page=${page}` : base;
  console.log('[MissAV] Search:', url);
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
    $('h1').first().text().trim()                  ||
    $('meta[property="og:title"]').attr('content') ||
    code.toUpperCase();

  const poster =
    $('meta[property="og:image"]').attr('content') ||
    $('video').attr('poster') || '';

  const tags = [];
  $('a[href*="/tags/"]').each((_, el) => {
    const t = $(el).text().trim(); if (t) tags.push(t);
  });

  const actresses = [];
  $('a[href*="/actresses/"], a[href*="/actress/"]').each((_, el) => {
    const a = $(el).text().trim(); if (a) actresses.push(a);
  });

  const releaseDate =
    $('meta[property="video:release_date"]').attr('content') ||
    $('time').first().attr('datetime') || '';

  const studio =
    $('a[href*="/makers/"], a[href*="/label/"]').first().text().trim() || '';

  const meta = {
    id:          `missav:${code}`,
    type:        'movie',
    name:        title,
    poster,
    posterShape: 'poster',
    background:  poster,
    description: [
      actresses.length ? `Actress: ${actresses.join(', ')}` : '',
      studio            ? `Studio: ${studio}`               : '',
      tags.length       ? `Tags: ${tags.slice(0, 10).join(' · ')}` : '',
    ].filter(Boolean).join('\n'),
    releaseInfo: releaseDate ? releaseDate.slice(0, 4) : undefined,
    cast:        actresses,
    genres:      tags.slice(0, 5),
    links:       [{ name: 'MissAV', category: 'Source', url }],
  };

  CACHE.set(cacheKey, meta, TTL.meta);
  return meta;
}

async function fetchStreams(code) {
  const cacheKey = `stream:${code}`;
  const cached   = CACHE.get(cacheKey);
  if (cached) return cached;

  const prefix  = await discoverPrefix();
  const pageUrl = `${SITE_ROOT}${prefix}/${code}`;
  const html    = await fetchPage(pageUrl, TTL.stream);
  const $       = cheerio.load(html);
  const streams = [];
  const seen    = new Set();

  function addStream(url, label = 'Stream') {
    if (!url || seen.has(url)) return;
    seen.add(url);
    streams.push({ name: 'MissAV', title: label, url, behaviorHints: { notWebReady: false } });
  }

  const PATTERNS = [
    /(?:source|file|src|hlsUrl|videoUrl|streamUrl|hls)\s*[=:]\s*['"]([^'"]+\.(?:m3u8|mp4)[^'"]*)['"]/gi,
    /"(?:hls|mp4|source|file|src|url|stream)"\s*:\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/gi,
    /https?:\/\/[^\s'"<>]+\.m3u8[^\s'"<>]*/gi,
    /https?:\/\/[^\s'"<>]+\.mp4[^\s'"<>]*/gi,
  ];

  $('script:not([src])').each((_, el) => {
    const src = $(el).html() || '';
    const jwMatch = src.match(/jwplayer\([^)]*\)\.setup\((\{[\s\S]*?\})\)/);
    if (jwMatch) {
      const urlMatch = jwMatch[1].match(/['"](?:file|src|hls|mp4)['"]\s*:\s*['"]([^'"]+)['"]/gi);
      if (urlMatch) urlMatch.forEach(m => {
        const u = m.match(/['"]([^'"]+\.(?:m3u8|mp4)[^'"]*)['"]$/);
        if (u) addStream(u[1], u[1].includes('.m3u8') ? 'HLS' : 'MP4');
      });
    }
    for (const pat of PATTERNS) {
      pat.lastIndex = 0; let m;
      while ((m = pat.exec(src)) !== null) {
        const found = m[1] || m[0];
        if (found) addStream(found.trim(), found.includes('.m3u8') ? 'HLS' : 'MP4');
      }
    }
  });

  $('video source').each((_, el) => { const s = $(el).attr('src'); if (s) addStream(s, 'Video'); });

  if (streams.length === 0) {
    try {
      const { data } = await axios.get(`${SITE_ROOT}/api/v1/video/${code}`, {
        headers: { ...HEADERS, Accept: 'application/json', Referer: pageUrl },
        timeout: 5_000,
      });
      for (const s of (data?.sources || data?.data?.sources || [])) {
        const u = s.src || s.url || s.file || '';
        if (u) addStream(u, s.label || (u.includes('.m3u8') ? 'HLS' : 'MP4'));
      }
    } catch (_) {}
  }

  if (streams.length === 0) {
    try {
      const { data } = await axios.post(
        `${SITE_ROOT}/api/v2/source/${code}`,
        { r: pageUrl, d: 'missav.ws' },
        {
          headers: {
            ...HEADERS, Accept: 'application/json',
            'Content-Type': 'application/json',
            Referer: pageUrl, 'X-Requested-With': 'XMLHttpRequest',
          },
          timeout: 5_000,
        },
      );
      for (const s of (data?.data || [])) {
        const u = s.file || s.src || s.url || '';
        if (u) addStream(u, s.label || (u.includes('.m3u8') ? 'HLS' : 'MP4'));
      }
    } catch (_) {}
  }

  console.log(`[MissAV] ${streams.length} stream(s) for ${code}`);
  CACHE.set(cacheKey, streams, TTL.stream);
  return streams;
}
