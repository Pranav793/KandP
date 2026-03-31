# Pranav & Kashika (Cloudflare Worker + static assets)

A simple website served by a Cloudflare Worker using **Workers Static Assets**.

The pages are plain HTML/CSS/JS in `public/`.

## Pages

- `public/index.html` (Home)
- `public/story.html` (Our Story)
- `public/gallery.html` (Gallery placeholder for now)

## Develop locally

Install dependencies and run the Worker:

```bash
npm i
npm run dev
```

Wrangler will print a local URL (usually `http://localhost:8787`).

## Deploy

```bash
npm run deploy
```

## Domain: `kandp.site` and `www.kandp.site`

In **Cloudflare** → your Worker → **Custom domains**, add:

- `kandp.site`
- `www.kandp.site`

The Worker **redirects** `www.kandp.site` → `https://kandp.site` (same path) so both URLs work, with one canonical site for sharing and SEO.

Pages include `canonical` and Open Graph URLs pointing at `https://kandp.site/...`.

## Cloudflare dashboard fields

If Cloudflare asks for these:

- **Project name**: `kandp` (or anything you want)
- **Build command**: `npm run build`
- **Deploy command**: `npm run deploy`

## Customize

- Edit the text directly in `public/index.html`, `public/story.html`, `public/gallery.html`
- Update the look in `public/styles.css`

