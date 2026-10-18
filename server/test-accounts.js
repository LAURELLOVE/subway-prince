// Checks sign-up, sign-in and that only account runs reach the online leaderboard.
// Start the server first (node server.js), then: node test-accounts.js
const BASE = process.env.BASE || 'http://localhost:8787';
const post = (p, body) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
const ok = (name, cond) => console.log((cond ? 'PASS ' : 'FAIL ') + name);
(async () => {
  const u = 'tester' + Math.floor(Math.random() * 1e6);
  ok('weak password rejected', !(await post('/api/register', { username: u, password: '123' })).ok);
  ok('bad username rejected', !(await post('/api/register', { username: 'a b', password: 'secret1' })).ok);
  const reg = await post('/api/register', { username: u, password: 'secret1' });
  ok('register works and returns a token', reg.ok && reg.token && reg.username === u);
  ok('duplicate name rejected (any case)', !(await post('/api/register', { username: u.toUpperCase(), password: 'secret1' })).ok);
  ok('wrong password rejected', !(await post('/api/login', { username: u, password: 'wrong!!' })).ok);
  const lg = await post('/api/login', { username: u, password: 'secret1' });
  ok('login works', lg.ok && lg.token);
  const run = await post('/api/run/start', { token: lg.token, char: 0 });
  ok('run with token is an account run', run.account === true);
  const guest = await post('/api/run/start', { token: 'forged', char: 0 });
  ok('forged token becomes a guest', guest.account === false);
  const board = await (await fetch(BASE + '/api/leaderboard')).json();
  ok('leaderboard lists only account runs', board.top.every(r => !/^Guest-/.test(r.name)));
})();
