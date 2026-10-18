// Subway Prince score server. No dependencies, run with: node server.js
// It never trusts the score a browser reports. It hands out a random seed, then replays the
// player's recorded inputs with the game's own code and records the result it computes itself.
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const PORT = +process.env.PORT || 8787;
const GAME_FILE = path.join(__dirname, '..', 'index.html');
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data.json');
const MAX_TICKS = 60 * 60 * 20;          // 20 minutes of play at 60 ticks per second
const MAX_INPUTS = 30000;
const ACTIONS = new Set(['left', 'right', 'up', 'down']);

const html = fs.readFileSync(GAME_FILE, 'utf8');
const SCRIPT = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'));

let db = { scores: [], users: {}, sessions: {} };
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) {}
db.scores = db.scores || []; db.users = db.users || {}; db.sessions = db.sessions || {};
const saveDb = () => fs.writeFileSync(DB_FILE, JSON.stringify(db));
const pending = new Map();               // runId -> { seed, char, name, startedAt, ip }
const startLog = new Map();              // ip -> recent start times (rate limit)
const authLog = new Map();
const SESSION_MS = 30 * 24 * 3600 * 1000;

// ---- accounts: username + password, stored as a salted scrypt hash, no outside services ----
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
function limited(map, ip, max) {
  const now = Date.now(), recent = (map.get(ip) || []).filter(t => now - t < 60000);
  if (recent.length >= max) return true;
  recent.push(now); map.set(ip, recent); return false;
}
function newSession(username) {
  const token = crypto.randomBytes(24).toString('hex'), now = Date.now();
  for (const [k, v] of Object.entries(db.sessions)) if (v.exp < now) delete db.sessions[k];
  db.sessions[token] = { u: username, exp: now + SESSION_MS }; saveDb();
  return token;
}
function userFor(token) {
  const s = typeof token === 'string' && db.sessions[token];
  return s && s.exp > Date.now() ? s.u : null;
}
function register(b) {
  const u = String(b.username || '').trim(), pw = String(b.password || '');
  if (!/^[A-Za-z0-9_]{3,16}$/.test(u)) return { ok: false, error: 'Username must be 3-16 letters, numbers or _' };
  if (pw.length < 6 || pw.length > 100) return { ok: false, error: 'Password must be at least 6 characters' };
  const key = u.toLowerCase();
  if (Object.keys(db.users).some(k => k.toLowerCase() === key)) return { ok: false, error: 'That username is taken' };
  const salt = crypto.randomBytes(16).toString('hex');
  db.users[u] = { salt, hash: hashPw(pw, salt), created: Date.now() }; saveDb();
  return { ok: true, username: u, token: newSession(u) };
}
function login(b) {
  const u = Object.keys(db.users).find(k => k.toLowerCase() === String(b.username || '').trim().toLowerCase());
  const bad = { ok: false, error: 'Wrong username or password' };
  if (!u) return bad;
  const rec = db.users[u], a = Buffer.from(hashPw(String(b.password || ''), rec.salt)), h = Buffer.from(rec.hash);
  return a.length === h.length && crypto.timingSafeEqual(a, h) ? { ok: true, username: u, token: newSession(u) } : bad;
}

// A stand-in for the browser so the game's code can run without a screen.
function sandbox() {
  const mock = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : mock), apply: () => mock, set: () => true, construct: () => mock });
  const el = { getContext: () => mock, addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 800 }) };
  return { document: { getElementById: () => el }, addEventListener() {}, requestAnimationFrame() {}, setTimeout() {}, performance: { now: () => 0 }, console: { log() {} } };
}

// Run the player's inputs through the real game code and report what actually happened.
function replay(char, seed, ticks, inputs) {
  const ctx = vm.createContext(sandbox());
  vm.runInContext(SCRIPT, ctx, { timeout: 2000 });
  ctx.__in = inputs; ctx.__ticks = ticks; ctx.__char = char; ctx.__seed = seed;
  return vm.runInContext(`(function () {
    sel = __char; beginRun(__seed, null);
    let ii = 0, t = 0;
    for (; t < __ticks; t++) {
      while (ii < __in.length && __in[ii][0] === t) { act(__in[ii][1]); ii++; }
      update(1 / 60);
      if (state !== 'play') { t++; break; }
    }
    return { meters: Math.floor(dist / 100), coins: coinCount, over: state !== 'play', ticks: t };
  })()`, ctx, { timeout: 8000 });
}

