import * as SQLite from 'expo-sqlite';
import { workouts } from './workouts';
import { exercises as baseExercises, MUSCLE_GROUP_MAP, type Exercise } from './exercises';
import type { Block, WorkoutEvent, Workout, SubSet, Routine, RoutineExercise } from './types';

export const db = SQLite.openDatabaseSync('workouts.db');

// Raw shapes as returned by SQLite before enrichment
type WorkoutRow = { id: string; date: string; durationSeconds: number; notes: string };
type BlockRow = {
  id: string;
  workoutId: string;
  order: number;
  type: string;
  name: string;
  exerciseIds: string;
  sets: number;
  datetime: string;
  alternativeExerciseOptions: string | null;
};
type EventRow = {
  id: number;
  blockId: string;
  type: string;
  exerciseId: string | null;
  parentEventId: string | null;
  weightKg: number | null;
  rep_type: string | null;
  reps: number | null;
  rpe: number | null;
  durationSeconds: number | null;
  datetime: string;
};
type ExerciseRow = {
  id: string;
  name: string;
  equipment: string;
  equipmentVariant: string | null;
  muscleEmphasis: string;
  description: string;
  videoUrl: string;
  defaultRestSeconds: number | null;
  baseWeightKg: number | null;
  weightMode: string | null;
  weightStep: number | null;
  weightStack: string | null;
  isCustom: number;
  isFavourite: number;
};

export type PersonalRecord = {
  id: string;
  exerciseId: string;
  reps: number;
  weightKg: number;
  blockId: string;
  date: string;
  datetime: string;
};

