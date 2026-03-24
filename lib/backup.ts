import { db } from './db';

const BACKUP_FOLDER_NAME = 'musculucos_backups';
const BACKUP_FILE_PREFIX = 'musculucos_backup_';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const MAX_BACKUPS = 10;

export type BackupData = {
  version: number;
  exportedAt: string;
  workouts: any[];
  blocks: any[];
  events: any[];
  exercises: any[];
  routines: any[];
  routineExercises: any[];
  prefs: any[];
  customEquipment: any[];
};

// ── Export ────────────────────────────────────────────────────────────────────

export async function exportData(): Promise<BackupData> {
  const [workouts, blocks, events, exercises, routines, routineExercises, prefs, customEquipment] =
    await Promise.all([
      db.getAllAsync('SELECT * FROM workouts ORDER BY date ASC'),
      db.getAllAsync('SELECT * FROM blocks'),
      db.getAllAsync('SELECT * FROM events'),
      db.getAllAsync('SELECT * FROM exercises ORDER BY id ASC'),
      db.getAllAsync('SELECT * FROM routines ORDER BY [order] ASC'),
      db.getAllAsync('SELECT * FROM routine_exercises ORDER BY routineId, [order] ASC'),
      db.getAllAsync('SELECT * FROM prefs'),
      db.getAllAsync('SELECT * FROM custom_equipment'),
    ]);

  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    workouts: workouts as any[],
    blocks: blocks as any[],
    events: events as any[],
    exercises: exercises as any[],
    routines: routines as any[],
    routineExercises: routineExercises as any[],
    prefs: prefs as any[],
    customEquipment: customEquipment as any[],
  };
}

// ── Import ────────────────────────────────────────────────────────────────────

