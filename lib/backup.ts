import { db } from './db';

const BACKUP_FILENAME = 'musculucos_backup.json';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

export type BackupData = {
  version: number;
  exportedAt: string;
  workouts: any[];
  blocks: any[];
  events: any[];
  customExercises: any[];
  favouriteExerciseIds: string[];
};

// ── Export ────────────────────────────────────────────────────────────────────

export async function exportData(): Promise<BackupData> {
  const [workouts, blocks, events, customExercises, favouriteRows] = await Promise.all([
    db.getAllAsync('SELECT * FROM workouts ORDER BY date ASC'),
    db.getAllAsync('SELECT * FROM blocks'),
    db.getAllAsync('SELECT * FROM events'),
    db.getAllAsync('SELECT * FROM exercises WHERE isCustom = 1'),
    db.getAllAsync<{ id: string }>('SELECT id FROM exercises WHERE isFavourite = 1'),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    workouts: workouts as any[],
    blocks: blocks as any[],
    events: events as any[],
    customExercises: customExercises as any[],
    favouriteExerciseIds: favouriteRows.map((r) => r.id),
  };
}

// ── Import ────────────────────────────────────────────────────────────────────

export async function importData(backup: BackupData): Promise<void> {
  await db.withTransactionAsync(async () => {
    // Wipe existing user data (cascades delete blocks → events)
    await db.runAsync('DELETE FROM workouts');
    await db.runAsync('DELETE FROM exercises WHERE isCustom = 1');

    for (const w of backup.workouts) {
      await db.runAsync(
        'INSERT OR REPLACE INTO workouts (id, date, durationSeconds, notes) VALUES (?, ?, ?, ?)',
        [w.id, w.date, w.durationSeconds, w.notes]
      );
    }

    for (const b of backup.blocks) {
      await db.runAsync(
        'INSERT OR REPLACE INTO blocks (id, workoutId, [order], type, name, exerciseIds, sets, datetime) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [b.id, b.workoutId, b.order, b.type, b.name, b.exerciseIds, b.sets, b.datetime]
      );
    }

    for (const e of backup.events) {
      await db.runAsync(
        `INSERT OR REPLACE INTO events (id, blockId, type, exerciseId, parentEventId, weightKg, rep_type, reps, rpe, durationSeconds, datetime)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          e.id,
          e.blockId,
          e.type,
          e.exerciseId,
          e.parentEventId,
          e.weightKg,
          e.rep_type,
          e.reps,
          e.rpe,
          e.durationSeconds,
          e.datetime,
        ]
      );
    }

    for (const ex of backup.customExercises) {
      await db.runAsync(
        `INSERT OR REPLACE INTO exercises (id, baseId, name, equipment, muscleEmphasis, description, videoUrl, isCustom)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [ex.id, ex.baseId, ex.name, ex.equipment, ex.muscleEmphasis, ex.description, ex.videoUrl]
      );
    }

    // Restore favourites (clears all first, then sets from backup)
    await db.runAsync('UPDATE exercises SET isFavourite = 0');
    for (const id of backup.favouriteExerciseIds ?? []) {
      await db.runAsync('UPDATE exercises SET isFavourite = 1 WHERE id = ?', [id]);
    }
  });
}

// ── Drive helpers ─────────────────────────────────────────────────────────────

async function findBackupFile(accessToken: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${BACKUP_FILENAME}' and trashed=false`);
  const res = await fetch(`${DRIVE_FILES_URL}?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json();
  return json.files?.[0]?.id ?? null;
}

export async function uploadToDrive(accessToken: string, data: BackupData): Promise<void> {
  const body = JSON.stringify(data);
  const metadata = JSON.stringify({ name: BACKUP_FILENAME, mimeType: 'application/json' });

  const existingId = await findBackupFile(accessToken);

  const boundary = 'backup_boundary';
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n` +
    `--${boundary}--`;

  const url = existingId
    ? `${DRIVE_UPLOAD_URL}/${existingId}?uploadType=multipart`
    : `${DRIVE_UPLOAD_URL}?uploadType=multipart`;

  const res = await fetch(url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipart,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive upload failed: ${err}`);
  }
}

export async function downloadFromDrive(accessToken: string): Promise<BackupData> {
  const fileId = await findBackupFile(accessToken);
  if (!fileId) throw new Error('No backup found on Google Drive.');

  const res = await fetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);

  return res.json();
}

export async function getBackupInfo(accessToken: string): Promise<{ modifiedTime: string } | null> {
  const q = encodeURIComponent(`name='${BACKUP_FILENAME}' and trashed=false`);
  const res = await fetch(`${DRIVE_FILES_URL}?q=${q}&fields=files(id,modifiedTime)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json();
  const file = json.files?.[0];
  return file ? { modifiedTime: file.modifiedTime } : null;
}
