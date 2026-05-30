/**
 * scraper.js
 * Handles all MissAV HTTP requests and HTML parsing
 * Dynamically discovers the dm-prefix (e.g. /dm265/en)
 */

const axios = require('axios');
const cheerio = require('cheerio');
const NodeCache = require('node-cache');

const SITE_ROOT = 'https://missav.ws';
const ITEMS_PER_PAGE = 36;

const cache = new NodeCache({ stdTTL: 0 });
const CACHE_TTL = { prefix: 1800, catalog: 600, meta: 3600, stream: 300 };

const HTTP_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-CH-UA': '"Chromium";v="124", "Google Chrome";v="124"',
  'Sec-CH-UA-Mobile': '?0',
  'Sec-CH-UA-Platform': '"Windows"',
};

// ─── Prefix discovery ─────────────────────────────────────────────────────────

/**
 * Discover the current dm-prefix by following the redirect on missav.ws
 * e.g. https://missav.ws/ → https://missav.ws/dm265/en
 * Returns something like "/dm265/en"
 */
async function discoverPrefix() {
  const cached = cache.get('dm_prefix');
  if (cached) return cached;

  try {
    // Follow the redirect from the root
    const resp = await axios.get(SITE_ROOT + '/', {
      headers: { ...HTTP_HEADERS, Referer: SITE_ROOT },
      maxRedirects: 10,
      timeout: 15000,
      validateStatus: () => true, // don't throw on 4xx
    });

    // The final URL after redirect contains the dm prefix
    const finalUrl = resp.request?.res?.responseUrl || resp.config?.url || '';
    let match = finalUrl.match(/\/(dm\d+)\/en/);

    // Fallback: scan links in the HTML for a dm-prefixed href
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
      cache.set('dm_prefix', prefix, CACHE_TTL.prefix);
      return prefix;
    }
  } catch (err) {
    console.warn('[MissAV] Prefix discovery failed:', err.message);
  }

  // Last resort: try known common prefixes
  for (const fallback of ['/dm265/en', '/dm19/en', '/en']) {
    try {
      const testUrl = `${SITE_ROOT}${fallback}/new`;
      const r = await axios.get(testUrl, {
        headers: HTTP_HEADERS,
        timeout: 8000,
        validateStatus: (s) => s < 500,
      });
      if (r.status === 200) {
        console.log('[MissAV] Using fallback prefix:', fallback);
        cache.set('dm_prefix', fallback, CACHE_TTL.prefix);
        return fallback;
      }
    } catch (_) {}
  }

  console.warn('[MissAV] Could not discover prefix, defaulting to /en');
  return '/en';
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function fetchPage(url, ttl = CACHE_TTL.catalog) {
  const cached = cache.get(url);
  if (cached) return cached;

  const { data } = await axios.get(url, {
    headers: { ...HTTP_HEADERS, Referer: SITE_ROOT },
    timeout: 15000,
    maxRedirects: 10,
  });
  cache.set(url, data, ttl);
  return data;
}

// ─── HTML parsers ─────────────────────────────────────────────────────────────

function parseVideoGrid(html) {
  const $ = cheerio.load(html);
  const metas = [];

  // MissAV uses a grid of <div class="group ..."> items
  // Each item has an <a href="/dm265/en/CODE"> and an <img>
  const selectors = [
    'div.thumbnail',          // classic layout
    'div.group',              // Tailwind layout
    '[x-data] .group',       // Alpine.js wrapped
    'li.group',
  ];

  let $items = $([]);
  for (const sel of selectors) {
    $items = $(sel);
    if ($items.length > 0) break;
  }

  // If still empty, try any anchor that links to a video code pattern
  if ($items.length === 0) {
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      // Match paths like /dm265/en/abc-123 (video code at end)
      if (/\/en\/[a-z]+-\d+\/?$/.test(href)) {
        const code = href.split('/').filter(Boolean).pop();
        const title =
          $(el).attr('title') ||
          $(el).find('img').attr('alt') ||
          code.toUpperCase();
        const poster =
          $(el).find('img').attr('data-src') ||
          $(el).find('img').attr('src') || '';

        if (code && !metas.find((m) => m.id === `missav:${code}`)) {
          metas.push({
            id: `missav:${code}`,
            type: 'movie',
            name: title,
            poster,
            posterShape: 'poster',
          });
        }
      }
    });
    return metas;
  }

  $items.each((_, el) => {
    const $el = $(el);
    const $a = $el.find('a[href]').first();
    const href = $a.attr('href') || '';
    const code = href.split('/').filter(Boolean).pop();
    if (!code || !/^[a-z]+-\d+$/i.test(code)) return;

    const title =
      $el.find('a[title]').attr('title') ||
      $el.find('img').attr('alt') ||
      $el.find('p, span').last().text().trim() ||
      code.toUpperCase();

    const $img = $el.find('img').first();
    const poster =
      $img.attr('data-src') || $img.attr('src') || '';

    metas.push({
      id: `missav:${code}`,
      type: 'movie',
      name: title,
      poster,
      posterShape: 'poster',
    });
  });

  return metas;
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function fetchCatalog(categoryPath, skip = 0) {
  const prefix = await discoverPrefix();
  const page = Math.floor(skip / ITEMS_PER_PAGE) + 1;
  const base = `${SITE_ROOT}${prefix}${categoryPath}`;
  const url = page > 1 ? `${base}?page=${page}` : base;
  console.log('[MissAV] Catalog URL:', url);
  const html = await fetchPage(url);
  return parseVideoGrid(html);
}

