// SnookR Worker: serves index.html (static assets) and syncs the settings table to D1.
// Auth: Cloudflare Access sets Cf-Access-Authenticated-User-Email on every request.

const MAX_VALUE_BYTES = 1_900_000; // D1 row limit is 2 MB
const isPrivateKey = k => k.startsWith('snk_aikey_'); // API keys never leave the browser

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const user = getUser(request, env);
      if (!user) return json({ error: 'unauthorized' }, 401);
      if (url.pathname === '/api/settings') return handleSettings(request, env, user);
      return json({ error: 'not found' }, 404);
    }
    return env.ASSETS.fetch(request);
  },
};
