import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, TouchableOpacity, Modal } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { Activity, ArrowLeftRight, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock, Pencil, Trash2 } from 'lucide-react-native';
import { router } from 'expo-router';
import type { Block } from '@/lib/types';
import type { Exercise } from '@/lib/exercises';
import { setActiveBlock } from '@/lib/block-state';
import { restTimer } from '@/lib/rest-timer';

function fmt(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(datetime: string): string {
  const d = new Date(datetime);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}
function variantLabel(ex: Exercise): string {
  if (ex.equipmentVariant) {
    return `${fmt(ex.equipmentVariant)} ${fmt(ex.equipment === 'ez_bar' ? 'EZ Bar' : ex.equipment)}`.trim();
  }
  return fmt(ex.equipment === 'ez_bar' ? 'EZ Bar' : ex.equipment);
}

// ─── Options Modal ────────────────────────────────────────────────────────────

const DIVIDER = { height: 1, backgroundColor: '#2c2c2e' } as const;

function BlockOptionsModal({
  visible,
  title,
  onClose,
  onEdit,
  onReplace,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onEdit?: () => void;
  onReplace?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDelete?: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleClose = () => {
    setConfirmDelete(false);
    onClose();
  };

  const hasMoveRow = onMoveUp || onMoveDown;
  const hasActionRow = onEdit || onReplace;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }}
        onPress={handleClose}>
        <Pressable onPress={() => {}}>
          <View style={{ width: 300, backgroundColor: '#1c1c1e', borderRadius: 22, overflow: 'hidden' }}>

            {/* Title */}
            <View style={{ paddingVertical: 14, paddingHorizontal: 20 }}>
              <Text style={{ color: '#8e8e93', fontSize: 13, fontWeight: '600', textAlign: 'center' }} numberOfLines={1}>
                {title}
              </Text>
            </View>
            <View style={DIVIDER} />

            {/* Move Up / Move Down row */}
            {hasMoveRow && (
              <>
                <View style={{ flexDirection: 'row' }}>
                  <TouchableOpacity
                    onPress={() => { onMoveUp?.(); handleClose(); }}
                    disabled={!onMoveUp}
                    style={{
                      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                      gap: 8, paddingVertical: 16,
                      opacity: onMoveUp ? 1 : 0.3,
                    }}>
                    <ChevronUp size={18} color="#ffffff" />
                    <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>Move Up</Text>
                  </TouchableOpacity>
                  <View style={{ width: 1, backgroundColor: '#2c2c2e' }} />
                  <TouchableOpacity
                    onPress={() => { onMoveDown?.(); handleClose(); }}
                    disabled={!onMoveDown}
                    style={{
                      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                      gap: 8, paddingVertical: 16,
                      opacity: onMoveDown ? 1 : 0.3,
                    }}>
                    <ChevronDown size={18} color="#ffffff" />
                    <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>Move Down</Text>
                  </TouchableOpacity>
                </View>
                <View style={DIVIDER} />
              </>
            )}

            {/* Edit / Replace row */}
            {hasActionRow && (
              <>
                <View style={{ flexDirection: 'row' }}>
                  {onEdit && (
                    <>
                      <TouchableOpacity
                        onPress={() => { onEdit(); handleClose(); }}
                        style={{
                          flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                          gap: 8, paddingVertical: 16,
                        }}>
                        <Pencil size={16} color="#60a5fa" />
                        <Text style={{ color: '#60a5fa', fontSize: 15, fontWeight: '600' }}>Edit</Text>
                      </TouchableOpacity>
                      {onReplace && <View style={{ width: 1, backgroundColor: '#2c2c2e' }} />}
                    </>
                  )}
                  {onReplace && (
                    <TouchableOpacity
                      onPress={() => { onReplace(); handleClose(); }}
                      style={{
                        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                        gap: 8, paddingVertical: 16,
                      }}>
                      <ArrowLeftRight size={16} color="#a78bfa" />
                      <Text style={{ color: '#a78bfa', fontSize: 15, fontWeight: '600' }}>Replace</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={DIVIDER} />
              </>
            )}

            {/* Delete */}
            {onDelete && !confirmDelete && (
              <TouchableOpacity
                onPress={() => setConfirmDelete(true)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 }}>
                <Trash2 size={16} color="#ff453a" />
                <Text style={{ color: '#ff453a', fontSize: 15, fontWeight: '600' }}>Delete</Text>
              </TouchableOpacity>
            )}
            {onDelete && confirmDelete && (
              <View style={{ paddingVertical: 14, paddingHorizontal: 16, gap: 12 }}>
                <Text style={{ color: '#8e8e93', fontSize: 13, textAlign: 'center' }}>Are you sure?</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => setConfirmDelete(false)}
                    style={{ flex: 1, backgroundColor: '#2c2c2e', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                    <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '600' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { onDelete(); handleClose(); }}
                    style={{ flex: 1, backgroundColor: 'rgba(255,69,58,0.15)', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                    <Text style={{ color: '#ff453a', fontSize: 14, fontWeight: '700' }}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={DIVIDER} />

            {/* Cancel */}
            <TouchableOpacity
              onPress={handleClose}
              style={{ paddingVertical: 16, alignItems: 'center' }}>
              <Text style={{ color: '#0a84ff', fontSize: 17, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>

          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
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
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onReplace?: (blockId: string) => void;
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
  onMoveUp,
  onMoveDown,
  onReplace,
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

  const [optionsVisible, setOptionsVisible] = useState(false);
  const [confirmDismiss, setConfirmDismiss] = useState(false);

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
          setOptionsVisible(true);
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
          <Text style={{ color: '#3f3f46', fontSize: 11, fontWeight: '600', marginLeft: 8 }}>
            {formatTime(exerciseBlock.datetime)}
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
        {onDismiss && !confirmDismiss && (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setConfirmDismiss(true);
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
        {onDismiss && confirmDismiss && (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
            <TouchableOpacity
              onPress={() => setConfirmDismiss(false)}
              style={{ flex: 1, backgroundColor: '#2c2c2e', borderRadius: 10, paddingVertical: 9, alignItems: 'center' }}>
              <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onDismiss(exerciseBlock.id);
              }}
              style={{ flex: 1, backgroundColor: 'rgba(255,69,58,0.15)', borderRadius: 10, paddingVertical: 9, alignItems: 'center' }}>
              <Text style={{ color: '#ff453a', fontSize: 13, fontWeight: '700' }}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <BlockOptionsModal
        visible={optionsVisible}
        title={exerciseBlock.name}
        onClose={() => setOptionsVisible(false)}
        onEdit={openBlock}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onReplace={onReplace ? () => onReplace(exerciseBlock.id) : undefined}
        onDelete={onDismiss ? () => onDismiss(exerciseBlock.id) : undefined}
      />
    </View>
  );
}

// ─── Active Block (has events logged) ────────────────────────────────────────

function ActiveBlock({
  exerciseBlock,
  saveEditedBlock,
  dateString,
  onDeleteBlock,
  onMoveUp,
  onMoveDown,
  onReplace,
}: ViewExerciseBlockProps) {
  const [optionsVisible, setOptionsVisible] = useState(false);
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

  const openBlock = () => {
    setActiveBlock({ block: exerciseBlock, dateString, saveEditedBlock, onDeleteBlock });
    router.push('/exercise_block');
  };

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
      onPress={openBlock}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setOptionsVisible(true);
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
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Activity size={20} color="#22c55e" />
          <Text style={{ color: '#3f3f46', fontSize: 11, fontWeight: '600' }}>
            {formatTime(exerciseBlock.datetime)}
          </Text>
        </View>
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
      <BlockOptionsModal
        visible={optionsVisible}
        title={exerciseBlock.name}
        onClose={() => setOptionsVisible(false)}
        onEdit={openBlock}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onReplace={onReplace ? () => onReplace(exerciseBlock.id) : undefined}
        onDelete={() => onDeleteBlock(exerciseBlock.id)}
      />
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