async function fetchSearch(query, skip = 0) {
  const prefix = await discoverPrefix();
  const page = Math.floor(skip / ITEMS_PER_PAGE) + 1;
  const encoded = encodeURIComponent(query.trim());
  const base = `${SITE_ROOT}${prefix}/search/${encoded}`;
  const url = page > 1 ? `${base}?page=${page}` : base;
  console.log('[MissAV] Search URL:', url);
  const html = await fetchPage(url);
  return parseVideoGrid(html);
}

async function fetchMeta(code) {
  const cacheKey = `meta:${code}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const prefix = await discoverPrefix();
  const url = `${SITE_ROOT}${prefix}/${code}`;
  const html = await fetchPage(url, CACHE_TTL.meta);
  const $ = cheerio.load(html);

  const title =
    $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    code.toUpperCase();

  const poster =
    $('meta[property="og:image"]').attr('content') ||
    $('video').attr('poster') || '';

  const tags = [];
  $('a[href*="/tags/"]').each((_, el) => {
    const t = $(el).text().trim();
    if (t) tags.push(t);
  });

  const actresses = [];
  $('a[href*="/actresses/"], a[href*="/actress/"]').each((_, el) => {
    const a = $(el).text().trim();
    if (a) actresses.push(a);
  });

  const releaseDate =
    $('meta[property="video:release_date"]').attr('content') ||
    $('time').first().attr('datetime') || '';

  const studio =
    $('a[href*="/makers/"], a[href*="/label/"]').first().text().trim() || '';

  const description = [
    actresses.length ? `Actress: ${actresses.join(', ')}` : '',
    studio ? `Studio: ${studio}` : '',
    tags.length ? `Tags: ${tags.slice(0, 10).join(' · ')}` : '',
  ].filter(Boolean).join('\n');

  const meta = {
    id: `missav:${code}`,
    type: 'movie',
    name: title,
    poster,
    posterShape: 'poster',
    background: poster,
    description,
    releaseInfo: releaseDate ? releaseDate.slice(0, 4) : undefined,
    cast: actresses,
    genres: tags.slice(0, 5),
    links: [{ name: 'MissAV', category: 'Source', url }],
  };

  cache.set(cacheKey, meta, CACHE_TTL.meta);
  return meta;
}

async function fetchStreams(code) {
  const cacheKey = `stream:${code}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const prefix = await discoverPrefix();
  const url = `${SITE_ROOT}${prefix}/${code}`;
  const html = await fetchPage(url, CACHE_TTL.stream);
  const streams = [];

  const $ = cheerio.load(html);

  // Strategy 1: find m3u8/mp4 in inline script tags
  const streamPatterns = [
    /(?:source|file|src|hlsUrl|videoUrl|streamUrl)\s*[:=]\s*['"]([^'"]+\.(?:m3u8|mp4)[^'"]*)['"]/gi,
    /"(?:hls|mp4|source|file|src)"\s*:\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/gi,
    /https?:\/\/[^'"\s<>]+\.m3u8[^'"\s<>]*/gi,
  ];

  $('script:not([src])').each((_, el) => {
    const src = $(el).html() || '';
    for (const pattern of streamPatterns) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(src)) !== null) {
        const found = match[1] || match[0];
        if (found && !streams.find((s) => s.url === found)) {
          streams.push({
            name: 'MissAV',
            title: found.includes('.m3u8') ? 'HLS Stream' : 'MP4',
            url: found,
            behaviorHints: { notWebReady: false },
          });
        }
      }
    }
  });

  // Strategy 2: <video><source> tags
  $('video source').each((_, el) => {
    const src = $(el).attr('src');
    if (src && !streams.find((s) => s.url === src)) {
      streams.push({ name: 'MissAV', title: 'Video', url: src });
    }
  });

  // Strategy 3: try /api/v1/video/{code}
  if (streams.length === 0) {
    try {
      const apiUrl = `${SITE_ROOT}/api/v1/video/${code}`;
      const { data } = await axios.get(apiUrl, {
        headers: { ...HTTP_HEADERS, Accept: 'application/json' },
        timeout: 8000,
      });
      for (const src of (data?.sources || data?.data?.sources || [])) {
        const u = src.src || src.url || src.file || '';
        if (u) streams.push({ name: 'MissAV', title: src.label || 'Stream', url: u });
      }
    } catch (_) {}
  }

  cache.set(cacheKey, streams, CACHE_TTL.stream);
  return streams;
}

module.exports = { fetchCatalog, fetchSearch, fetchMeta, fetchStreams, ITEMS_PER_PAGE };
