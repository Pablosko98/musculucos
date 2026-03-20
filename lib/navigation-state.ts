// Module-level singleton for cross-screen navigation intent.
// Set before navigating, consumed once on arrival.

let _pendingWorkoutDate: string | null = null;

export function setPendingWorkoutDate(date: string) {
  _pendingWorkoutDate = date;
}

export function consumePendingWorkoutDate(): string | null {
  const d = _pendingWorkoutDate;
  _pendingWorkoutDate = null;
  return d;
}