function validInputs(inputs, ticks) {
  if (!Array.isArray(inputs) || inputs.length > MAX_INPUTS) return false;
  let prev = 0;
  for (const i of inputs) {
    if (!Array.isArray(i) || !Number.isInteger(i[0]) || i[0] < prev || i[0] > ticks || !ACTIONS.has(i[1])) return false;
    prev = i[0];
  }
  return true;
}

function leaderboard() {
  const best = new Map();
  for (const s of db.scores) if (s.acct && (!best.has(s.name) || best.get(s.name).meters < s.meters)) best.set(s.name, s);
  return [...best.values()].sort((a, b) => b.meters - a.meters).slice(0, 20).map(s => ({ name: s.name, meters: s.meters, coins: s.coins }));
}

const send = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' });
  res.end(JSON.stringify(obj));
};
const readBody = req => new Promise((resolve, reject) => {
  let n = 0; const chunks = [];
  req.on('data', c => { n += c.length; if (n > 1e6) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch (e) { reject(e); } });
});

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = req.socket.remoteAddress;
  if (req.method === 'OPTIONS') return send(res, 204, {});
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(html);
    }
    if (req.method === 'GET' && url.pathname === '/api/leaderboard') return send(res, 200, { top: leaderboard() });

    if (req.method === 'POST' && (url.pathname === '/api/register' || url.pathname === '/api/login')) {
      if (limited(authLog, ip, 10)) return send(res, 429, { ok: false, error: 'Too many tries, wait a minute' });
      const b = await readBody(req);
      return send(res, 200, url.pathname === '/api/register' ? register(b) : login(b));
    }

    if (req.method === 'POST' && url.pathname === '/api/run/start') {
      const now = Date.now(), recent = (startLog.get(ip) || []).filter(t => now - t < 60000);
      if (recent.length >= 20) return send(res, 429, { error: 'too many runs, slow down' });
      recent.push(now); startLog.set(ip, recent);
      const b = await readBody(req);
      const char = Number.isInteger(b.char) && b.char >= 0 && b.char < 7 ? b.char : 0;
      const acct = userFor(b.token), name = acct || 'Guest-' + crypto.randomBytes(2).toString('hex');
      const runId = crypto.randomBytes(12).toString('hex'), seed = crypto.randomBytes(4).readUInt32BE(0);
      pending.set(runId, { seed, char, name, acct: !!acct, startedAt: now, ip });
      for (const [k, v] of pending) if (now - v.startedAt > 3600000) pending.delete(k);
      return send(res, 200, { runId, seed, account: !!acct });
    }

    if (req.method === 'POST' && url.pathname === '/api/run/finish') {
      const b = await readBody(req), run = pending.get(b.runId);
      if (!run) return send(res, 400, { ok: false, error: 'unknown or already used run' });
      pending.delete(b.runId);                                   // one submission per run
      const ticks = b.ticks, inputs = b.inputs;
      if (!Number.isInteger(ticks) || ticks < 1 || ticks > MAX_TICKS || !validInputs(inputs, ticks)) return send(res, 400, { ok: false, error: 'bad run data' });
      const elapsed = (Date.now() - run.startedAt) / 1000;
      if (ticks / 60 > elapsed + 3) return send(res, 400, { ok: false, error: 'run was faster than real time' });
      const r = replay(run.char, run.seed, ticks, inputs);
      if (!r.over) return send(res, 400, { ok: false, error: 'run did not finish' });
      db.scores.push({ name: run.name, acct: run.acct, meters: r.meters, coins: r.coins, char: run.char, at: Date.now() });
      db.scores = db.scores.slice(-5000); saveDb();
      const rank = run.acct ? leaderboard().findIndex(s => s.name === run.name) + 1 : 0;
      return send(res, 200, { ok: true, meters: r.meters, coins: r.coins, rank });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) { send(res, 400, { ok: false, error: 'bad request' }); }
}).listen(PORT, () => console.log('Subway Prince server on http://localhost:' + PORT));
