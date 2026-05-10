# Anti-Bot Phase 5: Integration Layer — System Binding

**Date:** April 27, 2026 | **Phase:** Integration with Game Systems

## Overview

This phase connects the Anti-Bot system with all game mechanics without breaking existing logic. The integration layer acts as a **protective shield** on top of existing systems using:

1. **Points & Progress Integration**
2. **Referral System Binding**
3. **Wallet & TAPCO Protection** (Server-side)
4. **API Layer Guards**
5. **Logs & Monitoring**
6. **Architectural Principle**: No modifications to core logic, only protective layers added

---

## Part 1: Points & Progress Integration

### Principle
Every point-earning mechanism passes through Anti-Bot penalty layer before confirmation.

### Affected Systems
- Manual Tap
- AutoTap
- Passive Income
- Boss Battles
- Challenges
- Events
- Daily Missions
- Referral Rewards

### Server Functions

#### `applyPointPenalty(basePoints, botTier)`
Returns: `{ basePoints, penaltyPercent, finalPoints, tier }`

| Tier | Penalty | Multiplier |
|------|---------|-----------|
| A | 0% | 1.0x |
| B | 10% | 0.9x |
| C | 40% | 0.6x |

```javascript
// Example
const result = applyPointPenalty(1000, 'C');
// {
//   basePoints: 1000,
//   penaltyPercent: 40,
//   finalPoints: 600,
//   tier: 'C',
//   penaltyApplied: true
// }
```

### Client Functions

#### `verifyPointsWithServer(basePoints, operation)`
Calls `/api/verify-points` endpoint.

**Returns:**
```javascript
{
  allowed: true,
  finalPoints: 600,
  penalty: 40,
  tier: 'C'
}
```

**Fallback (Server Unavailable):**
Uses local `getLocalBotTier()` to calculate penalty.

### Implementation Pattern

**DO NOT modify existing `addPoints()` function.**

Instead, use verification layer at call sites:

```javascript
// Option 1: Pre-check server (for critical operations)
const verification = await verifyPointsWithServer(1000, 'boss_reward');
if (verification.allowed) {
  addPoints(verification.finalPoints); // Already penalized
}

// Option 2: Passive check (no server call)
const tier = getLocalBotTier();
const multiplier = tier === 'C' ? 0.6 : (tier === 'B' ? 0.9 : 1.0);
const finalReward = Math.floor(baseReward * multiplier);
addPoints(finalReward);
```

---

## Part 2: Energy & Cooldown Penalties

### Server Function

#### `applyEnergyPenalty(baseCost, botTier)`
Returns: `{ baseCost, bonusPercent, finalCost, tier }`

| Tier | Bonus | Multiplier |
|------|-------|-----------|
| A | 0% | 1.0x |
| B | 0% | 1.0x |
| C | +15% | 1.15x |

Bots pay more energy for suspicious activity.

### Client Function

#### `verifyEnergyWithServer(baseCost, operation)`
Calls `/api/verify-energy` endpoint.

**Example:**
```javascript
// Boss fight costs 50 energy normally
const energyCheck = await verifyEnergyWithServer(50, 'boss_attack');
// If tier C: returns finalCost = 58 (50 * 1.15)
```

---

## Part 3: Referral System Integration

### Principle
Referral rewards are blocked for suspicious accounts.

### Server Function

#### `canPlayerActivateReferral(botTier, banStatus)`
Returns: `{ allowed, reason }`

**Blocking Rules:**
- **Shadow Ban** → Blocked
- **Smart Ban** → Blocked
- **Tier C** → Blocked (under monitoring)

### Client Function

#### `verifyReferralActivation()`
Calls `/api/verify-referral` endpoint.

**Response:**
```javascript
{
  allowed: false,
  reason: "حسابك تحت المراقبة - لا يمكن تفعيل الإحالات"
}
```

### Implementation

```javascript
// Before activating referral
const refCheck = await verifyReferralActivation();
if (!refCheck.allowed) {
  showError(refCheck.reason);
  return;
}

// Proceed with activation
activateReferralCode(refCode);
```

