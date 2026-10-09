# Repository Guidelines

## Project Structure & Module Organization

The app is a single static page in `public/index.html`. The file includes the HTML shell, inline CSS, and inline JavaScript for the SnookR 2D/3D scoring and table interface. Browser dependencies are loaded from CDNs near the top, including Matter.js, sql.js, OpenCV, TensorFlow.js, and COCO-SSD.

It is hosted on Cloudflare Workers (`wrangler.jsonc`): `public/` is served as static assets and `src/worker.js` handles `/api/settings`, syncing the browser's sql.js `settings` table to a D1 database (schema in `migrations/`). The user is identified by the Cloudflare Access header `Cf-Access-Authenticated-User-Email`. Keys starting with `snk_aikey_` (AI API keys) are never synced — both the client and the Worker filter them. Without a backend (file://, `python -m http.server`) the client sync turns itself off and the app works locally only.

Keep related UI, style, and behavior changes close to the existing sections in `public/index.html`. If the app grows beyond one file, prefer `public/` for static assets, `src/` for Worker code, and `tests/` for automated checks.

## Build, Test, and Development Commands

There is no package manager or build step; Wrangler runs through `npx`.

- `npx wrangler d1 migrations apply snookr --local`: create the local D1 schema (once, and after new migrations).
- `npx wrangler dev`: serve the app and API at http://localhost:8787 (`.dev.vars` sets `DEV=1` so `/api` works without Cloudflare Access).
- `npx wrangler d1 execute snookr --local --command "SELECT * FROM settings"`: inspect synced rows.
- `npx wrangler d1 migrations apply snookr --remote` then `npx wrangler deploy`: publish to Cloudflare.
- `python -m http.server 8000 -d public`: static-only serving, no cloud sync.
- `git status --short`: check pending changes before editing or committing.

## Coding Style & Naming Conventions

Use the existing style in `public/index.html`: compact CSS blocks, browser-native JavaScript, `const`/`let`, and camelCase names. Preserve the monospace UI direction and CSS custom properties under `:root`.

Avoid adding frameworks or build tooling unless the change clearly requires it. Keep browser storage keys, database table names, and DOM IDs stable because they affect persisted user data and UI wiring.

## Testing Guidelines

No automated tests are currently configured. For changes, manually verify the affected tab or workflow in a modern browser through a local server. Check console errors, mobile and desktop layouts, persisted settings, score changes, and physics interactions when relevant.

If tests are added later, place them under `tests/` and name them by behavior, for example `scorekeeping.spec.js` or `physics-collisions.spec.js`.

## Commit & Pull Request Guidelines

Recent commits use concise, imperative summaries such as `Fix physics tunneling: use substeps so fast balls don't pass through targets`. Follow that pattern: start with a verb and name the affected behavior.

Pull requests should include a short description, manual test notes, linked issues when applicable, and screenshots or screen recordings for visible UI changes. Mention any new external dependency or storage migration explicitly.

## Agent-Specific Instructions

Before editing, check for user changes with `git status --short`. Do not overwrite unrelated local changes. Keep modifications narrowly scoped and update this guide if the repository structure or developer commands change.
