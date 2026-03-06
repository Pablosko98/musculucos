import * as SQLite from 'expo-sqlite';
import { workouts } from './workouts';

export const db = SQLite.openDatabaseSync('workouts.db');

export const initDB = () => {
  // UNCOMMENT THESE LINES ONCE TO WIPE THE DB, THEN COMMENT THEM OUT AGAIN
  db.execSync('DROP TABLE IF EXISTS events;');
  db.execSync('DROP TABLE IF EXISTS blocks;');
  db.execSync('DROP TABLE IF EXISTS workouts;');
  db.execSync(`
    PRAGMA foreign_keys = ON;
    
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
      exerciseIds TEXT, -- Stored as stringified JSON
      sets INTEGER,
      dateTime TEXT,
      FOREIGN KEY (workoutId) REFERENCES workouts (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blockId TEXT NOT NULL,
      type TEXT, -- 'set' or 'rest'
      exerciseId TEXT,
      setIndex INTEGER,
      weightKg REAL,
      rep_type TEXT,
      reps INTEGER,
      rpe REAL,
      durationSeconds INTEGER, -- for rest events
      dateTime TEXT,
      FOREIGN KEY (blockId) REFERENCES blocks (id) ON DELETE CASCADE
    );
  `);
};

export const WorkoutDAL = {
  // Save a full workout object from your JSON format
  async saveFullWorkout(workout: any) {
    try {
      // 1. Insert Workout
      await db.runAsync(
        'INSERT OR REPLACE INTO workouts (id, date, durationSeconds, notes) VALUES (?, ?, ?, ?)',
        [workout.id, workout.date, workout.durationSeconds, workout.notes]
      );

      for (const block of workout.blocks) {
        // 2. Insert Block
        await db.runAsync(
          'INSERT OR REPLACE INTO blocks (id, workoutId, [order], type, name, exerciseIds, sets, dateTime) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            block.id,
            workout.id,
            block.order,
            block.type,
            block.name,
            JSON.stringify(block.exerciseIds),
            block.sets,
            block.dateTime,
          ]
        );

        // 3. Insert Events for this block
        for (const event of block.events) {
          await db.runAsync(
            `INSERT INTO events 
            (blockId, type, exerciseId, setIndex, weightKg, rep_type, reps, rpe, durationSeconds, dateTime) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              block.id,
              event.type,
              event.exerciseId,
              event.setIndex,
              event.weightKg,
              event.rep_type,
              event.reps,
              event.rpe,
              event.durationSeconds,
              event.dateTime,
            ]
          );
        }
      }
    } catch (error) {
      console.error('DB Save Error:', error);
    }
  },

  // Fetch a full workout for a specific date and reconstruct the JSON shape
  async getWorkoutByDate(date: string) {
    const workout: any = await db.getFirstAsync('SELECT * FROM workouts WHERE date = ?', [date]);
    if (!workout) return null;

    // 1. Fetch all blocks for this workout
    const blocks: any[] = await db.getAllAsync(
      'SELECT * FROM blocks WHERE workoutId = ? ORDER BY [order] ASC',
      [workout.id]
    );

    // 2. Use Promise.all to fetch events for EVERY block simultaneously
    const blocksWithEvents = await Promise.all(
      blocks.map(async (block) => {
        const events = await db.getAllAsync(
          'SELECT * FROM events WHERE blockId = ? ORDER BY id ASC',
          [block.id]
        );

        return {
          ...block,
          exerciseIds: block.exerciseIds ? JSON.parse(block.exerciseIds) : [],
          events: events || [],
        };
      })
    );

    return { ...workout, blocks: blocksWithEvents };
  },
};

export const seedDatabase = async () => {
  try {
    console.log('Seeding test data...');
    const testData = workouts;

    for (const workout of testData) {
      await WorkoutDAL.saveFullWorkout(workout);
    }
    console.log('Seeding complete!');
  } catch (error) {
    console.error('Seeding failed:', error);
  }
};
