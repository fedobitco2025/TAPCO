# AGENTS

This file helps AI coding agents become productive quickly in this repository.

## Scope

- Main client game logic lives in [Game.html](Game.html).
- **Active backend**: [backend/server.js](backend/server.js) + MongoDB + [backend/worker.js](backend/worker.js).
- **Retired backend** (do not use): `server/app.js` (SQLite) — kept for reference only.
- Backend architecture guide: [server/README.md](server/README.md) (describes old system patterns; new system uses MongoDB).

## Quick Start Commands

Run from `backend/` directory:

```
npm install
copy .env.example .env    # or create .env with required vars
npm start                 # starts backend/server.js on port 4000
npm run worker            # starts backend/worker.js (processes pending withdrawals)
```

Primary scripts are defined in [backend/package.json](backend/package.json).
Required environment variables: `MONGODB_URI`, `REQUEST_SECRET` (or `CLIENT_SECRET`), `RPC_URL`, `PRIVATE_KEY`, `CONTRACT_ADDRESS` (or `TAPCO_CONTRACT`).

## Architecture Snapshot

- Client: [Game.html](Game.html) handles gameplay, wallet interactions, and withdrawal payload creation. Connects to **port 4000**.
- API: [backend/server.js](backend/server.js) validates requests, applies limits, and writes authoritative balance/withdrawal state to **MongoDB**.
  - Compatibility endpoints (`/api/report-bot`, `/api/player-bot-state`, `/api/verify-points`, `/api/verify-energy`, `/api/verify-referral`, `/api/verify-wallet-op`, `/api/withdraw-tapco`, `/api/withdraw-status`, `/api/player-balance`) are defined directly in server.js for Game.html compatibility.
  - Modular routes under `backend/src/api/` handle new-style requests.
- Worker: [backend/worker.js](backend/worker.js) processes pending `WithdrawRequest` documents on interval, submits on-chain transfers, and refunds `player.tapcoBalance` on failure.
- DB models are in [backend/src/models/](backend/src/models/): `player.model.js`, `withdrawRequest.model.js`, `walletTx.model.js`, etc.
- Signature and validation helpers are in [backend/src/core/security.js](backend/src/core/security.js). Uses `REQUEST_SECRET` env var (falls back to `CLIENT_SECRET`).

## Project Conventions For Edits

- Keep server-side balance as source of truth for withdrawals; do not move balance authority to client.
- Keep anti-replay and signature checks intact in [backend/src/core/security.js](backend/src/core/security.js) and [backend/server.js](backend/server.js).
- Prefer small, targeted edits; avoid broad refactors in [Game.html](Game.html) unless requested.
- For TAPCO achievement/event logic in [Game.html](Game.html), prefer centralized register* handlers and immediately run save plus achievement sync flow after event updates.
- Preserve existing Arabic user-facing messages unless the task explicitly requests copy changes.
- Weekly withdrawal state is persisted on the Player document (`weeklyWithdrawPoints`, `weeklyWithdrawReset`) — do not revert to in-memory.

## High-Value Files To Read First

- [backend/server.js](backend/server.js)
- [backend/worker.js](backend/worker.js)
- [backend/src/models/player.model.js](backend/src/models/player.model.js)
- [backend/src/models/withdrawRequest.model.js](backend/src/models/withdrawRequest.model.js)
- [backend/src/core/security.js](backend/src/core/security.js)
- [backend/src/config/env.js](backend/src/config/env.js)
- [Game.html](Game.html)

## Common Pitfalls

- Running only API without worker leaves withdrawals pending.
- Missing or mismatched `REQUEST_SECRET` / `CLIENT_SECRET` breaks clientSignature validation — must match `TAPCO_CLIENT_SECRET` value in Game.html.
- Invalid chain configuration or unfunded `PRIVATE_KEY` causes worker transfer failures.
- Clock drift beyond `TIMESTAMP_WINDOW_MS` causes request rejection.
- `unityAccessGuard` is a no-op passthrough — do not re-enable it for browser clients.
- `CONTRACT_ADDRESS` env var is used by `backend/src/blockchain/client.js`; also accepts `TAPCO_CONTRACT` as fallback.

## Working Style

- Prefer behavior-preserving fixes with explicit validation steps.
- When changing API or worker behavior, verify both server process and worker process assumptions still hold.
- When changing game state logic, validate localStorage-dependent flows and achievement sync behavior.

