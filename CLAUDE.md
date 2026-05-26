# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SnookR is a mobile-optimized snooker scorekeeper and table tracker. It is a **single-file web app**: all HTML, CSS, and JavaScript lives in `index.html`. There are no build tools, no npm, no transpilation — open the file directly in a browser.

## Running the app

Open `index.html` in any modern browser. No server is required.

For development with live reload, any static file server works:
```
python -m http.server 8080
# or
npx serve .
```

## Architecture

Everything is in one `index.html`. The structure is:

1. **`<style>` block** — all CSS, using CSS custom properties (`--gold`, `--felt`, `--panel`, etc.) for theming
2. **HTML body** — page/tab divs + modal overlays; tabs toggled by `showTab(n)` (see below)
3. **Main `<script>` block** — all game logic, scoring, 2D table, AI photo analysis, physics
4. **`<script type="module">` block** — Three.js 3D viewer (separate module scope)

### Tab system

`showTab(n)` controls visibility. Tab indices map to page element IDs:

| n | Element | Description |
|---|---------|-------------|
| 0 | `pSetup` | Player setup / game start |
| 1 | `pScore` | Score entry (pot/foul/miss/undo) |
| 3 | `pTimeline` | Recording, playback, save/load |
| 4 | `pReport` | Stats and report generation |
| 5 | `pTable` | 2D interactive table |
| 6 | `p3D` | 3D viewer (requires external GLB file) |

The Stats tab (`pStats`) is hidden and its content has been merged into the Report tab.

### Core state

All mutable game state is in top-level `let` variables:

- `B` — ball positions dict: `{[id]: {x, y, potted, isRed, pts, c, ...}}`; `x`/`y` are percentages of the table element
- `G` — game state: `{cp, scores, frames, breaks, reds, colPts}` where `cp` is current player (1 or 2)
- `shots[]` — shot history array for statistics
- `snaps[]` — timeline snapshots (includes ball state copies)
- `potH[]` / `redoH[]` — undo/redo stack for score entries
- `tblPosHistory[]` — undo stack for 2D ball drag moves
- `pNames[]` — player names
- `gameMode` — 15, 10, or 6 reds

### 2D table coordinate system

Portrait orientation: `x=0`/`y=0` is top-left, `x=100`/`y=100` is bottom-right. **Black end is at top (y≈0–10%), baulk at bottom (y≈79%).**

Ball `B[id].x` and `B[id].y` are always in percent. Two simultaneous surfaces exist: `#ftbl` (precise style) and `#ctbl` (cartoon style). Ball DOM elements are prefixed `b-` (precise) and `cb-` (cartoon).

### 3D viewer

Lives in a module script. Communicates with the main script via `window._snkBalls()`, `window._update3D()`, `window._draw3DAim()`, and `window._aimData` / `window._aimStats`. Requires the user to manually load a `Table.glb` file (browser security prevents automatic local file loading). Ball positions are converted from 2D % coordinates to Three.js world units via `to3D(bx, by)`.

### AI photo ball detection

`analyzePhoto(event)` dispatches to `callClaude()`, `callOpenAI()`, `callGemini()`, `detectWithOpenCV()`, or `detectWithTFJS()` depending on `aiProvider`. Claude runs natively in the claude.ai preview context (no API key); others require user-supplied keys stored in `localStorage`. Results place detected balls onto the 2D table.

### Physics simulation

`startBreakShot()` creates a Matter.js world, maps ball positions from `%` to mm (table = 1778×3569mm), fires the cue ball toward the aim target, and syncs positions back to `B` each frame via `syncBalls()`.

### Persistence

`localStorage` only:
- `sp_p` — saved player name list
- `sp_last` — last used player names
- `snk_auto` — autosave (written on every `snap()` call)

Game files are exported as `.json` (download) and re-imported via file picker.

## Finnish language

The app has Finnish UI strings in several places (help text, inline labels, `confirm()` dialogs). This is intentional — keep existing Finnish strings as-is; new user-facing strings can be in English.
