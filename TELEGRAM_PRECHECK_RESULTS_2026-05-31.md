# TAPCO Telegram Precheck Results (2026-05-31)

## Scope
- Issue 1: progress persistence between Telegram sessions (score/level/upgrades).
- Issue 2: energy bar stutter and tap responsiveness.

## Code Included In This Precheck
- backend canonical identity fix in API state/progress endpoints.
- fallback Telegram identity extraction in canonical resolver (works even when beta gate is disabled).
- energy bar render optimization in client (scaleX transform instead of width updates).

## Automated Local Smoke Tests
Environment:
- Local backend on http://localhost:4000
- MongoDB connected
- Test Telegram user id: 777888999
- Intentionally mismatched client playerId used: LOCAL_TEST_PLAYER

### Test A: Canonical identity on progress GET
Request:
- GET /api/player-progress?playerId=LOCAL_TEST_PLAYER&telegramUserId=777888999

Result:
- PASS
- Response playerId = TG_777888999

### Test B: Progress save+load with Telegram identity
Actions:
1. POST /api/player-progress with playerId=LOCAL_TEST_PLAYER and telegramUserId=777888999
2. GET /api/player-progress with same query

Result:
- PASS
- progressPost = TG_777888999
- progressGet = TG_777888999
- score and level persisted and returned as expected

### Test C: Player state save+load canonicalization
Actions:
1. POST /api/player-state with playerId=LOCAL_TEST_PLAYER and telegramUserId=777888999
2. GET /api/player-state with same query

Result:
- PASS
- playerStateId = TG_777888999
- saved sample payload restored successfully

### Test D: Game state save+load canonicalization
Actions:
1. POST /api/game-state with playerId=LOCAL_TEST_PLAYER and telegramUserId=777888999
2. GET /api/game-state with same query

Result:
- PASS
- gameStateId = TG_777888999
- saved sample payload restored successfully

## Manual Telegram Checklist (Ready To Run)
Run in Telegram WebApp with one test account:

1. Open game and note current score/level/one upgrade level.
2. Tap rapidly for 10-15 seconds and watch energy bar:
- Expected: smooth decrement without visible jump/cut frames.
3. Buy one upgrade (any low-cost upgrade) and wait 3-5 seconds.
4. Close Telegram app fully (force close), then reopen same bot/game.
5. Verify restore:
- score is restored
- level is restored
- purchased upgrade level is restored
6. Repeat one more cycle with additional taps + one more upgrade.
7. Optional stress pass:
- rapid tap for 20-30 seconds
- expected: TAP response remains immediate and energy bar remains visually continuous.

## Verdict Before Telegram Live Check
- Backend persistence identity mapping: validated locally (PASS).
- Client energy render path: optimized in code and ready for Telegram manual validation.

## Notes
- During precheck, server listener was intentionally stopped after tests to avoid leaving background processes running.
