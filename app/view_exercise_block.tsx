import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { 
  TextInput, View, KeyboardAvoidingView, 
  Platform, Dimensions, Pressable, ScrollView, Alert, Linking,
  Keyboard
} from 'react-native';
import DraggableFlatList, { 
  RenderItemParams, 
  ScaleDecorator 
} from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { produce } from 'immer';
import { Activity, Trash2, Zap, ChevronDown, ChevronUp, Plus, Minus, Youtube, Clock } from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const WEIGHT_STEP = 2.5;
const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const REP_TYPES = ['warmup', 'full', 'top half', 'bot half', 'assisted'];

const DEFAULT_RESTS: Record<string, number> = {
  'leg_press': 180, 'bench_press': 120, 'default': 60
};

function ViewExerciseBlock({ exerciseBlock, saveEditedBlock, dateString, exerciseList = [], onDeleteBlock }: any) {
  if (!exerciseBlock) return null;

  const exerciseMap = useMemo(() => {
    return new Map(exerciseList.map((ex: any) => [ex.id, ex]));
  }, [exerciseList]);

  const [open, setOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const [localBlock, setLocalBlock] = useState(exerciseBlock);
  const [editing, setEditing] = useState<{type: 'set' | 'rest', eventId: string, subSetId?: string} | null>(null);
  const [activeExerciseId, setActiveExerciseId] = useState(exerciseBlock?.exerciseIds?.[0] || '');
  const [inputWeight, setInputWeight] = useState('60');
  const [inputReps, setInputReps] = useState('10');
  const [inputRest, setInputRest] = useState('');
  const [inputRPE, setInputRPE] = useState(8);
  const [repType, setRepType] = useState('full');
  const [currentDefaultRest, setCurrentDefaultRest] = useState(DEFAULT_RESTS[activeExerciseId] || DEFAULT_RESTS['default']);

  // 1. Sync local state with parent when NOT editing
  useEffect(() => {
    if (!editing) setLocalBlock(exerciseBlock);
  }, [exerciseBlock, editing]);

  // 2. LIVE SYNC: Updates localBlock as you type
  useEffect(() => {
    if (editing?.type === 'set' && editing.subSetId) {
      const nextBlock = produce(localBlock, (draft: any) => {
        const event = draft.events.find((e: any) => e.id === editing.eventId);
        if (event) {
          const sub = event.subSets.find((s: any) => s.id === editing.subSetId);
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
      .filter((e: any) => e.type === 'set')
      .flatMap((e: any) => e.subSets)
      .filter((s: any) => s.exerciseId === id);
    const lastWeight = allMatching.length > 0 ? allMatching[allMatching.length - 1].weightKg.toString() : '60';
    setInputWeight(lastWeight);
  };

  const handleAddNewSet = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowAdvanced(false);
    Keyboard.dismiss();


    const now = new Date().toLocaleTimeString('en-GB', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    const newSub = { 
        id: `sub-${Date.now()}`,
        exerciseId: activeExerciseId, 
        weightKg: parseFloat(inputWeight) || 0, 
        reps: parseInt(inputReps) || 0, 
        rpe: inputRPE, 
        rep_type: repType, 
        datetime: now,
        exercise: exerciseMap.get(activeExerciseId)
    };

    const nextBlock = produce(localBlock, (draft: any) => {
        const lastEvent = draft.events[draft.events.length - 1];
        if (lastEvent?.type === 'set') {
          lastEvent.subSets.push(newSub);
        } else {
          draft.events.push({ 
            id: `event-set-${Date.now()}`, 
            type: 'set', 
            subSets: [newSub], 
            datetime: now 
          });
        }
    });

    setLocalBlock(nextBlock);
    saveEditedBlock(dateString, nextBlock);

    if(activeExerciseId === exerciseBlock?.exerciseIds?.[0] && exerciseBlock?.exerciseIds?.[1]){
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

    const nextBlock = produce(localBlock, (draft: any) => {
      const { type, eventId, subSetId } = editing;
      const eIdx = draft.events.findIndex((e: any) => e.id === eventId);
      if (eIdx === -1) return;

      if (type === 'set' && subSetId) {
        const sIdx = draft.events[eIdx].subSets.findIndex((s: any) => s.id === subSetId);
        if (sIdx !== -1) {
          draft.events[eIdx].subSets.splice(sIdx, 1);
          if (draft.events[eIdx].subSets.length === 0) draft.events.splice(eIdx, 1);
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
    
    const nextBlock = produce(localBlock, (draft: any) => {
      draft.events.push({ 
        id: `rest-${Date.now()}`,
        type: 'rest', 
        durationSeconds: dur, 
        datetime: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) 
      });
    });

    setLocalBlock(nextBlock);
    saveEditedBlock(dateString, nextBlock);
    setInputRest('');
  };

  const renderEvent = useCallback(({ item, drag, isActive }: RenderItemParams<any>) => (
    <ScaleDecorator>
      <Pressable 
        onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); drag(); }} 
        disabled={isActive} 
        className={`mb-4 ${isActive ? 'opacity-50' : ''}`}
      >
        {item.type === 'set' ? (
          <View className="p-4 rounded-[32px] bg-zinc-900 border border-zinc-800">
            <View className="flex-row items-center justify-between mb-3 px-1">
                <Text className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Training Set</Text>
                <Text className="text-[10px] font-bold text-zinc-700">{item.datetime}</Text>
            </View>
            <View style={{flexDirection: 'row', flexWrap: 'wrap', flex: 1, gap: 4}}>
              {item.subSets?.map((sub: any, index: number) => {
                const isEditing = editing?.subSetId === sub.id;
                const exerciseMeta = sub.exercise || exerciseMap.get(sub.exerciseId);
                
                const displayWeight = isEditing ? inputWeight : sub.weightKg;
                const displayReps = isEditing ? inputReps : sub.reps;
                const displayRPE = isEditing ? inputRPE : sub.rpe;

                return (
                  <Pressable 
                    key={sub.id}
                    onPress={() => {
                      Haptics.selectionAsync();
                      if (isEditing) { handleFinishEditing(); return; }
                      setEditing({ type: 'set', eventId: item.id, subSetId: sub.id });
                      handleChangeActiveExercise(sub.exerciseId);
                      setInputWeight(sub.weightKg.toString());
                      setInputReps(sub.reps.toString());
                      setInputRPE(sub.rpe || 8);
                      setRepType(sub.rep_type || 'full');
                    }}
                    style={{ flex: 1, minWidth: 140 }}
                    className={`px-4 py-3 rounded-2xl border ${isEditing ? 'bg-zinc-100 border-zinc-100' : 'bg-zinc-950 border-zinc-800'}`}
                  >
                    <View className="flex-row justify-between items-center mb-1 gap-4">
                      <Text numberOfLines={1} className={`text-[9px] font-black uppercase flex-1 ${isEditing ? 'text-zinc-400' : 'text-zinc-500'}`}>{exerciseMeta?.name || sub.exerciseId}</Text>
                      <Text className={`text-[9px] font-black uppercase ${isEditing ? 'text-zinc-400' : 'text-zinc-500'}`}>| {sub.rep_type} </Text>
                      <Text className={`text-[9px] font-black ${isEditing ? 'text-zinc-900' : 'text-green-500'}`}>@{displayRPE}</Text>
                    </View>
                    <Text className={`font-black text-lg ${isEditing ? 'text-black' : 'text-zinc-100'}`}>
                      <Text className={`text-green-500`}>{index + 1}.   </Text>
                      {displayWeight}<Text className="text-zinc-500 text-xs">kg</Text> × {displayReps}
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
                if(editing){handleFinishEditing(); return;}
                setEditing({ type: 'rest', eventId: item.id }); 
                setInputRest(item.durationSeconds.toString()); 
            }} 
            className={`p-3 rounded-2xl border flex-row justify-center items-center gap-2 ${editing?.eventId === item.id ? 'bg-purple-600 border-purple-500' : 'bg-purple-900/10 border-purple-500/20'}`}
          >
            <Zap size={12} color={editing?.eventId === item.id ? 'white' : '#a855f7'} />
            <Text className={`font-black text-xs uppercase ${editing?.eventId === item.id ? 'text-white' : 'text-purple-400'}`}>{item.durationSeconds}s Rest</Text>
          </Pressable>
        )}
      </Pressable>
    </ScaleDecorator>
  ), [editing, exerciseMap, inputWeight, inputReps, inputRPE, repType, localBlock]);

  return (
    <Dialog open={open} onOpenChange={(val) => { if(!val && editing) handleFinishEditing(); setOpen(val); }}>
      <DialogTrigger asChild>
        <Pressable className="p-5 bg-zinc-900 border border-zinc-800 rounded-[32px] mb-3 flex-row justify-between items-center" onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            Alert.alert("Delete", "Delete block?", [{ text: "Cancel" }, { text: "Delete", style: "destructive", onPress: () => onDeleteBlock(exerciseBlock.id) }]);
          }}>
            <Text className="text-white font-black text-xl leading-tight">{localBlock.name}</Text>
            <Activity size={20} color="#22c55e" />
        </Pressable>
      </DialogTrigger>

      <DialogContent className="bg-zinc-950 border-zinc-800 p-0" style={{ width: SCREEN_WIDTH, height: '97%', marginTop: 'auto' }}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View className="px-6 pt-6 pb-2 flex-row">
                <View className="flex-1">
                    <Text className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Active Exercise</Text>
                    <Text className="text-white text-2xl font-black">{exerciseMap.get(activeExerciseId)?.name || 'Exercise'}</Text>
                </View>
                {exerciseMap.get(activeExerciseId)?.videoUrl && (
                    <Pressable onPress={() => Linking.openURL(exerciseMap.get(activeExerciseId).videoUrl)} className="w-12 h-12 ml-5 bg-red-600/10 border border-red-600/20 rounded-2xl items-center justify-center">
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

            <View className="bg-zinc-900 border-t border-zinc-800 p-5 rounded-t-[44px]">
              <View className="flex-row items-center justify-between mb-4 px-1">
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                      {localBlock.exerciseIds.map((id: string) => (
                          !editing && <Pressable key={id} onPress={() => { Haptics.selectionAsync(); handleChangeActiveExercise(id);}} className={`mr-2 px-4 py-2 rounded-full border ${activeExerciseId === id ? 'bg-zinc-100 border-zinc-100' : 'bg-zinc-950 border-zinc-800'}`}>
                              <Text className={`text-[10px] font-black uppercase ${activeExerciseId === id ? 'text-black' : 'text-zinc-500'}`}>{exerciseMap.get(id)?.name || id}</Text>
                          </Pressable>
                      ))}
                  </ScrollView>
              </View>

              <View className="flex-row gap-3 mb-4">
                <View className="flex-1 bg-zinc-950 rounded-[28px] border border-zinc-800 p-2 flex-row items-center">
                  <Pressable onPress={() => setInputWeight((prev) => (Math.max(0, parseFloat(prev)-WEIGHT_STEP)).toString())} className="w-12 h-12 bg-zinc-900 rounded-2xl items-center justify-center"><Minus size={18} color="#71717a" /></Pressable>
                  <View className="flex-1 items-center">
                      <Text className="text-[8px] font-black text-zinc-600 uppercase">Weight</Text>
                      <TextInput keyboardType="decimal-pad" selectTextOnFocus value={inputWeight} onChangeText={setInputWeight} className="text-white font-black text-2xl text-center" />
                  </View>
                  <Pressable onPress={() => setInputWeight((prev) => (parseFloat(prev)+WEIGHT_STEP).toString())} className="w-12 h-12 bg-zinc-900 rounded-2xl items-center justify-center"><Plus size={18} color="#71717a" /></Pressable>
                </View>

                <View className="w-36 bg-zinc-950 rounded-[28px] border border-zinc-800 p-2 flex-row items-center">
                  <Pressable onPress={() => setInputReps((prev) => (Math.max(0, parseInt(prev)-1)).toString())} className="w-10 h-10 bg-zinc-900 rounded-xl items-center justify-center"><Minus size={16} color="#71717a" /></Pressable>
                  <View className="flex-1 items-center">
                      <Text className="text-[8px] font-black text-zinc-600 uppercase">Reps</Text>
                      <TextInput keyboardType="number-pad" selectTextOnFocus value={inputReps} onChangeText={setInputReps} className="text-white font-black text-2xl text-center" />
                  </View>
                  <Pressable onPress={() => setInputReps((prev) => (parseInt(prev)+1).toString())} className="w-10 h-10 bg-zinc-900 rounded-xl items-center justify-center"><Plus size={16} color="#71717a" /></Pressable>
                </View>
              </View>

              <View className="flex-row gap-2">
                  <Button onPress={() => setShowAdvanced(!showAdvanced)} variant="outline" className="flex-1 h-16 rounded-[24px] border-zinc-800 flex-row gap-2">
                      <Text className="text-zinc-500 font-black text-[10px] uppercase">RPE / Type</Text>
                      {showAdvanced ? <ChevronUp size={14} color="#52525b" /> : <ChevronDown size={14} color="#52525b" />}
                  </Button>
                  {!editing && (
                      <Pressable onPress={handleAddRest} className="ml-2 px-4 bg-purple-600/10 border border-purple-500/30 rounded-full flex-row items-center gap-2">
                          <Clock size={14} color="#a855f7" />
                          <Text className="text-purple-400 font-black text-xs">{currentDefaultRest}s</Text>
                      </Pressable>
                  )}
                  {editing ? (
                      <Button variant="destructive" className="w-20 h-16 rounded-[24px]" onPress={deleteCurrent}><Trash2 color="white" /></Button>
                  ) : (
                      <Button className="w-20 h-16 rounded-[24px] bg-green-600" onPress={handleAddNewSet}><Plus color="white" strokeWidth={4} /></Button>
                  )}
              </View>

              {showAdvanced && (
                <View className="mt-4 p-4 bg-zinc-950 rounded-[32px] border border-zinc-800">
                  <ScrollView horizontal className="flex-row mb-5">
                    {RPE_VALUES.map(v => (
                      <Pressable key={v} onPress={() => setInputRPE(v)} className={`mr-2 w-12 h-11 rounded-xl items-center justify-center border ${inputRPE === v ? 'bg-green-500 border-green-400' : 'bg-zinc-900 border-zinc-800'}`}>
                        <Text className={`text-xs font-black ${inputRPE === v ? 'text-white' : 'text-zinc-500'}`}>{v}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <View className="flex-row flex-wrap gap-2">
                    {REP_TYPES.map(t => (
                      <Pressable key={t} onPress={() => setRepType(t)} className={`px-4 py-2 rounded-xl border ${repType === t ? 'bg-zinc-100 border-zinc-100' : 'bg-zinc-900 border-zinc-800'}`}>
                        <Text className={`text-[10px] font-black uppercase ${repType === t ? 'text-black' : 'text-zinc-500'}`}>{t}</Text>
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