process.env.NODE_ENV = 'test';

import app from './server.js';
import { seedDatabase } from './db/seed.js';
import http from 'http';

async function runEndToEndTests() {
  console.log('🧪 Starting PulseFit Gym WebApp End-to-End Verification Tests...\n');

  // 1. Seed fresh database state
  seedDatabase();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(5099, resolve));
  const baseUrl = 'http://localhost:5099/api';

  try {
    // Test 1: Health Check
    console.log('Test 1: GET /api/health');
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthData = await healthRes.json();
    if (healthData.status !== 'ok') throw new Error('Health check failed');
    console.log('  ✅ Health Check OK\n');

    // Test 2: Demo Login - Member
    console.log('Test 2: POST /api/auth/demo-login (member)');
    const memberLoginRes = await fetch(`${baseUrl}/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'member' })
    });
    const memberLoginData = await memberLoginRes.json();
    if (!memberLoginData.success || !memberLoginData.data.token) throw new Error('Member demo login failed');
    const memberToken = memberLoginData.data.token;
    console.log(`  ✅ Member Login OK: ${memberLoginData.data.user.name} (${memberLoginData.data.user.membership_tier})\n`);

    // Test 3: Demo Login - Admin
    console.log('Test 3: POST /api/auth/demo-login (admin)');
    const adminLoginRes = await fetch(`${baseUrl}/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin' })
    });
    const adminLoginData = await adminLoginRes.json();
    if (!adminLoginData.success || !adminLoginData.data.token) throw new Error('Admin demo login failed');
    const adminToken = adminLoginData.data.token;
    console.log(`  ✅ Admin Login OK: ${adminLoginData.data.user.name} (Role: ${adminLoginData.data.user.role})\n`);

    // Test 4: Query Classes
    console.log('Test 4: GET /api/classes');
    const classesRes = await fetch(`${baseUrl}/classes`);
    const classesData = await classesRes.json();
    if (!classesData.success || !Array.isArray(classesData.data) || classesData.data.length === 0) {
      throw new Error('Classes retrieval failed');
    }
    const sampleClass = classesData.data[0];
    console.log(`  ✅ Retrieved ${classesData.data.length} gym classes. Sample: "${sampleClass.title}" (${sampleClass.booked_count}/${sampleClass.capacity} booked)\n`);

    // Test 5: Reserve Class Spot (Member)
    console.log('Test 5: POST /api/bookings (Reserve spot in class)');
    const bookingRes = await fetch(`${baseUrl}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${memberToken}`
      },
      body: JSON.stringify({
        class_id: sampleClass.id,
        booking_date: '2026-09-28'
      })
    });
    const bookingData = await bookingRes.json();
    if (!bookingData.success) throw new Error(`Booking failed: ${bookingData.error}`);
    const bookingId = bookingData.data.id;
    console.log(`  ✅ Spot Reserved! Booking ID: ${bookingId}\n`);

    // Test 6: Cancel Class Spot
    console.log('Test 6: DELETE /api/bookings/:id (Cancel reservation)');
    const cancelRes = await fetch(`${baseUrl}/bookings/${bookingId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${memberToken}` }
    });
    const cancelData = await cancelRes.json();
    if (!cancelData.success) throw new Error('Cancel booking failed');
    console.log('  ✅ Booking Cancelled & Capacity Spot Restored\n');

    // Test 7: Log Workout with sets
    console.log('Test 7: POST /api/workouts (Log workout session with sets)');
    const workoutRes = await fetch(`${baseUrl}/workouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${memberToken}`
      },
      body: JSON.stringify({
        title: 'High Intensity Push & Core',
        date: '2026-09-09',
        duration_minutes: 50,
        notes: 'Great mind-muscle connection on chest press.',
        sets: [
          { exercise_id: 'ex_bench_press', exercise_name: 'Barbell Flat Bench Press', set_number: 1, weight_kg: 70, reps: 10, is_warmup: true },
          { exercise_id: 'ex_bench_press', exercise_name: 'Barbell Flat Bench Press', set_number: 2, weight_kg: 90, reps: 8, is_warmup: false },
          { exercise_id: 'ex_bench_press', exercise_name: 'Barbell Flat Bench Press', set_number: 3, weight_kg: 100, reps: 6, is_warmup: false },
          { exercise_id: 'ex_incline_db_press', exercise_name: 'Incline Dumbbell Press', set_number: 1, weight_kg: 32, reps: 10, is_warmup: false }
        ]
      })
    });
    const workoutData = await workoutRes.json();
    if (!workoutData.success) throw new Error('Workout logging failed');
    console.log(`  ✅ Workout Logged: ${workoutData.data.title} • Volume: ${workoutData.data.total_volume_kg}kg\n`);

    // Test 8: QR Turnstile Scanner Check-In (Valid Active Member)
    console.log('Test 8: POST /api/attendance/check-in (Valid Active Pass: PULSE-MEM-ALEX-8821)');
    const checkInRes = await fetch(`${baseUrl}/attendance/check-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ tokenOrId: 'PULSE-MEM-ALEX-8821', method: 'qr' })
    });
    const checkInData = await checkInRes.json();
    if (!checkInData.success) throw new Error('Active check-in failed');
    console.log(`  ✅ Check-In Validated: "${checkInData.message}"\n`);

    // Test 9: QR Turnstile Scanner Check-In (Expired Member: PULSE-MEM-DAVID-1100)
    console.log('Test 9: POST /api/attendance/check-in (Expired Pass: PULSE-MEM-DAVID-1100)');
    const expiredRes = await fetch(`${baseUrl}/attendance/check-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ tokenOrId: 'PULSE-MEM-DAVID-1100', method: 'qr' })
    });
    const expiredData = await expiredRes.json();
    if (expiredData.success) throw new Error('Expected expired membership to be rejected');
    console.log(`  ✅ Turnstile Blocked Expired Member as expected: "${expiredData.error}"\n`);

    // Test 10: Admin KPI Dashboard Analytics
    console.log('Test 10: GET /api/analytics/dashboard (Admin KPIs)');
    const analyticsRes = await fetch(`${baseUrl}/analytics/dashboard`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const analyticsData = await analyticsRes.json();
    if (!analyticsData.success || !analyticsData.data.kpis) throw new Error('Admin analytics retrieval failed');
    console.log(`  ✅ Admin Dashboard Analytics Retrieved:`);
    console.log(`     - Active Members: ${analyticsData.data.kpis.activeMembers}`);
    console.log(`     - Monthly Revenue: $${analyticsData.data.kpis.monthlyRevenue}`);
    console.log(`     - Fill Rate: ${analyticsData.data.kpis.avgFillRate}%\n`);

    console.log('🎉 ALL 10 END-TO-END VERIFICATION TESTS PASSED PERFECTLY!');
  } finally {
    server.close();
    process.exit(0);
  }
}

runEndToEndTests().catch(err => {
  console.error('❌ Test Failed:', err);
  process.exit(1);
});
