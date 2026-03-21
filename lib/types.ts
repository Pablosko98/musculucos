import type { Exercise } from './exercises';

export type RepType = 'warmup' | 'full' | 'half' | 'assisted';
export type BlockType = 'standard' | 'superset';

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
};

export type Workout = {
  id: string;
  date: string;
  durationSeconds: number;
  notes: string;
  blocks: Block[];
};
