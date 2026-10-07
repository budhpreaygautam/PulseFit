// Client-side checks that mirror the server's rules, so people see the problem before submitting.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailError(email: string): string | null {
  if (!email.trim()) return 'Enter your email address.';
  return EMAIL.test(email.trim()) ? null : 'Enter a valid email address.';
}

export function nameError(name: string): string | null {
  const n = name.trim();
  if (n.length < 2) return 'Your name needs at least 2 characters.';
  if (n.length > 60) return 'Your name can be at most 60 characters.';
  return null;
}

/** Same rules as the server: 8–72 characters (at most 72 bytes), at least one letter and one digit. */
export function passwordError(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters for your password.';
  // bcrypt reads at most 72 bytes; accented or non-Latin characters take 2–4 bytes each.
  if (new TextEncoder().encode(password).length > 72) return 'Your password is too long. Use fewer or simpler characters.';
  if (!/[A-Za-z]/.test(password)) return 'Your password needs at least one letter.';
  if (!/\d/.test(password)) return 'Your password needs at least one digit.';
  return null;
}

/**
 * An Indian mobile number in any common spelling (98110 12345, +91 98110 12345, 098110 12345),
 * returned as "+91 98110 12345", or null when it is not one.
 */
export function normalizeIndianPhone(phone: string): string | null {
  let digits = phone.replace(/[\s()-]/g, '');
  if (!/^\+?\d+$/.test(digits)) return null;
  digits = digits.replace(/^\+/, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

export const PHONE_HINT = 'Enter a 10-digit Indian mobile number, for example +91 98110 12345.';
