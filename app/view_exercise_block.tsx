import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Pressable,
  ScrollView,
  Alert,
  Linking,
  Keyboard,
} from 'react-native';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { produce } from 'immer';
import type { Block, WorkoutEvent, SubSet } from '@/lib/types';
import type { Exercise } from '@/lib/exercises';
import {
  Activity,
  Trash2,
  Zap,
  ChevronDown,
  ChevronUp,
  Plus,
  Minus,
  Youtube,
  Clock,
} from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const WEIGHT_STEP = 2.5;
const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const REP_TYPES = ['warmup', 'full', 'top half', 'bot half', 'assisted'];

const DEFAULT_RESTS: Record<string, number> = {
  leg_press: 180,
  bench_press: 120,
  default: 60,
};

type ViewExerciseBlockProps = {
  exerciseBlock: Block;
  saveEditedBlock: (dateString: string, block: Block) => void;
  dateString: string;
  exerciseList?: Exercise[];
  onDeleteBlock: (blockId: string) => void;
};

function ViewExerciseBlock({
  exerciseBlock,
  saveEditedBlock,
  dateString,
  exerciseList = [],
  onDeleteBlock,
}: ViewExerciseBlockProps) {
  if (!exerciseBlock) return null;

  const exerciseMap = useMemo(() => {
    return new Map<string, Exercise>(exerciseList.map((ex) => [ex.id, ex]));
  }, [exerciseList]);

  const [open, setOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [localBlock, setLocalBlock] = useState<Block>(exerciseBlock);
  const [editing, setEditing] = useState<{
    type: 'set' | 'rest';
    eventId: string;
    subSetId?: string;
  } | null>(null);
  const [activeExerciseId, setActiveExerciseId] = useState(exerciseBlock?.exerciseIds?.[0] || '');
  const [inputWeight, setInputWeight] = useState('60');
  const [inputReps, setInputReps] = useState('10');
  const [inputRest, setInputRest] = useState('');
  const [inputRPE, setInputRPE] = useState(8);
  const [repType, setRepType] = useState('full');
  const [currentDefaultRest, setCurrentDefaultRest] = useState(
    DEFAULT_RESTS[activeExerciseId] || DEFAULT_RESTS['default']
  );

  const blockSummary = useMemo(() => {
    const setEvents = localBlock.events.filter(
      (e): e is import('@/lib/types').SetEvent => e.type === 'set'
    );
    const workingSetEvents = setEvents.filter((e) =>
      e.subSets.some((s) => s.rep_type !== 'warmup')
    );
    const allWorkingSubSets = workingSetEvents.flatMap((e) =>
      e.subSets.filter((s) => s.rep_type !== 'warmup')
    );
    const volume = allWorkingSubSets.reduce((sum, s) => sum + s.weightKg * s.reps, 0);
    const totalRest = localBlock.events
      .filter((e): e is import('@/lib/types').RestEvent => e.type === 'rest')
      .reduce((sum, e) => sum + e.durationSeconds, 0);
    const equipment = [...new Set(localBlock.exercises.map((ex) => ex.equipment).filter(Boolean))];
    return { sets: workingSetEvents.length, volume, totalRest, equipment };
  }, [localBlock]);

  // 1. Sync local state with parent when NOT editing
  useEffect(() => {
    if (!editing) setLocalBlock(exerciseBlock);
  }, [exerciseBlock, editing]);

  // 2. LIVE SYNC: Updates localBlock as you type
  useEffect(() => {
    if (editing?.type === 'set' && editing.subSetId) {
      const nextBlock = produce(localBlock, (draft) => {
        const event = draft.events.find((e) => e.id === editing.eventId);
        if (event && event.type === 'set') {
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
    saveEditedBlock(dateString, localBlock);
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

    const now = new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const newSub = {
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
    saveEditedBlock(dateString, nextBlock);

    if (activeExerciseId === exerciseBlock?.exerciseIds?.[0] && exerciseBlock?.exerciseIds?.[1]) {
      handleChangeActiveExercise(exerciseBlock?.exerciseIds?.[1]);
    } else {
      handleChangeActiveExercise(exerciseBlock?.exerciseIds?.[0]);
    }
  };

  const deleteCurrent = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!editing) return;
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
    saveEditedBlock(dateString, nextBlock);
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
    saveEditedBlock(dateString, nextBlock);
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
                {item.type === 'set' &&
                  item.subSets?.map((sub: SubSet, index: number) => {
                    const isEditing = editing?.subSetId === sub.id;
                    const exerciseMeta: Exercise | null | undefined =
                      sub.exercise ?? exerciseMap.get(sub.exerciseId);

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
                          <Text className={`text-green-500`}>{index + 1}. </Text>
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

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val && editing) handleFinishEditing();
        setOpen(val);
      }}>
      <DialogTrigger asChild>
        <Pressable
          className="mb-3 rounded-[22px] border border-zinc-800 bg-zinc-900 p-5"
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
            <Text className="text-xl font-black leading-tight text-white">{localBlock.name}</Text>
            <Activity size={20} color="#22c55e" />
          </View>
          <View className="flex-row flex-wrap gap-2">
            {blockSummary.equipment.map((eq) => (
              <View
                key={eq}
                className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-2 py-1">
                <Text className="text-[9px] font-black uppercase tracking-widest text-blue-400">
                  {eq}
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
            {blockSummary.totalRest > 0 && (
              <View className="rounded-lg border border-purple-500/20 bg-purple-500/10 px-2 py-1">
                <Text className="text-[9px] font-black uppercase tracking-widest text-purple-400">
                  {Math.round(blockSummary.totalRest / 60)}m rest
                </Text>
              </View>
            )}
          </View>
        </Pressable>
      </DialogTrigger>

      <DialogContent
        className="border-zinc-800 bg-zinc-950 p-0"
        style={{ width: SCREEN_WIDTH, height: '97%', marginTop: 'auto' }}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}>
            <View className="flex-row px-6 pb-2 pt-6">
              <View className="flex-1">
                <Text className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Active Exercise
                </Text>
                <Text className="text-2xl font-black text-white">
                  {exerciseMap.get(activeExerciseId)?.name || 'Exercise'}
                </Text>
              </View>
              {exerciseMap.get(activeExerciseId)?.videoUrl && (
                <Pressable
                  onPress={() => Linking.openURL(exerciseMap.get(activeExerciseId).videoUrl)}
                  className="ml-5 h-12 w-12 items-center justify-center rounded-2xl border border-red-600/20 bg-red-600/10">
                  <Youtube color="#dc2626" size={24} />
                </Pressable>
              )}
            </View>

            <DraggableFlatList
              data={localBlock.events}
              onDragEnd={({ data }) => {
                const next = { ...localBlock, events: data };
                setLocalBlock(next);
                saveEditedBlock(dateString, next);
              }}
              keyExtractor={(item) => item.id}
              renderItem={renderEvent}
              containerStyle={{ flex: 1 }}
              contentContainerStyle={{ padding: 20 }}
            />

            <View className="rounded-t-[24px] border-t border-zinc-800 bg-zinc-900 p-5">
              <View className="mb-4 flex-row items-center justify-between px-1">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                  {localBlock.exerciseIds.length > 1 &&
                    localBlock.exerciseIds.map(
                      (id: string) =>
                        !editing && (
                          <Pressable
                            key={id}
                            onPress={() => {
                              Haptics.selectionAsync();
                              handleChangeActiveExercise(id);
                            }}
                            className={`mr-2 rounded-full border px-4 py-2 ${activeExerciseId === id ? 'border-zinc-100 bg-zinc-100' : 'border-zinc-800 bg-zinc-950'}`}>
                            <Text
                              className={`text-[10px] font-black uppercase ${activeExerciseId === id ? 'text-black' : 'text-zinc-500'}`}>
                              {exerciseMap.get(id)?.name || id}
                            </Text>
                          </Pressable>
                        )
                    )}
                </ScrollView>
              </View>

              <View className="mb-4 flex-row gap-3">
                <View className="flex-1 flex-row items-center rounded-[28px] border border-zinc-800 bg-zinc-950 p-2">
                  <Pressable
                    onPress={() =>
                      setInputWeight((prev) =>
                        Math.max(0, parseFloat(prev) - WEIGHT_STEP).toString()
                      )
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
                    onPress={() =>
                      setInputReps((prev) => Math.max(0, parseInt(prev) - 1).toString())
                    }
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
                    <Text className="text-xs font-black text-purple-400">
                      {currentDefaultRest}s
                    </Text>
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
                  <Button
                    className="h-16 w-20 rounded-[24px] bg-green-600"
                    onPress={handleAddNewSet}>
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
        </GestureHandlerRootView>
      </DialogContent>
    </Dialog>
  );
}

export default React.memo(ViewExerciseBlock, (prev, next) => {
  return (
    prev.exerciseBlock === next.exerciseBlock &&
    prev.dateString === next.dateString &&
    prev.exerciseList.length === next.exerciseList.length
  );
});
