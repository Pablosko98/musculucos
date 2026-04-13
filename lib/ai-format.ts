import { db, ExerciseDAL, PRDAL, RoutineDAL } from './db';
import type { Exercise } from './exercises';
import type { Routine } from './types';
import { format, subDays } from 'date-fns';

// ─── Display name helpers ─────────────────────────────────────────────────────

export function exDisplayName(
  ex: Pick<Exercise, 'name' | 'equipment' | 'equipmentVariant'>
): string {
  const parts = [ex.equipment];
  if (ex.equipmentVariant) parts.push(ex.equipmentVariant);
  return `${ex.name} (${parts.join(', ')})`;
}

function parseDisplayName(
  s: string
): { name: string; equipment: string; equipmentVariant?: string } | null {
  const match = s.match(/^(.+?)\s*\(([^,)]+)(?:,\s*(.+))?\)\s*$/);
  if (!match) return null;
  return {
    name: match[1].trim(),
    equipment: match[2].trim().toLowerCase(),
    equipmentVariant: match[3]?.trim() || undefined,
  };
}

function generateId(): string {
  return `ex_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function exportExercisesAI(ids?: string[]): Promise<string> {
  const all = await ExerciseDAL.getAll();
  const exercises = ids ? all.filter((e) => ids.includes(e.id)) : all;
  const payload = {
    type: 'exercises',
    exercises: exercises.map((ex) => ({
      name: ex.name,
      equipment: ex.equipment,
      equipmentVariant: ex.equipmentVariant ?? null,
      muscleEmphasis: ex.muscleEmphasis,
      defaultRestSeconds: ex.defaultRestSeconds ?? null,
      weightMode: ex.weightMode ?? null,
      baseWeightKg: ex.baseWeightKg ?? null,
      weightStep: ex.weightStep ?? null,
      description: ex.description || null,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export async function exportRoutinesAI(ids?: string[]): Promise<string> {
  const [all, exercises] = await Promise.all([RoutineDAL.getAll(), ExerciseDAL.getAll()]);
  const routines = ids ? all.filter((r) => ids.includes(r.id)) : all;
  const exMap = new Map(exercises.map((e) => [e.id, e]));

  // Collect only exercises actually referenced in the selected routines
  const usedExIds = new Set<string>();
  for (const r of routines) {
    for (const re of r.exercises) {
      for (const group of re.exerciseGroups) {
        for (const id of group) usedExIds.add(id);
      }
    }
  }
  const usedExercises = [...usedExIds]
    .map((id) => exMap.get(id))
    .filter((ex): ex is Exercise => ex != null);

  const payload = {
    type: 'routines',
    exercises: usedExercises.map((ex) => ({
      name: ex.name,
      equipment: ex.equipment,
      equipmentVariant: ex.equipmentVariant ?? null,
    })),
    routines: routines.map((r) => ({
      name: r.name,
      description: r.description,
      slots: r.exercises.map((re) =>
        re.exerciseGroups.map((group) =>
          group.map((id) => {
            const ex = exMap.get(id);
            return ex ? exDisplayName(ex) : id;
          })
        )
      ),
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export type AnalyticsExportOpts = {
  exerciseIds?: string[];  // undefined = all
  daysBack?: number | null; // null = all time, undefined = 28 days
};

export async function exportAnalyticsAI(opts?: AnalyticsExportOpts): Promise<string> {
  const daysBack = opts?.daysBack === undefined ? 28 : opts.daysBack;
  const startDate =
    daysBack === null ? null : format(subDays(new Date(), daysBack), 'yyyy-MM-dd');

  const [allExercises, stats, prs] = await Promise.all([
    ExerciseDAL.getAll(),
    ExerciseDAL.getExerciseStats(),
    PRDAL.getAll(),
  ]);

  const idSet = opts?.exerciseIds ? new Set(opts.exerciseIds) : null;
  const exercises = idSet ? allExercises.filter((e) => idSet.has(e.id)) : allExercises;
  const exMap = new Map(exercises.map((e) => [e.id, e]));

  // Group PRs by exercise
  const prsByEx = new Map<string, Array<{ reps: number; weightKg: number }>>();
  for (const pr of prs) {
    if (!prsByEx.has(pr.exerciseId)) prsByEx.set(pr.exerciseId, []);
    prsByEx.get(pr.exerciseId)!.push({ reps: pr.reps, weightKg: pr.weightKg });
  }

  function paretoOptimal(list: Array<{ reps: number; weightKg: number }>) {
    return list.filter(
      (a) => !list.some((b) => b !== a && b.reps >= a.reps && b.weightKg >= a.weightKg)
    );
  }

  const exerciseData = exercises
    .filter((ex) => stats[ex.id] != null)
    .map((ex) => {
      const stat = stats[ex.id];
      const optimal = paretoOptimal(prsByEx.get(ex.id) ?? []).sort((a, b) => a.reps - b.reps);
      return {
        name: exDisplayName(ex),
        lastTrainedAt: stat.lastTrainedAt,
        workoutCount: stat.workoutCount,
        maxWeightKg: stat.maxWeightKg,
        repsAtMaxWeight: stat.repsAtMaxWeight,
        personalRecords: optimal,
      };
    });

  const allMuscleStats = await ExerciseDAL.getMuscleStats(startDate);
  // Filter to selected exercises only
  const muscleStats = idSet
    ? allMuscleStats.filter((r) => idSet.has(r.exerciseId))
    : allMuscleStats;

  const muscleVolume = new Map<
    string,
    { totalSets: number; totalVolume: number; sessions: Set<string> }
  >();
  for (const row of muscleStats) {
    const ex = exMap.get(row.exerciseId);
    if (!ex) continue;
    for (const me of ex.muscleEmphasis) {
      if (me.role !== 'primary') continue;
      if (!muscleVolume.has(me.muscle))
        muscleVolume.set(me.muscle, { totalSets: 0, totalVolume: 0, sessions: new Set() });
      const entry = muscleVolume.get(me.muscle)!;
      entry.totalSets += row.sets;
      entry.totalVolume += row.volume;
      entry.sessions.add(row.date);
    }
  }

  const volumeLabel =
    daysBack === null ? 'allTime' : `last${daysBack}Days`;

  const payload = {
    type: 'analytics',
    exportedAt: format(new Date(), 'yyyy-MM-dd'),
    exercises: exerciseData,
    [`muscleVolume_${volumeLabel}`]: Object.fromEntries(
      [...muscleVolume.entries()].map(([muscle, data]) => [
        muscle,
        {
          sessions: data.sessions.size,
          totalSets: data.totalSets,
          totalVolumeTonnage: Math.round(data.totalVolume),
        },
      ])
    ),
  };
  return JSON.stringify(payload, null, 2);
}

// Character threshold above which sharing is disabled (~10 exercises of JSON data)
export const PASTE_CHAR_LIMIT = 2_500;

// ─── AI import prompts ────────────────────────────────────────────────────────

export const EXERCISE_IMPORT_PROMPT = `You are a fitness data assistant for the Musculucos workout app. Respond ONLY with valid JSON — no markdown, no code blocks, no explanation.

To create exercises, use this exact schema:
{
  "type": "exercises",
  "exercises": [
    {
      "name": "Exercise Name",
      "equipment": "barbell | dumbbell | cable | machine | bodyweight | ez_bar",
      "equipmentVariant": "optional e.g. Seated, Rope, Wide Grip — or null",
      "muscleEmphasis": [
        { "muscle": "abs | back | biceps | chest | forearms | legs | shoulders | triceps", "head": "optional subdivision or omit", "role": "primary | secondary | stabilizer" }
      ],
      "defaultRestSeconds": 90,
      "weightMode": "total | per_side | null",
      "baseWeightKg": null,
      "weightStep": 2.5,
      "description": "optional or null"
    }
  ]
}

Valid head subdivisions by muscle:
  back: lats, upper, lower, traps, rhomboids
  biceps: long_head, short_head, brachialis
  chest: upper_chest, middle, lower_chest
  legs: quads, hamstrings, glutes, calves, adductors, hip_flexors
  shoulders: front, side, rear
  triceps: lateral, medial
  abs: obliques

Notes:
- weightMode "per_side" = user enters per-side weight (for dumbbell/per-arm exercises)
- baseWeightKg = inherent equipment weight (20 for barbell, 10 for ez_bar, null otherwise)
- Respond with ONLY the JSON object, nothing else`;

export const ROUTINE_IMPORT_SCHEMA = `You are a fitness data assistant for the Musculucos workout app. Respond ONLY with valid JSON — no markdown, no code blocks, no explanation.

To create routines, use this exact schema:
{
  "type": "routines",
  "routines": [
    {
      "name": "Routine Name",
      "description": "Short description",
      "slots": [
        [["Primary Exercise (equipment)", "Optional Alternative (equipment)"]],
        [["Single Exercise (equipment)"]],
        [["Superset Exercise A (equipment)"], ["Superset Exercise B (equipment)"]]
      ]
    }
  ]
}

Slot structure:
- Each slot = one exercise block in the workout
- slots[i] = array of exercise groups (length 1 = single exercise, length 2+ = superset)
- slots[i][j] = [primary, alt1, alt2, ...] — first entry is primary, rest are alternatives
- Format exercise names exactly as "Name (equipment)" or "Name (equipment, Variant)"`;

export async function buildRoutineImportPrompt(exerciseIds?: string[]): Promise<string> {
  const all = await ExerciseDAL.getAll();
  const exercises = exerciseIds ? all.filter((e) => exerciseIds.includes(e.id)) : all;
  const list = exercises.map((ex) => `  - ${exDisplayName(ex)}`).join('\n');

  return `${ROUTINE_IMPORT_SCHEMA}

Available exercises (use ONLY these):
${list}

Respond with ONLY the JSON object, nothing else.`;
}

// ─── Parse AI response ────────────────────────────────────────────────────────

export type AIExercise = {
  name: string;
  equipment: string;
  equipmentVariant?: string | null;
  muscleEmphasis: Exercise['muscleEmphasis'];
  defaultRestSeconds?: number | null;
  weightMode?: 'total' | 'per_side' | null;
  baseWeightKg?: number | null;
  weightStep?: number | null;
  description?: string | null;
};

export type AIRoutine = {
  name: string;
  description: string;
  slots: string[][][];
};

export type ParsedAIImport =
  | { type: 'exercises'; items: AIExercise[] }
  | { type: 'routines'; items: AIRoutine[] }
  | { type: 'error'; message: string };

export function parseAIImport(text: string): ParsedAIImport {
  try {
    let cleaned = text.trim();
    // Strip markdown code blocks if present
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

    const data = JSON.parse(cleaned);

    if (data.type === 'exercises' && Array.isArray(data.exercises)) {
      const items: AIExercise[] = data.exercises
        .map((e: any) => ({
          name: String(e.name ?? '').trim(),
          equipment: String(e.equipment ?? '').trim().toLowerCase(),
          equipmentVariant: e.equipmentVariant ?? null,
          muscleEmphasis: Array.isArray(e.muscleEmphasis) ? e.muscleEmphasis : [],
          defaultRestSeconds: typeof e.defaultRestSeconds === 'number' ? e.defaultRestSeconds : null,
          weightMode: e.weightMode ?? null,
          baseWeightKg: typeof e.baseWeightKg === 'number' ? e.baseWeightKg : null,
          weightStep: typeof e.weightStep === 'number' ? e.weightStep : null,
          description: e.description ?? null,
        }))
        .filter((e: AIExercise) => e.name && e.equipment);

      if (items.length === 0)
        return { type: 'error', message: 'No valid exercises found in the response.' };
      return { type: 'exercises', items };
    }

    if (data.type === 'routines' && Array.isArray(data.routines)) {
      const items: AIRoutine[] = data.routines
        .map((r: any) => ({
          name: String(r.name ?? '').trim(),
          description: String(r.description ?? '').trim(),
          slots: Array.isArray(r.slots) ? r.slots : [],
        }))
        .filter((r: AIRoutine) => r.name);

      if (items.length === 0)
        return { type: 'error', message: 'No valid routines found in the response.' };
      return { type: 'routines', items };
    }

    return {
      type: 'error',
      message: 'Unrecognized format. Make sure the JSON has "type": "exercises" or "type": "routines".',
    };
  } catch {
    return { type: 'error', message: 'Invalid JSON. Paste the complete AI response without modifications.' };
  }
}

// ─── Conflict detection ───────────────────────────────────────────────────────

export type ExerciseConflict = {
  item: AIExercise;
  existing: Exercise | null;
  resolution: 'update' | 'add_new' | 'skip';
};

export type RoutineConflict = {
  item: AIRoutine;
  existing: Routine | null;
  resolution: 'update' | 'add_new' | 'skip';
};

export async function detectExerciseConflicts(
  items: AIExercise[]
): Promise<ExerciseConflict[]> {
  const all = await ExerciseDAL.getAll();
  return items.map((item) => {
    const existing =
      all.find(
        (ex) =>
          ex.name.toLowerCase() === item.name.toLowerCase() &&
          ex.equipment.toLowerCase() === item.equipment.toLowerCase() &&
          (ex.equipmentVariant ?? null)?.toLowerCase() ===
            (item.equipmentVariant ?? null)?.toLowerCase()
      ) ?? null;
    return { item, existing, resolution: (existing ? 'update' : 'add_new') as ExerciseConflict['resolution'] };
  });
}

export async function detectRoutineConflicts(
  items: AIRoutine[]
): Promise<RoutineConflict[]> {
  const all = await RoutineDAL.getAll();
  return items.map((item) => {
    const existing =
      all.find((r) => r.name.toLowerCase() === item.name.toLowerCase()) ?? null;
    return { item, existing, resolution: (existing ? 'update' : 'add_new') as RoutineConflict['resolution'] };
  });
}

// ─── Apply import ─────────────────────────────────────────────────────────────

export async function applyExerciseImport(
  conflicts: ExerciseConflict[]
): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;

  for (const c of conflicts) {
    if (c.resolution === 'skip') {
      skipped++;
      continue;
    }

    if (c.resolution === 'update' && c.existing) {
      await ExerciseDAL.update(c.existing.id, {
        muscleEmphasis: c.item.muscleEmphasis,
        ...(c.item.description != null ? { description: c.item.description } : {}),
        ...(c.item.defaultRestSeconds !== undefined
          ? { defaultRestSeconds: c.item.defaultRestSeconds ?? undefined }
          : {}),
        ...(c.item.weightMode !== undefined ? { weightMode: c.item.weightMode } : {}),
        ...(c.item.baseWeightKg !== undefined
          ? { baseWeightKg: c.item.baseWeightKg ?? undefined }
          : {}),
        ...(c.item.weightStep !== undefined
          ? { weightStep: c.item.weightStep ?? undefined }
          : {}),
      });
    } else {
      const name =
        c.resolution === 'add_new' && c.existing ? `${c.item.name} (copy)` : c.item.name;
      await ExerciseDAL.save({
        id: generateId(),
        name,
        equipment: c.item.equipment,
        equipmentVariant: c.item.equipmentVariant ?? null,
        muscleEmphasis: c.item.muscleEmphasis,
        description: c.item.description ?? '',
        defaultRestSeconds: c.item.defaultRestSeconds ?? null,
        weightMode: c.item.weightMode ?? null,
        baseWeightKg: c.item.baseWeightKg ?? null,
        weightStep: c.item.weightStep ?? null,
        isFavourite: 0,
      });
    }
    imported++;
  }

  return { imported, skipped };
}

export async function applyRoutineImport(
  conflicts: RoutineConflict[],
  exerciseList: Exercise[]
): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;
  const allRoutines = await RoutineDAL.getAll();

  for (const c of conflicts) {
    if (c.resolution === 'skip') {
      skipped++;
      continue;
    }

    const resolvedSlots = c.item.slots
      .map((slot) =>
        slot
          .map((group) =>
            group
              .map((displayName) => {
                const parsed = parseDisplayName(displayName);
                if (!parsed) return null;
                const ex = exerciseList.find(
                  (e) =>
                    e.name.toLowerCase() === parsed.name.toLowerCase() &&
                    e.equipment.toLowerCase() === parsed.equipment.toLowerCase()
                );
                return ex?.id ?? null;
              })
              .filter((id): id is string => id !== null)
          )
          .filter((group) => group.length > 0)
      )
      .filter((slot) => slot.length > 0);

    let routineId: string;
    let routineOrder: number;
    let routineName: string;

    if (c.resolution === 'update' && c.existing) {
      routineId = c.existing.id;
      routineOrder = c.existing.order;
      routineName = c.item.name;
    } else {
      routineId = `routine_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      routineOrder = allRoutines.length + imported;
      routineName =
        c.resolution === 'add_new' && c.existing ? `${c.item.name} (copy)` : c.item.name;
    }

    const routine: Routine = {
      id: routineId,
      name: routineName,
      description: c.item.description,
      order: routineOrder,
      exercises: resolvedSlots.map((slot, i) => ({
        id: `re_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_${i}`,
        routineId,
        order: i,
        exerciseGroups: slot,
      })),
    };

    await RoutineDAL.save(routine);
    imported++;
  }

  return { imported, skipped };
}
