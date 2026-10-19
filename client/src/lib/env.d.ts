/// <reference types="vite/client" />

// The build-time settings the client reads. Only VITE_* variables reach the bundle, and only those
// read as import.meta.env.VITE_… below, so nothing secret belongs here: Razorpay's key id, Google
// sign-in and demo mode come from the API at runtime (GET /api/config).
interface ImportMetaEnv {
  /**
   * Origin of the API, e.g. https://gym.example.com (no /api). Unset on the website, which calls its
   * own origin; set by scripts/mobile-sync.mjs for the Android/iOS app bundle.
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
