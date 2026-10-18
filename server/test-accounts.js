// Checks sign-up with email codes, password reset and that only confirmed accounts reach the online leaderboard.
// Start the server with test codes on:  DEV_CODES=1 DB_FILE=./test-data.json node server.js
// then: node test-accounts.js
const BASE = process.env.BASE || 'http://localhost:8787';
const post = (p, body) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
const ok = (name, cond) => console.log((cond ? 'PASS ' : 'FAIL ') + name);
(async () => {
  const n = Math.floor(Math.random() * 1e6), u = 'tester' + n, email = 'player.' + n + '@gmail.com';
  ok('weak password rejected', !(await post('/api/register', { username: u, email, password: '123' })).ok);
  ok('bad username rejected', !(await post('/api/register', { username: 'a b', email, password: 'secret1' })).ok);
  ok('bad email rejected', !(await post('/api/register', { username: u, email: 'nope', password: 'secret1' })).ok);
  const reg = await post('/api/register', { username: u, email, password: 'secret1' });
  ok('register works, not confirmed yet', reg.ok && reg.token && reg.verified === false && reg.devCode);
  ok('duplicate name rejected (any case)', !(await post('/api/register', { username: u.toUpperCase(), email: 'other' + n + '@x.com', password: 'secret1' })).ok);
  ok('same email rejected even with gmail dots/plus', !(await post('/api/register', { username: u + 'b', email: 'p.layer.' + n + '+x@gmail.com'.replace('p.layer.', 'player.'), password: 'secret1' })).ok);
  const before = await post('/api/run/start', { token: reg.token, char: 0 });
  ok('unconfirmed account does not count for the board', before.signedIn === true && before.account === false);
  ok('wrong code rejected', !(await post('/api/verify', { token: reg.token, code: '000000' })).ok);
  ok('right code confirms the email', (await post('/api/verify', { token: reg.token, code: reg.devCode })).ok);
  const after = await post('/api/run/start', { token: reg.token, char: 0 });
  ok('confirmed account counts for the board', after.account === true);
  ok('wrong password rejected', !(await post('/api/login', { username: u, password: 'wrong!!' })).ok);
  const lg = await post('/api/login', { username: u, password: 'secret1' });
  ok('login works and shows confirmed', lg.ok && lg.verified === true);

  const fg = await post('/api/forgot', { email });
  ok('forgot answers ok and gives a code in test mode', fg.ok && fg.devCode);
  const unknown = await post('/api/forgot', { email: 'nobody' + n + '@x.com' });
  ok('unknown email gets the same answer (no probing)', unknown.ok && !unknown.devCode);
  ok('reset with wrong code rejected', !(await post('/api/reset', { email, code: '111111', password: 'newpass1' })).ok);
  ok('reset with right code works', (await post('/api/reset', { email, code: fg.devCode, password: 'newpass1' })).ok);
  ok('old password no longer works', !(await post('/api/login', { username: u, password: 'secret1' })).ok);
  ok('new password works', (await post('/api/login', { username: u, password: 'newpass1' })).ok);
  ok('old session was signed out by the reset', (await post('/api/run/start', { token: lg.token, char: 0 })).signedIn === false);
  const guest = await post('/api/run/start', { token: 'forged', char: 0 });
  ok('forged token becomes a guest', guest.account === false && guest.signedIn === false);
  const board = await (await fetch(BASE + '/api/leaderboard')).json();
  ok('leaderboard lists only confirmed account runs', board.top.every(r => !/^Guest-/.test(r.name)));
})();
