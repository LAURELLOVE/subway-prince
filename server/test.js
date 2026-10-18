// End-to-end check: play a run with a simple bot using the game's own code, send it to the server, compare.
// Run the server first (node server.js), then: node test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const BASE = process.env.BASE || 'http://localhost:8787';
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SCRIPT = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'));

function sandbox() {
  const mock = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : mock), apply: () => mock, set: () => true, construct: () => mock });
  const el = { getContext: () => mock, addEventListener() {}, getBoundingClientRect: () => ({}) };
  return { document: { getElementById: () => el }, addEventListener() {}, requestAnimationFrame() {}, setTimeout() {}, performance: { now: () => 0 }, console };
}
const post = (p, body) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());

(async () => {
  const start = await post('/api/run/start', { name: 'TestBot', char: 2 });
  console.log('start:', start);
  // the "browser": same game code, same seed, a bot that sometimes jumps, rolls and changes lane
  const ctx = vm.createContext(sandbox());
  vm.runInContext(SCRIPT, ctx);
  ctx.__seed = start.seed; ctx.__char = 2;
  const local = vm.runInContext(`(function () {
    sel = __char; beginRun(__seed, null);
    const moves = ['left', 'up', 'right', 'down', 'up', 'right', 'left', 'down'];
    for (let t = 0; t < 60 * 120 && state === 'play'; t++) {
      if (t % 45 === 0) act(moves[(t / 45) % moves.length]);
      update(STEP); ticks++;
    }
    return { meters: Math.floor(dist / 100), coins: coinCount, over: state !== 'play', ticks, inputs };
  })()`, ctx);
  console.log('local result :', { meters: local.meters, coins: local.coins, over: local.over, ticks: local.ticks, inputs: local.inputs.length });
  await new Promise(r => setTimeout(r, (local.ticks / 60) * 1000 + 3500 > 4000 ? 0 : 0));
  // wait long enough that the run is not "faster than real time"
  const wait = Math.max(0, local.ticks / 60 - 2);
  console.log('waiting', wait.toFixed(1), 's so the run is not faster than real time');
  await new Promise(r => setTimeout(r, wait * 1000));
  const fin = await post('/api/run/finish', { runId: start.runId, ticks: local.ticks, inputs: local.inputs });
  console.log('server result:', fin);
  console.log(fin.ok && fin.meters === local.meters && fin.coins === local.coins ? 'PASS: server replay matches the game' : 'FAIL: mismatch');

  // cheat attempts
  console.log('reuse same run   :', (await post('/api/run/finish', { runId: start.runId, ticks: local.ticks, inputs: local.inputs })).error);
  console.log('fake run id      :', (await post('/api/run/finish', { runId: 'nope', ticks: 100, inputs: [] })).error);
  const s2 = await post('/api/run/start', { name: 'Cheater', char: 0 });
  console.log('too fast         :', (await post('/api/run/finish', { runId: s2.runId, ticks: 50000, inputs: [] })).error);
  const s3 = await post('/api/run/start', { name: 'Cheater', char: 0 });
  console.log('bad inputs       :', (await post('/api/run/finish', { runId: s3.runId, ticks: 10, inputs: [[3, 'fly']] })).error);
  const s4 = await post('/api/run/start', { name: 'Cheater', char: 0 });
  console.log('claimed 99999 m  :', await post('/api/run/finish', { runId: s4.runId, ticks: 5, inputs: [], meters: 99999, coins: 99999 }));
  console.log('leaderboard      :', JSON.stringify(await (await fetch(BASE + '/api/leaderboard')).json()));
})();
