# Subway Prince score server

Needs only Node 18 or newer. No packages to install.

```
node server.js
```

Open http://localhost:8787 to play. Runs played there are checked by the server and appear on the online leaderboard (menu, Scores).

Check that the replay and anti-cheat work:

```
node test.js
```

## Put it online

1. Host the `server` folder and `index.html` together on any Node host (Render, Railway, Fly.io or a VPS). Start command: `node server/server.js`. Set `PORT` if the host asks for it.
2. Keep the database file on a persistent disk (set `DB_FILE` to its path), otherwise scores reset on restart.
3. To let the GitHub Pages copy of the game use it, set `API_URL` near the top of `index.html` to your server's address and push the change.

Leave `API_URL` empty to play offline with local scores only.
