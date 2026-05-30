# MissAV Stremio Addon 🎬

A dedicated, full-featured Stremio addon for MissAV with enhanced browsing, rich genre filters, actress browsing, and full search support.

## Features

| Feature | Details |
|---|---|
| **Catalogs** | New, Today's Hot, Weekly Hot, Monthly Hot, Uncensored Leak |
| **Genre browser** | 30+ genres/tags (Uncensored, MILF, Cosplay, Creampie, …) |
| **Actress browser** | Browse by actress name or popularity |
| **Search** | Works across all catalogs — type any code or title |
| **Infinite scroll** | Pagination via `skip` |
| **Metadata** | Title, cast, tags, studio, release year |
| **Streams** | HLS + MP4 auto-extracted from video pages |
| **Caching** | In-memory cache (catalog: 10 min, meta: 1 hr, stream: 5 min) |

## Quick Start (Local)

```bash
# 1. Install dependencies
npm install

# 2. Start the addon
npm start

# 3. Open Stremio → Search Addons → paste:
#    http://localhost:7000/manifest.json
```

## Deployment (optional)

### Render / Railway / Fly.io

1. Push this folder to a GitHub repo.
2. Connect the repo to Render (free tier), select **Web Service**.
3. Set build command: `npm install`  
   Start command: `npm start`
4. Set env var `PORT=10000` (Render assigns its own port automatically).
5. Use the generated URL as your Stremio install URL.

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci --omit=dev
EXPOSE 7000
CMD ["node", "index.js"]
```

```bash
docker build -t missav-addon .
docker run -p 7000:7000 missav-addon
```

## Catalog IDs

| Stremio ID | MissAV URL |
|---|---|
| `missav-new` | `/en/new` on missav.ws |
| `missav-today-hot` | `/en/today-hot` on missav.ws |
| `missav-weekly-hot` | `/en/weekly-hot` on missav.ws |
| `missav-monthly-hot` | `/en/monthly-hot` on missav.ws |
| `missav-uncensored-leak` | `/en/uncensored-leak` on missav.ws |
| `missav-genre` | `/en/tags/{genre}` on missav.ws |
| `missav-actress` | `/en/actresses/{name}` on missav.ws |

## Troubleshooting

**No streams appearing?**  
MissAV may protect streams with tokens that expire. If streams are empty, try refreshing the metadata (open the title again — the 5-minute cache will clear the stale entry).

**Search not working?**  
Make sure you're searching from any catalog tab that has the search icon. All catalogs share the same MissAV search endpoint.

**Geo-block / 403 errors?**  
MissAV blocks some regions. Run the addon behind a VPN or deploy to a server in an allowed country.

## Notes

- This addon **only** provides access to content already publicly available on MissAV.com.
- No login or account required.
- For 18+ adults only.
