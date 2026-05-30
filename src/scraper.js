/**
 * scraper.js
 * Handles all MissAV HTTP requests and HTML parsing
 */

const axios = require('axios');
const cheerio = require('cheerio');
const NodeCache = require('node-cache');

const BASE_URL = 'https://missav.com/en';
const ITEMS_PER_PAGE = 36;

// Cache: catalog pages for 10 min, video meta for 1 hour, streams for 5 min
const cache = new NodeCache({ stdTTL: 0 });
const CACHE_TTL = { catalog: 600, meta: 3600, stream: 300 };

const HTTP_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  Referer: 'https://missav.com',
  'Cache-Control': 'no-cache',
};

async function fetchPage(url, ttl = CACHE_TTL.catalog) {
  const cached = cache.get(url);
  if (cached) return cached;

  const { data } = await axios.get(url, {
    headers: HTTP_HEADERS,
    timeout: 15000,
  });
  cache.set(url, data, ttl);
  return data;
}

/**
 * Parse a page of video thumbnails from MissAV HTML
 */
function parseVideoGrid(html) {
  const $ = cheerio.load(html);
  const metas = [];

  // MissAV uses div.thumbnail.group for each video card
  $('div.thumbnail').each((_, el) => {
    const $el = $(el);

    const $link = $el.find('a').first();
    const href = $link.attr('href') || '';
    // Extract the video code from the URL path (last segment)
    const code = href.split('/').filter(Boolean).pop();
    if (!code) return;

    // Title from the second anchor (description link) or title attribute
    const $titleAnchor = $el.find('a[title]').first();
    const title =
      $titleAnchor.attr('title') ||
      $el.find('.text-secondary2, .title').first().text().trim() ||
      code.toUpperCase();

    // Thumbnail: prefer data-src (lazy-loaded), fallback to src
    const $img = $el.find('img').first();
    const poster =
      $img.attr('data-src') || $img.attr('src') || '';

    // Duration if shown
    const duration =
      $el.find('.absolute.bottom-1, .duration, time').first().text().trim() || '';

    metas.push({
      id: `missav:${code}`,
      type: 'movie',
      name: title,
      poster,
      posterShape: 'poster',
      description: duration ? `Duration: ${duration}` : undefined,
    });
  });

  return metas;
}

/**
 * Build pagination URL for MissAV (page >= 2 appends ?page=N)
 */
function buildPageUrl(basePath, page = 1) {
  const url = `${BASE_URL}${basePath}`;
  return page > 1 ? `${url}?page=${page}` : url;
}

/**
 * Catalog: fetch a category listing
 */
async function fetchCatalog(categoryPath, skip = 0) {
  const page = Math.floor(skip / ITEMS_PER_PAGE) + 1;
  const url = buildPageUrl(categoryPath, page);
  const html = await fetchPage(url, CACHE_TTL.catalog);
  return parseVideoGrid(html);
}

/**
 * Search: fetch search results for a query
 */
async function fetchSearch(query, skip = 0) {
  const page = Math.floor(skip / ITEMS_PER_PAGE) + 1;
  const encoded = encodeURIComponent(query.trim());
  const url =
    page > 1
      ? `${BASE_URL}/search/${encoded}?page=${page}`
      : `${BASE_URL}/search/${encoded}`;
  const html = await fetchPage(url, CACHE_TTL.catalog);
  return parseVideoGrid(html);
}

/**
 * Meta: fetch full video metadata from a video page
 */