export async function importData(backup: BackupData): Promise<void> {
  await db.withTransactionAsync(async () => {
    // Wipe existing user data (cascades delete blocks → events, routines → routine_exercises)
    await db.runAsync('DELETE FROM workouts');
    await db.runAsync('DELETE FROM custom_equipment');

    for (const eq of backup.customEquipment) {
      await db.runAsync('INSERT OR REPLACE INTO custom_equipment (id) VALUES (?)', [eq.id]);
    }

    await db.runAsync('DELETE FROM exercises');
    for (const ex of backup.exercises) {
      await db.runAsync(
        `INSERT INTO exercises
           (id, name, equipment, equipmentVariant, muscleEmphasis, description, videoUrl,
            defaultRestSeconds, baseWeightKg, weightMode, weightStep, weightStack, isCustom, isFavourite)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ex.id, ex.name, ex.equipment, ex.equipmentVariant ?? null,
          ex.muscleEmphasis, ex.description ?? '', ex.videoUrl ?? '',
          ex.defaultRestSeconds ?? null, ex.baseWeightKg ?? null,
          ex.weightMode ?? null, ex.weightStep ?? null, ex.weightStack ?? null,
          ex.isCustom ?? 0, ex.isFavourite ?? 0,
        ]
      );
    }

    for (const w of backup.workouts) {
      await db.runAsync(
        'INSERT OR REPLACE INTO workouts (id, date, durationSeconds, notes) VALUES (?, ?, ?, ?)',
        [w.id, w.date, w.durationSeconds, w.notes]
      );
    }

    for (const b of backup.blocks) {
      await db.runAsync(
        `INSERT OR REPLACE INTO blocks
           (id, workoutId, [order], type, name, exerciseIds, sets, datetime, alternativeExerciseOptions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [b.id, b.workoutId, b.order, b.type, b.name, b.exerciseIds, b.sets, b.datetime, b.alternativeExerciseOptions ?? null]
      );
    }

    for (const e of backup.events) {
      await db.runAsync(
        `INSERT OR REPLACE INTO events
           (id, blockId, type, exerciseId, parentEventId, weightKg, rep_type, reps, rpe, durationSeconds, datetime)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [e.id, e.blockId, e.type, e.exerciseId, e.parentEventId, e.weightKg, e.rep_type, e.reps, e.rpe, e.durationSeconds, e.datetime]
      );
    }

    await db.runAsync('DELETE FROM routines');
    for (const r of backup.routines) {
      await db.runAsync(
        'INSERT OR REPLACE INTO routines (id, name, description, [order]) VALUES (?, ?, ?, ?)',
        [r.id, r.name, r.description ?? null, r.order ?? 0]
      );
    }
    for (const re of backup.routineExercises) {
      await db.runAsync(
        'INSERT OR REPLACE INTO routine_exercises (id, routineId, [order], exerciseGroups) VALUES (?, ?, ?, ?)',
        [re.id, re.routineId, re.order ?? 0, re.exerciseGroups]
      );
    }

    await db.runAsync('DELETE FROM prefs');
    for (const p of backup.prefs) {
      await db.runAsync('INSERT OR REPLACE INTO prefs (key, value) VALUES (?, ?)', [p.key, p.value]);
    }
  });
}

// ── Drive helpers ─────────────────────────────────────────────────────────────

async function findOrCreateBackupFolder(accessToken: string): Promise<string> {
  const q = encodeURIComponent(
    `name='${BACKUP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const res = await fetch(`${DRIVE_FILES_URL}?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json();

  if (json.files?.[0]?.id) return json.files[0].id;

  // Create the folder
  const createRes = await fetch(DRIVE_FILES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: BACKUP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create backup folder: ${err}`);
  }

  const folder = await createRes.json();
  return folder.id;
}

async function listBackupFiles(
  accessToken: string,
  folderId: string
): Promise<Array<{ id: string; name: string; createdTime: string }>> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const res = await fetch(
    `${DRIVE_FILES_URL}?q=${q}&orderBy=createdTime+desc&fields=files(id,name,createdTime)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const json = await res.json();
  return json.files ?? [];
}

async function deleteFile(accessToken: string, fileId: string): Promise<void> {
  await fetch(`${DRIVE_FILES_URL}/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function uploadToDrive(accessToken: string, data: BackupData): Promise<void> {
  const folderId = await findOrCreateBackupFolder(accessToken);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${BACKUP_FILE_PREFIX}${timestamp}.json`;
  const body = JSON.stringify(data);
  const metadata = JSON.stringify({
    name: filename,
    mimeType: 'application/json',
    parents: [folderId],
  });

  const boundary = 'backup_boundary';
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n` +
    `--${boundary}--`;

  const res = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, {
    method: 'POST',
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

  // Prune old backups beyond MAX_BACKUPS
  const files = await listBackupFiles(accessToken, folderId);
  const toDelete = files.slice(MAX_BACKUPS);
  await Promise.all(toDelete.map((f) => deleteFile(accessToken, f.id)));
}

export type BackupEntry = { id: string; name: string; createdTime: string };

export async function listBackups(accessToken: string): Promise<BackupEntry[]> {
  const folderId = await findOrCreateBackupFolder(accessToken);
  return listBackupFiles(accessToken, folderId);
}

export async function downloadFromDrive(accessToken: string): Promise<BackupData> {
  const files = await listBackups(accessToken);
  if (files.length === 0) throw new Error('No backup found on Google Drive.');
  return downloadFromDriveById(accessToken, files[0].id);
}

export async function downloadFromDriveById(
  accessToken: string,
  fileId: string
): Promise<BackupData> {
  const res = await fetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
  return res.json();
}

export async function getBackupInfo(
  accessToken: string
): Promise<{ modifiedTime: string; count: number } | null> {
  const folderId = await findOrCreateBackupFolder(accessToken).catch(() => null);
  if (!folderId) return null;

  const files = await listBackupFiles(accessToken, folderId);
  if (files.length === 0) return null;

  return { modifiedTime: files[0].createdTime, count: files.length };
}
