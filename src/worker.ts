export interface Env {
  ASSETS: Fetcher;
  IMAGES: R2Bucket;
  UPLOAD_PASSWORD: string;
}

const SITE_HOST = "kandp.site";
const WWW_HOST = `www.${SITE_HOST}`;
const IMG_HOST = `img.${SITE_HOST}`;

const IMAGE_CACHE_SECONDS = 60 * 60 * 24 * 365; // 1 year
const IMAGE_CACHE_HEADER = `public, max-age=${IMAGE_CACHE_SECONDS}, immutable`;

const PHOTOS_KEY = "_photos.json";

type PhotoEntry = { src: string; caption?: string };

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

async function getPhotos(env: Env): Promise<PhotoEntry[]> {
  const obj = await env.IMAGES.get(PHOTOS_KEY);
  if (obj) return obj.json<PhotoEntry[]>();

  // No _photos.json in R2 yet — fall back to the static seed file.
  // It only gets written to R2 when the first upload happens.
  const fallback = await env.ASSETS.fetch(new Request("http://dummy/us/photos.json"));
  if (fallback.ok) return fallback.json<PhotoEntry[]>();
  return [];
}

async function putPhotos(env: Env, photos: PhotoEntry[]): Promise<void> {
  await env.IMAGES.put(PHOTOS_KEY, JSON.stringify(photos, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });
}

function serveImage(object: R2ObjectBody, key: string): Response {
  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType ?? mimeFromKey(key));
  headers.set("Cache-Control", IMAGE_CACHE_HEADER);
  headers.set("ETag", object.httpEtag);
  if (object.httpMetadata?.contentEncoding) {
    headers.set("Content-Encoding", object.httpMetadata.contentEncoding);
  }
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(object.body, { headers });
}

async function handleImage(request: Request, env: Env, url: URL): Promise<Response> {
  const key = decodeURIComponent(url.pathname.slice(1)); // strip leading /
  if (!key) return new Response("Not found", { status: 404 });

  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;

  const object = await env.IMAGES.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const response = serveImage(object, key);
  cache.put(request, response.clone());
  return response;
}

async function handleGetPhotos(env: Env): Promise<Response> {
  const photos = await getPhotos(env);
  return json(photos, {
    headers: { "Cache-Control": "no-cache" },
  });
}

async function handlePostPhoto(request: Request, env: Env): Promise<Response> {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const form = await request.formData();
  const password = form.get("password");
  if (typeof password !== "string" || password !== env.UPLOAD_PASSWORD) {
    return json({ error: "Wrong password" }, { status: 401 });
  }

  const image = form.get("image");
  if (!(image instanceof File)) {
    return json({ error: "Missing image file" }, { status: 400 });
  }

  const ext = image.name.split(".").pop()?.toLowerCase() ?? "";
  if (!MIME[ext]) {
    return json({ error: "Unsupported image type" }, { status: 400 });
  }

  const caption = (form.get("caption") as string | null)?.trim() || "";
  const filename = `${Date.now()}_${image.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  await env.IMAGES.put(filename, image.stream(), {
    httpMetadata: { contentType: image.type || MIME[ext] },
  });

  const photos = await getPhotos(env);
  const entry: PhotoEntry = { src: filename };
  if (caption) entry.caption = caption;
  photos.push(entry);
  await putPhotos(env, photos);

  return json(entry, { status: 201 });
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

    // Serve R2 images at /img/*
    if (url.pathname.startsWith("/img/")) {
      const key = decodeURIComponent(url.pathname.slice(5));
      if (!key) return new Response("Not found", { status: 404 });

      const object = await env.IMAGES.get(key);
      if (!object) return new Response("Not found", { status: 404 });

      return serveImage(object, key);
    }

    // Photo list API
    if (url.pathname === "/api/photos") {
      if (request.method === "GET") return handleGetPhotos(env);
      if (request.method === "POST") return handlePostPhoto(request, env);
      if (request.method === "DELETE") {
        const pw = request.headers.get("x-password");
        if (pw !== env.UPLOAD_PASSWORD) return json({ error: "Wrong password" }, { status: 401 });
        await env.IMAGES.delete(PHOTOS_KEY);
        return json({ ok: true, message: "Reset to static seed" });
      }
      return new Response("Method not allowed", { status: 405 });
    }

    // Single-photo operations: /api/photos/<filename>
    if (url.pathname.startsWith("/api/photos/")) {
      const src = decodeURIComponent(url.pathname.slice("/api/photos/".length));
      if (!src) return new Response("Not found", { status: 404 });

      if (request.method === "PATCH") {
        const body = await request.json<{ caption: string; password: string }>();
        if (body.password !== env.UPLOAD_PASSWORD) {
          return json({ error: "Wrong password" }, { status: 401 });
        }
        const photos = await getPhotos(env);
        const photo = photos.find((p) => p.src === src);
        if (!photo) return json({ error: "Photo not found" }, { status: 404 });

        photo.caption = body.caption?.trim() || undefined;
        await putPhotos(env, photos);
        return json(photo);
      }

      if (request.method === "DELETE") {
        const body = await request.json<{ password: string }>();
        if (body.password !== env.UPLOAD_PASSWORD) {
          return json({ error: "Wrong password" }, { status: 401 });
        }
        const photos = await getPhotos(env);
        const idx = photos.findIndex((p) => p.src === src);
        if (idx === -1) return json({ error: "Photo not found" }, { status: 404 });

        photos.splice(idx, 1);
        await putPhotos(env, photos);
        await env.IMAGES.delete(src);
        return json({ ok: true });
      }

      return new Response("Method not allowed", { status: 405 });
    }

    if (url.pathname === "/api/health") {
      return json({ ok: true, project: "kandp", site: `https://${SITE_HOST}` });
    }

    const res = await env.ASSETS.fetch(request);
    return res;
  },
};
