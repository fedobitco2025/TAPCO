# TAPCO Withdrawal API

## Architecture

This implementation uses 3 layers:

1. Client game (Game.html):
- Builds secure withdrawal payload.
- Sends POST request to API.
- Stores request locally as pending and syncs status.

2. Server API (Express + SQLite):
- Validates request fields and signature.
- Validates timestamp freshness (anti-replay window).
- Validates Ethereum wallet address.
- Validates player balance from DB (server-side authority).
- Validates daily/weekly withdrawal limits.
- Deducts balance and inserts pending request in a single DB transaction.

3. Blockchain worker:
- Runs every minute.
- Reads pending requests.
- Marks each request completed or failed.
- On failure, refunds player balance.

## Endpoints

- POST /api/withdraw-tapco
Request body:
{
  "playerId": "PLAYER_123",
  "tapcoAmount": 250,
  "walletAddress": "0x1234abcd...",
  "timestamp": 1732639200000,
  "chainId": "0xaa36a7",
  "clientSignature": "sha256(...)"
}

Response:
{
  "ok": true,
  "requestId": 51,
  "status": "pending",
  "message": "تم تسجيل طلب السحب بنجاح"
}

- GET /api/withdraw-status?playerId=PLAYER_123
Returns latest requests with statuses and txHash when available.

- GET /api/player-balance?playerId=PLAYER_123
Returns server-side TAPCO balance for the player.

- GET /api/health
Health check endpoint.

## Database schema

Table: players
- id TEXT PRIMARY KEY
- tapcoBalance INTEGER NOT NULL
- createdAt INTEGER NOT NULL
- updatedAt INTEGER NOT NULL

Table: withdraw_requests
- id INTEGER PRIMARY KEY AUTOINCREMENT
- playerId TEXT NOT NULL
- amount INTEGER NOT NULL
- walletAddress TEXT NOT NULL
- chainId TEXT
- status TEXT CHECK(pending|processing|completed|failed)
- txHash TEXT
- clientSignature TEXT UNIQUE NOT NULL
- requestedAt INTEGER NOT NULL
- createdAt INTEGER NOT NULL
- updatedAt INTEGER NOT NULL
- failureReason TEXT

## Setup

1. Install Node.js 20+ (includes npm).
2. In project root, install dependencies:
   npm install
3. Copy env file:
   copy .env.example .env
4. Start API server:
   npm start
5. Start worker in another terminal:
   npm run worker

## Notes

- The worker uses real on-chain transfer with Ethers (transfer function on TAPCO token contract).
- Required env vars for worker: RPC_URL, PRIVATE_KEY, TAPCO_CONTRACT.
- Required env vars for API signature validation: CLIENT_SECRET.
- Use a funded project wallet (native gas token + TAPCO token balance).
- Requests are processed in batches (WORKER_BATCH_SIZE) to avoid flooding.
- On failed transfer, request is marked failed and player off-chain balance is refunded.
- The client uses localStorage key tapco_api_base. If empty, it defaults to current origin (when served by API) or http://localhost:3000.

## Operational warning

- Keep PRIVATE_KEY only in .env and never commit it.
- Keep CLIENT_SECRET only in .env on server and match it with client signature logic.
- Confirm TAPCO_TOKEN_DECIMALS matches token contract decimals.
- If you run multiple worker instances, status-claiming logic prevents duplicate execution for the same pending row.

## Rate Limit

Rate limiting is enabled on withdraw endpoint with two layers:

- IP limiter (express-rate-limit middleware):
   - WITHDRAW_IP_MAX_REQUESTS requests per WITHDRAW_IP_WINDOW_MS
   - message: "عدد كبير من الطلبات من نفس IP، حاول بعد قليل"
- Player limiter (database-based):
   - counts recent records in withdraw_requests for playerId
   - WITHDRAW_PLAYER_MAX_REQUESTS requests per WITHDRAW_PLAYER_WINDOW_MS

When limited, API returns HTTP 429 with JSON like:

{
   "ok": false,
   "code": "RATE_LIMITED",
   "scope": "ip",
   "retryAfterSeconds": 42,
   "retryAt": "2026-04-26T10:20:42.000Z",
   "limit": { "max": 10, "windowMs": 60000 },
   "message": "..."
}

For player-based limits, `scope` is `player` and `limit.currentCount` is included.