let _dbInitialized = false;
export const initDB = () => {
  if (_dbInitialized) return;
  _dbInitialized = true;
  // Toggle these to wipe the DB during development
  // db.execSync('DROP TABLE IF EXISTS events;');
  // db.execSync('DROP TABLE IF EXISTS blocks;');
  // db.execSync('DROP TABLE IF EXISTS workouts;');
  // db.execSync('DROP TABLE IF EXISTS muscle_group_map;');
  // db.execSync('DROP TABLE IF EXISTS exercises;');

  db.execSync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS muscle_group_map (
      muscle TEXT PRIMARY KEY NOT NULL,
      groupId TEXT NOT NULL,
      groupLabel TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS custom_equipment (
      id TEXT PRIMARY KEY NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      equipment TEXT,
      equipmentVariant TEXT,
      muscleEmphasis TEXT,
      description TEXT,
      videoUrl TEXT,
      defaultRestSeconds INTEGER,
      baseWeightKg REAL,
      weightMode TEXT,
      weightStep REAL,
      weightStack TEXT,
      isCustom INTEGER NOT NULL DEFAULT 0,
      isFavourite INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY NOT NULL,
      date TEXT UNIQUE NOT NULL,
      durationSeconds INTEGER,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS blocks (
      id TEXT PRIMARY KEY NOT NULL,
      workoutId TEXT NOT NULL,
      [order] INTEGER,
      type TEXT,
      name TEXT,
      exerciseIds TEXT,
      sets INTEGER,
      datetime TEXT,
      FOREIGN KEY (workoutId) REFERENCES workouts (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blockId TEXT NOT NULL,
      type TEXT,
      exerciseId TEXT,
      parentEventId TEXT, -- Used to group subSets together
      weightKg REAL,
      rep_type TEXT,
      reps INTEGER,
      rpe REAL,
      durationSeconds INTEGER,
      datetime TEXT,
      FOREIGN KEY (blockId) REFERENCES blocks (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS prefs (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS routines (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      [order] INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS routine_exercises (
      id TEXT PRIMARY KEY NOT NULL,
      routineId TEXT NOT NULL,
      [order] INTEGER DEFAULT 0,
      exerciseGroups TEXT NOT NULL,
      FOREIGN KEY (routineId) REFERENCES routines (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS personal_records (
      id TEXT PRIMARY KEY NOT NULL,
      exerciseId TEXT NOT NULL,
      reps INTEGER NOT NULL,
      weightKg REAL NOT NULL,
      blockId TEXT NOT NULL,
      date TEXT NOT NULL,
      datetime TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pr_exercise_reps ON personal_records (exerciseId, reps);
  `);

  // ── Migrations ────────────────────────────────────────────────────────────
  try { db.execSync('ALTER TABLE exercises ADD COLUMN isFavourite INTEGER NOT NULL DEFAULT 0'); } catch {}
  try { db.execSync('ALTER TABLE exercises ADD COLUMN defaultRestSeconds INTEGER'); } catch {}
  try { db.execSync('ALTER TABLE exercises ADD COLUMN baseWeightKg REAL'); } catch {}
  try { db.execSync('ALTER TABLE exercises ADD COLUMN equipmentVariant TEXT'); } catch {}
  try {
    db.execSync('ALTER TABLE exercises ADD COLUMN weightMode TEXT DEFAULT NULL');
  } catch {}
  try {
    db.execSync('ALTER TABLE exercises ADD COLUMN weightStep REAL DEFAULT NULL');
  } catch {}
  try {
    db.execSync('ALTER TABLE exercises ADD COLUMN weightStack TEXT DEFAULT NULL');
  } catch {}
  try { db.execSync('ALTER TABLE exercises DROP COLUMN baseId'); } catch {}
  try { db.execSync('ALTER TABLE blocks ADD COLUMN alternativeExerciseOptions TEXT DEFAULT NULL'); } catch {}
  try { db.execSync('ALTER TABLE blocks ADD COLUMN exerciseWeightModes TEXT DEFAULT NULL'); } catch {}
  try { db.execSync('CREATE TABLE IF NOT EXISTS personal_records (id TEXT PRIMARY KEY NOT NULL, exerciseId TEXT NOT NULL, reps INTEGER NOT NULL, weightKg REAL NOT NULL, blockId TEXT NOT NULL, date TEXT NOT NULL, datetime TEXT NOT NULL)'); } catch {}
  try { db.execSync('CREATE INDEX IF NOT EXISTS idx_pr_exercise_reps ON personal_records (exerciseId, reps)'); } catch {}
  // Backfill equipmentVariant for exercises that previously had none
  try {
    db.execSync(`
      UPDATE exercises SET equipmentVariant = 'Wide Grip'  WHERE id = 'lat_pulldown_wide_cable'        AND (equipmentVariant IS NULL OR equipmentVariant = '');
      UPDATE exercises SET equipmentVariant = 'Close Grip' WHERE id = 'lat_pulldown_close_grip_cable'  AND (equipmentVariant IS NULL OR equipmentVariant = '');
      UPDATE exercises SET equipmentVariant = 'V-Bar'      WHERE id = 'tricep_pushdown_vbar_cable'     AND (equipmentVariant IS NULL OR equipmentVariant = '');
      UPDATE exercises SET equipmentVariant = 'Rope'       WHERE id = 'tricep_pushdown_rope_cable'     AND (equipmentVariant IS NULL OR equipmentVariant = '');
      UPDATE exercises SET equipmentVariant = 'Rope'       WHERE id = 'overhead_tricep_ext_rope_cable' AND (equipmentVariant IS NULL OR equipmentVariant = '');
      UPDATE exercises SET equipmentVariant = 'Lying'      WHERE id = 'leg_curl_lying_machine'         AND (equipmentVariant IS NULL OR equipmentVariant = '');
      UPDATE exercises SET equipmentVariant = 'Seated'     WHERE id = 'leg_curl_seated_machine'        AND (equipmentVariant IS NULL OR equipmentVariant = '');
      UPDATE exercises SET equipmentVariant = 'Standing'   WHERE id = 'calf_raise_standing_machine'    AND (equipmentVariant IS NULL OR equipmentVariant = '');
      UPDATE exercises SET equipmentVariant = 'Seated'     WHERE id = 'calf_raise_seated_machine'      AND (equipmentVariant IS NULL OR equipmentVariant = '');
      UPDATE exercises SET equipmentVariant = 'Goblet'     WHERE id = 'squat_goblet_dumbbell'          AND (equipmentVariant IS NULL OR equipmentVariant = '');
    `);
  } catch {}
  // db.execSync(`UPDATE events SET rep_type = 'half' WHERE rep_type IN ('top half', 'bot half', 'top 1/2', 'bot 1/2')`);
  // ─────────────────────────────────────────────────────────────────────────

  // TEMP: seed test favourites — delete these two lines after testing
  // db.execSync("UPDATE exercises SET isFavourite = 1 WHERE id = 'incline_press_barbell'");
  // db.execSync("UPDATE exercises SET isFavourite = 1 WHERE id = 'tricep_pushdown_vbar_cable'");

  // Clean up any rest events left at 0s by a force-quit during an active rest
  db.execSync(`DELETE FROM events WHERE type = 'rest' AND durationSeconds = 0`);

  // Seed base exercises on first install (no-op if already seeded).
  // Run sequentially to avoid concurrent transaction conflicts.
  setTimeout(async () => {
    try {
      await ExerciseDAL.seedBaseExercises();
      await RoutineDAL.seedSampleRoutines();
    } catch (e) {
      console.error('Seed failed:', e);
    }
  }, 0);
};
let saveQueue = Promise.resolve();
export const WorkoutDAL = {
  async updateEvent(
    eventId: number,
    updates: Partial<Pick<SubSet, 'weightKg' | 'reps' | 'rpe' | 'durationSeconds' | 'rep_type'>>
  ) {
    try {
      await db.runAsync(
        `UPDATE events
         SET weightKg = ?, reps = ?, rpe = ?, durationSeconds = ?, type = ?
         WHERE id = ?`,
        [
          updates.weightKg,
          updates.reps,
          updates.rpe,
          updates.durationSeconds,
          updates.type,
          eventId,
        ]
      );
    } catch (error) {
      console.error('DB Update Error:', error);
      throw error;
    }
  },

  async finalizeOrphanedRest(blockId: string, durationSeconds: number) {
    saveQueue = saveQueue.then(() =>
      db.runAsync(
        `UPDATE events SET durationSeconds = ? WHERE blockId = ? AND type = 'rest' AND durationSeconds = 0`,
        [durationSeconds, blockId]
      )
    );
    return saveQueue;
  },

  async saveFullWorkout(workout: Workout) {
    // We chain every call onto the saveQueue to ensure sequential execution
    saveQueue = saveQueue.then(async () => {
      try {
        await db.withTransactionAsync(async () => {
          // 1. Update/Insert the main workout
          await db.runAsync(
            'INSERT OR REPLACE INTO workouts (id, date, durationSeconds, notes) VALUES (?, ?, ?, ?)',
            [workout.id, workout.date, workout.durationSeconds || 0, workout.notes || '']
          );

          // PR re-eval: collect old blockIds BEFORE deletion
          const oldBlockRows = await db.getAllAsync<{ id: string }>(
            'SELECT id FROM blocks WHERE workoutId = ?',
            [workout.id]
          );
          const allBlockIds = [
            ...new Set([
              ...oldBlockRows.map((r) => r.id),
              ...workout.blocks.map((b) => b.id),
            ]),
          ];
          if (allBlockIds.length > 0) {
            await db.runAsync(
              `DELETE FROM personal_records WHERE blockId IN (${allBlockIds.map(() => '?').join(',')})`,
              allBlockIds
            );
          }

          // 2. Clear existing blocks.
          // Because of "ON DELETE CASCADE" in your initDB,
          // this automatically deletes all associated events!
          await db.runAsync('DELETE FROM blocks WHERE workoutId = ?', [workout.id]);

          // 3. Loop through blocks and insert
          for (const block of workout.blocks) {
            await db.runAsync(
              'INSERT INTO blocks (id, workoutId, [order], type, name, exerciseIds, sets, datetime, alternativeExerciseOptions, exerciseWeightModes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [
                block.id,
                workout.id,
                block.order,
                block.type,
                block.name,
                JSON.stringify(block.exerciseIds),
                block.sets,
                block.datetime,
                block.alternativeExerciseOptions ? JSON.stringify(block.alternativeExerciseOptions) : null,
                block.exerciseWeightModes ? JSON.stringify(block.exerciseWeightModes) : null,
              ]
            );

            // 4. Insert the Events
            for (const event of block.events) {
              if (event.type === 'set' && event.subSets) {
                const parentEventId = `group_${block.id}_${event.datetime}`;
                for (const sub of event.subSets) {
                  await db.runAsync(
                    `INSERT INTO events (blockId, type, exerciseId, parentEventId, weightKg, rep_type, reps, rpe, datetime)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                      block.id,
                      'set',
                      sub.exerciseId,
                      parentEventId,
                      sub.weightKg,
                      sub.rep_type,
                      sub.reps,
                      sub.rpe,
                      sub.datetime,
                    ]
                  );
                }
              } else {
                await db.runAsync(
                  `INSERT INTO events (blockId, type, durationSeconds, datetime) VALUES (?, ?, ?, ?)`,
                  [block.id, 'rest', event.durationSeconds, event.datetime]
                );
              }
            }
          }

          // Re-evaluate PRs for all blocks in this workout (in chronological order)
          const sortedBlocks = [...workout.blocks].sort((a, b) => a.order - b.order);
          for (const block of sortedBlocks) {
            for (const event of block.events) {
              if (event.type !== 'set' || !event.subSets) continue;
              for (const sub of event.subSets) {
                if (sub.rep_type === 'warmup') continue;
                const dominated = await db.getFirstAsync<{ id: string }>(
                  'SELECT id FROM personal_records WHERE exerciseId = ? AND weightKg >= ? AND reps >= ? LIMIT 1',
                  [sub.exerciseId, sub.weightKg, sub.reps]
                );
                if (!dominated) {
                  const prId = `pr_${block.id}_${sub.exerciseId}_${sub.reps}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                  await db.runAsync(
                    'INSERT INTO personal_records (id, exerciseId, reps, weightKg, blockId, date, datetime) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [prId, sub.exerciseId, sub.reps, sub.weightKg, block.id, workout.date, sub.datetime ?? new Date().toISOString()]
                  );
                }
              }
            }
          }
        });
      } catch (error) {
        console.error('Transaction failed in queue:', error);
        // We don't re-throw here unless you want the UI to crash;
        // the queue will continue to the next item regardless.
      }
    });

    return saveQueue;
  },

  async getWorkoutByDate(date: string): Promise<Workout | null> {
    const workout = await db.getFirstAsync<WorkoutRow>('SELECT * FROM workouts WHERE date = ?', [
      date,
    ]);
    if (!workout) return null;

    // Build exercise lookup from DB (includes custom exercises)
    const exerciseRows = await db.getAllAsync<ExerciseRow>('SELECT * FROM exercises');
    const exerciseLookup = new Map<string, Exercise>(
      exerciseRows.map((r) => [
        r.id,
        {
          ...r,
          muscleEmphasis: r.muscleEmphasis ? JSON.parse(r.muscleEmphasis) : [],
          weightMode: (r.weightMode as 'total' | 'per_side' | null) ?? null,
          weightStep: r.weightStep ?? null,
          weightStack: r.weightStack ? (JSON.parse(r.weightStack) as number[]) : null,
        },
      ])
    );

    const blocks = await db.getAllAsync<BlockRow>(
      'SELECT * FROM blocks WHERE workoutId = ? ORDER BY [order] ASC',
      [workout.id]
    );

    const blocksWithEvents: Block[] = await Promise.all(
      blocks.map(async (block) => {
        const rows = await db.getAllAsync<EventRow>(
          'SELECT * FROM events WHERE blockId = ? ORDER BY id ASC',
          [block.id]
        );

        // Group the flat rows back into the nested structure the UI expects
        const formattedEvents: WorkoutEvent[] = [];
        const groupMap: Record<
          string,
          { id: string; type: 'set'; datetime: string; subSets: SubSet[] }
        > = {};

        rows.forEach((row) => {
          if (row.type === 'set' && row.parentEventId) {
            if (!groupMap[row.parentEventId]) {
              groupMap[row.parentEventId] = {
                id: row.parentEventId,
                type: 'set',
                datetime: row.datetime,
                subSets: [],
              };
              formattedEvents.push(groupMap[row.parentEventId]);
            }
            groupMap[row.parentEventId].subSets.push({
              ...row,
              id: row.id.toString(),
              type: 'set',
              exerciseId: row.exerciseId ?? '',
              parentEventId: row.parentEventId,
              weightKg: row.weightKg ?? 0,
              rep_type: (row.rep_type ?? 'full') as SubSet['rep_type'],
              reps: row.reps ?? 0,
              rpe: row.rpe ?? 8,
              durationSeconds: null,
              exercise: exerciseLookup.get(row.exerciseId ?? '') ?? null,
            });
          } else if (row.type === 'rest') {
            formattedEvents.push({
              id: row.id.toString(),
              type: 'rest',
              durationSeconds: row.durationSeconds ?? 0,
              datetime: row.datetime,
            });
          }
        });

        const exerciseIds: string[] = block.exerciseIds ? JSON.parse(block.exerciseIds) : [];
        const resolvedExercises = exerciseIds
          .map((id) => exerciseLookup.get(id))
          .filter((e): e is Exercise => e != null);
        // Derive name fresh from exercises so renames are reflected immediately
        const freshName =
          resolvedExercises.length > 0
            ? resolvedExercises.map((e) => e.name).join(' / ')
            : block.name;
        const alternativeExerciseOptions: string[][] | null = block.alternativeExerciseOptions
          ? JSON.parse(block.alternativeExerciseOptions)
          : null;
        const exerciseWeightModes: Record<string, 'total' | 'per_side'> | undefined =
          block.exerciseWeightModes ? JSON.parse(block.exerciseWeightModes) : undefined;
        const prCountRow = await db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM personal_records WHERE blockId = ?',
          [block.id]
        );
        const prCount = prCountRow?.count ?? 0;
        return {
          ...block,
          name: freshName,
          type: block.type as Block['type'],
          exerciseIds,
          exercises: resolvedExercises,
          events: formattedEvents,
          alternativeExerciseOptions,
          exerciseWeightModes,
          prCount,
        };
      })
    );

    return { ...workout, blocks: blocksWithEvents };
  },

  // Add this helper to insert a single event without rebuilding the world
  async addEvent(blockId: string, event: WorkoutEvent) {
    try {
      if (event.type === 'set') {
        const parentEventId = event.id;
        for (const sub of event.subSets) {
          await db.runAsync(
            `INSERT INTO events (blockId, type, exerciseId, parentEventId, weightKg, rep_type, reps, rpe, datetime)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              blockId,
              'set',
              sub.exerciseId,
              parentEventId,
              sub.weightKg,
              sub.rep_type,
              sub.reps,
              sub.rpe,
              sub.datetime,
            ]
          );
        }
        // Check PRs for working sets
        const dateRow = await db.getFirstAsync<{ date: string }>(
          'SELECT w.date FROM workouts w JOIN blocks b ON b.workoutId = w.id WHERE b.id = ?',
          [blockId]
        );
        const date = dateRow?.date ?? new Date().toISOString().slice(0, 10);
        for (const sub of event.subSets) {
          if (sub.rep_type === 'warmup') continue;
          const dominated = await db.getFirstAsync<{ id: string }>(
            'SELECT id FROM personal_records WHERE exerciseId = ? AND weightKg >= ? AND reps >= ? LIMIT 1',
            [sub.exerciseId, sub.weightKg, sub.reps]
          );
          if (!dominated) {
            const prId = `pr_${blockId}_${sub.exerciseId}_${sub.reps}_${Date.now()}`;
            await db.runAsync(
              'INSERT INTO personal_records (id, exerciseId, reps, weightKg, blockId, date, datetime) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [prId, sub.exerciseId, sub.reps, sub.weightKg, blockId, date, sub.datetime ?? new Date().toISOString()]
            );
          }
        }
      } else {
        await db.runAsync(
          `INSERT INTO events (blockId, type, durationSeconds, datetime) VALUES (?, ?, ?, ?)`,
          [blockId, 'rest', event.durationSeconds, event.datetime]
        );
      }
    } catch (e) {
      console.error('Atomic insert failed', e);
    }
  },

  // Optimized: Just removes one event or subset
  async deleteEventAtomic(eventId: string) {
    // This deletes the rest event OR all sub-sets sharing a parentEventId
    await db.runAsync('DELETE FROM events WHERE id = ? OR parentEventId = ?', [eventId, eventId]);
  },
};

export const PRDAL = {
  async getBestsMap(
    exerciseIds: string[],
    excludeBlockId: string
  ): Promise<Record<string, number>> {
    if (exerciseIds.length === 0) return {};
    const placeholders = exerciseIds.map(() => '?').join(',');
    const rows = await db.getAllAsync<{ exerciseId: string; reps: number; maxKg: number }>(
      `SELECT exerciseId, reps, MAX(weightKg) as maxKg
       FROM personal_records
       WHERE exerciseId IN (${placeholders}) AND blockId != ?
       GROUP BY exerciseId, reps`,
      [...exerciseIds, excludeBlockId]
    );
    const map: Record<string, number> = {};
    for (const row of rows) {
      map[`${row.exerciseId}:${row.reps}`] = row.maxKg;
    }
    return map;
  },

  async getCountForBlock(blockId: string): Promise<number> {
    const row = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM personal_records WHERE blockId = ?',
      [blockId]
    );
    return row?.count ?? 0;
  },

  async getPRsForExercises(
    exerciseIds: string[],
    excludeBlockId: string
  ): Promise<Array<{ exerciseId: string; reps: number; weightKg: number }>> {
    if (exerciseIds.length === 0) return [];
    const placeholders = exerciseIds.map(() => '?').join(',');
    return db.getAllAsync<{ exerciseId: string; reps: number; weightKg: number }>(
      `SELECT exerciseId, reps, MAX(weightKg) as weightKg
       FROM personal_records
       WHERE exerciseId IN (${placeholders}) AND blockId != ?
       GROUP BY exerciseId, reps`,
      [...exerciseIds, excludeBlockId]
    );
  },

  async getForExercise(exerciseId: string): Promise<Set<string>> {
    const rows = await db.getAllAsync<{ date: string; reps: number; weightKg: number }>(
      'SELECT date, reps, weightKg FROM personal_records WHERE exerciseId = ?',
      [exerciseId]
    );
    return new Set(rows.map((r) => `${r.date}:${r.reps}:${r.weightKg}`));
  },

  async getAll(): Promise<PersonalRecord[]> {
    return db.getAllAsync<PersonalRecord>(
      'SELECT * FROM personal_records ORDER BY datetime DESC'
    );
  },
};

export const ExerciseDAL = {
  async seedBaseExercises() {
    const existing = await db.getFirstAsync('SELECT id FROM exercises LIMIT 1');
    if (existing) {
      // Re-sync muscleEmphasis for all base exercises (isCustom = 0)
      for (const ex of baseExercises) {
        await db.runAsync(
          `UPDATE exercises SET muscleEmphasis = ? WHERE id = ? AND isCustom = 0`,
          [JSON.stringify(ex.muscleEmphasis ?? []), ex.id]
        );
      }
      return;
    }

    for (const [muscle, { groupId, groupLabel }] of Object.entries(MUSCLE_GROUP_MAP)) {
      await db.runAsync(
        'INSERT OR IGNORE INTO muscle_group_map (muscle, groupId, groupLabel) VALUES (?, ?, ?)',
        [muscle, groupId, groupLabel]
      );
    }

    for (const ex of baseExercises) {
      await db.runAsync(
        `INSERT OR IGNORE INTO exercises (id, name, equipment, muscleEmphasis, description, videoUrl, isCustom)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [
          ex.id,
          ex.name,
          ex.equipment ?? '',
          JSON.stringify(ex.muscleEmphasis ?? []),
          ex.description ?? '',
          ex.videoUrl ?? '',
        ]
      );
    }
  },

  async getAll(): Promise<Exercise[]> {
    const rows = await db.getAllAsync<ExerciseRow>(
      'SELECT * FROM exercises ORDER BY name COLLATE NOCASE ASC, equipment COLLATE NOCASE ASC'
    );
    return rows.map((r) => ({
      ...r,
      muscleEmphasis: r.muscleEmphasis ? JSON.parse(r.muscleEmphasis) : [],
      isFavourite: r.isFavourite ?? 0,
      defaultRestSeconds: r.defaultRestSeconds ?? null,
      baseWeightKg: r.baseWeightKg ?? null,
      equipmentVariant: r.equipmentVariant ?? null,
      weightMode: (r.weightMode as 'total' | 'per_side' | null) ?? null,
      weightStep: r.weightStep ?? null,
      weightStack: r.weightStack ? (JSON.parse(r.weightStack) as number[]) : null,
    }));
  },

  async getMuscleGroupMap(): Promise<Record<string, { groupId: string; groupLabel: string }>> {
    const rows = await db.getAllAsync<{ muscle: string; groupId: string; groupLabel: string }>(
      'SELECT * FROM muscle_group_map'
    );
    return Object.fromEntries(
      rows.map((r) => [r.muscle, { groupId: r.groupId, groupLabel: r.groupLabel }])
    );
  },

  async getByIds(ids: string[]): Promise<Exercise[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const rows = await db.getAllAsync<ExerciseRow>(
      `SELECT * FROM exercises WHERE id IN (${placeholders})`,
      ids
    );
    return rows.map((r) => ({
      ...r,
      muscleEmphasis: r.muscleEmphasis ? JSON.parse(r.muscleEmphasis) : [],
      isFavourite: r.isFavourite ?? 0,
      defaultRestSeconds: r.defaultRestSeconds ?? null,
      baseWeightKg: r.baseWeightKg ?? null,
      equipmentVariant: r.equipmentVariant ?? null,
      weightMode: (r.weightMode as 'total' | 'per_side' | null) ?? null,
      weightStep: r.weightStep ?? null,
      weightStack: r.weightStack ? (JSON.parse(r.weightStack) as number[]) : null,
    }));
  },

  async getByName(name: string): Promise<Exercise[]> {
    const rows = await db.getAllAsync<ExerciseRow>(
      'SELECT * FROM exercises WHERE name = ? COLLATE NOCASE ORDER BY equipment COLLATE NOCASE ASC',
      [name]
    );
    return rows.map((r) => ({
      ...r,
      muscleEmphasis: r.muscleEmphasis ? JSON.parse(r.muscleEmphasis) : [],
      isFavourite: r.isFavourite ?? 0,
      defaultRestSeconds: r.defaultRestSeconds ?? null,
      baseWeightKg: r.baseWeightKg ?? null,
      equipmentVariant: r.equipmentVariant ?? null,
      weightMode: (r.weightMode as 'total' | 'per_side' | null) ?? null,
      weightStep: r.weightStep ?? null,
      weightStack: r.weightStack ? (JSON.parse(r.weightStack) as number[]) : null,
    }));
  },

  async save(exercise: Omit<Exercise, 'isCustom'>) {
    await db.runAsync(
      `INSERT INTO exercises (id, name, equipment, equipmentVariant, muscleEmphasis, description, videoUrl, defaultRestSeconds, baseWeightKg, weightMode, weightStep, weightStack, isCustom)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        exercise.id,
        exercise.name,
        exercise.equipment ?? '',
        exercise.equipmentVariant ?? null,
        JSON.stringify(exercise.muscleEmphasis ?? []),
        exercise.description ?? '',
        exercise.videoUrl ?? '',
        exercise.defaultRestSeconds ?? null,
        exercise.baseWeightKg ?? null,
        exercise.weightMode ?? null,
        exercise.weightStep ?? null,
        exercise.weightStack ? JSON.stringify(exercise.weightStack) : null,
      ]
    );
  },

  async update(
    id: string,
    updates: Partial<
      Pick<
        Exercise,
        | 'name'
        | 'equipment'
        | 'equipmentVariant'
        | 'muscleEmphasis'
        | 'description'
        | 'videoUrl'
        | 'defaultRestSeconds'
        | 'baseWeightKg'
        | 'weightMode'
        | 'weightStep'
        | 'weightStack'
      >
    >
  ) {
    await db.runAsync(
      `UPDATE exercises
       SET name = COALESCE(?, name),
           equipment = COALESCE(?, equipment),
           equipmentVariant = CASE WHEN ? THEN ? ELSE equipmentVariant END,
           muscleEmphasis = COALESCE(?, muscleEmphasis),
           description = COALESCE(?, description),
           videoUrl = COALESCE(?, videoUrl),
           defaultRestSeconds = ?,
           baseWeightKg = ?,
           weightMode = CASE WHEN ? THEN ? ELSE weightMode END,
           weightStep = ?,
           weightStack = ?
       WHERE id = ?`,
      [
        updates.name ?? null,
        updates.equipment ?? null,
        'equipmentVariant' in updates ? 1 : 0,
        updates.equipmentVariant ?? null,
        updates.muscleEmphasis ? JSON.stringify(updates.muscleEmphasis) : null,
        updates.description ?? null,
        updates.videoUrl ?? null,
        updates.defaultRestSeconds ?? null,
        updates.baseWeightKg ?? null,
        'weightMode' in updates ? 1 : 0,
        updates.weightMode ?? null,
        updates.weightStep ?? null,
        updates.weightStack ? JSON.stringify(updates.weightStack) : null,
        id,
      ]
    );
  },

  async adjustSetWeights(exerciseId: string, delta: number) {
    await db.runAsync(
      `UPDATE events SET weightKg = weightKg + ? WHERE exerciseId = ? AND type = 'set' AND weightKg IS NOT NULL`,
      [delta, exerciseId]
    );
  },

  async delete(id: string) {
    await db.runAsync('DELETE FROM exercises WHERE id = ?', [id]);
    await ExerciseDAL.cleanupUnusedCustomEquipment();
  },

  async cleanupUnusedCustomEquipment(): Promise<void> {
    await db.runAsync(
      `DELETE FROM custom_equipment
       WHERE id NOT IN (SELECT DISTINCT equipment FROM exercises WHERE equipment IS NOT NULL AND equipment != '')`
    );
  },

  async getCustomEquipment(): Promise<string[]> {
    const rows = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM custom_equipment ORDER BY id'
    );
    return rows.map((r) => r.id);
  },

  async saveCustomEquipment(id: string): Promise<void> {
    await db.runAsync('INSERT OR IGNORE INTO custom_equipment (id) VALUES (?)', [id]);
  },

  async setFavourite(id: string, isFavourite: boolean) {
    await db.runAsync('UPDATE exercises SET isFavourite = ? WHERE id = ?', [
      isFavourite ? 1 : 0,
      id,
    ]);
  },

  async getExerciseStats(): Promise<Record<string, ExerciseStat>> {
    const statsRows = await db.getAllAsync<{
      exerciseId: string;
      lastTrainedAt: string;
      workoutCount: number;
      maxWeightKg: number;
    }>(`
      SELECT
        e.exerciseId,
        MAX(w.date) as lastTrainedAt,
        COUNT(DISTINCT b.workoutId) as workoutCount,
        MAX(COALESCE(e.weightKg, 0)) as maxWeightKg
      FROM events e
      JOIN blocks b ON e.blockId = b.id
      JOIN workouts w ON b.workoutId = w.id
      WHERE e.exerciseId IS NOT NULL
      GROUP BY e.exerciseId
    `);

    const repsRows = await db.getAllAsync<{ exerciseId: string; reps: number; weightKg: number }>(`
      SELECT exerciseId, reps, COALESCE(weightKg, 0) as weightKg
      FROM events
      WHERE exerciseId IS NOT NULL
      ORDER BY datetime DESC
    `);

    const statsMap: Record<string, ExerciseStat> = {};
    for (const row of statsRows) {
      statsMap[row.exerciseId] = {
        lastTrainedAt: row.lastTrainedAt,
        workoutCount: row.workoutCount,
        maxWeightKg: row.maxWeightKg,
        repsAtMaxWeight: null,
      };
    }

    const repsFilled = new Set<string>();
    for (const row of repsRows) {
      if (repsFilled.has(row.exerciseId)) continue;
      const stat = statsMap[row.exerciseId];
      if (stat && row.weightKg === stat.maxWeightKg) {
        stat.repsAtMaxWeight = row.reps;
        repsFilled.add(row.exerciseId);
      }
    }

    return statsMap;
  },

  async getMuscleStats(
    startDate: string | null
  ): Promise<Array<{ exerciseId: string; date: string; volume: number; sets: number }>> {
    if (startDate) {
      return db.getAllAsync<{ exerciseId: string; date: string; volume: number; sets: number }>(
        `SELECT ev.exerciseId, w.date,
                SUM(CASE WHEN COALESCE(ev.rep_type, 'full') = 'half' THEN 0.5 ELSE 1.0 END * COALESCE(ev.weightKg, 0) * COALESCE(ev.reps, 0)) as volume,
                COUNT(*) as sets
         FROM events ev
         JOIN blocks b ON ev.blockId = b.id
         JOIN workouts w ON b.workoutId = w.id
         WHERE ev.exerciseId IS NOT NULL
           AND COALESCE(ev.rep_type, 'full') != 'warmup'
           AND w.date >= ?
         GROUP BY ev.exerciseId, w.date`,
        [startDate]
      );
    }
    return db.getAllAsync<{ exerciseId: string; date: string; volume: number; sets: number }>(
      `SELECT ev.exerciseId, w.date,
              SUM(CASE WHEN COALESCE(ev.rep_type, 'full') = 'half' THEN 0.5 ELSE 1.0 END * COALESCE(ev.weightKg, 0) * COALESCE(ev.reps, 0)) as volume,
              COUNT(*) as sets
       FROM events ev
       JOIN blocks b ON ev.blockId = b.id
       JOIN workouts w ON b.workoutId = w.id
       WHERE ev.exerciseId IS NOT NULL
         AND COALESCE(ev.rep_type, 'full') != 'warmup'
       GROUP BY ev.exerciseId, w.date`
    );
  },

  async getExerciseHistory(
    exerciseId: string,
    limit: number,
    offset: number
  ): Promise<HistoryWorkout[]> {
    const dateRows = await db.getAllAsync<{ date: string }>(
      `SELECT DISTINCT w.date
       FROM events e
       JOIN blocks b ON e.blockId = b.id
       JOIN workouts w ON b.workoutId = w.id
       WHERE e.exerciseId = ? AND e.type = 'set'
       ORDER BY w.date DESC
       LIMIT ? OFFSET ?`,
      [exerciseId, limit, offset]
    );
    if (dateRows.length === 0) return [];

    const dates = dateRows.map((r) => r.date);
    const placeholders = dates.map(() => '?').join(',');

    const rows = await db.getAllAsync<{
      date: string;
      weightKg: number | null;
      reps: number | null;
      rpe: number | null;
      rep_type: string | null;
      parentEventId: string;
    }>(
      `SELECT w.date, e.weightKg, e.reps, e.rpe, e.rep_type, e.parentEventId
       FROM events e
       JOIN blocks b ON e.blockId = b.id
       JOIN workouts w ON b.workoutId = w.id
       WHERE e.exerciseId = ? AND e.type = 'set' AND w.date IN (${placeholders})
       ORDER BY w.date DESC, e.id ASC`,
      [exerciseId, ...dates]
    );

    const byDate = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!byDate.has(row.date)) byDate.set(row.date, []);
      byDate.get(row.date)!.push(row);
    }

    return dates.map((date) => {
      const sets = byDate.get(date) ?? [];
      const working = sets.filter((s) => s.rep_type !== 'warmup');
      const workingParentIds = new Set(working.map((s) => s.parentEventId));
      const maxWeightKg = sets.length > 0 ? Math.max(...sets.map((s) => s.weightKg ?? 0)) : 0;
      const totalVolume = working.reduce(
        (sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0) * (s.rep_type === 'half' ? 0.5 : 1),
        0
      );
      return {
        date,
        sets: sets.map((s) => ({
          weightKg: s.weightKg ?? 0,
          reps: s.reps ?? 0,
          rpe: s.rpe ?? null,
          rep_type: s.rep_type ?? 'full',
          parentEventId: s.parentEventId,
        })),
        workingSets: workingParentIds.size,
        maxWeightKg,
        totalVolume,
      };
    });
  },
};

