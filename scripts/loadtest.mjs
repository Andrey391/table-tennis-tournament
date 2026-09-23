// Load test: one club night, measured from the server's side.
//
//   node scripts/loadtest.mjs                      # against http://localhost:3000/api
//   BASE=http://localhost:3000/api VIEWERS=40 PLAYERS=16 DURATION=60 node scripts/loadtest.mjs
//
// Registers a manager and PLAYERS players, creates a tournament, pairs round 1,
// then for DURATION seconds: VIEWERS phones poll the event page the way
// TournamentPage does (event + standings every 5 s), and every table's players
// start their match, record sets every SET_EVERY seconds and end it. Prints
// p50/p95/max per endpoint. Needs Node 18+ (built-in fetch), no dependencies.
//
// Each virtual user sends its own X-Forwarded-For, so the per-IP rate limits
// (the server trusts one proxy hop) see a room of phones rather than one
// attacker. NEVER point this at production: it creates real accounts and events.

const BASE = process.env.BASE || "http://localhost:3000/api";
const VIEWERS = +(process.env.VIEWERS || 30);
const PLAYERS = +(process.env.PLAYERS || 16);
const DURATION = +(process.env.DURATION || 60) * 1000;
const POLL_MS = +(process.env.POLL_MS || 5000);
const SET_EVERY = +(process.env.SET_EVERY || 4) * 1000;

if (/supabase|vercel\.app|onrender/.test(BASE)) { console.error("Refusing to load-test a hosted deployment:", BASE); process.exit(1); }

const samples = new Map();
let errors = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ipSeq = 1;
const newIp = () => { const n = ipSeq++; return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`; };

async function call(label, ip, method, path, body, token) {
  const t0 = performance.now();
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: e.message }) }));
  const ms = performance.now() - t0;
  if (!samples.has(label)) samples.set(label, []);
  samples.get(label).push(ms);
  const data = await res.json().catch(() => null);
  if (!res.ok) { errors++; if (errors <= 10) console.error(`  ${label} -> ${res.status}`, data?.error ?? ""); }
  return { ok: res.ok, status: res.status, data };
}

async function register(i) {
  const ip = newIp();
  const email = `load-${Date.now()}-${i}@example.test`;
  const r = await call("POST /auth/register", ip, "POST", "/auth/register", { email, password: "loadtest1", firstName: `Load${i}`, lastName: "Test" });
  if (!r.ok) throw new Error("register failed");
  return { ip, token: r.data.token, id: r.data.user.id };
}

// SMART_POLL=1 polls the way the current TournamentPage does: standings only
// when a completed match changed; without it, both requests on every tick.
const SMART_POLL = process.env.SMART_POLL === "1";

async function viewer(id, until) {
  const ip = newIp();
  let seen = null;
  await sleep(Math.random() * POLL_MS);
  while (Date.now() < until) {
    const r = await call("GET /tournaments/:id", ip, "GET", `/tournaments/${id}`);
    const key = (r.data?.matches || []).filter((m) => m.status === "COMPLETED").map((m) => `${m.id}:${m.setsWon1}:${m.setsWon2}`).join("|");
    if (!SMART_POLL || key !== seen) {
      await call("GET /tournaments/:id/standings", ip, "GET", `/tournaments/${id}/standings`);
      seen = key;
    }
    await sleep(POLL_MS);
  }
}

async function table(match, player, until) {
  await sleep(Math.random() * SET_EVERY);
  await call("POST /matches/:id/start", player.ip, "POST", `/matches/${match.id}/start`, {}, player.token);
  let w1 = 0, w2 = 0;
  while (Date.now() < until && Math.max(w1, w2) < 3) {
    const side = Math.random() < 0.5 ? 1 : 2;
    const r = await call("POST /matches/:id/score", player.ip, "POST", `/matches/${match.id}/score`, { side }, player.token);
    if (r.ok) { if (side === 1) w1++; else w2++; }
    await call("GET /matches/:id", player.ip, "GET", `/matches/${match.id}`);
    await sleep(SET_EVERY);
  }
  if (w1 !== w2) await call("POST /matches/:id/end", player.ip, "POST", `/matches/${match.id}/end`, {}, player.token);
}

const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))];

async function main() {
  console.log(`Setting up: ${PLAYERS} players against ${BASE}`);
  const manager = await register(0);
  const players = [];
  for (let i = 1; i <= PLAYERS; i++) players.push(await register(i));
  // A tournament needs a venue.
  const club = await call("POST /clubs", manager.ip, "POST", "/clubs", { name: `Load club ${Date.now()}`, city: "Loadtest" }, manager.token);
  if (!club.ok) throw new Error("create club failed");
  const t = await call("POST /tournaments", manager.ip, "POST", "/tournaments", { name: `Load test ${new Date().toISOString()}`, tablesCount: 8, clubId: club.data.id, startTime: new Date().toISOString(), isPublic: false }, manager.token);
  if (!t.ok) throw new Error("create tournament failed");
  const id = t.data.id;
  await call("POST /tournaments/:id/players", manager.ip, "POST", `/tournaments/${id}/players`, { userIds: players.map((p) => p.id) }, manager.token);
  await call("POST /tournaments/:id/pair", manager.ip, "POST", `/tournaments/${id}/pair`, {}, manager.token);
  const event = await call("GET /tournaments/:id", manager.ip, "GET", `/tournaments/${id}`);
  const matches = event.data.matches;
  const byId = new Map(players.map((p) => [p.id, p]));

  samples.clear(); errors = 0;
  console.log(`Running ${DURATION / 1000}s: ${VIEWERS} viewers polling every ${POLL_MS / 1000}s, ${matches.length} tables scoring`);
  const until = Date.now() + DURATION;
  const started = Date.now();
  await Promise.all([
    ...Array.from({ length: VIEWERS }, () => viewer(id, until)),
    ...matches.map((m) => table(m, byId.get(m.player1Id), until)),
  ]);
  const secs = (Date.now() - started) / 1000;

  let total = 0;
  const rows = [...samples.entries()].map(([label, arr]) => {
    arr.sort((a, b) => a - b); total += arr.length;
    return { endpoint: label, n: arr.length, p50: Math.round(pct(arr, 50)), p95: Math.round(pct(arr, 95)), max: Math.round(arr[arr.length - 1]) };
  });
  console.table(rows);
  console.log(`${total} requests in ${secs.toFixed(0)}s (${(total / secs).toFixed(1)} req/s), ${errors} errors. Event id: ${id}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
