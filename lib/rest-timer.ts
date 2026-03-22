import { postRestNotification, dismissRestNotification } from './notifications';

export type ActiveRest = { blockId: string; blockName: string; dateString: string; startMs: number; targetSeconds: number };

let _activeRest: ActiveRest | null = null;
let _navCallback: (() => void) | null = null;
let _finalizeCallback: ((elapsed: number) => void) | null = null;
let _notifInterval: ReturnType<typeof setInterval> | null = null;

export const restTimer = {
  start(blockId: string, dateString: string, targetSeconds = 60, blockName = '') {
    _activeRest = { blockId, blockName, dateString, startMs: Date.now(), targetSeconds };
    if (_notifInterval) clearInterval(_notifInterval);
    postRestNotification(0, blockName).catch(() => {});
    _notifInterval = setInterval(() => {
      if (!_activeRest) return;
      const elapsed = Math.floor((Date.now() - _activeRest.startMs) / 1000);
      postRestNotification(elapsed, _activeRest.blockName).catch(() => {});
    }, 1000);
  },

  setNavCallback(fn: (() => void) | null) {
    _navCallback = fn;
  },

  navigate() {
    _navCallback?.();
  },

  setFinalizeCallback(fn: ((elapsed: number) => void) | null) {
    _finalizeCallback = fn;
  },

  /** Call block A's saveEditedBlock with the finalized elapsed time before taking over. */
  finalizeForBlock(elapsed: number) {
    _finalizeCallback?.(elapsed);
  },

  get(): ActiveRest | null {
    return _activeRest;
  },

  elapsed(): number {
    if (!_activeRest) return 0;
    return Math.floor((Date.now() - _activeRest.startMs) / 1000);
  },

  target(): number {
    return _activeRest?.targetSeconds ?? 60;
  },

  isActiveBlock(blockId: string): boolean {
    return _activeRest?.blockId === blockId;
  },

  clear() {
    _activeRest = null;
    _navCallback = null;
    _finalizeCallback = null;
    if (_notifInterval) { clearInterval(_notifInterval); _notifInterval = null; }
    dismissRestNotification().catch(() => {});
  },
};
