export type MuscleRole = 'primary' | 'secondary' | 'stabilizer';

export type MuscleEmphasis = {
  muscle: string; // e.g. 'biceps', 'chest', 'deltoid', 'lats'
  head?: string; // e.g. 'long_head', 'upper', 'anterior', 'lateral'
  role: MuscleRole;
};

// Each entry = one movement + equipment combination.
// `baseId` groups all variants of the same movement (e.g. all bicep curls).
// `name` is the movement name shared by all variants (e.g. 'Bicep Curl').
// Equipment distinguishes variants within a group.
export type Exercise = {
  id: string; // unique variant ID, e.g. 'bicep_curl_dumbbell'
  baseId: string; // movement family, e.g. 'bicep_curl'
  name: string; // movement display name, same for all variants
  equipment: string; // category used for filtering: 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'bodyweight' | 'ez_bar'
  equipmentVariant?: string | null; // optional subtype label, e.g. 'Seated', 'Smith', 'Wide Grip'
  muscleEmphasis: MuscleEmphasis[];
  description?: string;
  videoUrl?: string;
  defaultRestSeconds?: number | null; // preferred rest between sets
  baseWeightKg?: number | null; // inherent equipment weight (e.g. 20 for barbell, 10 for ez_bar)
  isCustom?: number; // 0 = base exercise, 1 = user-created; present when read from DB
  isFavourite?: number; // 0 = not favourite, 1 = favourite; present when read from DB
};

// muscle = one of the 7 top-level groups (abs, back, biceps, chest, legs, shoulders, triceps)
// head  = subdivision within that group (quads, lats, long_head, front, …)
// Secondary muscles use only `muscle` with no head.
export const MUSCLE_GROUP_MAP: Record<string, { groupId: string; groupLabel: string }> = {
  abs:       { groupId: 'abs',       groupLabel: 'Abs' },
  back:      { groupId: 'back',      groupLabel: 'Back' },
  biceps:    { groupId: 'biceps',    groupLabel: 'Biceps' },
  chest:     { groupId: 'chest',     groupLabel: 'Chest' },
  legs:      { groupId: 'legs',      groupLabel: 'Legs' },
  shoulders: { groupId: 'shoulders', groupLabel: 'Shoulders' },
  triceps:   { groupId: 'triceps',   groupLabel: 'Triceps' },
};

// Display labels for subdivision heads used in the sub-filter row.
export const HEAD_LABELS: Record<string, string> = {
  // back
  lats:      'Lats',
  upper:     'Upper',
  lower:     'Lower',
  traps:     'Traps',
  rhomboids: 'Rhomboids',
  // biceps
  long_head:  'Long Head',
  short_head: 'Short Head',
  brachialis: 'Brachialis',
  // chest
  upper_chest: 'Upper',
  middle:      'Middle',
  lower_chest: 'Lower',
  // legs
  quads:       'Quads',
  hamstrings:  'Hamstrings',
  glutes:      'Glutes',
  calves:      'Calves',
  adductors:   'Adductors',
  hip_flexors: 'Hip Flexors',
  // shoulders
  front: 'Front',
  side:  'Side',
  rear:  'Rear',
  // triceps
  lateral:  'Lateral Head',
  medial:   'Medial Head',
  // abs
  obliques: 'Obliques',
};

