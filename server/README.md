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

## Email codes and password reset

Sign-up asks for an email and sends a 6-digit code. Only confirmed accounts appear on the online leaderboard. "Forgot password" sends a reset code. Codes last 15 minutes and allow 5 tries. One person, one address: Gmail dots and +tags count as the same address.

To send real emails, create a free account at https://resend.com, make an API key and set these on your host:

- `RESEND_API_KEY` = your key
- `MAIL_FROM` = for example `Subway Prince <noreply@yourdomain.com>` (Resend needs you to verify a domain you own; the default sender only works for testing)

Without `RESEND_API_KEY` the codes are printed in the server log, so nobody gets an email. Never set `DEV_CODES=1` in production; it exists only for `node test-accounts.js`, which you run with `DEV_CODES=1 DB_FILE=./test-data.json node server.js`.
