import { postRestNotification, dismissRestNotification } from './notifications';

export type ActiveRest = { blockId: string; blockName: string; dateString: string; startMs: number; targetSeconds: number };

let _activeRest: ActiveRest | null = null;
let _navCallback: (() => void) | null = null;
let _finalizeCallback: ((elapsed: number) => void) | null = null;
let _pendingFinalize: { blockId: string; elapsed: number } | null = null;

export const restTimer = {
  start(blockId: string, dateString: string, targetSeconds = 60, blockName = '') {
    _activeRest = { blockId, blockName, dateString, startMs: Date.now(), targetSeconds };
    postRestNotification(_activeRest.startMs, blockName).catch(() => {});
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
    if (_finalizeCallback) {
      _finalizeCallback(elapsed);
      _pendingFinalize = null;
    } else if (_activeRest) {
      // Callback not set yet (e.g. background event before component mounts).
      // Store so the component can consume it on mount.
      _pendingFinalize = { blockId: _activeRest.blockId, elapsed };
    }
  },

  consumePendingFinalize(blockId: string): number | null {
    if (_pendingFinalize?.blockId === blockId) {
      const elapsed = _pendingFinalize.elapsed;
      _pendingFinalize = null;
      return elapsed;
    }
    return null;
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
    dismissRestNotification().catch(() => {});
  },
};
