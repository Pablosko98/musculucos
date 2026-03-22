import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, TouchableOpacity, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { Activity, ChevronLeft, ChevronRight, Clock, Trash2 } from 'lucide-react-native';
import { router } from 'expo-router';
import type { Block } from '@/lib/types';
import type { Exercise } from '@/lib/exercises';
import { setActiveBlock } from '@/lib/block-state';
import { restTimer } from '@/lib/rest-timer';

function fmt(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function variantLabel(ex: Exercise): string {
  if (ex.equipmentVariant) {
    return `${fmt(ex.equipmentVariant)} ${fmt(ex.equipment === 'ez_bar' ? 'EZ Bar' : ex.equipment)}`.trim();
  }
  return fmt(ex.equipment === 'ez_bar' ? 'EZ Bar' : ex.equipment);
}

type ViewExerciseBlockProps = {
  exerciseBlock: Block;
  saveEditedBlock: (dateString: string, block: Block) => void;
  dateString: string;
  exerciseList?: Exercise[];
  onDeleteBlock: (blockId: string) => void;
  onDoLater?: (blockId: string) => void;
  onDismiss?: (blockId: string) => void;
  onSwitchAlternative?: (
    blockId: string,
    exerciseIndex: number,
    newExerciseId: string
  ) => void;
};

// ─── Ghost Block (no events logged yet) ──────────────────────────────────────

function GhostBlock({
  exerciseBlock,
  dateString,
  saveEditedBlock,
  onDeleteBlock,
  onDoLater,
  onDismiss,
  onSwitchAlternative,
}: ViewExerciseBlockProps) {
  const opts = exerciseBlock.alternativeExerciseOptions;
  const hasAnyAlternatives = opts != null && opts.some((o) => o.length > 1);

  // Only show equipment labels for exercises that have NO alternatives switcher
  // (exercises with a switcher already show name + equipment inline)
  const staticEquipmentLabels = [
    ...new Set(
      exerciseBlock.exercises
        .filter((_, idx) => !opts?.[idx] || opts[idx].length <= 1)
        .map(variantLabel)
    ),
  ];

  const openBlock = () => {
    setActiveBlock({ block: exerciseBlock, dateString, saveEditedBlock, onDeleteBlock });
    router.push('/exercise_block');
  };

  return (
    <View
      style={{
        marginBottom: 10,
        borderRadius: 22,
        borderWidth: 1.5,
        borderColor: '#2a2a2a',
        borderStyle: 'dashed',
        backgroundColor: '#0d0d0d',
        overflow: 'hidden',
      }}>
      {/* Main tap area → opens block */}
      <Pressable
        onPress={openBlock}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          Alert.alert('Options', exerciseBlock.name, [
            { text: 'Cancel' },
            onDoLater && { text: 'Do Later', onPress: () => onDoLater(exerciseBlock.id) },
            onDismiss && { text: 'Dismiss', style: 'destructive', onPress: () => onDismiss(exerciseBlock.id) },
          ].filter(Boolean) as any[]);
        }}
        style={{ padding: 16, paddingBottom: hasAnyAlternatives ? 8 : 16 }}>
        {/* Header row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <View
            style={{
              backgroundColor: '#1e293b',
              borderRadius: 6,
              paddingHorizontal: 7,
              paddingVertical: 2,
              marginRight: 8,
            }}>
            <Text style={{ color: '#60a5fa', fontSize: 9, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>
              TODO
            </Text>
          </View>
          <Text
            style={{ color: '#6b7280', fontSize: 18, fontWeight: '800', flex: 1 }}
            numberOfLines={1}>
            {exerciseBlock.name}
          </Text>
        </View>

        {/* Equipment labels only for exercises without an alternatives switcher */}
        {staticEquipmentLabels.length > 0 && (
          <Text style={{ color: '#3f3f46', fontSize: 12, fontWeight: '600' }}>
            {staticEquipmentLabels.join(' · ')}
          </Text>
        )}
      </Pressable>

      {/* Alternatives switcher (per exercise in block) */}
      {hasAnyAlternatives && exerciseBlock.alternativeExerciseOptions && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 8 }}>
          {exerciseBlock.alternativeExerciseOptions.map((opts, exerciseIndex) => {
            if (opts.length <= 1) return null;
            const currentId = exerciseBlock.exerciseIds[exerciseIndex];
            const currentPos = opts.indexOf(currentId);
            const safePos = currentPos === -1 ? 0 : currentPos;
            const hasPrev = safePos > 0;
            const hasNext = safePos < opts.length - 1;
            const currentEx = exerciseBlock.exercises[exerciseIndex];

            return (
              <View
                key={exerciseIndex}
                style={{
                  flexDirection: 'row',
                  backgroundColor: '#141414',
                  borderRadius: 14,
                  overflow: 'hidden',
                  minHeight: 72,
                  borderWidth: 1,
                  borderColor: '#222',
                }}>
                {/* Left arrow — full-height tap zone */}
                <TouchableOpacity
                  disabled={!hasPrev}
                  onPress={() => {
                    Haptics.selectionAsync();
                    onSwitchAlternative?.(exerciseBlock.id, exerciseIndex, opts[safePos - 1]);
                  }}
                  style={{
                    width: 52,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: hasPrev ? 'rgba(255,255,255,0.04)' : 'transparent',
                    borderRightWidth: 1,
                    borderRightColor: '#222',
                  }}>
                  <ChevronLeft size={24} color={hasPrev ? '#d4d4d8' : '#2a2a2a'} />
                </TouchableOpacity>

                {/* Center: full exercise info — tapping opens the block */}
                <TouchableOpacity
                  onPress={openBlock}
                  activeOpacity={0.7}
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 8 }}>
                  {currentEx && (
                    <>
                      <Text
                        style={{ color: 'white', fontSize: 15, fontWeight: '800', textAlign: 'center' }}
                        numberOfLines={1}>
                        {currentEx.name}
                      </Text>
                      <Text style={{ color: '#71717a', fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 2 }}>
                        {variantLabel(currentEx)}
                      </Text>
                    </>
                  )}
                  {/* Dot position indicator */}
                  <View style={{ flexDirection: 'row', gap: 4, marginTop: 8 }}>
                    {opts.map((_, i) => (
                      <View
                        key={i}
                        style={{
                          width: i === safePos ? 18 : 5,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: i === safePos ? '#60a5fa' : '#2a2a2a',
                        }}
                      />
                    ))}
                  </View>
                </TouchableOpacity>

                {/* Right arrow — full-height tap zone */}
                <TouchableOpacity
                  disabled={!hasNext}
                  onPress={() => {
                    Haptics.selectionAsync();
                    onSwitchAlternative?.(exerciseBlock.id, exerciseIndex, opts[safePos + 1]);
                  }}
                  style={{
                    width: 52,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: hasNext ? 'rgba(255,255,255,0.04)' : 'transparent',
                    borderLeftWidth: 1,
                    borderLeftColor: '#222',
                  }}>
                  <ChevronRight size={24} color={hasNext ? '#d4d4d8' : '#2a2a2a'} />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {/* Action bar */}
      <View
        style={{
          flexDirection: 'row',
          borderTopWidth: 1,
          borderTopColor: '#1c1c1e',
        }}>
        {onDoLater && (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onDoLater(exerciseBlock.id);
            }}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              paddingVertical: 10,
              borderRightWidth: 1,
              borderRightColor: '#1c1c1e',
            }}>
            <Clock size={13} color="#71717a" />
            <Text style={{ color: '#71717a', fontSize: 12, fontWeight: '600' }}>Do Later</Text>
          </TouchableOpacity>
        )}
        {onDismiss && (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Alert.alert('Dismiss Exercise', `Remove "${exerciseBlock.name}" from today's workout?`, [
                { text: 'Cancel' },
                { text: 'Dismiss', style: 'destructive', onPress: () => onDismiss(exerciseBlock.id) },
              ]);
            }}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              paddingVertical: 10,
            }}>
            <Trash2 size={13} color="#6b1a1a" />
            <Text style={{ color: '#6b1a1a', fontSize: 12, fontWeight: '600' }}>Dismiss</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Active Block (has events logged) ────────────────────────────────────────

