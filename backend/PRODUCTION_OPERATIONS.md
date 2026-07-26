# TAPCO Production Operations

## Render Services

The root `render.yaml` defines three services:

- `tapco-backend`: public API and `/admin/` dashboard.
- `tapco-withdrawal-worker`: continuous withdrawal processor.
- `tapco-economy-monitor`: operational check every 10 minutes.

Background workers and cron jobs require paid Render compute. Do not replace the
worker with a cron job: withdrawals require continuous reconciliation.

## Initial Blueprint Setup

1. In Render, create or sync a Blueprint from the repository `main` branch.
2. Enter the prompted secret values for `MONGO_URI`, `REQUEST_SECRET`, `RPC_URL`,
   `PRIVATE_KEY`, `CONTRACT_ADDRESS`, and `CORS_ORIGINS`.
3. Keep the generated `ECONOMY_ADMIN_KEY` private. Copy it once into a password
   manager for dashboard access.
4. Confirm all three services use the same production environment and region.
5. Enable Render failure notifications for the worker and economy monitor.

Never copy `backend/.env` into Render or commit it to Git.

## Deployment Gate

Before enabling withdrawals, verify:

1. `GET https://tapco-backend.onrender.com/api/health` returns HTTP 200.
2. `components.database` is `healthy`.
3. `components.worker.status` becomes `healthy` within 90 seconds.
4. `/admin/` accepts the production admin key.
5. The dashboard shows `API متصل · عامل السحب سليم`.
6. The distribution wallet has sufficient BNB gas and TAPCO coverage.
7. A small Testnet withdrawal completes exactly once.

If the worker is not healthy, set `WITHDRAWALS_ENABLED=false` on the API until
the worker is restored.

## Alert Meanings

- `WITHDRAWAL_WORKER_NOT_STARTED`: no worker heartbeat exists.
- `WITHDRAWAL_WORKER_STALE`: heartbeat is older than the configured threshold.
- `WITHDRAWAL_WORKER_ERROR`: the latest worker cycle failed.
- `LOW_TAPCO_COVERAGE`: distribution balance does not cover liabilities safely.
- `HIGH_WITHDRAW_FAILURES_24H`: failed withdrawals crossed the alert threshold.
- `SHARED_WITHDRAW_WALLETS`: multiple players use the same withdrawal wallet.

The economy monitor exits with code `2` when alerts are active. Render records
the run as failed and can send a notification through the workspace settings.