export interface Env {
  ASSETS: Fetcher;
}

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Simple API endpoint (useful later for gallery uploads, auth, etc.)
    if (url.pathname === "/api/health") {
      return json({ ok: true, project: "kandp" });
    }

    // Serve the static site from ./public via Workers Static Assets binding.
    // With `run_worker_first = true`, this keeps the door open for middleware-style logic.
    const res = await env.ASSETS.fetch(request);

    // Optional SPA-style fallback could go here; for now keep it strict.
    return res;
  }
};

