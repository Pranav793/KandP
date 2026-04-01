export interface Env {
  ASSETS: Fetcher;
  IMAGES: R2Bucket;
}

const SITE_HOST = "kandp.site";
const WWW_HOST = `www.${SITE_HOST}`;
const IMG_HOST = `img.${SITE_HOST}`;

const IMAGE_CACHE_SECONDS = 60 * 60 * 24 * 365; // 1 year
const IMAGE_CACHE_HEADER = `public, max-age=${IMAGE_CACHE_SECONDS}, immutable`;

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
};

function mimeFromKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

async function handleImage(request: Request, env: Env, url: URL): Promise<Response> {
  const key = decodeURIComponent(url.pathname.slice(1)); // strip leading /

  if (!key) {
    return new Response("Not found", { status: 404 });
  }

  // Check Cloudflare edge cache first
  const cache = caches.default;
  const cacheKey = request;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Fetch from R2
  const object = await env.IMAGES.get(key);
  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType ?? mimeFromKey(key));
  headers.set("Cache-Control", IMAGE_CACHE_HEADER);
  headers.set("ETag", object.httpEtag);
  if (object.httpMetadata?.contentEncoding) {
    headers.set("Content-Encoding", object.httpMetadata.contentEncoding);
  }

  // CORS so the gallery page on kandp.site can load images
  headers.set("Access-Control-Allow-Origin", "*");

  const response = new Response(object.body, { headers });

  // Store in Cloudflare edge cache (non-blocking)
  const cacheResponse = response.clone();
  cache.put(cacheKey, cacheResponse);

  return response;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // www → apex redirect
    if (url.hostname === WWW_HOST) {
      url.hostname = SITE_HOST;
      return Response.redirect(url.toString(), 301);
    }

    // Image subdomain → serve from R2 with aggressive caching
    if (url.hostname === IMG_HOST) {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Max-Age": "86400",
          },
        });
      }
      return handleImage(request, env, url);
    }

    if (url.pathname === "/api/health") {
      return json({ ok: true, project: "kandp", site: `https://${SITE_HOST}` });
    }

    const res = await env.ASSETS.fetch(request);
    return res;
  },
};
