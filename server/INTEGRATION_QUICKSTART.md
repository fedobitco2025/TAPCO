# Anti-Bot Integration Layer - Quick Start Guide

**For Developers:** How to integrate Anti-Bot checks into game mechanics

---

## 1️⃣ Adding Point Penalties

When granting points to any system, use `verifyPointsWithServer()`:

### Before (Original)
```javascript
function claimBossReward() {
  const reward = 5000;
  score += reward;
  savePlayerData();
}
```

### After (With Anti-Bot)
```javascript
async function claimBossReward() {
  const reward = 5000;
  
  // Verify with Anti-Bot
  const result = await verifyPointsWithServer(reward, 'boss_reward');
  
  // Add penalized points
  score += result.finalPoints;
  savePlayerData();
}
```

**That's it!** Tier C players automatically get 40% less.

---

## 2️⃣ Adding Energy Penalties

Tier C players pay more energy:

```javascript
async function attackBoss() {
  const energyCost = 50;
  
  // Verify energy cost with Anti-Bot
  const energyCheck = await verifyEnergyWithServer(energyCost, 'boss_attack');
  
  if (currentEnergy < energyCheck.finalCost) {
    showError('Not enough energy');
    return;
  }
  
  currentEnergy -= energyCheck.finalCost;
  executeBossAttack();
}
```

Tier C: 50 → 58 (15% increase)

---

## 3️⃣ Blocking Referral Activation

Tier C and banned accounts can't activate referrals:

```javascript
async function activateReferralCode(code) {
  // Check if referral activation is allowed
  const refCheck = await verifyReferralActivation();
  
  if (!refCheck.allowed) {
    showError(refCheck.reason); // e.g., "حسابك تحت المراقبة"
    return;
  }
  
  // Proceed normally
  myReferralCode = code;
  savePlayerData();
}
```

---

## 4️⃣ Blocking Wallet Operations (Silent Mode)

**Shadow-banned accounts see success, but money never leaves:**

```javascript
async function submitWithdrawalRequest(amount) {
  // Verify wallet operation
  const walletCheck = await verifyWalletOperation('withdraw');
  
  if (!walletCheck.allowed) {
    if (!walletCheck.silent) {
      // Explicit rejection
      showError(walletCheck.reason);
    } else {
      // Shadow ban: pretend success
      showSuccess('تم معالجة الطلب');
      // Server logs it but never executes
    }
    return;
  }
  
  // Normal withdrawal (tier A/B or soft flag)
  submitWithdrawal(amount);
}
```

---

## 5️⃣ Custom Integration Points

### Add penalty to any reward system:

```javascript
async function grantSystemReward(baseReward, systemName) {
  const verification = await verifyPointsWithServer(baseReward, systemName);
  
  if (!verification.allowed) return;
  
  score += verification.finalPoints;
  console.log(`${systemName}: +${verification.finalPoints} (penalty: ${verification.penalty}%)`);
}

// Usage
grantSystemReward(1000, 'daily_mission');
grantSystemReward(500, 'event_reward');
grantSystemReward(250, 'challenge_bonus');
```

---

## 6️⃣ Checking Ban Status in UI

Display current status in penalty indicator:

```javascript
// Game loop automatically calls this every 10 ticks
updatePenaltyStatusUI();

// Manual update if needed:
function showBotStatus() {
  const status = serverBotState; // { tier, banStatus, score }
  
  if (status.banStatus === 'smart_ban') {
    showAlert('🚫 Your account is banned');
  } else if (status.tier === 'C') {
    showWarning(`⚠️ Tier C - Rewards at 60% of normal`);
  } else if (status.tier === 'B') {
    showWarning(`⚠️ Tier B - Rewards at 90% of normal`);
  }
}
```

---

## 7️⃣ Server-Side Integration (Node.js)

If you add new endpoints, integrate Anti-Bot:

```javascript
app.post('/api/new-reward', (req, res) => {
  try {
    const playerId = req.body.playerId;
    const baseReward = toSafeInt(req.body.reward);
    
    // Get bot state
    const botState = getServerBotState(playerId);
    
    // Apply penalty
    const penaltyResult = applyPointPenalty(baseReward, botState.botTier);
    
    // Log action
    logAntiBotAction(playerId, 'new-reward', {
      baseReward,
      finalReward: penaltyResult.finalPoints,
      tier: botState.botTier
    });
    
    // Shadow ban: silent rejection
    if (botState.banStatus === 'shadow_ban') {
      return res.json({
        ok: true,
        reward: 0, // Pretend success but give 0
        message: 'Reward processed'
      });
    }
    
    // Smart ban: explicit rejection
    if (botState.banStatus === 'smart_ban') {
      return res.status(403).json({
        ok: false,
        message: 'Account banned'
      });
    }
    
    // Normal: return penalized reward
    return res.json({
      ok: true,
      reward: penaltyResult.finalPoints,
      message: 'OK'
    });
    
  } catch (error) {
    return res.status(500).json({ ok: false });
  }
});
```

---

## ✅ Best Practices

### DO ✅
- ✅ Use `verifyPointsWithServer()` for all rewards
- ✅ Respect shadow ban silent mode
- ✅ Fallback to local tier if server unavailable
- ✅ Log sensitive operations
- ✅ Test both tier A and tier C accounts

### DON'T ❌
- ❌ Modify referral system logic
- ❌ Modify wallet system logic
- ❌ Skip verification for quick gains
- ❌ Expose shadow ban status to client
- ❌ Cache bot state longer than 30s

---

## 🧪 Testing Checklist

### Tier A (Normal)
- [ ] Tap rewards = base × 1.0
- [ ] Can activate referral
- [ ] Can withdraw TAPCO
- [ ] Energy cost = normal

### Tier B (Monitoring)
- [ ] Tap rewards = base × 0.9
- [ ] Can activate referral
- [ ] Can withdraw TAPCO
- [ ] Energy cost = normal

### Tier C (High Risk)
- [ ] Tap rewards = base × 0.6
- [ ] Cannot activate referral
- [ ] Can withdraw (but not shadow banned)
- [ ] Energy cost = normal × 1.15

### Shadow Ban
- [ ] Client sees success
- [ ] Server logs operation
- [ ] No actual points deducted
- [ ] No blockchain transaction

### Smart Ban
- [ ] Explicit rejection
- [ ] Cannot do any operation
- [ ] Account effectively frozen

---

## 🔧 Fallback Behavior

If server is unreachable:

```javascript
// Client still works with local tier
const localTier = getLocalBotTier(); // Based on suspicionScore

// Apply local penalty
const multiplier = localTier === 'C' ? 0.6 : (localTier === 'B' ? 0.9 : 1.0);
const finalReward = Math.floor(baseReward * multiplier);
```

---

## 📊 Monitoring

View Anti-Bot activity:

```bash
# Recent logs for player
curl "http://localhost:3000/api/anti-bot-logs?playerId=player123&limit=50"

# Check player state
curl "http://localhost:3000/api/player-bot-state?playerId=player123"

# Test point penalty
curl -X POST "http://localhost:3000/api/verify-points" \
  -H "Content-Type: application/json" \
  -d '{
    "playerId": "player123",
    "basePoints": 1000,
    "operation": "test"
  }'
```

---

**Everything is non-breaking. Core systems unchanged.** ✨