async function fetchMeta(code) {
  const cacheKey = `meta:${code}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const url = `${BASE_URL}/${code}`;
  const html = await fetchPage(url, CACHE_TTL.meta);
  const $ = cheerio.load(html);

  // Title
  const title =
    $('h1.text-base, h1').first().text().trim() ||
    $('title').text().replace('| MissAV.com', '').trim() ||
    code.toUpperCase();

  // Poster / cover image
  const poster =
    $('meta[property="og:image"]').attr('content') ||
    $('video').attr('poster') ||
    $('img.cover, img[alt="cover"]').attr('src') ||
    '';

  // Description / tags block
  const tags = [];
  $('a[href*="/tags/"], a[href*="/genres/"]').each((_, el) => {
    const t = $(el).text().trim();
    if (t) tags.push(t);
  });

  // Actress names
  const actresses = [];
  $('a[href*="/actresses/"], a[href*="/actor/"]').each((_, el) => {
    const a = $(el).text().trim();
    if (a) actresses.push(a);
  });

  // Release date
  const releaseDate =
    $('meta[property="video:release_date"]').attr('content') ||
    $('span:contains("Release"), time').first().text().trim() ||
    '';

  // Studio
  const studio =
    $('a[href*="/makers/"], a[href*="/label/"]').first().text().trim() || '';

  const description = [
    actresses.length ? `Actress: ${actresses.join(', ')}` : '',
    studio ? `Studio: ${studio}` : '',
    tags.length ? `Tags: ${tags.slice(0, 10).join(' · ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

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
    links: [
      { name: 'MissAV', category: 'Source', url: `https://missav.com/en/${code}` },
    ],
  };

  cache.set(cacheKey, meta, CACHE_TTL.meta);
  return meta;
}

/**
 * Stream: extract HLS/MP4 stream URLs from a MissAV video page
 */
async function fetchStreams(code) {
  const cacheKey = `stream:${code}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const url = `${BASE_URL}/${code}`;
  const html = await fetchPage(url, CACHE_TTL.stream);

  const streams = [];

  // --- Strategy 1: inline <script> blocks containing m3u8 or mp4 ---
  const scriptPatterns = [
    // source: '...'  or  file: '...'  or  src: '...'
    /(?:source|file|src|hlsUrl|videoUrl|streamUrl)\s*[:=]\s*['"]([^'"]+\.(?:m3u8|mp4)[^'"]*)['"]/gi,
    // "hls":"..."  JSON style
    /"(?:hls|mp4|source|file)"\s*:\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/gi,
    // direct m3u8 URLs anywhere in a script block
    /https?:\/\/[^'"\s]+\.m3u8[^'"\s]*/gi,
  ];

  const $ = cheerio.load(html);
  $('script:not([src])').each((_, el) => {
    const src = $(el).html() || '';
    for (const pattern of scriptPatterns) {
      let match;
      pattern.lastIndex = 0; // reset global regex
      while ((match = pattern.exec(src)) !== null) {
        const found = match[1] || match[0];
        if (found && !streams.find((s) => s.url === found)) {
          const isHLS = found.includes('.m3u8');
          streams.push({
            name: 'MissAV',
            title: isHLS ? 'HLS Stream' : 'MP4 Stream',
            url: found,
            behaviorHints: { notWebReady: false },
          });
        }
      }
    }
  });

  // --- Strategy 2: <source> tags inside <video> ---
  $('video source').each((_, el) => {
    const src = $(el).attr('src');
    const type = $(el).attr('type') || '';
    if (src && !streams.find((s) => s.url === src)) {
      streams.push({
        name: 'MissAV',
        title: type.includes('mp4') ? 'MP4' : 'Video Stream',
        url: src,
      });
    }
  });

  // --- Strategy 3: try the /api/video/{code} endpoint if available ---
  if (streams.length === 0) {
    try {
      const apiUrl = `https://missav.com/api/v1/video/${code}`;
      const { data } = await axios.get(apiUrl, {
        headers: { ...HTTP_HEADERS, Accept: 'application/json' },
        timeout: 8000,
      });
      const sources = data?.sources || data?.data?.sources || [];
      for (const src of sources) {
        const u = src.src || src.url || src.file || '';
        if (u) {
          streams.push({
            name: 'MissAV',
            title: `${src.label || src.quality || 'Stream'} (${src.type || 'HLS'})`,
            url: u,
          });
        }
      }
    } catch (_) {
      // API not available, skip
    }
  }

  cache.set(cacheKey, streams, CACHE_TTL.stream);
  return streams;
}

module.exports = {
  fetchCatalog,
  fetchSearch,
  fetchMeta,
  fetchStreams,
  ITEMS_PER_PAGE,
};
