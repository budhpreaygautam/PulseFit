// Test the full Razorpay payment flow: create order -> verify -> membership upgrade
const fs = require('fs');
const path = require('path');
const { createHmac } = require('crypto');

// Read server .env to get Razorpay secret (avoid exposing in CLI)
const envPath = path.resolve('c:/Users/budhp/Vs Projects/gym-webapp/server/.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const secretMatch = envContent.match(/^RAZORPAY_KEY_SECRET=(.+)$/m);
const RAZORPAY_KEY_SECRET = secretMatch ? secretMatch[1].trim() : '';
if (!RAZORPAY_KEY_SECRET) {
  console.error('Could not read RAZORPAY_KEY_SECRET from server/.env');
  process.exit(1);
}

const BASE = 'http://localhost:5004/api';

async function postJSON(endpoint, body, token = null) {
  const response = await fetch(BASE + endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  let data;
  try {
    data = await response.json();
  } catch (e) {
    data = await response.text();
  }

  return { ok: response.ok, status: response.status, data };
}

async function main() {
  // 1. Demo login as member
  const loginResp = await postJSON('/auth/demo-login', { role: 'member' });
  if (!loginResp.ok || !loginResp.data?.token) {
    console.error('Demo login failed:', loginResp);
    return;
  }
  const token = loginResp.data.token;
  console.log(`✓ Demo login successful. Token last 4: ${token.slice(-4)}`);

  // 2. Create Razorpay order for VIP monthly (69 INR)
  const orderResp = await postJSON('/payment/create-order',
    { amount: 69, notes: { tier: 'vip', billingCycle: 'monthly' } },
    token
  );
  if (!orderResp.ok || !orderResp.data?.id) {
    console.error('Order creation failed:', orderResp);
    return;
  }
  const orderId = orderResp.data.id;
  console.log(`✓ Order created: ${orderId}`);

  // 3. Fabricate a payment ID and compute correct signature
  const paymentId = `pay_test_${Date.now()}`;
  const payload = `${orderId}|${paymentId}`;
  const signature = createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(payload)
    .digest('hex');
  console.log(`✓ Computed signature for payload ${payload}`);

  // 4. Call verify endpoint
  const verifyResp = await postJSON('/payment/verify', {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
    tier: 'vip',
    billing_cycle: 'monthly',
  }, token);

  console.log(`Verify response status: ${verifyResp.status}`);
  console.log('Verify response body:', JSON.stringify(verifyResp.data, null, 2));

  if (verifyResp.ok && verifyResp.data?.success) {
    console.log('\n🎉 FLOW SUCCESS: Membership should now be upgraded to VIP');
    const user = verifyResp.data.data?.user;
    if (user) {
      console.log(`   User ${user.name} tier: ${user.membership_tier} (expected: vip)`);
      console.log(`   Expiry: ${user.membership_expiry}`);
    }
  } else {
    console.error('\n❌ FLOW FAILED');
  }
}

main().catch(err => {
  console.error('Unexpected error:', err);
});