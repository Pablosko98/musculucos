import type { Exercise } from './exercises';

export type RepType = 'warmup' | 'full' | 'half' | 'assisted';
export type BlockType = 'standard' | 'superset';

// ─── Routine Types ────────────────────────────────────────────────────────────

// One "slot" in a routine = one block when added to a workout.
// exerciseGroups[i] = ordered list of [primaryId, alt1Id, alt2Id, ...] for each
// exercise in the slot. Length 1 = regular set; length 2+ = superset.
export type RoutineExercise = {
  id: string;
  routineId: string;
  order: number;
  exerciseGroups: string[][];
};

export type Routine = {
  id: string;
  name: string;
  description: string;
  order: number;
  exercises: RoutineExercise[];
};

export type SubSet = {
  id: string;
  blockId: string;
  type: 'set';
  exerciseId: string;
  parentEventId: string;
  weightKg: number;
  rep_type: RepType;
  reps: number;
  rpe: number;
  durationSeconds: null;
  datetime: string;
  exercise: Exercise | null;
};

export type SetEvent = {
  id: string;
  type: 'set';
  datetime: string;
  subSets: SubSet[];
};

export type RestEvent = {
  id: string;
  type: 'rest';
  durationSeconds: number;
  datetime: string;
};

export type WorkoutEvent = SetEvent | RestEvent;

export type Block = {
  id: string;
  workoutId: string;
  order: number;
  type: BlockType;
  name: string;
  exerciseIds: string[];
  exercises: Exercise[];
  sets: number;
  datetime: string;
  events: WorkoutEvent[];
  // Per-exercise alternative options from a routine; index matches exerciseIds.
  // Each entry is [primaryId, alt1Id, alt2Id, ...] for that exercise slot.
  alternativeExerciseOptions?: string[][] | null;
  // Per-exercise weight mode override for this workout session.
  // Overrides the exercise's default weightMode setting.
  exerciseWeightModes?: Record<string, 'total' | 'per_side'>;
};

export type Workout = {
  id: string;
  date: string;
  durationSeconds: number;
  notes: string;
  blocks: Block[];
};
