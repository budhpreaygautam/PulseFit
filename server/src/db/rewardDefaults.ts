import { Gift, GiftLevel, GiftSize, RewardSettings } from '../types/index.js';

// The rewards a gym starts with, in production and demo alike; admins edit all of it. Ids are fixed
// so milestones and joining bundles can name gifts. Items start with no stock (the gym enters its
// real counts); services are unlimited.

const SIZES: GiftSize[] = ['S', 'M', 'L', 'XL', 'XXL'];

type GiftSeed = [id: string, name: string, image: string, level: GiftLevel, points_cost: number, description: string, kind?: 'apparel' | 'service'];

const GIFTS: GiftSeed[] = [
  ['gift_sticker_pack', 'Sticker pack', '🏷️', 'small', 150, 'A sheet of PulseFit stickers for your bottle or laptop.'],
  ['gift_keychain', 'Keychain', '🔑', 'small', 180, 'A metal PulseFit dumbbell keychain.'],
  ['gift_sweatband', 'Sweatband', '💦', 'small', 200, 'A terry wristband to keep your grip dry.'],
  ['gift_skipping_rope', 'Skipping rope', '🪢', 'small', 250, 'An adjustable speed rope for warm-ups.'],
  ['gift_sample_pack', 'Supplement sample pack', '🧪', 'small', 220, 'Single-serve samples of whey, pre-workout and electrolytes.'],
  ['gift_mug', 'Coffee mug', '☕', 'medium', 300, 'A PulseFit ceramic mug for the morning coffee.'],
  ['gift_water_bottle', 'Water bottle', '💧', 'medium', 350, 'A 750 ml steel bottle that keeps water cold.'],
  ['gift_shaker', 'Shaker', '🥤', 'medium', 350, 'A leak-proof protein shaker with a mixing ball.'],
  ['gift_towel', 'Gym towel', '🧺', 'medium', 400, 'A quick-dry microfibre towel for the bench.'],
  ['gift_cap', 'Cap', '🧢', 'medium', 450, 'A PulseFit cap, one size fits all.'],
  ['gift_resistance_bands', 'Resistance bands', '➰', 'medium', 450, 'A set of three bands for warm-ups and travel.'],
  ['gift_gloves', 'Gym gloves', '🧤', 'medium', 500, 'Padded lifting gloves with wrist support.'],
  ['gift_tshirt', 'PulseFit T-shirt', '👕', 'big', 800, 'A breathable training tee with the PulseFit logo.', 'apparel'],
  ['gift_lifting_straps', 'Lifting straps', '🏋️', 'big', 700, 'Cotton straps for heavy pulls.'],
  ['gift_wrist_wraps', 'Wrist wraps', '🩹', 'big', 750, 'Stiff wraps for pressing days.'],
  ['gift_knee_sleeves', 'Knee sleeves', '🦵', 'big', 1200, 'A pair of 7 mm neoprene sleeves for squats.'],
  ['gift_yoga_mat', 'Yoga mat', '🧘', 'big', 1000, 'A 6 mm non-slip mat for stretching and floor work.'],
  ['gift_tank_top', 'Tank top', '🎽', 'big', 750, 'A light PulseFit tank for hot cardio days.', 'apparel'],
  ['gift_hoodie', 'PulseFit hoodie', '🧥', 'premium', 2000, 'A heavyweight hoodie for the walk home.', 'apparel'],
  ['gift_duffel_bag', 'Gym duffel bag', '👜', 'premium', 2200, 'A roomy duffel with a shoe compartment.'],
  ['gift_foam_roller', 'Foam roller', '🌀', 'premium', 1500, 'A firm roller for recovery days.'],
  ['gift_pt_session', 'Free personal-training session', '💪', 'premium', 2500, 'One hour with a PulseFit coach.', 'service'],
  ['gift_free_week', 'Free week of membership', '📅', 'premium', 3000, 'Seven extra days added to your membership.', 'service'],
  ['gift_guest_pass', 'Guest pass for a friend', '🎟️', 'premium', 1500, 'Bring a friend for one day of training.', 'service']
];

export function defaultGifts(createdAt = new Date().toISOString()): Gift[] {
  return GIFTS.map(([id, name, image, level, points_cost, description, kind]) => ({
    id,
    name,
    description,
    image,
    level,
    points_cost,
    stock: kind === 'service' || kind === 'apparel' ? null : 0,
    ...(kind === 'apparel' ? { sizes: [...SIZES], stock_by_size: Object.fromEntries(SIZES.map(s => [s, 0])) } : {}),
    kind: kind === 'service' ? 'service' : 'item',
    active: true,
    created_at: createdAt
  }));
}

export function defaultRewardSettings(): RewardSettings {
  return {
    points_per_checkin: 10,
    points_per_workout: 5,
    points_per_referral: 200,
    welcome_points_for_referred: 50,
    milestones: [
      { id: 'ms_visits_10', type: 'visits', threshold: 10, gift_id: 'gift_keychain' },
      { id: 'ms_streak_30', type: 'streak', threshold: 30, gift_id: 'gift_shaker' },
      { id: 'ms_visits_100', type: 'visits', threshold: 100, gift_id: 'gift_lifting_straps' },
      { id: 'ms_visits_250', type: 'visits', threshold: 250, gift_id: 'gift_hoodie' }
    ],
    joining_gifts: [
      { tier: 'basic', billing_cycle: 'annual', gift_ids: ['gift_tshirt', 'gift_shaker'], once_per_member: false },
      { tier: 'pro', billing_cycle: 'annual', gift_ids: ['gift_tshirt', 'gift_shaker'], once_per_member: false },
      { tier: 'vip', billing_cycle: 'annual', gift_ids: ['gift_hoodie', 'gift_shaker', 'gift_water_bottle'], once_per_member: false },
      // A sample pack once per member, so twelve monthly renewals do not give twelve packs.
      { tier: 'basic', billing_cycle: 'monthly', gift_ids: ['gift_sample_pack'], once_per_member: true },
      { tier: 'pro', billing_cycle: 'monthly', gift_ids: ['gift_sample_pack'], once_per_member: true },
      { tier: 'vip', billing_cycle: 'monthly', gift_ids: ['gift_sample_pack'], once_per_member: true }
    ]
  };
}
