# TAPCO Telegram Launch Runbook

This runbook is the operational reference for launching TAPCO safely in Telegram first, then scaling to mobile.

## 1) Launch Principle

- Phase 1 (first 3 days): Rewarded ads only, no interstitials.
- Phase 2 (days 4-7): Interstitial rollout to 10% of users.
- Phase 3 (days 8-14): Interstitial rollout to 20% only if KPIs are healthy.
- Any KPI breach: apply kill switch immediately.

## 2) Runtime Controls (No Code Deployment)

Ad runtime overrides are read from localStorage key `tapco_ads_runtime_overrides`.

Example payload:

```json
{
  "enabled": true,
  "killAllAds": false,
  "killInterstitial": true,
  "killRewarded": false,
  "killRewardedEnergy": false,
  "killRewardedPointsBoost": false,
  "killRewardedDailyChest": false,
  "interstitialPercent": 0,
  "rewardedPercent": 100
}
```

Quick presets from browser console:

```javascript
// Phase 1: Rewarded only (safe start)
localStorage.setItem('tapco_ads_runtime_overrides', JSON.stringify({
  enabled: true,
  killAllAds: false,
  killInterstitial: true,
  killRewarded: false,
  interstitialPercent: 0,
  rewardedPercent: 100
}));
```

```javascript
// Phase 2: Gradual interstitial rollout to 10%
localStorage.setItem('tapco_ads_runtime_overrides', JSON.stringify({
  enabled: true,
  killAllAds: false,
  killInterstitial: false,
  killRewarded: false,
  interstitialPercent: 10,
  rewardedPercent: 100
}));
```

```javascript
// Emergency: stop all ads now
localStorage.setItem('tapco_ads_runtime_overrides', JSON.stringify({
  enabled: false,
  killAllAds: true
}));
```

```javascript
// Clear overrides and return to code defaults
localStorage.removeItem('tapco_ads_runtime_overrides');
```

## 3) KPI Guardrails

- D1 retention drop > 3% from baseline: rollback one ad phase.
- Post-ad churn > 12%: disable interstitial immediately.
- Rewarded failure rate > 2%: disable the failing rewarded type.
- Severe abuse spike: disable rewarded points + daily chest, keep energy only.

## 4) 14-Day Daily Plan

### Day 1
- Freeze feature scope.
- Verify no console errors in Telegram WebView.
- Enable Phase 1 preset (rewarded only).

### Day 2
- UX polish pass for first 60 seconds.
- Confirm all modal interactions are readable on small screens.

### Day 3
- Validate rewarded limits/cooldowns manually with 2-3 test accounts.
- Confirm anti-bot severe mode blocks risky rewarded paths.

### Day 4
- Enable Phase 2 preset (10% interstitial rollout).
- Monitor first 6 hours closely.

### Day 5
- Compare cohort metrics (exposed vs non-exposed users).
- Keep or rollback interstitial based on churn threshold.

### Day 6
- Fix top 3 UX pain points from feedback.
- Re-run manual ad flow tests.

### Day 7
- Weekly checkpoint decision:
  - If stable: continue to Day 8 plan.
  - If unstable: return to rewarded-only mode.

### Day 8
- Raise interstitial rollout to 20% only if KPIs are healthy.

### Day 9
- Run Rewarded A/B (higher reward vs lower cooldown).

### Day 10
- Analyze reward economy impact (inflation risk).

### Day 11
- Security review for ad-claim abuse patterns.

### Day 12
- Harden fraud rules and tune cooldowns if needed.

### Day 13
- Prepare Android WebView wrapper backlog from real Telegram learnings.

### Day 14
- Go/No-Go review for broader Telegram rollout + mobile preparation.

## 5) Incident Response (Production Safety)

Priority P0 (immediate):
- Trigger: crash loops, broken progression, ad spam, reward duplication.
- Action in first 5 minutes:
  - Set `killAllAds=true`.
  - Set `enabled=false` if needed.
  - Pause risky rewarded types individually.

Priority P1:
- Trigger: high churn after ads, UX regressions, cooldown bypass reports.
- Action:
  - Disable interstitial.
  - Keep rewarded energy only.
  - Re-evaluate in 12 hours.

## 6) Non-Negotiables

- Do not increase interstitial rollout without KPI check.
- Do not run rewarded points/daily chest when severe monitoring is active.
- Keep all ad controls reversible via runtime overrides.
- Keep a rollback note for each change.