**Key:** Referral system logic unchanged. Only permission gate added.

---

## Part 4: Wallet & TAPCO Operations (Server-Side)

### Principle
Wallet operations have 3 response modes based on ban status.

### Server Function

#### `canPlayerPerformWalletOp(botTier, banStatus, operation)`
Returns: `{ allowed, silent, reason, requiresLogging }`

**Response Modes:**

| Ban Status | Allowed | Silent | Behavior |
|-----------|---------|--------|----------|
| None (A/B) | ✅ true | false | Execute normally |
| Soft Flag | ✅ true | false | Execute + Log |
| Shadow Ban | ✅ true | **true** | Pretend success, don't execute |
| Smart Ban | ❌ false | false | Reject explicitly |

### Shadow Ban Deception

When `silent === true`:

```javascript
// Wallet request from shadow-banned account
POST /api/withdraw-tapco

// Server response:
{
  "ok": true,
  "requestId": 999999,
  "status": "pending",
  "message": "تم تسجيل طلب السحب بنجاح",
  "_shadowBanned": true  // For logging only
}

// But in database:
// - No actual debit from balance
// - No blockchain transaction sent
// - Withdrawal request marked internal-only
```

**Result:** Bot thinks withdrawal succeeded. Money never leaves system.

### Client Function

#### `verifyWalletOperation(operation)`
Calls `/api/verify-wallet-op` endpoint.

**Example:**
```javascript
const walletCheck = await verifyWalletOperation('withdraw');
if (!walletCheck.allowed) {
  if (!walletCheck.silent) {
    // Show error to user
    showError(walletCheck.reason);
  } else {
    // Pretend success internally
    showSuccess('تم معالجة الطلب');
  }
  return;
}

// Proceed normally
processWithdrawal();
```

---

## Part 5: API Layer Guards

### Protected Endpoints

| Endpoint | Operation | Guard |
|----------|-----------|-------|
| POST `/api/tap/submit` | Submit tap | Verify points penalty |
| POST `/api/boss/reward` | Boss completion | Verify points + energy |
| POST `/api/challenge/complete` | Challenge claim | Verify points penalty |
| POST `/api/referral/activate` | Activate code | Verify referral allowed |
| POST `/api/wallet/withdraw` | Request withdrawal | Verify wallet op (shadow ban) |
| POST `/api/tapco/transfer` | TAPCO transfer | Verify wallet op |
| GET `/api/player-balance` | Get balance | Return 0 for shadow ban |

### New Integration Endpoints

#### POST `/api/verify-points`
**Request:**
```json
{
  "playerId": "player123",
  "basePoints": 1000,
  "operation": "boss_reward"
}
```

**Response:**
```json
{
  "ok": true,
  "basePoints": 1000,
  "finalPoints": 600,
  "penaltyPercent": 40,
  "tier": "C",
  "botState": {
    "tier": "C",
    "banStatus": "soft_flag"
  }
}
```

#### POST `/api/verify-energy`
Similar to `/api/verify-points`, but for energy costs.

#### POST `/api/verify-referral`
Check if referral activation is allowed.

**Response:**
```json
{
  "ok": true,
  "canActivate": true,
  "message": "OK",
  "botState": { "tier": "A", "banStatus": "none" }
}
```

**Or (Blocked):**
```json
{
  "ok": false,
  "canActivate": false,
  "message": "حسابك تحت المراقبة - لا يمكن تفعيل الإحالات"
}
```

#### POST `/api/verify-wallet-op`
**Request:**
```json
{
  "playerId": "player123",
  "operation": "withdraw"
}
```

**Response (Allowed, Normal):**
```json
{
  "ok": true,
  "allowed": true,
  "silent": false,
  "message": "OK",
  "botState": { "tier": "A", "banStatus": "none" }
}
```

**Response (Allowed, Shadow):**
```json
{
  "ok": true,
  "allowed": true,
  "silent": true,
  "message": "OK (shadow)",
  "botState": { "tier": "B", "banStatus": "shadow_ban" }
}
```

