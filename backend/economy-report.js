#!/usr/bin/env node

require('dotenv').config();

const apiBase = String(process.env.TAPCO_API_BASE || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, '');
const adminKey = String(process.env.ECONOMY_ADMIN_KEY || '');
const failOnAlert = process.argv.includes('--fail-on-alert');

async function main() {
  if (!adminKey) {
    throw new Error('ECONOMY_ADMIN_KEY is required');
  }

  const response = await fetch(`${apiBase}/api/admin/economy`, {
    headers: { 'X-TAPCO-Admin-Key': adminKey }
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(`Economy report request failed (${response.status}): ${payload?.code || 'INVALID_RESPONSE'}`);
  }

  console.log(JSON.stringify(payload, null, 2));
  if (payload.alerts.length > 0) {
    console.error(`\nECONOMY ALERTS: ${payload.alerts.join(', ')}`);
    if (failOnAlert) process.exitCode = 2;
  } else {
    console.log('\nEconomy status: no active alerts');
  }
}

main().catch((error) => {
  console.error(`[economy-report] ${error.message}`);
  process.exitCode = 1;
});