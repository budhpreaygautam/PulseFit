import { storage } from '../../lib/storage.js';

// The Train tab's workout in progress, kept on the phone per member so it survives another tab, a
// reload or the app being closed, until Finish saves it.

export interface TrainDraft {
  title: string;
  /** When the first set was added (ms); the workout's duration runs from here, and its day is this one's. */
  startedAt: number;
  /** When the last set was added (ms): where a draft left from an earlier day ends. */
  lastSetAt?: number;
  exercises: { exercise_id: string; exercise_name: string; sets: { weight_kg: number; reps: number }[] }[];
}

const keyOf = (userId: string) => `pulsefit_train_draft:${userId}`;
const isNumber = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/** The member's saved draft; null when there is none or what is stored is not a draft. */
export function loadDraft(userId: string): TrainDraft | null {
  try {
    const d = JSON.parse(storage.get(keyOf(userId)) ?? 'null') as TrainDraft | null;
    const valid =
      typeof d?.title === 'string' &&
      isNumber(d.startedAt) &&
      (d.lastSetAt === undefined || isNumber(d.lastSetAt)) &&
      Array.isArray(d.exercises) &&
      d.exercises.every(
        e => typeof e?.exercise_id === 'string' && typeof e.exercise_name === 'string' && Array.isArray(e.sets) && e.sets.every(s => isNumber(s?.weight_kg) && isNumber(s.reps))
      );
    return valid ? d : null;
  } catch {
    return null;
  }
}

export function saveDraft(userId: string, draft: TrainDraft): void {
  storage.set(keyOf(userId), JSON.stringify(draft));
}

export function clearDraft(userId: string): void {
  storage.remove(keyOf(userId));
}
