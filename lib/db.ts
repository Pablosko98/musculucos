import * as SQLite from 'expo-sqlite';
import { workouts } from './workouts';

export const db = SQLite.openDatabaseSync('workouts.db');

export const initDB = () => {
  // Toggle these to wipe the DB during development
  // db.execSync('DROP TABLE IF EXISTS events;');
  // db.execSync('DROP TABLE IF EXISTS blocks;');
  // db.execSync('DROP TABLE IF EXISTS workouts;');

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
};
let saveQueue = Promise.resolve();
export const WorkoutDAL = {
  async updateEvent(eventId: number, updates: any) {
    try {
      await db.runAsync(
        `UPDATE events 
         SET weightKg = ?, reps = ?, rpe = ?, durationSeconds = ?, type = ?
         WHERE id = ?`,
        [updates.weightKg, updates.reps, updates.rpe, updates.durationSeconds, updates.type, eventId]
      );
    } catch (error) {
      console.error('DB Update Error:', error);
      throw error;
    }
  },

  async saveFullWorkout(workout: any) {
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
                    [block.id, 'set', sub.exerciseId, parentEventId, sub.weightKg, sub.rep_type, sub.reps, sub.rpe, sub.datetime]
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

  async getWorkoutByDate(date: string) {
    const workout: any = await db.getFirstAsync('SELECT * FROM workouts WHERE date = ?', [date]);
    if (!workout) return null;

    const blocks: any[] = await db.getAllAsync(
      'SELECT * FROM blocks WHERE workoutId = ? ORDER BY [order] ASC',
      [workout.id]
    );

    const blocksWithEvents = await Promise.all(
      blocks.map(async (block) => {
        const rows: any[] = await db.getAllAsync(
          'SELECT * FROM events WHERE blockId = ? ORDER BY id ASC',
          [block.id]
        );

        // Group the flat rows back into the nested structure the UI expects
        const formattedEvents: any[] = [];
        const groupMap: Record<string, any> = {};

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
              id: row.id.toString(), // Ensure subSet has a unique string ID for React keys
            });
          } else if (row.type === 'rest') {
            formattedEvents.push({ ...row, id: row.id.toString() });
          }
        });

        return {
          ...block,
          exerciseIds: block.exerciseIds ? JSON.parse(block.exerciseIds) : [],
          events: formattedEvents,
        };
      })
    );

    return { ...workout, blocks: blocksWithEvents };
  },

  // Add this helper to insert a single event without rebuilding the world
async addEvent(blockId: string, event: any) {
    try {
      if (event.type === 'set') {
        const parentEventId = event.id; // Use the ID generated in UI
        for (const sub of event.subSets) {
          await db.runAsync(
            `INSERT INTO events (blockId, type, exerciseId, parentEventId, weightKg, rep_type, reps, rpe, datetime) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [blockId, 'set', sub.exerciseId, parentEventId, sub.weightKg, sub.rep_type, sub.reps, sub.rpe, sub.datetime]
          );
        }
      } else {
        await db.runAsync(
          `INSERT INTO events (blockId, type, durationSeconds, datetime) VALUES (?, ?, ?, ?)`,
          [blockId, 'rest', event.durationSeconds, event.datetime]
        );
      }
    } catch (e) {
      console.error("Atomic insert failed", e);
    }
  },

  // Optimized: Just removes one event or subset
  async deleteEventAtomic(eventId: string) {
    // This deletes the rest event OR all sub-sets sharing a parentEventId
    await db.runAsync('DELETE FROM events WHERE id = ? OR parentEventId = ?', [eventId, eventId]);
  }
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