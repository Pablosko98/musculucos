import { Platform } from 'react-native';

let notifee: typeof import('@notifee/react-native').default | null = null;
let AndroidImportance: typeof import('@notifee/react-native').AndroidImportance | null = null;
try {
  const mod = require('@notifee/react-native');
  notifee = mod.default;
  AndroidImportance = mod.AndroidImportance;
} catch {
  // Native module not available in this build
}

const CHANNEL_ID = 'rest-timer';
const NOTIF_ID = 'rest-timer';
let _ready = false;

async function ensureReady(): Promise<boolean> {
  if (!notifee) return false;
  if (_ready) return true;
  if (Platform.OS === 'android') {
    const settings = await notifee.requestPermission();
    if (settings.authorizationStatus < 1) return false;
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: 'Rest Timer',
      importance: AndroidImportance!.DEFAULT,
      sound: '',
    });
  }
  _ready = true;
  return true;
}

export async function postRestNotification(startMs: number, blockName = ''): Promise<void> {
  if (!(await ensureReady())) return;
  await notifee.displayNotification({
    id: NOTIF_ID,
    title: blockName ? `Resting · ${blockName}` : 'Resting',
    android: {
      channelId: CHANNEL_ID,
      ongoing: true,
      onlyAlertOnce: true,
      showChronometer: true,
      chronometerDirection: 'up',
      timestamp: startMs,
      color: '#a855f7',
    },
  });
}

export async function dismissRestNotification(): Promise<void> {
  if (!notifee) return;
  await notifee.cancelNotification(NOTIF_ID);
}