**Response (Blocked):**
```json
{
  "ok": false,
  "allowed": false,
  "silent": false,
  "message": "حسابك محظور - لا يمكن إجراء هذه العملية",
  "botState": { "tier": "C", "banStatus": "smart_ban" }
}
```

#### GET `/api/player-bot-state`
Get current bot state for display/logic.

**Query:** `?playerId=player123`

**Response:**
```json
{
  "ok": true,
  "playerId": "player123",
  "serverBotScore": 14,
  "botTier": "B",
  "banStatus": "soft_flag",
  "reportCount": 5
}
```

#### GET `/api/anti-bot-logs`
Monitoring endpoint (protected in production).

**Query:** `?playerId=player123&limit=100`

**Response:**
```json
{
  "ok": true,
  "count": 3,
  "logs": [
    {
      "timestamp": 1714230000,
      "playerId": "player123",
      "action": "points-penalty",
      "details": {
        "operation": "boss_reward",
        "basePoints": 1000,
        "finalPoints": 600,
        "penaltyPercent": 40,
        "tier": "C"
      },
      "isoTime": "2026-04-27T10:00:00.000Z"
    }
  ]
}
```

---

## Part 6: Logs & Monitoring

### Server Logging

Every Anti-Bot action is logged:

```javascript
logAntiBotAction(playerId, action, details)
```

### Logged Events

| Event | Details |
|-------|---------|
| `points-penalty` | basePoints, finalPoints, operation, tier |
| `energy-penalty` | baseCost, finalCost, operation, tier |
| `referral-check` | allowed, tier, banStatus |
| `wallet-op-check` | operation, allowed, silent, tier |
| `tier-transition` | oldTier, newTier, reason |
| `ban-status-change` | oldStatus, newStatus, evidenceScore |

### Viewing Logs

**Get player logs:**
```bash
GET /api/anti-bot-logs?playerId=player123&limit=50
```

**Get all recent logs:**
```bash
GET /api/anti-bot-logs?limit=1000
```

---

## Part 7: Client-Side Integration Functions

### Core Integration Functions

#### `fetchServerBotState()`
Syncs with server every 30 seconds.

Updates `serverBotState` object:
```javascript
{
  tier: 'B',
  banStatus: 'soft_flag',
  score: 10
}
```

#### `getLocalBotTier()`
Returns tier based on local `behavioralSuspicionScore`.

#### `updatePenaltyStatusUI()`
Updates penalty status element with current tier/ban status.

**Display Logic:**
- Smart Ban → "🚫 حسابك محظور"
- Shadow Ban → "🔒 حظر الظل"
- Tier C → "🔴 الفئة C | النقاط -40%"
- Tier B → "⚠️ الفئة B | النقاط -10%"
- Tier A → "✅ نشاط طبيعي"

#### `verifyPointsWithServer(basePoints, operation)`
Async call to verify points penalty.

Fallback to local tier if server unavailable.

#### `verifyEnergyWithServer(baseCost, operation)`
Async call to verify energy bonus for tier C.

#### `verifyReferralActivation()`
Check if referral can be activated.

Fallback denies if local tier C.

#### `verifyWalletOperation(operation)`
Verify wallet/TAPCO operations.

Fallback checks local shadow ban state.

---

## Part 8: Architectural Principles

### ✅ What This Layer Does

1. **Protective Shield** - Adds guards without changing core logic
2. **Transparent Penalties** - Bots receive fewer rewards transparently
3. **Silent Blocking** - Shadow ban deceives botters
4. **Persistent Logging** - Every action tracked for analysis
5. **Graceful Degradation** - Works offline with local fallbacks

### ❌ What This Layer Does NOT Do

1. **Change Referral Logic** - System structure unchanged
2. **Modify Wallet Code** - Only adds permission gates
3. **Alter Point Calculations** - Only applies multipliers
4. **Break Existing Systems** - Fully backward compatible

