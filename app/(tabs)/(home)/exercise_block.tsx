import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useNavigation, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { produce } from 'immer';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import {
  ArrowLeftRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Minus,
  Pencil,
  Plus,
  Square,
  Timer,
  Trash2,
  Youtube,
  Zap,
} from 'lucide-react-native';
import { ExerciseDAL, PrefsDAL } from '@/lib/db';
import { ExercisePickerSheet } from '@/components/ExercisePickerSheet';
import type { HistoryWorkout } from '@/lib/db';
import type { Block, WorkoutEvent, SubSet, SetEvent } from '@/lib/types';
import type { Exercise } from '@/lib/exercises';
import { getActiveBlock, setActiveBlock } from '@/lib/block-state';
import { setPendingWorkoutDate } from '@/lib/navigation-state';
import { restTimer } from '@/lib/rest-timer';

// ─── Constants ─────────────────────────────────────────────────────────────

const DEFAULT_WEIGHT_STEP = 2.5;

function stepWeight(current: number, direction: 1 | -1, exercise?: Exercise | null): number {
  const stack = exercise?.weightStack;
  if (stack && stack.length >= 2) {
    // Preserve user-defined order — no sorting
    const idx = stack.indexOf(current);
    if (idx !== -1) {
      const nextIdx = idx + direction;
      return nextIdx >= 0 && nextIdx < stack.length ? stack[nextIdx] : current;
    }
    // Not in stack: snap to closest by value, then step
    let closestIdx = 0;
    let closestDiff = Math.abs(stack[0] - current);
    for (let i = 1; i < stack.length; i++) {
      const diff = Math.abs(stack[i] - current);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIdx = i;
      }
    }
    const snapIdx = Math.max(0, Math.min(stack.length - 1, closestIdx + direction));
    return stack[snapIdx];
  }
  const step = exercise?.weightStep ?? DEFAULT_WEIGHT_STEP;
  return Math.max(0, current + direction * step);
}
const REP_TYPES = ['warmup', 'full', 'half', 'assisted'];
const DEFAULT_RESTS: Record<string, number> = {
  leg_press: 180,
  bench_press: 120,
  default: 60,
};
const HISTORY_PAGE = 50;

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDuration(s: number): string {
  if (s <= 0) return '0s';
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${rem}s`;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function formatTime(datetime: string): string {
  if (!datetime) return '';
  const d = new Date(datetime);
  if (isNaN(d.getTime())) return '';
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function variantLabel(ex: Exercise): string {
  if (ex.equipmentVariant) {
    return `${fmt(ex.equipmentVariant)} ${fmt(ex.equipment === 'ez_bar' ? 'EZ Bar' : ex.equipment)}`.trim();
  }
  return fmt(ex.equipment === 'ez_bar' ? 'EZ Bar' : ex.equipment);
}

// ─── Prefill helpers ─────────────────────────────────────────────────────────

type PrefillMode = 'last_set' | 'first_set';

function getDefaultInputs(
  exerciseId: string,
  currentRepType: string,
  block: Block,
  history: HistoryWorkout[],
  mode: PrefillMode,
  baseWeightKg = 0,
  multiplier = 1
): { weight: string; reps: string } {
  const currentSets = block.events
    .filter((e): e is SetEvent => e.type === 'set')
    .flatMap((e) => e.subSets)
    .filter((s) => s.exerciseId === exerciseId && s.rep_type === 'full');

  const r2 = (n: number) => Math.round(n * 100) / 100;

  if (currentSets.length > 0) {
    const ref = currentSets[currentSets.length - 1];
    const plates = r2(Math.max((ref.weightKg - baseWeightKg) / multiplier, 0));
    return { weight: String(plates), reps: ref.reps.toString() };
  }

  const lastWorkout = history[0];
  if (!lastWorkout) return { weight: '', reps: '' };
  const workingSets = lastWorkout.sets.filter((s) => s.rep_type === 'full');
  if (workingSets.length === 0) return { weight: '', reps: '' };
  const ref = mode === 'first_set' ? workingSets[0] : workingSets[workingSets.length - 1];
  const plates = r2(Math.max((ref.weightKg - baseWeightKg) / multiplier, 0));
  return { weight: String(plates), reps: ref.reps.toString() };
}

// ─── History helpers ────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  const abs = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (diffDays === 0) return `Today · ${abs}`;
  if (diffDays === 1) return `Yesterday · ${abs}`;
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago · ${abs}`;
  if (diffDays < 0) return `In ${Math.abs(diffDays)}d · ${abs}`;
  return abs;
}

