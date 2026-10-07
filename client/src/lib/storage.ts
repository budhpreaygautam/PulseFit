// localStorage that never throws: private windows and strict privacy settings can block
// storage entirely, and the app must still render.

export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: the value just isn't remembered */
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
};

export const TOKEN_KEY = 'pulsefit_token';
