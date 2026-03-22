import { Platform } from 'react-native';

let notifee: typeof import('@notifee/react-native').default | null = null;
let AndroidImportance: typeof import('@notifee/react-native').AndroidImportance | null = null;
let EventType: typeof import('@notifee/react-native').EventType | null = null;
try {
  const mod = require('@notifee/react-native');
  notifee = mod.default;
  AndroidImportance = mod.AndroidImportance;
  EventType = mod.EventType;
} catch {
  // Native module not available in this build
}

const CHANNEL_ID = 'rest-timer';
const NOTIF_ID = 'rest-timer';
let _ready = false;
let _updateInterval: ReturnType<typeof setInterval> | null = null;

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

// Callbacks set by the app layer
let _onNotificationPress: (() => void) | null = null;
let _onFinishPress: (() => void) | null = null;

export function setNotificationCallbacks(callbacks: {
  onPress?: () => void;
  onFinish?: () => void;
}) {
  _onNotificationPress = callbacks.onPress ?? null;
  _onFinishPress = callbacks.onFinish ?? null;
}

// Register notifee event handlers
if (notifee && EventType) {
  const ET = EventType;
  notifee.onForegroundEvent(({ type, detail }) => {
    if (type === ET.PRESS) {
      _onNotificationPress?.();
    } else if (type === ET.ACTION_PRESS && detail.pressAction?.id === 'finish') {
      _onFinishPress?.();
    }
  });
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type === ET.PRESS) {
      _onNotificationPress?.();
    } else if (type === ET.ACTION_PRESS && detail.pressAction?.id === 'finish') {
      _onFinishPress?.();
    }
  });
}

function formatElapsed(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return mins > 0 ? `${mins}m ${String(secs).padStart(2, '0')}s` : `${secs}s`;
}

async function displayNotif(startMs: number, blockName: string): Promise<void> {
  if (!notifee) return;
  const elapsed = formatElapsed(Date.now() - startMs);
  await notifee.displayNotification({
    id: NOTIF_ID,
    title: blockName ? `Resting · ${blockName}` : 'Resting',
    body: elapsed,
    android: {
      channelId: CHANNEL_ID,
      ongoing: true,
      autoCancel: false,
      onlyAlertOnce: true,
      color: '#a855f7',
      pressAction: { id: 'default' },
      actions: [
        {
          title: 'Finish',
          pressAction: { id: 'finish' },
        },
      ],
    },
  });
}

export async function postRestNotification(startMs: number, blockName = ''): Promise<void> {
  if (!(await ensureReady())) return;
  if (_updateInterval) clearInterval(_updateInterval);
  await displayNotif(startMs, blockName);
  _updateInterval = setInterval(() => {
    displayNotif(startMs, blockName).catch(() => {});
  }, 1000);
}

export async function dismissRestNotification(): Promise<void> {
  if (_updateInterval) { clearInterval(_updateInterval); _updateInterval = null; }
  if (!notifee) return;
  await notifee.cancelNotification(NOTIF_ID);
}
