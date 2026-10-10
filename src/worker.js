// SnookR Worker: serves index.html (static assets), syncs the settings table to D1,
// stores the shared match history and proxies CueScore imports.
// Auth: Cloudflare Access sets Cf-Access-Authenticated-User-Email on every request.

const MAX_VALUE_BYTES = 1_900_000; // D1 row limit is 2 MB
const isPrivateKey = k => k.startsWith('snk_aikey_'); // API keys never leave the browser
const CS_API = 'https://api.cuescore.com';
const CS_MAX_TOURNAMENTS = 40; // free plan allows 50 subrequests per invocation

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

function getUser(request, env) {
  const email = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (email) return email.toLowerCase();
  return env.DEV ? 'dev@local' : null;
}

async function handleSettings(request, env, user) {
  if (request.method === 'GET') {
    const { results } = await env.DB
      .prepare('SELECT key, value, updated_at FROM settings WHERE user = ?')
      .bind(user).all();
    return json(results);
  }
  if (request.method === 'PUT') {
    let rows;
    try { rows = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
    if (!Array.isArray(rows)) return json({ error: 'expected array' }, 400);
    const valid = rows.filter(r =>
      r && typeof r.key === 'string' && typeof r.value === 'string' && typeof r.updated_at === 'string' &&
      !isPrivateKey(r.key) && r.value.length <= MAX_VALUE_BYTES);
    if (valid.length) {
      const stmt = env.DB.prepare(
        `INSERT INTO settings (user, key, value, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
         WHERE excluded.updated_at > settings.updated_at`);
      await env.DB.batch(valid.map(r => stmt.bind(user, r.key, r.value, r.updated_at)));
    }
    return json({ saved: valid.length, skipped: rows.length - valid.length });
  }
  return json({ error: 'method not allowed' }, 405);
}

/* ── Match history (shared by all users) ── */

function validMatch(m) {
  return m && typeof m.sourceRef === 'string' && typeof m.source === 'string' &&
    typeof m.playedAt === 'string' && Array.isArray(m.players) && m.players.length >= 2 &&
    Array.isArray(m.frameWins) && Array.isArray(m.frames);
}

async function handleMatches(request, env, user, url) {
  if (request.method === 'GET') {
    const [matches, players] = await env.DB.batch([
      env.DB.prepare('SELECT id, source, data, created_by FROM matches ORDER BY played_at DESC'),
      env.DB.prepare('SELECT name, cuescore_id, image FROM players'),
    ]);
    return json({
      matches: matches.results.map(r => ({ ...JSON.parse(r.data), id: r.id, createdBy: r.created_by })),
      players: players.results,
    });
  }
  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
    const list = (Array.isArray(body) ? body : [body]).filter(validMatch);
    if (!list.length) return json({ error: 'no valid matches' }, 400);
    const now = new Date().toISOString();
    const stmt = env.DB.prepare(
      `INSERT INTO matches (id, source, source_ref, played_at, discipline, venue, player_a, player_b,
         frames_a, frames_b, data, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(source_ref) DO NOTHING`);
    const res = await env.DB.batch(list.map(m => {
      const data = JSON.stringify(m);
      return stmt.bind(crypto.randomUUID(), m.source, m.sourceRef, m.playedAt, m.discipline || null,
        m.venue || null, m.players[0], m.players[1], m.frameWins[0] || 0, m.frameWins[1] || 0,
        data.length <= MAX_VALUE_BYTES ? data : JSON.stringify({ ...m, frames: m.frames.map(f => ({ ...f, shots: undefined })) }),
        user, now);
    }));
    const saved = res.reduce((a, r) => a + (r.meta.changes || 0), 0);
    return json({ saved, skipped: list.length - saved });
  }
  if (request.method === 'DELETE') {
    const id = url.pathname.split('/')[3];
    if (!id) return json({ error: 'missing id' }, 400);
    const r = await env.DB.prepare('DELETE FROM matches WHERE id = ?').bind(id).run();
    return json({ deleted: r.meta.changes || 0 });
  }
  return json({ error: 'method not allowed' }, 405);
}

