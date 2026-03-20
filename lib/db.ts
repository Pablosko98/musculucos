import * as SQLite from 'expo-sqlite';
import { workouts } from './workouts';
import { exercises as baseExercises, MUSCLE_GROUP_MAP, type Exercise } from './exercises';
import type { Block, WorkoutEvent, Workout, SubSet } from './types';

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
  baseId: string;
  name: string;
  equipment: string;
  equipmentVariant: string | null;
  muscleEmphasis: string;
  description: string;
  videoUrl: string;
  defaultRestSeconds: number | null;
  baseWeightKg: number | null;
  isCustom: number;
  isFavourite: number;
};

export const initDB = () => {
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
      baseId TEXT NOT NULL,
      name TEXT NOT NULL,
      equipment TEXT,
      muscleEmphasis TEXT,
      description TEXT,
      videoUrl TEXT,
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
  `);

  // Migration: add isFavourite column if it doesn't exist yet (safe no-op on fresh installs)
  try {
    db.execSync('ALTER TABLE exercises ADD COLUMN isFavourite INTEGER NOT NULL DEFAULT 0');
  } catch {
    // Column already exists — ignore
  }
  try {
    db.execSync('ALTER TABLE exercises ADD COLUMN defaultRestSeconds INTEGER');
  } catch {}
  try {
    db.execSync('ALTER TABLE exercises ADD COLUMN baseWeightKg REAL');
  } catch {}
  try {
    db.execSync('ALTER TABLE exercises ADD COLUMN equipmentVariant TEXT');
  } catch {}

  // TEMP: seed test favourites — delete these two lines after testing
  // db.execSync("UPDATE exercises SET isFavourite = 1 WHERE id = 'incline_press_barbell'");
  // db.execSync("UPDATE exercises SET isFavourite = 1 WHERE id = 'tricep_pushdown_vbar_cable'");

  // Seed base exercises on first install (no-op if already seeded)
  // Deferred so ExerciseDAL is defined by the time this runs
  setTimeout(() => {
    ExerciseDAL.seedBaseExercises().catch((e) => console.error('Exercise seed failed:', e));
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

          // 2. Clear existing blocks.
          // Because of "ON DELETE CASCADE" in your initDB,
          // this automatically deletes all associated events!
          await db.runAsync('DELETE FROM blocks WHERE workoutId = ?', [workout.id]);

          // 3. Loop through blocks and insert
          for (const block of workout.blocks) {
            await db.runAsync(
              'INSERT INTO blocks (id, workoutId, [order], type, name, exerciseIds, sets, datetime) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [
                block.id,
                workout.id,
                block.order,
                block.type,
                block.name,
                JSON.stringify(block.exerciseIds),
                block.sets,
                block.datetime,
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
        { ...r, muscleEmphasis: r.muscleEmphasis ? JSON.parse(r.muscleEmphasis) : [] },
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
        const freshName = resolvedExercises.length > 0
          ? resolvedExercises.map((e) => e.name).join(' / ')
          : block.name;
        return {
          ...block,
          name: freshName,
          type: block.type as Block['type'],
          exerciseIds,
          exercises: resolvedExercises,
          events: formattedEvents,
        };
      })
    );

    return { ...workout, blocks: blocksWithEvents };
  },

  // Add this helper to insert a single event without rebuilding the world
  async addEvent(blockId: string, event: WorkoutEvent) {
    try {
      if (event.type === 'set') {
        const parentEventId = event.id; // Use the ID generated in UI
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

export const ExerciseDAL = {
  async seedBaseExercises() {
    const existing = await db.getFirstAsync('SELECT id FROM exercises LIMIT 1');
    if (existing) return;

    for (const [muscle, { groupId, groupLabel }] of Object.entries(MUSCLE_GROUP_MAP)) {
      await db.runAsync(
        'INSERT OR IGNORE INTO muscle_group_map (muscle, groupId, groupLabel) VALUES (?, ?, ?)',
        [muscle, groupId, groupLabel]
      );
    }

    for (const ex of baseExercises) {
      await db.runAsync(
        `INSERT OR IGNORE INTO exercises (id, baseId, name, equipment, muscleEmphasis, description, videoUrl, isCustom)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          ex.id,
          ex.baseId,
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

  async getByBaseId(baseId: string): Promise<Exercise[]> {
    const rows = await db.getAllAsync<ExerciseRow>(
      'SELECT * FROM exercises WHERE baseId = ? ORDER BY equipment COLLATE NOCASE ASC',
      [baseId]
    );
    return rows.map((r) => ({
      ...r,
      muscleEmphasis: r.muscleEmphasis ? JSON.parse(r.muscleEmphasis) : [],
      isFavourite: r.isFavourite ?? 0,
      defaultRestSeconds: r.defaultRestSeconds ?? null,
      baseWeightKg: r.baseWeightKg ?? null,
      equipmentVariant: r.equipmentVariant ?? null,
    }));
  },

  async save(exercise: Omit<Exercise, 'isCustom'>) {
    await db.runAsync(
      `INSERT INTO exercises (id, baseId, name, equipment, equipmentVariant, muscleEmphasis, description, videoUrl, defaultRestSeconds, baseWeightKg, isCustom)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        exercise.id,
        exercise.baseId,
        exercise.name,
        exercise.equipment ?? '',
        exercise.equipmentVariant ?? null,
        JSON.stringify(exercise.muscleEmphasis ?? []),
        exercise.description ?? '',
        exercise.videoUrl ?? '',
        exercise.defaultRestSeconds ?? null,
        exercise.baseWeightKg ?? null,
      ]
    );
  },

  async update(
    id: string,
    updates: Partial<
      Pick<Exercise, 'name' | 'equipment' | 'equipmentVariant' | 'muscleEmphasis' | 'description' | 'videoUrl' | 'defaultRestSeconds' | 'baseWeightKg'>
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
           baseWeightKg = ?
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
        id,
      ]
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
    const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM custom_equipment ORDER BY id');
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
      const totalVolume = working.reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0);
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