function ActiveBlock({
  exerciseBlock,
  saveEditedBlock,
  dateString,
  onDeleteBlock,
}: ViewExerciseBlockProps) {
  const [, forceUpdate] = useState(0);
  const wasRestingRef = useRef(restTimer.isActiveBlock(exerciseBlock?.id ?? ''));
  useEffect(() => {
    const id = exerciseBlock?.id ?? '';
    const interval = setInterval(() => {
      const isResting = restTimer.isActiveBlock(id);
      if (isResting || isResting !== wasRestingRef.current) {
        wasRestingRef.current = isResting;
        forceUpdate((n) => n + 1);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [exerciseBlock?.id]);

  if (!exerciseBlock) return null;

  const isResting = restTimer.isActiveBlock(exerciseBlock.id);

  const blockSummary = useMemo(() => {
    const setEvents = exerciseBlock.events.filter((e) => e.type === 'set');
    const workingSetEvents = setEvents.filter((e) =>
      e.subSets.some((s) => s.rep_type !== 'warmup')
    );
    const allWorkingSubSets = workingSetEvents.flatMap((e) =>
      e.subSets.filter((s) => s.rep_type !== 'warmup')
    );
    const volume = allWorkingSubSets.reduce((sum, s) => sum + s.weightKg * s.reps, 0);
    const totalRest = exerciseBlock.events
      .filter((e): e is import('@/lib/types').RestEvent => e.type === 'rest')
      .reduce((sum, e) => sum + e.durationSeconds, 0);
    const variantLabels = [...new Set(
      (exerciseBlock.exercises ?? [])
        .filter((ex) => ex.equipment)
        .map((ex) => variantLabel(ex))
    )];
    return { sets: workingSetEvents.length, volume, totalRest, variantLabels };
  }, [exerciseBlock]);

  return (
    <Pressable
      className="mb-3 rounded-[22px] border border-zinc-800 bg-zinc-900 p-5"
      onPress={() => {
        setActiveBlock({ block: exerciseBlock, dateString, saveEditedBlock, onDeleteBlock });
        router.push('/exercise_block');
      }}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        Alert.alert('Delete', 'Delete block?', [
          { text: 'Cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => onDeleteBlock(exerciseBlock.id),
          },
        ]);
      }}>
      <View className="mb-3 flex-row items-center justify-between">
        <View style={{ flex: 1 }}>
          <Text className="text-xl font-black leading-tight text-white">{exerciseBlock.name}</Text>
          {blockSummary.variantLabels.length > 0 && (
            <Text style={{ color: '#52525b', fontSize: 12, fontWeight: '600', marginTop: 2 }}>
              {blockSummary.variantLabels.join(' · ')}
            </Text>
          )}
        </View>
        <Activity size={20} color="#22c55e" />
      </View>
      <View className="flex-row flex-wrap gap-2">
        {blockSummary.variantLabels.map((label, i) => (
          <View
            key={`${label}-${i}`}
            className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-2 py-1">
            <Text className="text-[9px] font-black uppercase tracking-widest text-blue-400">
              {label}
            </Text>
          </View>
        ))}
        {blockSummary.sets > 0 && (
          <View className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1">
            <Text className="text-[9px] font-black uppercase tracking-widest text-zinc-300">
              {blockSummary.sets} sets
            </Text>
          </View>
        )}
        {blockSummary.volume > 0 && (
          <View className="rounded-lg border border-green-500/20 bg-green-500/10 px-2 py-1">
            <Text className="text-[9px] font-black uppercase tracking-widest text-green-400">
              {blockSummary.volume.toLocaleString()}kg vol
            </Text>
          </View>
        )}
        {isResting ? (
          <View className="rounded-lg border border-purple-500/40 bg-purple-500/20 px-2 py-1">
            <Text className="text-[9px] font-black uppercase tracking-widest text-purple-400">
              Resting…
            </Text>
          </View>
        ) : blockSummary.totalRest > 0 ? (
          <View className="rounded-lg border border-purple-500/20 bg-purple-500/10 px-2 py-1">
            <Text className="text-[9px] font-black uppercase tracking-widest text-purple-400">
              {Math.round(blockSummary.totalRest / 60)}m rest
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

// ─── ViewExerciseBlock (router) ───────────────────────────────────────────────

function ViewExerciseBlock(props: ViewExerciseBlockProps) {
  if (!props.exerciseBlock) return null;

  const isGhost = props.exerciseBlock.events.length === 0;

  if (isGhost) {
    return <GhostBlock {...props} />;
  }

  return <ActiveBlock {...props} />;
}

export default React.memo(
  ViewExerciseBlock,
  (prev, next) =>
    prev.exerciseBlock === next.exerciseBlock &&
    prev.dateString === next.dateString &&
    (prev.exerciseList?.length ?? 0) === (next.exerciseList?.length ?? 0)
);
