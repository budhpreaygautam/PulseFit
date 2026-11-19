// Server limits for POST /workouts (docs/API.md), shared by the website's logger and the app's Train tab.
export const WORKOUT_LIMITS = { title: 100, notes: 1000, duration: 300, weight: 500, reps: 100, rpe: 10, setsTotal: 100, setsPerExercise: 50, daysBack: 365 };

/** Parse a decimal within [min, max]; null when blank or out of range. */
export function inRange(value: string, min: number, max: number, integer = false): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) return null;
  return n;
}