### Design Principle

> **Anti-Bot is a Layer, Not a System**
>
> The core game systems (Tap, Referral, Wallet, etc.) remain completely independent.
> Anti-Bot adds protective logic on top using:
> - Penalty multipliers (0.6x, 0.9x)
> - Permission gates (allowed/not allowed)
> - Silent mode (pretend success)
> - Logging (track everything)
>
> Each layer can be disabled/modified without breaking others.

---

## Implementation Checklist

### Server Side
- [x] `applyPointPenalty()` function
- [x] `applyEnergyPenalty()` function
- [x] `canPlayerActivateReferral()` function
- [x] `canPlayerPerformWalletOp()` function
- [x] `logAntiBotAction()` function
- [x] GET `/api/player-bot-state` endpoint
- [x] POST `/api/verify-points` endpoint
- [x] POST `/api/verify-energy` endpoint
- [x] POST `/api/verify-referral` endpoint
- [x] POST `/api/verify-wallet-op` endpoint
- [x] GET `/api/anti-bot-logs` endpoint
- [x] Ban check in `/api/withdraw-tapco`
- [x] Updated `/api/player-balance` for shadow ban

### Client Side
- [x] `serverBotState` tracking
- [x] `fetchServerBotState()` function
- [x] `updatePenaltyStatusUI()` function
- [x] `verifyPointsWithServer()` function
- [x] `verifyEnergyWithServer()` function
- [x] `verifyReferralActivation()` function
- [x] `verifyWalletOperation()` function
- [x] Game loop integration (every 10 ticks)
- [x] Penalty status UI element

---

## Usage Examples

### Example 1: Claiming Boss Reward

```javascript
// Player defeats boss, claims 5000 points
async function claimBossReward() {
  const baseReward = 5000;
  
  // Verify with server
  const verification = await verifyPointsWithServer(baseReward, 'boss_reward');
  
  if (!verification.allowed) {
    showError('العملية غير مسموحة');
    return;
  }
  
  // Add the verified (penalized) amount
  score += verification.finalPoints; // If tier C: adds 3000 instead of 5000
  showBigMoment('Boss Defeated', `Reward: +${verification.finalPoints}`);
}
```

### Example 2: Activating Referral

```javascript
async function activateReferralCode(code) {
  // Check if allowed
  const refCheck = await verifyReferralActivation();
  
  if (!refCheck.allowed) {
    showError(refCheck.reason);
    return;
  }
  
  // Proceed normally (logic unchanged)
  myReferralCode = code;
  savePlayerData();
  showSuccess('تم تفعيل الكود بنجاح');
}
```

### Example 3: Requesting Withdrawal

```javascript
async function requestWithdrawal(amount) {
  const walletCheck = await verifyWalletOperation('withdraw');
  
  if (!walletCheck.allowed) {
    // Explicit rejection
    if (!walletCheck.silent) {
      showError(walletCheck.reason);
    } else {
      // Shadow ban: pretend success
      showSuccess('تم معالجة الطلب');
      // But server never processes it
    }
    return;
  }
  
  // Proceed with normal withdrawal flow
  const result = await submitWithdrawal(amount);
  // ...
}
```

---

## Monitoring & Debugging

### Check Player State
```bash
GET /api/player-bot-state?playerId=player123
```

### View Recent Actions
```bash
GET /api/anti-bot-logs?playerId=player123&limit=50
```

### Test Point Penalty
```bash
POST /api/verify-points
{
  "playerId": "player123",
  "basePoints": 1000,
  "operation": "test"
}
```

### Test Referral Block
```bash
POST /api/verify-referral
{
  "playerId": "player123"
}
```

---

## Performance Notes

- `/api/player-bot-state` called every 30 seconds (throttled)
- `/api/verify-*` called on-demand, can be batched
- Fallback to local tier if server unreachable
- Logs kept in memory (max 10,000 entries)

---

**Integration Layer Complete** ✨
All systems connected. Core logic preserved. Anti-Bot enforced.