export const exercises: Exercise[] = [
  // ─── CHEST ────────────────────────────────────────────────────────────────

  {
    id: 'bench_press_barbell',
    baseId: 'bench_press',
    name: 'Bench Press',
    equipment: 'barbell',
    muscleEmphasis: [
      { muscle: 'chest', head: 'middle', role: 'primary' },
      { muscle: 'triceps', role: 'secondary' },
      { muscle: 'shoulders', role: 'secondary' },
    ],
    videoUrl: 'https://www.youtube.com/shorts/5NStATS0zrw',
  },
  {
    id: 'bench_press_dumbbell',
    baseId: 'bench_press',
    name: 'Bench Press',
    equipment: 'dumbbell',
    muscleEmphasis: [
      { muscle: 'chest', head: 'middle', role: 'primary' },
      { muscle: 'triceps', role: 'secondary' },
      { muscle: 'shoulders', role: 'secondary' },
    ],
  },
  {
    id: 'incline_press_barbell',
    baseId: 'incline_press',
    name: 'Incline Press',
    equipment: 'barbell',
    muscleEmphasis: [
      { muscle: 'chest', head: 'upper', role: 'primary' },
      { muscle: 'shoulders', role: 'secondary' },
      { muscle: 'triceps', role: 'secondary' },
    ],
  },
  {
    id: 'incline_press_dumbbell',
    baseId: 'incline_press',
    name: 'Incline Press',
    equipment: 'dumbbell',
    muscleEmphasis: [
      { muscle: 'chest', head: 'upper', role: 'primary' },
      { muscle: 'shoulders', role: 'secondary' },
      { muscle: 'triceps', role: 'secondary' },
    ],
  },
  {
    id: 'decline_press_barbell',
    baseId: 'decline_press',
    name: 'Decline Press',
    equipment: 'barbell',
    muscleEmphasis: [
      { muscle: 'chest', head: 'lower', role: 'primary' },
      { muscle: 'triceps', role: 'secondary' },
    ],
  },
  {
    id: 'chest_fly_dumbbell',
    baseId: 'chest_fly',
    name: 'Chest Fly',
    equipment: 'dumbbell',
    description: 'Arms behind body at bottom = deep stretch on all chest fibres.',
    muscleEmphasis: [
      { muscle: 'chest', head: 'middle', role: 'primary' },
      { muscle: 'shoulders', role: 'secondary' },
    ],
  },
  {
    id: 'chest_fly_cable',
    baseId: 'chest_fly',
    name: 'Chest Fly',
    equipment: 'cable',
    description:
      'Cable angle determines head: high-to-low = lower chest, low-to-high = upper chest.',
    muscleEmphasis: [
      { muscle: 'chest', head: 'middle', role: 'primary' },
      { muscle: 'shoulders', role: 'secondary' },
    ],
  },
  {
    id: 'pec_deck_machine',
    baseId: 'pec_deck',
    name: 'Pec Deck',
    equipment: 'machine',
    muscleEmphasis: [
      { muscle: 'chest', head: 'middle', role: 'primary' },
      { muscle: 'shoulders', role: 'secondary' },
    ],
  },
  {
    id: 'push_up_bodyweight',
    baseId: 'push_up',
    name: 'Push-Up',
    equipment: 'bodyweight',
    muscleEmphasis: [
      { muscle: 'chest', head: 'middle', role: 'primary' },
      { muscle: 'triceps', role: 'secondary' },
      { muscle: 'shoulders', role: 'secondary' },
      { muscle: 'abs', role: 'stabilizer' },
    ],
  },

  // ─── BACK ─────────────────────────────────────────────────────────────────

  {
    id: 'pull_up_bodyweight',
    baseId: 'pull_up',
    name: 'Pull-Up',
    equipment: 'bodyweight',
    description: 'Wide overhand grip = lat width. Neutral grip = more biceps.',
    muscleEmphasis: [
      { muscle: 'back', head: 'lats', role: 'primary' },
      { muscle: 'biceps', role: 'secondary' },
      { muscle: 'shoulders', role: 'secondary' },
      { muscle: 'back', role: 'stabilizer' },
    ],
  },
  {
    id: 'lat_pulldown_wide_cable',
    baseId: 'lat_pulldown',
    name: 'Lat Pulldown',
    equipment: 'cable',
    description: 'Wide overhand grip. Emphasises lat width.',
    muscleEmphasis: [
      { muscle: 'back', head: 'lats', role: 'primary' },
      { muscle: 'biceps', role: 'secondary' },
      { muscle: 'shoulders', role: 'secondary' },
    ],
  },
  {
    id: 'lat_pulldown_close_grip_cable',
    baseId: 'lat_pulldown',
    name: 'Lat Pulldown',
    equipment: 'cable',
    description: 'Neutral/close grip. Longer ROM and more biceps recruitment.',
    muscleEmphasis: [
      { muscle: 'back', head: 'lats', role: 'primary' },
      { muscle: 'biceps', role: 'secondary' },
      { muscle: 'back', role: 'secondary' },
    ],
  },
  {
    id: 'bent_over_row_barbell',
    baseId: 'bent_over_row',
    name: 'Bent Over Row',
    equipment: 'barbell',
    description: 'Overhand grip targets upper back; underhand shifts load to lats.',
    muscleEmphasis: [
      { muscle: 'back', head: 'upper', role: 'primary' },
      { muscle: 'back', head: 'lats', role: 'primary' },
      { muscle: 'biceps', role: 'secondary' },
      { muscle: 'back', role: 'stabilizer' },
    ],
  },
  {
    id: 'single_arm_row_dumbbell',
    baseId: 'single_arm_row',
    name: 'Single Arm Row',
    equipment: 'dumbbell',
    muscleEmphasis: [
      { muscle: 'back', head: 'lats', role: 'primary' },
      { muscle: 'back', role: 'secondary' },
      { muscle: 'biceps', role: 'secondary' },
    ],
  },
  {
    id: 'seated_cable_row',
    baseId: 'seated_cable_row',
    name: 'Seated Cable Row',
    equipment: 'cable',
    description: 'Close neutral grip = more lats. Wide overhand = more upper back.',
    muscleEmphasis: [
      { muscle: 'back', head: 'upper', role: 'primary' },
      { muscle: 'back', head: 'lats', role: 'primary' },
      { muscle: 'biceps', role: 'secondary' },
    ],
  },
  {
    id: 't_bar_row_machine',
    baseId: 't_bar_row',
    name: 'T-Bar Row',
    equipment: 'machine',
    muscleEmphasis: [
      { muscle: 'back', head: 'upper', role: 'primary' },
      { muscle: 'back', role: 'secondary' },
      { muscle: 'biceps', role: 'secondary' },
      { muscle: 'back', role: 'stabilizer' },
    ],
  },
  {
    id: 'face_pull_cable',
    baseId: 'face_pull',
    name: 'Face Pull',
    equipment: 'cable',
    description: 'Rope at forehead height. Crucial for shoulder health and rear delt development.',
    muscleEmphasis: [
      { muscle: 'shoulders', head: 'rear', role: 'primary' },
      { muscle: 'back', head: 'upper', role: 'primary' },
      { muscle: 'back', role: 'secondary' },
    ],
  },
  {
    id: 'straight_arm_pulldown_cable',
    baseId: 'straight_arm_pulldown',
    name: 'Straight Arm Pulldown',
    equipment: 'cable',
    description: 'Arms stay straight. Pure lat isolation.',
    muscleEmphasis: [
      { muscle: 'back', head: 'lats', role: 'primary' },
      { muscle: 'triceps', role: 'stabilizer' },
    ],
  },
  {
    id: 'deadlift_barbell',
    baseId: 'deadlift',
    name: 'Deadlift',
    equipment: 'barbell',
    muscleEmphasis: [
      { muscle: 'back', head: 'lower', role: 'primary' },
      { muscle: 'legs', head: 'glutes', role: 'primary' },
      { muscle: 'legs', head: 'hamstrings', role: 'primary' },
      { muscle: 'legs', role: 'secondary' },
      { muscle: 'back', role: 'secondary' },
      { muscle: 'abs', role: 'stabilizer' },
    ],
  },

  // ─── SHOULDERS ────────────────────────────────────────────────────────────

  {
    id: 'overhead_press_barbell',
    baseId: 'overhead_press',
    name: 'Overhead Press',
    equipment: 'barbell',
    muscleEmphasis: [
      { muscle: 'shoulders', head: 'front', role: 'primary' },
      { muscle: 'shoulders', role: 'secondary' },
      { muscle: 'triceps', role: 'secondary' },
      { muscle: 'back', role: 'stabilizer' },
    ],
  },
  {
    id: 'overhead_press_dumbbell',
    baseId: 'overhead_press',
    name: 'Overhead Press',
    equipment: 'dumbbell',
    muscleEmphasis: [
      { muscle: 'shoulders', head: 'front', role: 'primary' },
      { muscle: 'shoulders', role: 'secondary' },
      { muscle: 'triceps', role: 'secondary' },
    ],
  },
  {
    id: 'overhead_press_machine',
    baseId: 'overhead_press',
    name: 'Overhead Press',
    equipment: 'machine',
    muscleEmphasis: [
      { muscle: 'shoulders', head: 'front', role: 'primary' },
      { muscle: 'shoulders', role: 'secondary' },
      { muscle: 'triceps', role: 'secondary' },
    ],
  },
  {
    id: 'lateral_raise_dumbbell',
    baseId: 'lateral_raise',
    name: 'Lateral Raise',
    equipment: 'dumbbell',
    description: 'Slight forward lean increases lateral delt activation.',
    muscleEmphasis: [
      { muscle: 'shoulders', head: 'side', role: 'primary' },
      { muscle: 'back', role: 'stabilizer' },
    ],
  },
  {
    id: 'lateral_raise_cable',
    baseId: 'lateral_raise',
    name: 'Lateral Raise',
    equipment: 'cable',
    description: 'Low pulley provides constant tension through full ROM.',
    muscleEmphasis: [
      { muscle: 'shoulders', head: 'side', role: 'primary' },
      { muscle: 'back', role: 'stabilizer' },
    ],
  },
  {
    id: 'front_raise_dumbbell',
    baseId: 'front_raise',
    name: 'Front Raise',
    equipment: 'dumbbell',
    muscleEmphasis: [
      { muscle: 'shoulders', head: 'front', role: 'primary' },
      { muscle: 'chest', role: 'secondary' },
    ],
  },
  {
    id: 'rear_delt_fly_dumbbell',
    baseId: 'rear_delt_fly',
    name: 'Rear Delt Fly',
    equipment: 'dumbbell',
    description: 'Torso parallel to floor. Slight elbow bend reduces trap recruitment.',
    muscleEmphasis: [
      { muscle: 'shoulders', head: 'rear', role: 'primary' },
      { muscle: 'back', role: 'secondary' },
    ],
  },
  {
    id: 'rear_delt_fly_cable',
    baseId: 'rear_delt_fly',
    name: 'Rear Delt Fly',
    equipment: 'cable',
    muscleEmphasis: [
      { muscle: 'shoulders', head: 'rear', role: 'primary' },
      { muscle: 'back', role: 'secondary' },
    ],
  },
  {
    id: 'upright_row_barbell',
    baseId: 'upright_row',
    name: 'Upright Row',
    equipment: 'barbell',
    description: 'Wide grip = lateral delt; narrow grip = more traps.',
    muscleEmphasis: [
      { muscle: 'shoulders', head: 'side', role: 'primary' },
      { muscle: 'back', head: 'traps', role: 'primary' },
      { muscle: 'biceps', role: 'secondary' },
    ],
  },

  // ─── BICEPS ───────────────────────────────────────────────────────────────
  // Arm position key:
  //   arm at side (neutral)  → both heads (standard curl)
  //   arm in FRONT of body   → short head isolated (long head is slack)
  //   arm BEHIND body        → long head stretched
  //   neutral grip           → brachialis dominant (hammer curl)

  {
    id: 'bicep_curl_dumbbell',
    baseId: 'bicep_curl',
    name: 'Bicep Curl',
    equipment: 'dumbbell',
    description: 'Supinated (palms-up) grip. Arm at side = both heads loaded equally.',
    muscleEmphasis: [
      { muscle: 'biceps', head: 'long_head', role: 'primary' },
      { muscle: 'biceps', head: 'short_head', role: 'primary' },
      { muscle: 'biceps', role: 'secondary' },
    ],
    videoUrl: 'https://www.youtube.com/shorts/MKWBV29S6c0',
  },
  {
    id: 'bicep_curl_barbell',
    baseId: 'bicep_curl',
    name: 'Bicep Curl',
    equipment: 'barbell',
    description: 'Fixed supination. Slightly more short head due to constant supinated wrist.',
    muscleEmphasis: [
      { muscle: 'biceps', head: 'short_head', role: 'primary' },
      { muscle: 'biceps', head: 'long_head', role: 'primary' },
      { muscle: 'biceps', role: 'secondary' },
    ],
  },
  {
    id: 'bicep_curl_cable',
    baseId: 'bicep_curl',
    name: 'Bicep Curl',
    equipment: 'cable',
    description: 'Constant tension through full ROM.',
    muscleEmphasis: [
      { muscle: 'biceps', head: 'long_head', role: 'primary' },
      { muscle: 'biceps', head: 'short_head', role: 'primary' },
      { muscle: 'biceps', role: 'secondary' },
    ],
  },
  {
    id: 'bicep_curl_ez_bar',
    baseId: 'bicep_curl',
    name: 'Bicep Curl',
    equipment: 'ez_bar',
    description: 'Angled grip reduces wrist stress. Slight short head emphasis.',
    muscleEmphasis: [
      { muscle: 'biceps', head: 'short_head', role: 'primary' },
      { muscle: 'biceps', head: 'long_head', role: 'primary' },
      { muscle: 'biceps', role: 'secondary' },
    ],
  },
  {
    id: 'hammer_curl_dumbbell',
    baseId: 'hammer_curl',
    name: 'Hammer Curl',
    equipment: 'dumbbell',
    description: 'Neutral (thumbs-up) grip. Removes supination → brachialis becomes primary mover.',
    muscleEmphasis: [
      { muscle: 'biceps', head: 'brachialis', role: 'primary' },
      { muscle: 'biceps', role: 'secondary' },
    ],
  },
  {
    id: 'hammer_curl_cable',
    baseId: 'hammer_curl',
    name: 'Hammer Curl',
    equipment: 'cable',
    description: 'Rope attachment, neutral grip. Constant tension on brachialis.',
    muscleEmphasis: [
      { muscle: 'biceps', head: 'brachialis', role: 'primary' },
      { muscle: 'biceps', role: 'secondary' },
    ],
  },
  {
    id: 'preacher_curl_ez_bar',
    baseId: 'preacher_curl',
    name: 'Preacher Curl',
    equipment: 'ez_bar',
    description: 'Arm rests on pad in front of body. Long head is slack → short head isolated.',
    muscleEmphasis: [
      { muscle: 'biceps', head: 'short_head', role: 'primary' },
      { muscle: 'biceps', role: 'secondary' },
    ],
  },
  {
    id: 'preacher_curl_dumbbell',
    baseId: 'preacher_curl',
    name: 'Preacher Curl',
    equipment: 'dumbbell',
    description: 'Single arm. Arm in front of body = short head isolation.',
    muscleEmphasis: [
      { muscle: 'biceps', head: 'short_head', role: 'primary' },
      { muscle: 'biceps', role: 'secondary' },
    ],
  },
  {
    id: 'incline_curl_dumbbell',
    baseId: 'incline_curl',
    name: 'Incline Curl',
    equipment: 'dumbbell',
    description: 'Arm falls behind body on incline bench. Maximum long head stretch.',
    muscleEmphasis: [
      { muscle: 'biceps', head: 'long_head', role: 'primary' },
      { muscle: 'biceps', role: 'secondary' },
    ],
  },
  {
    id: 'concentration_curl_dumbbell',
    baseId: 'concentration_curl',
    name: 'Concentration Curl',
    equipment: 'dumbbell',
    description: 'Elbow braced against inner thigh (arm in front of body) → short head isolation.',
    muscleEmphasis: [
      { muscle: 'biceps', head: 'short_head', role: 'primary' },
      { muscle: 'biceps', role: 'secondary' },
    ],
  },

  // ─── TRICEPS ──────────────────────────────────────────────────────────────
  // Long head is the only head crossing the shoulder joint.
  // Overhead position = long head stretched → most effective for long head mass.
  // Arms at sides = lateral and medial heads dominant.

  {
    id: 'tricep_pushdown_vbar_cable',
    baseId: 'tricep_pushdown',
    name: 'Tricep Pushdown',
    equipment: 'cable',
    description: 'V-bar attachment. Arms at sides → lateral and medial head dominant.',
    muscleEmphasis: [
      { muscle: 'triceps', head: 'lateral', role: 'primary' },
      { muscle: 'triceps', head: 'medial', role: 'primary' },
      { muscle: 'triceps', role: 'secondary' },
    ],
  },
  {
    id: 'tricep_pushdown_rope_cable',
    baseId: 'tricep_pushdown',
    name: 'Tricep Pushdown',
    equipment: 'cable',
    description: 'Rope attachment. Flare hands at bottom increases lateral head contraction.',
    muscleEmphasis: [
      { muscle: 'triceps', head: 'lateral', role: 'primary' },
      { muscle: 'triceps', role: 'secondary' },
    ],
  },
  {
    id: 'overhead_tricep_ext_rope_cable',
    baseId: 'overhead_tricep_ext',
    name: 'Overhead Tricep Extension',
    equipment: 'cable',
    description: 'Overhead = long head fully stretched. Most effective for long head mass.',
    muscleEmphasis: [
      { muscle: 'triceps', head: 'long_head', role: 'primary' },
      { muscle: 'triceps', role: 'secondary' },
    ],
  },
  {
    id: 'overhead_tricep_ext_dumbbell',
    baseId: 'overhead_tricep_ext',
    name: 'Overhead Tricep Extension',
    equipment: 'dumbbell',
    muscleEmphasis: [
      { muscle: 'triceps', head: 'long_head', role: 'primary' },
      { muscle: 'triceps', role: 'secondary' },
    ],
  },
  {
    id: 'skull_crusher_ez_bar',
    baseId: 'skull_crusher',
    name: 'Skull Crusher',
    equipment: 'ez_bar',
    description: 'Bar lowered to forehead on bench. Long and lateral heads.',
    muscleEmphasis: [
      { muscle: 'triceps', head: 'long_head', role: 'primary' },
      { muscle: 'triceps', head: 'lateral', role: 'primary' },
      { muscle: 'triceps', role: 'secondary' },
    ],
  },
  {
    id: 'close_grip_bench_press_barbell',
    baseId: 'close_grip_bench_press',
    name: 'Close Grip Bench Press',
    equipment: 'barbell',
    description:
      'Shoulder-width grip. Medial and lateral head dominant with some chest involvement.',
    muscleEmphasis: [
      { muscle: 'triceps', head: 'medial', role: 'primary' },
      { muscle: 'triceps', head: 'lateral', role: 'primary' },
      { muscle: 'chest', role: 'secondary' },
    ],
  },
  {
    id: 'dips_bodyweight',
    baseId: 'dips',
    name: 'Dips',
    equipment: 'bodyweight',
    description: 'Upright torso = tricep focus. Forward lean = more lower chest.',
    muscleEmphasis: [
      { muscle: 'triceps', head: 'lateral', role: 'primary' },
      { muscle: 'chest', role: 'secondary' },
      { muscle: 'shoulders', role: 'secondary' },
    ],
  },

  // ─── LEGS ─────────────────────────────────────────────────────────────────

  {
    id: 'squat_barbell',
    baseId: 'squat',
    name: 'Squat',
    equipment: 'barbell',
    description: 'High bar = more quad; low bar = more hip/glute drive.',
    muscleEmphasis: [
      { muscle: 'legs', head: 'quads', role: 'primary' },
      { muscle: 'legs', head: 'glutes', role: 'primary' },
      { muscle: 'legs', role: 'secondary' },
      { muscle: 'abs', role: 'stabilizer' },
    ],
  },
  {
    id: 'squat_goblet_dumbbell',
    baseId: 'squat',
    name: 'Squat',
    equipment: 'dumbbell',
    description: 'Goblet hold promotes upright torso → greater quad emphasis.',
    muscleEmphasis: [
      { muscle: 'legs', head: 'quads', role: 'primary' },
      { muscle: 'legs', role: 'secondary' },
      { muscle: 'abs', role: 'stabilizer' },
    ],
  },
  {
    id: 'hack_squat_machine',
    baseId: 'hack_squat',
    name: 'Hack Squat',
    equipment: 'machine',
    description: 'Feet forward on platform. VMO (inner quad) dominant.',
    muscleEmphasis: [
      { muscle: 'legs', head: 'quads', role: 'primary' },
      { muscle: 'legs', role: 'secondary' },
    ],
  },
  {
    id: 'leg_press_machine',
    baseId: 'leg_press',
    name: 'Leg Press',
    equipment: 'machine',
    description: 'Foot position changes emphasis: high/wide = glutes; low/narrow = quads.',
    muscleEmphasis: [
      { muscle: 'legs', head: 'quads', role: 'primary' },
      { muscle: 'legs', role: 'secondary' },
    ],
    videoUrl: 'https://www.youtube.com/shorts/EotSw18oR9w',
  },
  {
    id: 'romanian_deadlift_barbell',
    baseId: 'romanian_deadlift',
    name: 'Romanian Deadlift',
    equipment: 'barbell',
    description: 'Hip hinge with soft knees. Maximal hamstring and glute stretch.',
    muscleEmphasis: [
      { muscle: 'legs', head: 'hamstrings', role: 'primary' },
      { muscle: 'legs', head: 'glutes', role: 'primary' },
      { muscle: 'back', role: 'secondary' },
    ],
  },
  {
    id: 'romanian_deadlift_dumbbell',
    baseId: 'romanian_deadlift',
    name: 'Romanian Deadlift',
    equipment: 'dumbbell',
    muscleEmphasis: [
      { muscle: 'legs', head: 'hamstrings', role: 'primary' },
      { muscle: 'legs', head: 'glutes', role: 'primary' },
      { muscle: 'back', role: 'secondary' },
    ],
  },
  {
    id: 'leg_curl_lying_machine',
    baseId: 'leg_curl',
    name: 'Leg Curl',
    equipment: 'machine',
    description: 'Prone (lying). Hip extended → biceps femoris (outer hamstring) dominant.',
    muscleEmphasis: [
      { muscle: 'legs', head: 'hamstrings', role: 'primary' },
      { muscle: 'legs', role: 'secondary' },
    ],
  },
  {
    id: 'leg_curl_seated_machine',
    baseId: 'leg_curl',
    name: 'Leg Curl',
    equipment: 'machine',
    description: 'Seated. Hip flexed → medial hamstrings more active and deeper stretch.',
    muscleEmphasis: [
      { muscle: 'legs', head: 'hamstrings', role: 'primary' },
      { muscle: 'legs', role: 'secondary' },
    ],
  },
  {
    id: 'leg_extension_machine',
    baseId: 'leg_extension',
    name: 'Leg Extension',
    equipment: 'machine',
    description: 'Toes out = vastus medialis; toes in = vastus lateralis.',
    muscleEmphasis: [
      { muscle: 'legs', head: 'quads', role: 'primary' },
    ],
    videoUrl: 'https://www.youtube.com/shorts/uM86QE59Tgc',
  },
  {
    id: 'calf_raise_standing_machine',
    baseId: 'calf_raise',
    name: 'Calf Raise',
    equipment: 'machine',
    description: 'Knee straight → gastrocnemius dominant (crosses knee and ankle).',
    muscleEmphasis: [
      { muscle: 'legs', head: 'calves', role: 'primary' },
      { muscle: 'legs', role: 'secondary' },
    ],
    videoUrl: 'https://www.youtube.com/shorts/wdOkFomQNp8',
  },
  {
    id: 'calf_raise_seated_machine',
    baseId: 'calf_raise',
    name: 'Calf Raise',
    equipment: 'machine',
    description: 'Knee bent → gastrocnemius is slack → soleus isolated.',
    muscleEmphasis: [
      { muscle: 'legs', head: 'calves', role: 'primary' },
      { muscle: 'legs', role: 'secondary' },
    ],
  },
  {
    id: 'hip_thrust_barbell',
    baseId: 'hip_thrust',
    name: 'Hip Thrust',
    equipment: 'barbell',
    description: 'Best peak contraction for glutes due to full hip extension under load.',
    muscleEmphasis: [
      { muscle: 'legs', head: 'glutes', role: 'primary' },
      { muscle: 'legs', role: 'secondary' },
      { muscle: 'legs', role: 'stabilizer' },
    ],
  },
  {
    id: 'bulgarian_split_squat_dumbbell',
    baseId: 'bulgarian_split_squat',
    name: 'Bulgarian Split Squat',
    equipment: 'dumbbell',
    description: 'Upright torso = quad focus; forward lean = glute focus.',
    muscleEmphasis: [
      { muscle: 'legs', head: 'quads', role: 'primary' },
      { muscle: 'legs', head: 'glutes', role: 'primary' },
      { muscle: 'legs', role: 'secondary' },
    ],
  },
  {
    id: 'lunge_dumbbell',
    baseId: 'lunge',
    name: 'Lunge',
    equipment: 'dumbbell',
    muscleEmphasis: [
      { muscle: 'legs', head: 'quads', role: 'primary' },
      { muscle: 'legs', head: 'glutes', role: 'primary' },
      { muscle: 'legs', role: 'secondary' },
    ],
  },

  // ─── CORE ─────────────────────────────────────────────────────────────────

  {
    id: 'crunch_bodyweight',
    baseId: 'crunch',
    name: 'Crunch',
    equipment: 'bodyweight',
    muscleEmphasis: [{ muscle: 'abs', role: 'primary' }],
  },
  {
    id: 'cable_crunch',
    baseId: 'crunch',
    name: 'Crunch',
    equipment: 'cable',
    description: 'Kneeling cable crunch. Allows progressive overload on abs.',
    muscleEmphasis: [{ muscle: 'abs', role: 'primary' }],
  },
  {
    id: 'hanging_leg_raise_bodyweight',
    baseId: 'hanging_leg_raise',
    name: 'Hanging Leg Raise',
    equipment: 'bodyweight',
    muscleEmphasis: [
      { muscle: 'abs', role: 'primary' },
      { muscle: 'legs', role: 'secondary' },
    ],
  },
  {
    id: 'plank_bodyweight',
    baseId: 'plank',
    name: 'Plank',
    equipment: 'bodyweight',
    muscleEmphasis: [
      { muscle: 'abs', role: 'primary' },
    ],
  },
  {
    id: 'russian_twist_bodyweight',
    baseId: 'russian_twist',
    name: 'Russian Twist',
    equipment: 'bodyweight',
    muscleEmphasis: [
      { muscle: 'abs', head: 'obliques', role: 'primary' },
      { muscle: 'abs', role: 'secondary' },
    ],
  },
];