async function handlePlayers(request, env) {
  if (request.method !== 'PUT') return json({ error: 'method not allowed' }, 405);
  let rows;
  try { rows = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  rows = (Array.isArray(rows) ? rows : [rows]).filter(r => r && typeof r.name === 'string' && r.name.trim());
  if (!rows.length) return json({ error: 'no players' }, 400);
  const stmt = env.DB.prepare(
    `INSERT INTO players (name, cuescore_id, image) VALUES (?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET cuescore_id = COALESCE(excluded.cuescore_id, players.cuescore_id),
       image = COALESCE(excluded.image, players.image)`);
  await env.DB.batch(rows.map(r => stmt.bind(r.name.trim(), r.cuescore_id ?? null, r.image ?? null)));
  return json({ saved: rows.length });
}

/* ── CueScore proxy: player page has no CORS, so the Worker collects the matches ── */

const csGet = async path => {
  const r = await fetch(CS_API + path, { headers: { 'user-agent': 'SnookR/1.0' } });
  if (!r.ok) throw new Error('CueScore ' + r.status);
  return r.json();
};

const slimPlayer = p => p && ({ playerId: p.playerId, name: p.name, firstname: p.firstname, image: p.image });
const slimMatch = (m, t) => ({
  matchId: m.matchId, discipline: m.discipline || t?.discipline, starttime: m.starttime, stoptime: m.stoptime,
  scoreA: m.scoreA, scoreB: m.scoreB, raceTo: m.raceTo, matchstatus: m.matchstatus,
  playerA: slimPlayer(m.playerA), playerB: slimPlayer(m.playerB),
  tournament: t ? t.name : null, venue: m.table?.venue?.name || null, notes: m.notes || [],
});

async function handleCuescore(url) {
  const player = Number(url.searchParams.get('player')) || null;
  const tournament = url.searchParams.get('tournament');
  const match = url.searchParams.get('match');
  try {
    if (match) {
      const m = await csGet('/match/?matchId=' + encodeURIComponent(match));
      if (m.error) return json({ error: m.error }, 404);
      return json({ matches: [slimMatch(m, null)] });
    }
    let ids = [];
    if (tournament) ids = [tournament];
    else if (player) {
      const page = await fetch(`https://cuescore.com/player/x/${player}/tournaments?s=0`,
        { headers: { 'user-agent': 'Mozilla/5.0 SnookR/1.0' } });
      if (!page.ok) return json({ error: 'CueScore player page ' + page.status }, 502);
      const html = await page.text();
      ids = [...new Set([...html.matchAll(/\/tournament\/[^"'\s]+\/(\d+)/g)].map(x => x[1]))];
    } else return json({ error: 'player, tournament or match required' }, 400);

    const tours = await Promise.all(ids.slice(0, CS_MAX_TOURNAMENTS)
      .map(id => csGet('/tournament/?id=' + encodeURIComponent(id)).catch(() => null)));
    const matches = [];
    for (const t of tours) {
      if (!t || !Array.isArray(t.matches)) continue;
      for (const m of t.matches) {
        if (m.matchstatus !== 'finished') continue;
        if (player && m.playerA?.playerId !== player && m.playerB?.playerId !== player) continue;
        matches.push(slimMatch(m, t));
      }
    }
    return json({ matches, tournaments: ids.length, truncated: ids.length > CS_MAX_TOURNAMENTS });
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const user = getUser(request, env);
      if (!user) return json({ error: 'unauthorized' }, 401);
      if (url.pathname === '/api/settings') return handleSettings(request, env, user);
      if (url.pathname === '/api/matches' || url.pathname.startsWith('/api/matches/')) return handleMatches(request, env, user, url);
      if (url.pathname === '/api/players') return handlePlayers(request, env);
      if (url.pathname === '/api/cuescore' && request.method === 'GET') return handleCuescore(url);
      return json({ error: 'not found' }, 404);
    }
    return env.ASSETS.fetch(request);
  },
};
