import { Platform } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-var-requires
let Notifications: typeof import('expo-notifications') | null = null;
try {
  Notifications = require('expo-notifications');
  Notifications!.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
} catch {
  // Native module not available in this build
}

const NOTIF_ID = 'rest-timer';
let _permGranted: boolean | null = null;

async function ensurePermission(): Promise<boolean> {
  if (!Notifications) return false;
  if (_permGranted !== null) return _permGranted;
  const { status } = await Notifications.requestPermissionsAsync();
  _permGranted = status === 'granted';
  return _permGranted;
}

export async function postRestNotification(elapsedSeconds = 0, blockName = ''): Promise<void> {
  if (!Notifications || !(await ensurePermission())) return;

  const mins = Math.floor(elapsedSeconds / 60);
  const secs = elapsedSeconds % 60;
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  await Notifications.scheduleNotificationAsync({
    identifier: NOTIF_ID,
    content: {
      title: blockName ? `Resting · ${blockName}` : 'Resting',
      body: timeStr,
      ...(Platform.OS === 'android' && {
        android: { ongoing: true, color: '#a855f7' },
      }),
    },
    trigger: null,
  });
}

export async function dismissRestNotification(): Promise<void> {
  if (!Notifications) return;
  await Notifications.dismissNotificationAsync(NOTIF_ID);
}
