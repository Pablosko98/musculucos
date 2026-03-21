import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { produce } from 'immer';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  ChevronDown,
  ChevronUp,
  Minus,
  Plus,
  Trash2,
  Youtube,
  Zap,
} from 'lucide-react-native';
import { ExerciseDAL } from '@/lib/db';
import type { HistoryWorkout } from '@/lib/db';
import type { Block, WorkoutEvent, SubSet } from '@/lib/types';
import type { Exercise } from '@/lib/exercises';
import { getActiveBlock } from '@/lib/block-state';
import { setPendingWorkoutDate } from '@/lib/navigation-state';

// ─── Constants ─────────────────────────────────────────────────────────────

const WEIGHT_STEP = 2.5;
const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const REP_TYPES = ['warmup', 'full', 'top half', 'bot half', 'assisted'];
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

function variantLabel(ex: Exercise): string {
  if (ex.equipmentVariant) {
    return `${fmt(ex.equipmentVariant)} ${fmt(ex.equipment === 'ez_bar' ? 'EZ Bar' : ex.equipment)}`.trim();
  }
  const suffix = ex.id.startsWith(`${ex.baseId}_`) ? ex.id.slice(ex.baseId.length + 1) : '';
  if (suffix) {
    return suffix
      .replace('ez_bar', 'EZ Bar')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return fmt(ex.equipment === 'ez_bar' ? 'EZ Bar' : ex.equipment);
}

// ─── History helpers ────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  const abs = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (diffDays === 0) return `Today · ${abs}`;
  if (diffDays === 1) return `Yesterday · ${abs}`;
  if (diffDays < 7) return `${diffDays} days ago · ${abs}`;
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
              {s.rpe != null && (
                <Text style={{ color: '#22c55e', fontSize: 11, fontWeight: '600' }}>
                  @{s.rpe % 1 === 0 ? s.rpe : s.rpe.toFixed(1)}
                </Text>
              )}
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
  const [activeExerciseId, setActiveExerciseId] = useState(initialBlock?.exerciseIds?.[0] ?? '');
  const [inputWeight, setInputWeight] = useState('60');
  const [inputReps, setInputReps] = useState('10');
  const [inputRest, setInputRest] = useState('');
  const [inputRPE, setInputRPE] = useState(8);
  const [repType, setRepType] = useState('full');
  const [currentDefaultRest, setCurrentDefaultRest] = useState(
    DEFAULT_RESTS[activeExerciseId] || DEFAULT_RESTS['default']
  );

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

  const exerciseMap = useMemo(
    () => new Map<string, Exercise>((initialBlock?.exercises ?? []).map((ex) => [ex.id, ex])),
    [initialBlock]
  );

  const activeExercise = exerciseMap.get(activeExerciseId);

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

  // ── Sets tab logic ───────────────────────────────────────────────────────

  // Live sync while editing a set
  useEffect(() => {
    if (editing?.type === 'set' && editing.subSetId) {
      const nextBlock = produce(localBlock, (draft) => {
        const event = draft.events.find((e) => e.id === editing.eventId);
        if (event?.type === 'set') {
          const sub = event.subSets.find((s) => s.id === editing.subSetId);
          if (sub) {
            sub.weightKg = parseFloat(inputWeight) || 0;
            sub.reps = parseInt(inputReps) || 0;
            sub.rpe = inputRPE;
            sub.rep_type = repType;
          }
        }
      });
      setLocalBlock(nextBlock);
    }
  }, [inputWeight, inputReps, inputRPE, repType]);

  const handleFinishEditing = () => {
    saveEditedBlock?.(dateString, localBlock);
    setEditing(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleChangeActiveExercise = (id: string) => {
    setActiveExerciseId(id);
    setCurrentDefaultRest(DEFAULT_RESTS[id] || DEFAULT_RESTS['default']);
    const allMatching = localBlock.events
      .filter((e): e is import('@/lib/types').SetEvent => e.type === 'set')
      .flatMap((e) => e.subSets)
      .filter((s) => s.exerciseId === id);
    const lastWeight =
      allMatching.length > 0 ? allMatching[allMatching.length - 1].weightKg.toString() : '60';
    setInputWeight(lastWeight);
  };

  const handleAddNewSet = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowAdvanced(false);
    Keyboard.dismiss();
    const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const newSub: SubSet = {
      id: `sub-${Date.now()}`,
      exerciseId: activeExerciseId,
      weightKg: parseFloat(inputWeight) || 0,
      reps: parseInt(inputReps) || 0,
      rpe: inputRPE,
      rep_type: repType,
      datetime: now,
      exercise: exerciseMap.get(activeExerciseId),
    };
    const nextBlock = produce(localBlock, (draft) => {
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
    if (activeExerciseId === initialBlock?.exerciseIds?.[0] && initialBlock?.exerciseIds?.[1]) {
      handleChangeActiveExercise(initialBlock.exerciseIds[1]);
    } else {
      handleChangeActiveExercise(initialBlock?.exerciseIds?.[0] ?? activeExerciseId);
    }
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

  const renderEvent = useCallback(
    ({ item, drag, isActive }: RenderItemParams<WorkoutEvent>) => (
      <ScaleDecorator>
        <Pressable
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            drag();
          }}
          disabled={isActive}
          className={`mb-4 ${isActive ? 'opacity-50' : ''}`}>
          {item.type === 'set' ? (
            <View className="rounded-[32px] border border-zinc-800 bg-zinc-900 p-4">
              <View className="mb-3 flex-row items-center justify-between px-1">
                <Text className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                  Training Set
                </Text>
                <Text className="text-[10px] font-bold text-zinc-700">{item.datetime}</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', flex: 1, gap: 4 }}>
                {item.subSets?.map((sub: SubSet, index: number) => {
                  const isEditing = editing?.subSetId === sub.id;
                  const exerciseMeta = sub.exercise ?? exerciseMap.get(sub.exerciseId);
                  const displayWeight = isEditing ? inputWeight : sub.weightKg;
                  const displayReps = isEditing ? inputReps : sub.reps;
                  const displayRPE = isEditing ? inputRPE : sub.rpe;
                  return (
                    <Pressable
                      key={sub.id}
                      onPress={() => {
                        Haptics.selectionAsync();
                        if (isEditing) {
                          handleFinishEditing();
                          return;
                        }
                        setEditing({ type: 'set', eventId: item.id, subSetId: sub.id });
                        handleChangeActiveExercise(sub.exerciseId);
                        setInputWeight(sub.weightKg.toString());
                        setInputReps(sub.reps.toString());
                        setInputRPE(sub.rpe || 8);
                        setRepType(sub.rep_type || 'full');
                      }}
                      style={{ flex: 1, minWidth: 140 }}
                      className={`rounded-2xl border px-4 py-3 ${isEditing ? 'border-zinc-100 bg-zinc-100' : 'border-zinc-800 bg-zinc-950'}`}>
                      <View className="mb-1 flex-row items-center justify-between gap-4">
                        <Text
                          numberOfLines={1}
                          className={`flex-1 text-[9px] font-black uppercase ${isEditing ? 'text-zinc-400' : 'text-zinc-500'}`}>
                          {exerciseMeta?.name || sub.exerciseId}
                        </Text>
                        <Text
                          className={`text-[9px] font-black uppercase ${isEditing ? 'text-zinc-400' : 'text-zinc-500'}`}>
                          | {sub.rep_type}{' '}
                        </Text>
                        <Text
                          className={`text-[9px] font-black ${isEditing ? 'text-zinc-900' : 'text-green-500'}`}>
                          @{displayRPE}
                        </Text>
                      </View>
                      <Text
                        className={`text-lg font-black ${isEditing ? 'text-black' : 'text-zinc-100'}`}>
                        <Text className="text-green-500">{index + 1}. </Text>
                        {displayWeight}
                        <Text className="text-xs text-zinc-500">kg</Text> × {displayReps}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                if (editing) {
                  handleFinishEditing();
                  return;
                }
                setEditing({ type: 'rest', eventId: item.id });
                setInputRest(item.durationSeconds.toString());
              }}
              className={`flex-row items-center justify-center gap-2 rounded-2xl border p-3 ${editing?.eventId === item.id ? 'border-purple-500 bg-purple-600' : 'border-purple-500/20 bg-purple-900/10'}`}>
              <Zap size={12} color={editing?.eventId === item.id ? 'white' : '#a855f7'} />
              <Text
                className={`text-xs font-black uppercase ${editing?.eventId === item.id ? 'text-white' : 'text-purple-400'}`}>
                {item.durationSeconds}s Rest
              </Text>
            </Pressable>
          )}
        </Pressable>
      </ScaleDecorator>
    ),
    [editing, exerciseMap, inputWeight, inputReps, inputRPE, repType, localBlock]
  );

  if (!state || !initialBlock) return null;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: '#09090b', paddingTop: insets.top }}>
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
            router.back();
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
            Active Exercise
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
                {exerciseMap.get(id) ? variantLabel(exerciseMap.get(id)!) : id}
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
          <DraggableFlatList
            data={localBlock.events}
            onDragEnd={({ data }) => {
              const next = { ...localBlock, events: data };
              setLocalBlock(next);
              saveEditedBlock?.(dateString, next);
            }}
            keyExtractor={(item) => item.id}
            renderItem={renderEvent}
            containerStyle={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          />

          {/* Bottom control panel */}
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: '#18181b',
              backgroundColor: '#09090b',
              padding: 16,
              paddingBottom: insets.bottom + 8,
            }}>
            <View className="mb-4 flex-row gap-3">
              <View className="flex-1 flex-row items-center rounded-[28px] border border-zinc-800 bg-zinc-950 p-2">
                <Pressable
                  onPress={() =>
                    setInputWeight((prev) => Math.max(0, parseFloat(prev) - WEIGHT_STEP).toString())
                  }
                  className="h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900">
                  <Minus size={18} color="#71717a" />
                </Pressable>
                <View className="flex-1 items-center">
                  <Text className="text-[8px] font-black uppercase text-zinc-600">Weight</Text>
                  <TextInput
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                    value={inputWeight}
                    onChangeText={setInputWeight}
                    className="text-center text-2xl font-black text-white"
                  />
                </View>
                <Pressable
                  onPress={() =>
                    setInputWeight((prev) => (parseFloat(prev) + WEIGHT_STEP).toString())
                  }
                  className="h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900">
                  <Plus size={18} color="#71717a" />
                </Pressable>
              </View>

              <View className="w-36 flex-row items-center rounded-[28px] border border-zinc-800 bg-zinc-950 p-2">
                <Pressable
                  onPress={() => setInputReps((prev) => Math.max(0, parseInt(prev) - 1).toString())}
                  className="h-10 w-10 items-center justify-center rounded-xl bg-zinc-900">
                  <Minus size={16} color="#71717a" />
                </Pressable>
                <View className="flex-1 items-center">
                  <Text className="text-[8px] font-black uppercase text-zinc-600">Reps</Text>
                  <TextInput
                    keyboardType="number-pad"
                    selectTextOnFocus
                    value={inputReps}
                    onChangeText={setInputReps}
                    className="text-center text-2xl font-black text-white"
                  />
                </View>
                <Pressable
                  onPress={() => setInputReps((prev) => (parseInt(prev) + 1).toString())}
                  className="h-10 w-10 items-center justify-center rounded-xl bg-zinc-900">
                  <Plus size={16} color="#71717a" />
                </Pressable>
              </View>
            </View>

            <View className="flex-row gap-2">
              <Button
                onPress={() => setShowAdvanced(!showAdvanced)}
                variant="outline"
                className="h-16 flex-1 flex-row gap-2 rounded-[24px] border-zinc-800">
                <Text className="text-[10px] font-black uppercase text-zinc-500">RPE / Type</Text>
                {showAdvanced ? (
                  <ChevronUp size={14} color="#52525b" />
                ) : (
                  <ChevronDown size={14} color="#52525b" />
                )}
              </Button>
              {!editing && (
                <Pressable
                  onPress={handleAddRest}
                  className="ml-2 flex-row items-center gap-2 rounded-full border border-purple-500/30 bg-purple-600/10 px-4">
                  <Clock size={14} color="#a855f7" />
                  <Text className="text-xs font-black text-purple-400">{currentDefaultRest}s</Text>
                </Pressable>
              )}
              {editing ? (
                <Button
                  variant="destructive"
                  className="h-16 w-20 rounded-[24px]"
                  onPress={deleteCurrent}>
                  <Trash2 color="white" />
                </Button>
              ) : (
                <Button className="h-16 w-20 rounded-[24px] bg-green-600" onPress={handleAddNewSet}>
                  <Plus color="white" strokeWidth={4} />
                </Button>
              )}
            </View>

            {showAdvanced && (
              <View className="mt-4 rounded-[32px] border border-zinc-800 bg-zinc-950 p-4">
                <ScrollView horizontal className="mb-5 flex-row">
                  {RPE_VALUES.map((v) => (
                    <Pressable
                      key={v}
                      onPress={() => setInputRPE(v)}
                      className={`mr-2 h-11 w-12 items-center justify-center rounded-xl border ${inputRPE === v ? 'border-green-400 bg-green-500' : 'border-zinc-800 bg-zinc-900'}`}>
                      <Text
                        className={`text-xs font-black ${inputRPE === v ? 'text-white' : 'text-zinc-500'}`}>
                        {v}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View className="flex-row flex-wrap gap-2">
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
              </View>
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
                  router.navigate('/(tabs)');
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
    </View>
  );
}