export type ExerciseStat = {
  lastTrainedAt: string | null;
  workoutCount: number;
  maxWeightKg: number | null;
  repsAtMaxWeight: number | null;
};

export type HistorySet = {
  weightKg: number;
  reps: number;
  rpe: number | null;
  rep_type: string;
  parentEventId: string;
};
export type HistoryWorkout = {
  date: string;
  sets: HistorySet[];
  workingSets: number;
  maxWeightKg: number;
  totalVolume: number;
};

export const PrefsDAL = {
  async get(key: string): Promise<string | null> {
    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM prefs WHERE key = ?', [
      key,
    ]);
    return row?.value ?? null;
  },
  async set(key: string, value: string): Promise<void> {
    await db.runAsync('INSERT OR REPLACE INTO prefs (key, value) VALUES (?, ?)', [key, value]);
  },
};

// ─── RoutineDAL ───────────────────────────────────────────────────────────────

type RoutineRow = { id: string; name: string; description: string | null; order: number };
type RoutineExerciseRow = { id: string; routineId: string; order: number; exerciseGroups: string };

export const RoutineDAL = {
  async getAll(): Promise<Routine[]> {
    const routineRows = await db.getAllAsync<RoutineRow>(
      'SELECT * FROM routines ORDER BY [order] ASC'
    );
    if (routineRows.length === 0) return [];
    const exRows = await db.getAllAsync<RoutineExerciseRow>(
      'SELECT * FROM routine_exercises ORDER BY routineId, [order] ASC'
    );
    const exByRoutine = new Map<string, RoutineExercise[]>();
    for (const r of exRows) {
      if (!exByRoutine.has(r.routineId)) exByRoutine.set(r.routineId, []);
      exByRoutine.get(r.routineId)!.push({
        id: r.id,
        routineId: r.routineId,
        order: r.order,
        exerciseGroups: JSON.parse(r.exerciseGroups),
      });
    }
    return routineRows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? '',
      order: r.order,
      exercises: exByRoutine.get(r.id) ?? [],
    }));
  },

  async save(routine: Routine): Promise<void> {
    await db.runAsync(
      'INSERT OR REPLACE INTO routines (id, name, description, [order]) VALUES (?, ?, ?, ?)',
      [routine.id, routine.name, routine.description ?? '', routine.order]
    );
    await db.runAsync('DELETE FROM routine_exercises WHERE routineId = ?', [routine.id]);
    for (const ex of routine.exercises) {
      await db.runAsync(
        'INSERT INTO routine_exercises (id, routineId, [order], exerciseGroups) VALUES (?, ?, ?, ?)',
        [ex.id, routine.id, ex.order, JSON.stringify(ex.exerciseGroups)]
      );
    }
  },

  async delete(id: string): Promise<void> {
    await db.runAsync('DELETE FROM routines WHERE id = ?', [id]);
  },

  async seedSampleRoutines(): Promise<void> {
    const existing = await db.getFirstAsync('SELECT id FROM routines LIMIT 1');
    if (existing) return;

    const push: Routine = {
      id: 'routine_push',
      name: 'Push',
      description: 'Chest, shoulders & triceps',
      order: 0,
      exercises: [
        {
          id: 're_push_1',
          routineId: 'routine_push',
          order: 0,
          exerciseGroups: [
            ['incline_press_barbell', 'incline_press_dumbbell', 'bench_press_barbell', 'bench_press_dumbbell'],
          ],
        },
        {
          id: 're_push_2',
          routineId: 'routine_push',
          order: 1,
          exerciseGroups: [
            ['chest_fly_cable', 'chest_fly_dumbbell', 'pec_deck_machine'],
          ],
        },
        {
          id: 're_push_3',
          routineId: 'routine_push',
          order: 2,
          exerciseGroups: [
            ['tricep_pushdown_rope_cable', 'tricep_pushdown_vbar_cable'],
          ],
        },
        {
          id: 're_push_4',
          routineId: 'routine_push',
          order: 3,
          exerciseGroups: [
            ['overhead_tricep_ext_rope_cable', 'overhead_tricep_ext_dumbbell', 'skull_crusher_ez_bar'],
          ],
        },
        {
          id: 're_push_5',
          routineId: 'routine_push',
          order: 4,
          exerciseGroups: [
            ['lateral_raise_dumbbell', 'lateral_raise_cable'],
          ],
        },
        {
          id: 're_push_6',
          routineId: 'routine_push',
          order: 5,
          exerciseGroups: [
            ['overhead_press_barbell', 'overhead_press_dumbbell', 'overhead_press_machine'],
          ],
        },
      ],
    };

    const pull: Routine = {
      id: 'routine_pull',
      name: 'Pull',
      description: 'Back & biceps',
      order: 1,
      exercises: [
        {
          id: 're_pull_1',
          routineId: 'routine_pull',
          order: 0,
          exerciseGroups: [
            ['lat_pulldown_wide_cable', 'lat_pulldown_close_grip_cable'],
          ],
        },
        {
          id: 're_pull_2',
          routineId: 'routine_pull',
          order: 1,
          exerciseGroups: [
            ['seated_cable_row', 'bent_over_row_barbell', 't_bar_row_machine'],
          ],
        },
        {
          id: 're_pull_3',
          routineId: 'routine_pull',
          order: 2,
          exerciseGroups: [
            ['preacher_curl_ez_bar', 'preacher_curl_dumbbell'],
          ],
        },
        {
          id: 're_pull_4',
          routineId: 'routine_pull',
          order: 3,
          exerciseGroups: [
            ['hammer_curl_dumbbell', 'hammer_curl_cable'],
          ],
        },
      ],
    };

    const legs: Routine = {
      id: 'routine_legs',
      name: 'Legs',
      description: 'Quads, hamstrings & calves',
      order: 2,
      exercises: [
        {
          id: 're_legs_1',
          routineId: 'routine_legs',
          order: 0,
          exerciseGroups: [
            ['leg_press_machine'],
            ['calf_raise_standing_machine', 'calf_raise_seated_machine'],
          ],
        },
        {
          id: 're_legs_2',
          routineId: 'routine_legs',
          order: 1,
          exerciseGroups: [
            ['romanian_deadlift_barbell', 'romanian_deadlift_dumbbell'],
          ],
        },
        {
          id: 're_legs_3',
          routineId: 'routine_legs',
          order: 2,
          exerciseGroups: [
            ['leg_curl_lying_machine', 'leg_curl_seated_machine'],
          ],
        },
        {
          id: 're_legs_4',
          routineId: 'routine_legs',
          order: 3,
          exerciseGroups: [
            ['leg_extension_machine'],
          ],
        },
      ],
    };

    for (const routine of [push, pull, legs]) {
      await RoutineDAL.save(routine);
    }
  },
};

export const seedDatabase = async () => {
  try {
    // const existing = await db.getFirstAsync('SELECT id FROM workouts LIMIT 1');
    // if (existing) {
    //     console.log('Database already seeded.');
    //     return;
    // }

    console.log('Seeding test data...');
    for (const workout of workouts) {
      await WorkoutDAL.saveFullWorkout(workout);
    }
    console.log('Seeding complete!');
  } catch (error) {
    console.error('Seeding failed:', error);
  }
};
