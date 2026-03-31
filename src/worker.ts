export interface Env {
  ASSETS: Fetcher;
}

/** Canonical site host (apex). `www` redirects here so both kandp.site and www.kandp.site work. */
const SITE_HOST = "kandp.site";
const WWW_HOST = `www.${SITE_HOST}`;

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // One canonical URL: send www → apex (attach both domains to this Worker in Cloudflare).
    if (url.hostname === WWW_HOST) {
      url.hostname = SITE_HOST;
      return Response.redirect(url.toString(), 301);
    }

    // Simple API endpoint (useful later for gallery uploads, auth, etc.)
    if (url.pathname === "/api/health") {
      return json({ ok: true, project: "kandp", site: `https://${SITE_HOST}` });
    }

    // Serve the static site from ./public via Workers Static Assets binding.
    // With `run_worker_first = true`, this keeps the door open for middleware-style logic.
    const res = await env.ASSETS.fetch(request);

    // Optional SPA-style fallback could go here; for now keep it strict.
    return res;
  }
};

