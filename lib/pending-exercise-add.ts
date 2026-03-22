// IDs of exercises that should be auto-added to a specific date's workout after returning from create_exercise
type PendingAdd = { ids: string[]; dateString: string };
let _pending: PendingAdd | null = null;
let _callback: ((ids: string[]) => void) | null = null;

export function setPendingExerciseAdd(ids: string[], dateString: string) {
  _pending = { ids, dateString };
}

export function takePendingExerciseAdd(dateString: string): string[] | null {
  if (!_pending || _pending.dateString !== dateString) return null;
  const ids = _pending.ids;
  _pending = null;
  return ids;
}

export function setPendingExerciseCallback(cb: (ids: string[]) => void) {
  _callback = cb;
}

export function takePendingExerciseCallback(): ((ids: string[]) => void) | null {
  const cb = _callback;
  _callback = null;
  return cb;
}
