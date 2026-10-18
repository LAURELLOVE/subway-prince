# Subway Prince: automatic payout design

Status: part 1 (server-checked scores) is built. Parts 2 and 3 are a plan and need a lawyer and a payment provider.

## 1. Fraud-proof scoring (built)

The browser can never be trusted with a score, so the server decides.

1. `POST /api/run/start` gives the player a random seed and a run id. The server remembers them.
2. The game builds the whole run from that seed. Every random choice in the game uses one seeded generator, and the game advances in fixed 1/60 second steps.
3. The game records each input as `[tick, action]`.
4. `POST /api/run/finish` sends the run id, the tick count and the inputs.
5. The server loads the game's own code, replays the inputs and works out the real distance and coins. Any score the browser claims is ignored.
6. A run is rejected if the id is unknown or already used, the inputs are malformed, the run took less real time than it claims, or it did not end in a crash.

Files: `server/server.js` (the server), `server/test.js` (checks replay and common cheats).

Accounts (built): players sign up with a username and password, stored as a salted scrypt hash. Sessions last 30 days. Only runs from signed-in players reach the online leaderboard; guests still get a checked result but no rank. Sign-up and login are rate limited. Checks: `server/test-accounts.js`.

Email confirmation and password reset (built): sign-up sends a 6-digit code, only confirmed accounts rank, one account per email address, and reset codes sign the player out everywhere. Real email needs a Resend key (see `server/README.md`).

Still open before real prizes: phone verification (an email is easy to create), daily run limits and review of suspicious patterns such as perfect bot-like inputs.

## 2. Winning and payouts (plan)

- A win is a goal reached in a server-checked run, for example 1,500 m.
- The server stores the win as a pending reward in a ledger (player, amount, run id, status).
- Rewards wait 24 to 72 hours. Suspicious ones are held for manual review.
- A licensed provider moves the money: Stripe Connect, PayPal Payouts, Flutterwave, Paystack or mobile money, depending on the country. Never pay out of a personal bank account.
- An admin page lets the owner approve, deny or pause payouts and set a total budget cap.
- Where the money comes from must be decided first: sponsors or ads (safest), a fixed monthly prize pool, or the owner's funds with a hard cap.

## 3. Legal checklist (get a lawyer for your country)

- Do not charge players to enter. Paid entry plus prizes can count as gambling.
- Keep prizes skill-based, not chance-based.
- Do not hold players' money yourself. Use a licensed provider.
- Write contest rules: eligibility, age limit, budget cap, right to disqualify cheaters.
- Publish terms of use and a privacy policy. Check tax reporting for winners.
- Some countries restrict prize contests. Block those countries if needed.

## Build order

1. Server-checked free leaderboard (done).
2. Accounts and abuse limits.
3. Points that unlock non-cash perks.
4. Legal sign-off.
5. Sponsor-funded payouts through a payment provider, with a budget cap and admin approval.