function HistoryCard({
  workout,
  equipment,
  onPressDate,
}: {
  workout: HistoryWorkout;
  equipment?: string;
  onPressDate: (date: string) => void;
}) {
  const setGroups: string[] = [];
  const seenParents = new Set<string>();
  for (const s of workout.sets) {
    if (!seenParents.has(s.parentEventId)) {
      seenParents.add(s.parentEventId);
      setGroups.push(s.parentEventId);
    }
  }
  return (
    <View
      style={{
        backgroundColor: '#18181b',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#27272a',
        marginBottom: 10,
        overflow: 'hidden',
      }}>
      <TouchableOpacity
        onPress={() => onPressDate(workout.date)}
        activeOpacity={0.7}
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: '#27272a',
          flexDirection: 'row',
          alignItems: 'center',
        }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fafafa', fontSize: 14, fontWeight: '600' }}>
            {formatDate(workout.date)}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 3 }}>
            {workout.workingSets > 0 && (
              <Text style={{ color: '#52525b', fontSize: 12 }}>
                {workout.workingSets} {workout.workingSets === 1 ? 'set' : 'sets'}
              </Text>
            )}
            {workout.maxWeightKg > 0 && (
              <Text style={{ color: '#52525b', fontSize: 12 }}>· {workout.maxWeightKg}kg max</Text>
            )}
            {workout.totalVolume > 0 && (
              <Text style={{ color: '#52525b', fontSize: 12 }}>
                · {workout.totalVolume.toLocaleString()}kg vol
              </Text>
            )}
          </View>
        </View>
        <ChevronRight size={16} color="#3f3f46" />
      </TouchableOpacity>
      <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 6 }}>
        {workout.sets.map((s, i) => {
          const setNum = setGroups.indexOf(s.parentEventId) + 1;
          const isWarmup = s.rep_type === 'warmup';
          const isBodyweight = s.weightKg === 0 || equipment === 'bodyweight';
          return (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ color: '#3f3f46', fontSize: 12, width: 18, textAlign: 'right' }}>
                {setNum}
              </Text>
              <Text
                style={{
                  color: isWarmup ? '#52525b' : '#f4f4f5',
                  fontSize: 15,
                  fontWeight: '600',
                  flex: 1,
                }}>
                {isBodyweight ? 'BW' : `${s.weightKg}`}
                {!isBodyweight && (
                  <Text style={{ color: '#71717a', fontSize: 12, fontWeight: '400' }}> kg</Text>
                )}
                {' × '}
                {s.reps}
              </Text>
              {isWarmup && (
                <View
                  style={{
                    backgroundColor: '#27272a',
                    borderRadius: 4,
                    paddingHorizontal: 5,
                    paddingVertical: 1,
                  }}>
                  <Text
                    style={{
                      color: '#71717a',
                      fontSize: 9,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}>
                    warmup
                  </Text>
                </View>
              )}
              {!isWarmup && s.rep_type !== 'full' && (
                <View
                  style={{
                    backgroundColor: '#1c1c1f',
                    borderRadius: 4,
                    paddingHorizontal: 5,
                    paddingVertical: 1,
                  }}>
                  <Text
                    style={{
                      color: '#71717a',
                      fontSize: 9,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}>
                    {s.rep_type}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function ExerciseBlock() {
  const insets = useSafeAreaInsets();
  const state = getActiveBlock();

  const initialBlock = state?.block;
  const dateString = state?.dateString ?? '';
  const saveEditedBlock = state?.saveEditedBlock;
  const onDeleteBlock = state?.onDeleteBlock;

  const [localBlock, setLocalBlock] = useState<Block>(initialBlock!);
  const [activeTab, setActiveTab] = useState<'sets' | 'history'>('sets');
  const [editing, setEditing] = useState<{
    type: 'set' | 'rest';
    eventId: string;
    subSetId?: string;
  } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [replacePickerOpen, setReplacePickerOpen] = useState(false);
  const [activeExerciseId, setActiveExerciseId] = useState(initialBlock?.exerciseIds?.[0] ?? '');
  const [inputWeight, setInputWeight] = useState('');
  const [inputReps, setInputReps] = useState('');
  const [inputRest, setInputRest] = useState('');
  const [repType, setRepType] = useState('full');
  const [prefillMode, setPrefillMode] = useState<PrefillMode>('last_set');
  const flatListRef = useRef<any>(null);
  const localBlockRef = useRef<Block>(initialBlock!);
  const weightInputRef = useRef<any>(null);
  const repsInputRef = useRef<any>(null);
  const [weightSel, setWeightSel] = useState<{ start: number; end: number } | undefined>();
  const [repsSel, setRepsSel] = useState<{ start: number; end: number } | undefined>();
  const weightJustSelected = useRef(false);
  const repsJustSelected = useRef(false);
  const [currentDefaultRest, setCurrentDefaultRest] = useState(
    initialBlock?.exercises?.[0]?.defaultRestSeconds ??
      DEFAULT_RESTS[activeExerciseId] ??
      DEFAULT_RESTS['default']
  );
  const [tick, setTick] = useState(0);
  const [editingRestId, setEditingRestId] = useState<string | null>(null);
  const [editRestValue, setEditRestValue] = useState(0);
  // Derived from the block — no separate state needed
  const localPerSide =
    localBlock.exerciseWeightModes?.[activeExerciseId] === 'per_side'
      ? true
      : localBlock.exerciseWeightModes?.[activeExerciseId] === 'total'
        ? false
        : null;
  const [globalWeightMode, setGlobalWeightMode] = useState<'total' | 'per_side'>('total');

  // History state
  const [historyData, setHistoryData] = useState<HistoryWorkout[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyHasMore, setHistoryHasMore] = useState(true);
  const historyOffsetRef = useRef(0);
  const historyLoadingRef = useRef(false);
  const historyExerciseRef = useRef('');
  // Track whether we've ever successfully loaded history for the current exercise,
  // so we can skip the spinner on subsequent reloads (silently refresh instead).
  const historyInitializedRef = useRef(false);

  const navigation = useNavigation();
  const allowBackRef = useRef(false);

  // Hide the tab bar while in this screen, restore when leaving
  useEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ tabBarStyle: { display: 'none' } });
    return () => {
      parent?.setOptions({ tabBarStyle: { backgroundColor: '#fff', borderTopWidth: 0 } });
    };
  }, [navigation]);

  // Hijack hardware back / swipe gesture to always return to the workout tab.
  // allowBackRef prevents the re-dispatched action from re-triggering this listener.
  useEffect(() => {
    allowBackRef.current = false;
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (allowBackRef.current) return;
      // Only intercept natural back gestures — programmatic navigations (e.g. pressing
      // a date in history) handle their own routing and must not be intercepted.
      if (e.data.action.type !== 'GO_BACK' && e.data.action.type !== 'POP') return;
      e.preventDefault();
      if (dateString) setPendingWorkoutDate(dateString);
      allowBackRef.current = true;
      navigation.dispatch(e.data.action);
    });
    return unsub;
  }, [navigation, dateString]);

  const [exerciseMap, setExerciseMap] = useState<Map<string, Exercise>>(
    () => new Map<string, Exercise>((initialBlock?.exercises ?? []).map((ex) => [ex.id, ex]))
  );

  useFocusEffect(
    useCallback(() => {
      const ids = initialBlock?.exerciseIds ?? [];
      if (ids.length === 0) return;
      ExerciseDAL.getByIds(ids).then((exercises) => {
        setExerciseMap(new Map(exercises.map((ex) => [ex.id, ex])));
      });
    }, [initialBlock?.exerciseIds])
  );

  const activeExercise = exerciseMap.get(activeExerciseId);
  const exerciseDefaultBase = activeExercise?.baseWeightKg ?? 0;
  const isSuperset = localBlock.exerciseIds.length > 1;
  const activeExerciseIndex = localBlock.exerciseIds.indexOf(activeExerciseId);
  const isLastInRound = isSuperset && activeExerciseIndex === localBlock.exerciseIds.length - 1;
  // Hierarchy: workout override → exercise default → global default
  const isPerSide =
    localPerSide ??
    (activeExercise?.weightMode === 'per_side'
      ? true
      : activeExercise?.weightMode === 'total'
        ? false
        : globalWeightMode === 'per_side');
  const weightMultiplier = isPerSide ? 2 : 1;

  // ── History loading ──────────────────────────────────────────────────────

  const loadHistory = useCallback(
    async (exId: string, reset = false) => {
      if (!reset && historyLoadingRef.current) return;
      if (!reset && !historyHasMore) return;
      historyLoadingRef.current = true;
      const offset = reset ? 0 : historyOffsetRef.current;
      // Only show the full loading spinner on the very first load for this exercise.
      // Subsequent reloads (e.g. after adding a set) silently replace data to avoid flicker.
      const showSpinner = reset && !historyInitializedRef.current;
      if (showSpinner) setHistoryLoading(true);
      try {
        const results = await ExerciseDAL.getExerciseHistory(exId, HISTORY_PAGE, offset);
        historyInitializedRef.current = true;
        if (reset) {
          setHistoryData(results);
          historyOffsetRef.current = results.length;
        } else {
          setHistoryData((prev) => [...prev, ...results]);
          historyOffsetRef.current += results.length;
        }
        setHistoryHasMore(results.length === HISTORY_PAGE);
      } catch (e) {
        console.error('History error', e);
      } finally {
        if (showSpinner) setHistoryLoading(false);
        historyLoadingRef.current = false;
      }
    },
    [historyHasMore]
  );

  // When exercise changes: reset init flag and reload
  useEffect(() => {
    if (historyExerciseRef.current !== activeExerciseId) {
      historyExerciseRef.current = activeExerciseId;
      historyInitializedRef.current = false;
      setHistoryHasMore(true);
      historyOffsetRef.current = 0;
      loadHistory(activeExerciseId, true);
    }
  }, [activeExerciseId]);

  // Always reload when switching to History tab so new sets are reflected immediately.
  // Silent reload (no spinner) if we already have data.
  useEffect(() => {
    if (activeTab === 'history') {
      historyExerciseRef.current = activeExerciseId;
      setHistoryHasMore(true);
      historyOffsetRef.current = 0;
      loadHistory(activeExerciseId, true);
    }
  }, [activeTab]);

  // Load prefill mode and global weight mode from prefs on mount
  useEffect(() => {
    PrefsDAL.get('weightPrefill').then((v) => {
      if (v === 'last_set' || v === 'first_set') setPrefillMode(v);
    });
    PrefsDAL.get('defaultWeightMode').then((v) => {
      if (v === 'total' || v === 'per_side') setGlobalWeightMode(v);
    });
    // Apply any finalize that fired from the background notification before this
    // component had a chance to mount and register its finalize callback.
    const pendingElapsed = restTimer.consumePendingFinalize(localBlockRef.current.id);
    if (pendingElapsed != null) {
      const finalized = produce(localBlockRef.current, (draft) => {
        for (let i = draft.events.length - 1; i >= 0; i--) {
          const ev = draft.events[i];
          if (ev.type === 'rest' && ev.durationSeconds === 0) {
            ev.durationSeconds = pendingElapsed;
            break;
          }
        }
      });
      localBlockRef.current = finalized;
      setLocalBlock(finalized);
      saveEditedBlock?.(dateString, finalized);
    }
  }, []);

  // Scroll to bottom on mount so the latest sets are visible
  useEffect(() => {
    const timer = setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
    return () => clearTimeout(timer);
  }, []);

  // Scroll editing item into view when keyboard opens
  useEffect(() => {
    if (!editing) return;
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      const idx = localBlock.events.findIndex((e) => e.id === editing.eventId);
      if (idx >= 0) {
        flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewOffset: 16 });
      }
    });
    return () => sub.remove();
  }, [editing?.eventId]);

  // Apply prefill when history loads or exercise/mode changes
  useEffect(() => {
    const { weight, reps } = getDefaultInputs(
      activeExerciseId,
      repType,
      localBlock,
      historyData,
      prefillMode,
      exerciseDefaultBase,
      weightMultiplier
    );
    setInputWeight(weight);
    setInputReps(reps);
  }, [historyData, prefillMode, activeExerciseId, weightMultiplier]);

  // ── Sets tab logic ───────────────────────────────────────────────────────

  // Live sync while editing a set
  useEffect(() => {
    if (editing?.type === 'set' && editing.subSetId) {
      const nextBlock = produce(localBlock, (draft) => {
        const event = draft.events.find((e) => e.id === editing.eventId);
        if (event?.type === 'set') {
          const sub = event.subSets.find((s) => s.id === editing.subSetId);
          if (sub) {
            sub.weightKg =
              Math.round(
                ((parseFloat(inputWeight) || 0) * weightMultiplier + exerciseDefaultBase) * 100
              ) / 100;
            sub.reps = parseInt(inputReps) || 0;
            sub.rep_type = repType;
          }
        }
      });
      setLocalBlock(nextBlock);
    }
  }, [inputWeight, inputReps, repType, localPerSide, editing]);

  const handleFinishEditing = () => {
    saveEditedBlock?.(dateString, localBlock);
    setEditing(null);
    setEditingRestId(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Toggle per-side mode and convert inputWeight so the stored total stays consistent
  const handleTogglePerSide = () => {
    const newIsPerSide = !isPerSide;
    const currentVal = parseFloat(inputWeight) || 0;
    if (currentVal > 0) {
      const converted = newIsPerSide ? currentVal / 2 : currentVal * 2;
      setInputWeight(String(Math.round(converted * 100) / 100));
    }
    const newBlock = produce(localBlock, (draft) => {
      if (!draft.exerciseWeightModes) draft.exerciseWeightModes = {};
      draft.exerciseWeightModes[activeExerciseId] = newIsPerSide ? 'per_side' : 'total';
    });
    setLocalBlock(newBlock);
    saveEditedBlock?.(dateString, newBlock);
  };

  const handleChangeActiveExercise = (id: string, blockOverride?: Block) => {
    setActiveExerciseId(id);
    const ex = exerciseMap.get(id);
    const newBase = ex?.baseWeightKg ?? 0;
    setCurrentDefaultRest(ex?.defaultRestSeconds ?? DEFAULT_RESTS[id] ?? DEFAULT_RESTS['default']);
    const block = blockOverride ?? localBlock;
    const newIsPerSide =
      block.exerciseWeightModes?.[id] === 'per_side'
        ? true
        : block.exerciseWeightModes?.[id] === 'total'
          ? false
          : ex?.weightMode === 'per_side'
            ? true
            : ex?.weightMode === 'total'
              ? false
              : globalWeightMode === 'per_side';
    const newMultiplier = newIsPerSide ? 2 : 1;
    const { weight, reps } = getDefaultInputs(
      id,
      repType,
      block,
      historyData,
      prefillMode,
      newBase,
      newMultiplier
    );
    setInputWeight(weight);
    setInputReps(reps);
  };

  const handleAddNewSet = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowAdvanced(false);
    Keyboard.dismiss();
    const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const newSub: SubSet = {
      id: `sub-${Date.now()}`,
      exerciseId: activeExerciseId,
      weightKg:
        Math.round(
          ((parseFloat(inputWeight) || 0) * weightMultiplier + exerciseDefaultBase) * 100
        ) / 100,
      reps: parseInt(inputReps) || 0,
      rpe: 0,
      rep_type: repType,
      datetime: now,
      exercise: exerciseMap.get(activeExerciseId),
    };
    const baseBlock = finalizeActiveRest(localBlock);
    const nextBlock = produce(baseBlock, (draft) => {
      const lastEvent = draft.events[draft.events.length - 1];
      if (lastEvent?.type === 'set') {
        lastEvent.subSets.push(newSub);
      } else {
        draft.events.push({
          id: `event-set-${Date.now()}`,
          type: 'set',
          subSets: [newSub],
          datetime: now,
        });
      }
    });
    setLocalBlock(nextBlock);
    saveEditedBlock?.(dateString, nextBlock);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
    const ids = localBlock.exerciseIds;
    const curIdx = ids.indexOf(activeExerciseId);
    const nextIdx = (curIdx + 1) % Math.max(ids.length, 1);
    handleChangeActiveExercise(ids[nextIdx] ?? activeExerciseId, nextBlock);
  };

  const deleteCurrent = () => {
    if (!editing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowAdvanced(false);
    Keyboard.dismiss();
    const nextBlock = produce(localBlock, (draft) => {
      const { type, eventId, subSetId } = editing;
      const eIdx = draft.events.findIndex((e) => e.id === eventId);
      if (eIdx === -1) return;
      if (type === 'set' && subSetId) {
        const ev = draft.events[eIdx];
        if (ev.type === 'set') {
          const sIdx = ev.subSets.findIndex((s) => s.id === subSetId);
          if (sIdx !== -1) {
            ev.subSets.splice(sIdx, 1);
            if (ev.subSets.length === 0) draft.events.splice(eIdx, 1);
          }
        }
      } else {
        draft.events.splice(eIdx, 1);
      }
    });
    setLocalBlock(nextBlock);
    saveEditedBlock?.(dateString, nextBlock);
    setEditing(null);
  };

  const handleAddRest = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const dur = inputRest ? parseInt(inputRest) : currentDefaultRest;
    const nextBlock = produce(localBlock, (draft) => {
      draft.events.push({
        id: `rest-${Date.now()}`,
        type: 'rest',
        durationSeconds: dur,
        datetime: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      });
    });
    setLocalBlock(nextBlock);
    saveEditedBlock?.(dateString, nextBlock);
    setInputRest('');
  };

  const handleStopRest = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const nextBlock = finalizeActiveRest(localBlock);
    setLocalBlock(nextBlock);
    saveEditedBlock?.(dateString, nextBlock);
  };

  const handleSaveRestEdit = (eventId: string, newSeconds: number) => {
    const nextBlock = produce(localBlock, (draft) => {
      const ev = draft.events.find((e) => e.id === eventId);
      if (ev && ev.type === 'rest') ev.durationSeconds = Math.max(newSeconds, 1);
    });
    setLocalBlock(nextBlock);
    saveEditedBlock?.(dateString, nextBlock);
    setEditingRestId(null);
  };

  const handleDeleteRestEvent = () => {
    if (!editingRestId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const ev = localBlock.events.find((e) => e.id === editingRestId);
    if (ev?.type === 'rest' && ev.durationSeconds === 0 && restTimer.isActiveBlock(localBlock.id)) {
      restTimer.clear();
    }
    const nextBlock = produce(localBlock, (draft) => {
      const idx = draft.events.findIndex((e) => e.id === editingRestId);
      if (idx !== -1) draft.events.splice(idx, 1);
    });
    setLocalBlock(nextBlock);
    saveEditedBlock?.(dateString, nextBlock);
    setEditingRestId(null);
  };

  // Keep localBlockRef in sync so the nav callback always has fresh block state
  useEffect(() => {
    localBlockRef.current = localBlock;
  }, [localBlock]);

  // Tick every second to drive the live rest counter; also fire once when
  // the timer transitions active→inactive so the row clears even if the
  // finalise callback didn't trigger a state update (e.g. background event).
  useEffect(() => {
    let wasActive = restTimer.isActiveBlock(localBlock.id);
    const interval = setInterval(() => {
      const isActive = restTimer.isActiveBlock(localBlock.id);
      if (isActive || wasActive) setTick((t) => t + 1);
      wasActive = isActive;
    }, 1000);
    return () => clearInterval(interval);
  }, [localBlock.id]);

  // Finalize the active rest (record elapsed) and return the updated block.
  // Matches by durationSeconds === 0 since DB reload changes the event ID.
  const finalizeActiveRest = (block: Block): Block => {
    if (!restTimer.isActiveBlock(block.id)) return block;
    const elapsed = Math.max(restTimer.elapsed(), 1);
    restTimer.clear();
    return produce(block, (draft) => {
      // Find the last rest with durationSeconds === 0 (the active one)
      for (let i = draft.events.length - 1; i >= 0; i--) {
        const ev = draft.events[i];
        if (ev.type === 'rest' && ev.durationSeconds === 0) {
          ev.durationSeconds = elapsed;
          break;
        }
      }
    });
  };

  const handleStartRestTimerOnly = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (restTimer.get() && !restTimer.isActiveBlock(localBlock.id)) {
      restTimer.finalizeForBlock(Math.max(restTimer.elapsed(), 1));
      restTimer.clear();
    }
    const baseBlock = finalizeActiveRest(localBlock);
    const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const nextBlock = produce(baseBlock, (draft) => {
      draft.events.push({
        id: `rest-${Date.now()}`,
        type: 'rest',
        durationSeconds: 0,
        datetime: now,
      });
    });
    setLocalBlock(nextBlock);
    saveEditedBlock?.(dateString, nextBlock);
    restTimer.setNavCallback(() => {
      setActiveBlock({ block: localBlockRef.current, dateString, saveEditedBlock, onDeleteBlock });
    });
    restTimer.setFinalizeCallback((elapsed: number) => {
      const finalized = produce(localBlockRef.current, (draft) => {
        for (let i = draft.events.length - 1; i >= 0; i--) {
          const ev = draft.events[i];
          if (ev.type === 'rest' && ev.durationSeconds === 0) {
            ev.durationSeconds = elapsed;
            break;
          }
        }
      });
      setLocalBlock(finalized);
      saveEditedBlock?.(dateString, finalized);
    });
    restTimer.start(localBlock.id, dateString, currentDefaultRest, localBlock.name);
  };

  const handleAddSetWithTimer = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowAdvanced(false);
    Keyboard.dismiss();
    const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    // If another block has an active rest, call its finalize callback before taking over.
    // Must call finalizeForBlock before clear() since clear() nulls the callbacks.
    if (restTimer.get() && !restTimer.isActiveBlock(localBlock.id)) {
      restTimer.finalizeForBlock(Math.max(restTimer.elapsed(), 1));
      restTimer.clear();
    }

    const newSub: SubSet = {
      id: `sub-${Date.now()}`,
      exerciseId: activeExerciseId,
      weightKg:
        Math.round(
          ((parseFloat(inputWeight) || 0) * weightMultiplier + exerciseDefaultBase) * 100
        ) / 100,
      reps: parseInt(inputReps) || 0,
      rpe: 0,
      rep_type: repType,
      datetime: now,
      exercise: exerciseMap.get(activeExerciseId),
    };
    const baseBlock = finalizeActiveRest(localBlock);
    const nextBlock = produce(baseBlock, (draft) => {
      const lastEvent = draft.events[draft.events.length - 1];
      if (lastEvent?.type === 'set') {
        lastEvent.subSets.push(newSub);
      } else {
        draft.events.push({
          id: `event-set-${Date.now()}`,
          type: 'set',
          subSets: [newSub],
          datetime: now,
        });
      }
      draft.events.push({
        id: `rest-${Date.now()}`,
        type: 'rest',
        durationSeconds: 0,
        datetime: now,
      });
    });
    setLocalBlock(nextBlock);
    saveEditedBlock?.(dateString, nextBlock);
    restTimer.setNavCallback(() => {
      setActiveBlock({ block: localBlockRef.current, dateString, saveEditedBlock, onDeleteBlock });
    });
    restTimer.setFinalizeCallback((elapsed: number) => {
      // Finalize this block's active 0s rest in memory, then save through the normal path
      const finalized = produce(localBlockRef.current, (draft) => {
        for (let i = draft.events.length - 1; i >= 0; i--) {
          const ev = draft.events[i];
          if (ev.type === 'rest' && ev.durationSeconds === 0) {
            ev.durationSeconds = elapsed;
            break;
          }
        }
      });
      setLocalBlock(finalized);
      saveEditedBlock?.(dateString, finalized);
    });
    restTimer.start(localBlock.id, dateString, currentDefaultRest, localBlock.name);
    const ids = localBlock.exerciseIds;
    const curIdx = ids.indexOf(activeExerciseId);
    const nextIdx = (curIdx + 1) % Math.max(ids.length, 1);
    handleChangeActiveExercise(ids[nextIdx] ?? activeExerciseId, nextBlock);
  };

  const handleReplaceExercise = useCallback(
    (newExercise: Exercise) => {
      const nextBlock = produce(localBlock, (draft) => {
        const idx = draft.exerciseIds.indexOf(activeExerciseId);
        if (idx !== -1) draft.exerciseIds[idx] = newExercise.id;
        const exIdx = draft.exercises.findIndex((e) => e.id === activeExerciseId);
        if (exIdx !== -1) draft.exercises[exIdx] = newExercise;
        draft.name = draft.exercises.map((e) => e.name).join(' / ');
        for (const event of draft.events) {
          if (event.type === 'set') {
            for (const sub of event.subSets) {
              if (sub.exerciseId === activeExerciseId) {
                sub.exerciseId = newExercise.id;
                sub.exercise = newExercise;
              }
            }
          }
        }
      });
      setLocalBlock(nextBlock);
      localBlockRef.current = nextBlock;
      setExerciseMap((prev) => {
        const next = new Map(prev);
        next.set(newExercise.id, newExercise);
        return next;
      });
      setActiveExerciseId(newExercise.id);
      setLocalPerSide(null);
      setReplacePickerOpen(false);
      saveEditedBlock?.(dateString, nextBlock);
    },
    [localBlock, activeExerciseId, saveEditedBlock, dateString]
  );

  const renderEvent = useCallback(
    ({ item, drag, isActive }: RenderItemParams<WorkoutEvent>) => (
      <ScaleDecorator>
        <Pressable
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            drag();
          }}
          disabled={isActive}
          className={`mb-2 ${isActive ? 'opacity-50' : ''}`}>
          {item.type === 'set' ? (
            (() => {
              const multiSet = (item.subSets?.length ?? 0) > 1;
              const subSetCards = item.subSets?.map((sub: SubSet, index: number) => {
                const isEditing = editing?.subSetId === sub.id;
                const exerciseMeta = sub.exercise ?? exerciseMap.get(sub.exerciseId);
                const displayWeight = isEditing
                  ? Math.round(
                      ((parseFloat(inputWeight) || 0) * weightMultiplier + exerciseDefaultBase) *
                        100
                    ) / 100
                  : sub.weightKg;
                const displayReps = isEditing ? inputReps : sub.reps;
                return (
                  <Pressable
                    key={sub.id}
                    onPress={() => {
                      Haptics.selectionAsync();
                      if (isEditing) {
                        handleFinishEditing();
                        return;
                      }
                      setEditingRestId(null);
                      setEditing({ type: 'set', eventId: item.id, subSetId: sub.id });
                      handleChangeActiveExercise(sub.exerciseId);
                      setInputWeight(
                        String(
                          Math.max(
                            ((sub.weightKg || 0) - exerciseDefaultBase) / weightMultiplier,
                            0
                          )
                        )
                      );
                      setInputReps(sub.reps.toString());
                      setRepType(sub.rep_type || 'full');
                    }}
                    style={{ flex: 1, minWidth: 120 }}
                    className={`rounded-2xl border px-3 py-2 ${isEditing ? 'border-zinc-100 bg-zinc-100' : 'border-zinc-800 bg-zinc-950'}`}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 4,
                        marginBottom: 2,
                      }}>
                      <Text
                        numberOfLines={1}
                        className={`flex-1 text-[9px] font-black uppercase ${isEditing ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        {exerciseMeta?.name || sub.exerciseId}
                      </Text>
                      <Text
                        className={`text-[9px] font-black uppercase ${isEditing ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        {sub.rep_type}
                      </Text>
                    </View>
                    <Text
                      className={`text-base font-black ${isEditing ? 'text-black' : 'text-zinc-100'}`}>
                      <Text className="text-green-500">{index + 1}. </Text>
                      {displayWeight}
                      <Text className="text-xs text-zinc-500">kg</Text> × {displayReps}
                    </Text>
                  </Pressable>
                );
              });
              const setTime = item.datetime || '';
              const timeLabel = setTime ? (
                <Text
                  style={{ color: '#71717a', fontSize: 10, textAlign: 'right', marginBottom: 3 }}>
                  {setTime}
                </Text>
              ) : null;
              if (!multiSet) {
                return (
                  <View>
                    {timeLabel}
                    <View style={{ flexDirection: 'row' }}>{subSetCards}</View>
                  </View>
                );
              }
              return (
                <View
                  style={{
                    borderWidth: 0.5,
                    borderColor: '#27272a',
                    borderRadius: 20,
                    overflow: 'hidden',
                  }}>
                  {timeLabel && (
                    <View style={{ paddingRight: 10, paddingTop: 6 }}>{timeLabel}</View>
                  )}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3, padding: 6 }}>
                    {subSetCards}
                  </View>
                </View>
              );
            })()
          ) : restTimer.isActiveBlock(localBlock.id) && item.durationSeconds === 0 ? (
            // ── Active rest row ──
            <View className="overflow-hidden rounded-2xl border border-purple-500/40 bg-purple-900/20">
              <View className="flex-row items-center gap-3 px-4 py-3">
                <Timer size={13} color="#a855f7" />
                <Text className="flex-1 text-xs font-black uppercase text-purple-400">
                  Resting · {formatDuration(restTimer.elapsed())}
                </Text>
                <Pressable
                  onPress={handleStopRest}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  className="flex-row items-center gap-1 rounded-xl border border-purple-500/30 bg-purple-900/30 px-3 py-1.5">
                  <Square size={10} color="#a855f7" fill="#a855f7" />
                  <Text className="text-[10px] font-black uppercase text-purple-400">
                    Done Resting
                  </Text>
                </Pressable>
              </View>
              <View style={{ height: 3, backgroundColor: 'rgba(168,85,247,0.15)' }}>
                <View
                  style={{
                    height: 3,
                    width: `${Math.min((restTimer.elapsed() / currentDefaultRest) * 100, 100)}%`,
                    backgroundColor: '#a855f7',
                  }}
                />
              </View>
            </View>
          ) : editingRestId === item.id ? (
            // ── Rest selected (editing via bottom panel) ──
            <View className="flex-row items-center justify-center gap-1.5 rounded-xl border border-purple-400/50 bg-purple-500/10 py-2">
              <Zap size={10} color="#c084fc" />
              <Text className="text-[10px] font-black uppercase text-purple-300">
                {formatDuration(editRestValue)} Rest
              </Text>
            </View>
          ) : (
            // ── Completed rest row ──
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                if (editing) handleFinishEditing();
                setEditingRestId(item.id);
                setEditRestValue(item.durationSeconds);
              }}
              className="flex-row items-center justify-center gap-1.5 rounded-xl border border-purple-500/20 bg-purple-900/10 py-2">
              <Zap size={10} color="#a855f7" />
              <Text className="text-[10px] font-black uppercase text-purple-400">
                {formatDuration(item.durationSeconds)} Rest
              </Text>
            </Pressable>
          )}
        </Pressable>
      </ScaleDecorator>
    ),
    [
      editing,
      editingRestId,
      editRestValue,
      exerciseMap,
      inputWeight,
      inputReps,
      repType,
      localBlock,
      tick,
      currentDefaultRest,
      exerciseDefaultBase,
      weightMultiplier,
    ]
  );

  if (!state || !initialBlock) return null;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: '#09090b' }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: '#18181b',
        }}>
        <Pressable
          onPress={() => {
            if (editing) handleFinishEditing();
            router.back(); // beforeRemove handles setPendingWorkoutDate
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ChevronLeft size={24} color="#a1a1aa" />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text
            style={{
              color: '#71717a',
              fontSize: 10,
              fontWeight: '900',
              textTransform: 'uppercase',
              letterSpacing: 1.2,
            }}>
            {isSuperset
              ? `Superset · ${activeExerciseIndex + 1} of ${localBlock.exerciseIds.length}`
              : 'Active Exercise'}
          </Text>
          <Text style={{ color: '#fafafa', fontSize: 20, fontWeight: '900', lineHeight: 24 }}>
            {activeExercise?.name || localBlock.name}
          </Text>
          {activeExercise && (
            <Text style={{ color: '#52525b', fontSize: 12, fontWeight: '600', marginTop: 1 }}>
              {variantLabel(activeExercise)}
            </Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => router.push(`/create_exercise?exerciseId=${activeExerciseId}`)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{
              height: 44,
              width: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: 'rgba(113,113,122,0.25)',
              backgroundColor: 'rgba(39,39,42,0.6)',
            }}>
            <Pencil color="#71717a" size={17} />
          </Pressable>
          <Pressable
            onPress={() => setReplacePickerOpen(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{
              height: 44,
              width: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: 'rgba(234,88,12,0.25)',
              backgroundColor: 'rgba(234,88,12,0.08)',
            }}>
            <ArrowLeftRight color="#ea580c" size={17} />
          </Pressable>
          {activeExercise?.videoUrl ? (
            <Pressable
              onPress={() => Linking.openURL(activeExercise.videoUrl!)}
              style={{
                height: 44,
                width: 44,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: 'rgba(220,38,38,0.2)',
                backgroundColor: 'rgba(220,38,38,0.1)',
              }}>
              <Youtube color="#dc2626" size={20} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Tab bar */}
      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: 16,
          paddingVertical: 10,
          gap: 8,
          borderBottomWidth: 1,
          borderBottomColor: '#18181b',
        }}>
        <Pressable
          onPress={() => setActiveTab('sets')}
          style={{
            flex: 1,
            paddingVertical: 9,
            borderRadius: 12,
            alignItems: 'center',
            backgroundColor: activeTab === 'sets' ? '#27272a' : 'transparent',
            borderWidth: 1,
            borderColor: activeTab === 'sets' ? '#3f3f46' : 'transparent',
          }}>
          <Text
            style={{
              color: activeTab === 'sets' ? '#fafafa' : '#52525b',
              fontSize: 13,
              fontWeight: '700',
            }}>
            Sets
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('history')}
          style={{
            flex: 1,
            paddingVertical: 9,
            borderRadius: 12,
            alignItems: 'center',
            backgroundColor: activeTab === 'history' ? '#27272a' : 'transparent',
            borderWidth: 1,
            borderColor: activeTab === 'history' ? '#3f3f46' : 'transparent',
          }}>
          <Text
            style={{
              color: activeTab === 'history' ? '#fafafa' : '#52525b',
              fontSize: 13,
              fontWeight: '700',
            }}>
            History
          </Text>
        </Pressable>
      </View>

      {/* Exercise switcher — shown when superset, always visible */}
      {localBlock.exerciseIds.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: '#18181b' }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}>
          {localBlock.exerciseIds.map((id: string) => (
            <Pressable
              key={id}
              onPress={() => {
                Haptics.selectionAsync();
                handleChangeActiveExercise(id);
              }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 20,
                borderWidth: 1,
                backgroundColor: activeExerciseId === id ? '#fafafa' : '#09090b',
                borderColor: activeExerciseId === id ? '#fafafa' : '#27272a',
              }}>
              <Text
                style={{
                  color: activeExerciseId === id ? '#09090b' : '#71717a',
                  fontSize: 11,
                  fontWeight: '900',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}>
                {exerciseMap.get(id) ? exerciseMap.get(id)!.name : id}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* ── Sets tab ── */}
      {activeTab === 'sets' && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}>
          <Pressable
            style={{ flex: 1 }}
            onPress={() => {
              if (editingRestId) {
                setEditingRestId(null);
                return;
              }
              if (editing) handleFinishEditing();
            }}>
            <DraggableFlatList
              ref={flatListRef}
              data={localBlock.events}
              onDragEnd={({ data }) => {
                const next = { ...localBlock, events: data };
                setLocalBlock(next);
                saveEditedBlock?.(dateString, next);
              }}
              keyExtractor={(item) => item.id}
              renderItem={renderEvent}
              containerStyle={{ flex: 1 }}
              contentContainerStyle={{ padding: 12, paddingBottom: 8 }}
            />
          </Pressable>

          {/* Bottom control panel */}
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: '#18181b',
              backgroundColor: '#09090b',
              padding: 16,
              paddingBottom: insets.bottom + 8,
            }}>
            {editingRestId ? (
              <>
                {/* Rest duration stepper */}
                <View className="mb-4 flex-row items-center rounded-[28px] border border-zinc-800 bg-zinc-950 p-2">
                  {([-60, -10] as const).map((d) => (
                    <Pressable
                      key={d}
                      onPress={() => setEditRestValue((v) => Math.max(v + d, 1))}
                      className="h-12 w-14 items-center justify-center rounded-2xl bg-zinc-900">
                      <Text className="text-xs font-black text-zinc-400">{d}s</Text>
                    </Pressable>
                  ))}
                  <View className="flex-1 items-center">
                    <Text className="text-[8px] font-black uppercase text-zinc-600">Rest</Text>
                    <Text className="text-center text-2xl font-black text-white">
                      {formatDuration(editRestValue)}
                    </Text>
                  </View>
                  {([10, 60] as const).map((d) => (
                    <Pressable
                      key={d}
                      onPress={() => setEditRestValue((v) => v + d)}
                      className="h-12 w-14 items-center justify-center rounded-2xl bg-zinc-900">
                      <Text className="text-xs font-black text-zinc-400">+{d}s</Text>
                    </Pressable>
                  ))}
                </View>

                {/* Rest action row */}
                <View className="flex-row gap-2">
                  <Button
                    onPress={() => setShowAdvanced(!showAdvanced)}
                    variant="outline"
                    className="h-16 w-16 flex-row gap-1 rounded-[24px] border-zinc-800">
                    {showAdvanced ? (
                      <ChevronUp size={14} color="#52525b" />
                    ) : (
                      <ChevronDown size={14} color="#52525b" />
                    )}
                  </Button>
                  <Button
                    className="h-16 flex-1 rounded-[24px] bg-purple-600"
                    onPress={() => handleSaveRestEdit(editingRestId, editRestValue)}>
                    <Check color="white" size={20} strokeWidth={3} />
                  </Button>
                  <Button
                    variant="destructive"
                    className="h-16 w-16 rounded-[24px]"
                    onPress={handleDeleteRestEvent}>
                    <Trash2 color="white" size={18} />
                  </Button>
                </View>
              </>
            ) : (
              <>
                <View className="mb-4 flex-row gap-3">
                  <View className="flex-1 flex-row items-center rounded-[28px] border border-zinc-800 bg-zinc-950 p-2">
                    <Pressable
                      onPress={() =>
                        setInputWeight((prev) =>
                          stepWeight(parseFloat(prev) || 0, -1, activeExercise).toString()
                        )
                      }
                      className="h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900">
                      <Minus size={18} color="#71717a" />
                    </Pressable>
                    <View className="flex-1 items-center">
                      <Text className="text-[8px] font-black uppercase text-zinc-600">
                        {isPerSide ? 'Per side' : 'Weight'}
                      </Text>
                      <TextInput
                        ref={weightInputRef}
                        keyboardType="decimal-pad"
                        value={inputWeight}
                        selection={weightSel}
                        onChangeText={(text) => {
                          setWeightSel(undefined);
                          setInputWeight(text);
                        }}
                        onFocus={() => {
                          weightJustSelected.current = true;
                          setWeightSel({ start: 0, end: inputWeight.length });
                        }}
                        onBlur={() => setWeightSel(undefined)}
                        onSelectionChange={() => {
                          if (weightJustSelected.current) {
                            weightJustSelected.current = false;
                          } else if (weightSel !== undefined) {
                            setWeightSel(undefined);
                          }
                        }}
                        placeholder="0"
                        placeholderTextColor="#3f3f46"
                        className="text-center text-2xl font-black text-white"
                      />
                    </View>
                    <Pressable
                      onPress={() =>
                        setInputWeight((prev) =>
                          stepWeight(parseFloat(prev) || 0, 1, activeExercise).toString()
                        )
                      }
                      className="h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900">
                      <Plus size={18} color="#71717a" />
                    </Pressable>
                  </View>

                  <View className="w-36 flex-row items-center rounded-[28px] border border-zinc-800 bg-zinc-950 p-2">
                    <Pressable
                      onPress={() =>
                        setInputReps((prev) => Math.max(0, (parseInt(prev) || 0) - 1).toString())
                      }
                      className="h-10 w-10 items-center justify-center rounded-xl bg-zinc-900">
                      <Minus size={16} color="#71717a" />
                    </Pressable>
                    <View className="flex-1 items-center">
                      <Text className="text-[8px] font-black uppercase text-zinc-600">Reps</Text>
                      <TextInput
                        ref={repsInputRef}
                        keyboardType="number-pad"
                        value={inputReps}
                        selection={repsSel}
                        onChangeText={(text) => {
                          setRepsSel(undefined);
                          setInputReps(text);
                        }}
                        onFocus={() => {
                          repsJustSelected.current = true;
                          setRepsSel({ start: 0, end: inputReps.length });
                        }}
                        onBlur={() => setRepsSel(undefined)}
                        onSelectionChange={() => {
                          if (repsJustSelected.current) {
                            repsJustSelected.current = false;
                          } else if (repsSel !== undefined) {
                            setRepsSel(undefined);
                          }
                        }}
                        placeholder="0"
                        placeholderTextColor="#3f3f46"
                        className="text-center text-2xl font-black text-white"
                      />
                    </View>
                    <Pressable
                      onPress={() => setInputReps((prev) => ((parseInt(prev) || 0) + 1).toString())}
                      className="h-10 w-10 items-center justify-center rounded-xl bg-zinc-900">
                      <Plus size={16} color="#71717a" />
                    </Pressable>
                  </View>
                </View>

                <View
                  style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
                  {exerciseDefaultBase > 0 && (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: '#27272a',
                        backgroundColor: '#18181b',
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                      }}>
                      <Text style={{ color: '#71717a', fontSize: 12, fontWeight: '700' }}>
                        {exerciseDefaultBase}kg bar
                      </Text>
                    </View>
                  )}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: isPerSide
                        ? localPerSide !== null
                          ? 'rgba(217,119,6,0.4)'
                          : 'rgba(234,88,12,0.3)'
                        : '#27272a',
                      backgroundColor: isPerSide
                        ? localPerSide !== null
                          ? 'rgba(28,21,3,0.8)'
                          : 'rgba(234,88,12,0.05)'
                        : '#18181b',
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                    }}>
                    {isPerSide ? (
                      <Text
                        style={{
                          color: localPerSide !== null ? '#d97706' : '#ea580c',
                          fontSize: 12,
                          fontWeight: '700',
                        }}>
                        {parseFloat(inputWeight) || 0} × 2 ={' '}
                        {Math.round((parseFloat(inputWeight) || 0) * 2 * 100) / 100}kg
                      </Text>
                    ) : (
                      <Text style={{ color: '#52525b', fontSize: 12, fontWeight: '700' }}>
                        total weight
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }} />
                  {(exerciseDefaultBase > 0 || isPerSide) && (
                    <Text style={{ color: '#71717a', fontSize: 13, fontWeight: '700' }}>
                      {Math.round(
                        ((parseFloat(inputWeight) || 0) * weightMultiplier + exerciseDefaultBase) *
                          100
                      ) / 100}
                      kg total
                    </Text>
                  )}
                </View>

                <View className="flex-row gap-2">
                  <Button
                    onPress={() => setShowAdvanced(!showAdvanced)}
                    variant="outline"
                    className="h-16 w-16 flex-row gap-1 rounded-[24px] border-zinc-800">
                    {showAdvanced ? (
                      <ChevronUp size={14} color="#52525b" />
                    ) : (
                      <ChevronDown size={14} color="#52525b" />
                    )}
                  </Button>
                  {editing ? (
                    <>
                      <Button
                        className="h-16 flex-1 rounded-[24px] bg-green-600"
                        onPress={handleFinishEditing}>
                        <Check color="white" size={20} strokeWidth={3} />
                      </Button>
                      <Button
                        variant="destructive"
                        className="h-16 w-16 rounded-[24px]"
                        onPress={deleteCurrent}>
                        <Trash2 color="white" size={18} />
                      </Button>
                    </>
                  ) : isSuperset && !isLastInRound ? (
                    /* Superset mid-round: log set and advance to next exercise */
                    <Button
                      className="h-16 flex-1 flex-row gap-2 rounded-[24px] bg-blue-600"
                      onPress={handleAddNewSet}>
                      <Text className="text-sm font-black text-white">Next Exercise</Text>
                      <ChevronRight color="white" size={18} strokeWidth={3} />
                    </Button>
                  ) : isSuperset && isLastInRound ? (
                    /* Superset last exercise: finish round */
                    <>
                      <Button
                        variant="outline"
                        className="h-16 flex-1 flex-col gap-0 rounded-[24px] border-zinc-700"
                        onPress={handleAddNewSet}>
                        <Plus color="#71717a" strokeWidth={3} size={18} />
                        <Text className="text-[8px] font-black uppercase text-zinc-600">
                          no rest
                        </Text>
                      </Button>
                      <Button
                        className="h-16 flex-[2] flex-row gap-2 rounded-[24px] bg-green-600"
                        onPress={handleAddSetWithTimer}>
                        <Timer color="white" size={16} />
                        <Text className="text-sm font-black text-white">Done Round</Text>
                      </Button>
                    </>
                  ) : (
                    /* Standard block */
                    <>
                      <Button
                        variant="outline"
                        className="h-16 flex-1 flex-col gap-0 rounded-[24px] border-zinc-700"
                        onPress={handleAddNewSet}>
                        <Plus color="#71717a" strokeWidth={3} size={18} />
                        <Text className="text-[8px] font-black uppercase text-zinc-600">
                          no rest
                        </Text>
                      </Button>
                      <Button
                        className="h-16 flex-[2] flex-row gap-2 rounded-[24px] bg-green-600"
                        onPress={handleAddSetWithTimer}>
                        <Timer color="white" size={16} />
                        <Text className="text-sm font-black text-white">Log Set + Rest</Text>
                      </Button>
                    </>
                  )}
                </View>

                {showAdvanced && (
                  <View className="mt-4 rounded-[32px] border border-zinc-800 bg-zinc-950 p-4">
                    <View className="mb-4 flex-row flex-wrap gap-2">
                      {REP_TYPES.map((t) => (
                        <Pressable
                          key={t}
                          onPress={() => setRepType(t)}
                          className={`rounded-xl border px-4 py-2 ${repType === t ? 'border-zinc-100 bg-zinc-100' : 'border-zinc-800 bg-zinc-900'}`}>
                          <Text
                            className={`text-[10px] font-black uppercase ${repType === t ? 'text-black' : 'text-zinc-500'}`}>
                            {t}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    {/* Weight mode toggle */}
                    <View
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: '#27272a',
                        marginTop: 12,
                        paddingTop: 12,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                      }}>
                      <Text style={{ color: '#52525b', fontSize: 12, fontWeight: '600', flex: 1 }}>
                        Weight mode
                      </Text>
                      <View
                        style={{
                          flexDirection: 'row',
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: '#27272a',
                          overflow: 'hidden',
                        }}>
                        <Pressable
                          onPress={() => isPerSide && handleTogglePerSide()}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            backgroundColor: !isPerSide ? '#27272a' : 'transparent',
                          }}>
                          <Text
                            style={{
                              color: !isPerSide ? '#ffffff' : '#52525b',
                              fontSize: 12,
                              fontWeight: '700',
                            }}>
                            Total
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => !isPerSide && handleTogglePerSide()}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            backgroundColor: isPerSide ? 'rgba(234,88,12,0.15)' : 'transparent',
                          }}>
                          <Text
                            style={{
                              color: isPerSide ? '#ea580c' : '#52525b',
                              fontSize: 12,
                              fontWeight: '700',
                            }}>
                            Per side ×2
                          </Text>
                        </Pressable>
                      </View>
                      {localPerSide !== null && (
                        <Pressable
                          onPress={() => {
                            const newBlock = produce(localBlock, (draft) => {
                              if (draft.exerciseWeightModes) {
                                delete draft.exerciseWeightModes[activeExerciseId];
                              }
                            });
                            setLocalBlock(newBlock);
                            saveEditedBlock?.(dateString, newBlock);
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={{ color: '#3f3f46', fontSize: 11 }}>↺</Text>
                        </Pressable>
                      )}
                    </View>

                    {/* Manual rest — no set logged, less common */}
                    <View
                      className="mt-4 border-t border-zinc-800 pt-4"
                      style={{ flexDirection: 'row', justifyContent: 'space-evenly' }}>
                      <Pressable
                        onPress={handleAddRest}
                        style={{ padding: 10 }}
                        className="flex-row items-center justify-center gap-2 rounded-2xl border border-purple-500/20 bg-purple-900/10 py-3">
                        <Zap size={12} color="#a855f7" />
                        <Text className="text-xs font-black uppercase text-purple-400">
                          Add Rest · {currentDefaultRest}s
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={handleStartRestTimerOnly}
                        style={{ padding: 10 }}
                        className="flex-row items-center justify-center gap-2 rounded-2xl border border-purple-500/20 bg-purple-900/10 py-3">
                        <Timer size={12} color="#a855f7" />
                        <Text className="text-xs font-black uppercase text-purple-400">
                          Start rest timer
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      )}

      {/* ── History tab ── */}
      {activeTab === 'history' &&
        (historyLoading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color="#ea580c" />
          </View>
        ) : (
          <FlatList
            data={historyData}
            keyExtractor={(item) => item.date}
            contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
            showsVerticalScrollIndicator={false}
            onEndReached={() => {
              if (historyHasMore && !historyLoadingRef.current)
                loadHistory(activeExerciseId, false);
            }}
            onEndReachedThreshold={0.5}
            renderItem={({ item }) => (
              <HistoryCard
                workout={item}
                equipment={activeExercise?.equipment}
                onPressDate={(date) => {
                  setPendingWorkoutDate(date);
                  router.dismissAll();
                }}
              />
            )}
            ListHeaderComponent={
              historyData.length > 0 ? (
                <Text style={{ color: '#52525b', fontSize: 13, marginBottom: 12 }}>
                  {historyData.length} workout{historyData.length !== 1 ? 's' : ''}
                  {historyHasMore ? '+' : ''}
                </Text>
              ) : null
            }
            ListEmptyComponent={
              <View style={{ paddingTop: 80, alignItems: 'center' }}>
                <Text style={{ color: '#3f3f46', fontSize: 15 }}>No history yet</Text>
                <Text style={{ color: '#27272a', fontSize: 13, marginTop: 6 }}>
                  Log a set to see it here
                </Text>
              </View>
            }
            ListFooterComponent={
              !historyLoading && historyHasMore ? (
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <ActivityIndicator color="#52525b" size="small" />
                </View>
              ) : null
            }
          />
        ))}

      <ExercisePickerSheet
        open={replacePickerOpen}
        onClose={() => setReplacePickerOpen(false)}
        onSelect={handleReplaceExercise}
        excludeIds={new Set(localBlock.exerciseIds.filter((id) => id !== activeExerciseId))}
      />
    </View>
  );
}
