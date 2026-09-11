const fs = require('fs');
const path = require('path');
const { createHmac } = require('crypto');

// Read server .env to get Razorpay secret
const envPath = path.resolve('c:/Users/budhp/Vs Projects/gym-webapp/server/.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const secretMatch = envContent.match(/^RAZORPAY_KEY_SECRET=(.+)$/m);
const RAZORPAY_KEY_SECRET = secretMatch ? secretMatch[1].trim() : '';
if (!RAZORPAY_KEY_SECRET) {
  console.error('Could not read RAZORPAY_KEY_SECRET from server/.env');
  process.exit(1);
}

const baseUrl = 'http://localhost:5004/api';

// Step 1: Demo login
async function demoLogin() {
  const res = await fetch(`${baseUrl}/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'member' })
  });
  const json = await res.json();
  if (!res.ok || !json.data?.token) {
    throw new Error('Demo login failed: ' + JSON.stringify(json));
  }
  return json.data.token;
}

// Step 2: Create order
async function createOrder(token) {
  const res = await fetch(`${baseUrl}/payment/create-order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ amount: 69, notes: { tier: 'vip', billingCycle: 'monthly' } })
  });
  const json = await res.json();
  if (!res.ok || !json.data?.id) {
    throw new Error('Order creation failed: ' + JSON.stringify(json));
  }
  return json.data.id;
}

// Step 3: Verify payment with fabricated payment ID and correct HMAC
async function verifyPayment(token, orderId) {
  const paymentId = `pay_test_${Date.now()}`;
  const payload = `${orderId}|${paymentId}`;
  const signature = createHmac('sha256', RAZORPAY_KEY_SECRET).update(payload).digest('hex');

  const res = await fetch(`${baseUrl}/payment/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      tier: 'vip',
      billing_cycle: 'monthly'
    })
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error('Verification failed: ' + JSON.stringify(json));
  }
  return { json, userTier: json.data?.user?.membership_tier, userName: json.data?.user?.name };
}

async function main() {
  try {
    console.log('🔐 Demo logging in...');
    const token = await demoLogin();
    console.log(`✓ Logged in (token ends ${token.slice(-4)})`);

    console.log('💳 Creating Razorpay order...');
    const orderId = await createOrder(token);
    console.log(`✓ Order created: ${orderId}`);

    console.log('🔐 Verifying payment...');
    const { json, userTier, userName } = await verifyPayment(token, orderId);
    console.log('✓ Verification successful');
    console.log(`   User: ${userName}`);
    console.log(`   New tier: ${userTier} (expected: vip)`);
    console.log(`   Message: ${json.data?.message}`);

    if (userTier === 'vip') {
      console.log('\n🎉 SUCCESS: Membership upgraded to VIP!');
    } else {
      console.log('\n⚠️  WARNING: Tier not upgraded as expected.');
    }
  } catch (err) {
    console.error('❌ ERROR:', err.message);
  }
}

main();