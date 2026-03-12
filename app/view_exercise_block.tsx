import React, { useEffect, useState, useMemo, useRef } from 'react';
import { 
  Pressable, TextInput, View, ScrollView, 
  KeyboardAvoidingView, Platform, Dimensions, Keyboard 
} from 'react-native';
import { Text } from '@/components/ui/text';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { produce } from 'immer';
import { Check, Activity, Trash2, Clock, Zap } from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const WEIGHT_STEP = 2.5;

const DEFAULT_RESTS: Record<string, number> = {
  'squat': 180,
  'bench_press': 120,
  'deadlift': 240,
  'default': 60
};

const REP_TYPES = ['warmup', 'full', 'top half', 'bot half', 'assisted'];

export default function ViewExerciseBlock({ exerciseBlock, saveEditedBlock, dateString }: any) {
  if (!exerciseBlock) return null;

  const [open, setOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  
  const [localBlock, setLocalBlock] = useState(() => ({
    name: exerciseBlock?.name || '',
    exerciseIds: exerciseBlock?.exerciseIds || [],
    events: exerciseBlock?.events || []
  }));
  
  const [selectedEventIndex, setSelectedEventIndex] = useState<number | null>(null);
  const [activeExerciseId, setActiveExerciseId] = useState(exerciseBlock?.exerciseIds?.[0] || '');
  
  const [inputWeight, setInputWeight] = useState('');
  const [inputReps, setInputReps] = useState('');
  const [inputRest, setInputRest] = useState('');
  const [inputRPE, setInputRPE] = useState('8');
  const [repType, setRepType] = useState('full');

  const currentDefaultRest = DEFAULT_RESTS[activeExerciseId] || DEFAULT_RESTS['default'];

  // Handle live updates when editing an existing set
  useEffect(() => {
    if (selectedEventIndex !== null) {
      setLocalBlock(produce(draft => {
        const event = draft.events[selectedEventIndex];
        if (event.type === 'set') {
          event.weightKg = parseFloat(inputWeight) || 0;
          event.reps = parseInt(inputReps) || 0;
          event.rpe = parseFloat(inputRPE);
          event.rep_type = repType;
        } else {
          event.durationSeconds = parseInt(inputRest) || 0;
        }
      }));
    }
  }, [inputWeight, inputReps, inputRPE, repType, inputRest]);

  // Inheritance & Prefill Logic
  useEffect(() => {
    if (selectedEventIndex !== null) return;
    const lastSet = [...localBlock.events].reverse().find(e => e.type === 'set' && e.exerciseId === activeExerciseId);
    if (lastSet) {
      setInputWeight(lastSet.weightKg.toString());
      setInputReps(lastSet.reps.toString());
      setInputRPE(lastSet.rpe?.toString() || '8');
      setRepType(lastSet.rep_type || 'full');
    }
  }, [activeExerciseId, localBlock.events.length, selectedEventIndex]);

  const scrollToBottom = () => setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 150);

  const stats = useMemo(() => {
    const sets = localBlock.events.filter((e: any) => e.type === 'set');
    const rests = localBlock.events.filter((e: any) => e.type === 'rest');
    const totalVol = sets.reduce((acc: number, s: any) => acc + ((s.weightKg || 0) * (s.reps || 0)), 0);
    const avgReps = sets.length ? (sets.reduce((acc, s) => acc + (s.reps || 0), 0) / sets.length).toFixed(1) : 0;
    const avgRest = rests.length ? Math.round(rests.reduce((acc, r) => acc + r.durationSeconds, 0) / rests.length) : 0;
    const typeBreakdown = sets.reduce((acc: any, s: any) => { acc[s.rep_type] = (acc[s.rep_type] || 0) + 1; return acc; }, {});
    return { totalVol, setCount: sets.length, avgReps, avgRest, typeBreakdown };
  }, [localBlock.events]);

  const adjust = (target: 'weight' | 'reps', amount: number) => {
    if (target === 'weight') {
      const val = (parseFloat(inputWeight) || 0) + amount;
      setInputWeight(val < 0 ? '0' : val.toFixed(1));
    } else {
      const val = (parseInt(inputReps) || 0) + amount;
      setInputReps(val < 0 ? '0' : val.toString());
    }
  };

  const handleApplyNewSet = () => {
    const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    setLocalBlock(produce(draft => {
      draft.events.push({
        type: 'set',
        exerciseId: activeExerciseId,
        weightKg: parseFloat(inputWeight) || 0,
        reps: parseInt(inputReps) || 0,
        rpe: parseFloat(inputRPE),
        rep_type: repType,
        datetime: now
      });
    }));
    scrollToBottom();
  };

  const deleteSelected = () => {
    if (selectedEventIndex === null) return;
    setLocalBlock(produce(draft => { draft.events.splice(selectedEventIndex, 1); }));
    setSelectedEventIndex(null);
    setInputRest('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Pressable className="p-5 bg-zinc-900 border border-zinc-800 rounded-[32px] mb-3 active:opacity-70">
          <View className="flex-row justify-between items-start mb-4">
            <View className="flex-1">
              <Text className="text-white font-black text-xl mb-1">{localBlock.name}</Text>
              <View className="flex-row flex-wrap gap-2">
                <Text className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest">{stats.setCount} Sets | {stats.totalVol}kg Vol</Text>
              </View>
            </View>
            <View className="bg-green-500/10 p-2 rounded-full"><Activity size={16} color="#22c55e" /></View>
          </View>
        </Pressable>
      </DialogTrigger>

      <DialogContent 
        className="bg-zinc-950 border-zinc-800 p-0" 
        style={{ width: SCREEN_WIDTH, height: '96%', marginTop: 'auto' }}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : -20}
          style={{ flex: 1 }}
        >
          <ScrollView 
            ref={scrollViewRef} 
            className="flex-1" 
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={true}
          >
            {localBlock.events.map((event: any, index: number) => (
              <View key={index} className="flex-row">
                <View className="items-center mr-4">
                  <View className={`w-1.5 h-1.5 rounded-full ${event.type === 'set' ? 'bg-zinc-700' : 'bg-purple-500'} mt-6`} />
                  {index !== localBlock.events.length - 1 && <View className="w-[1px] flex-1 bg-zinc-800 my-1" />}
                </View>
                <Pressable 
                  onPress={() => {
                    if (selectedEventIndex === index) {
                      setSelectedEventIndex(null);
                      setInputRest('');
                    } else {
                      setSelectedEventIndex(index);
                      if (event.type === 'set') {
                        setActiveExerciseId(event.exerciseId);
                        setInputWeight(event.weightKg.toString());
                        setInputReps(event.reps.toString());
                        setInputRPE(event.rpe.toString());
                        setRepType(event.rep_type);
                      } else {
                        setInputRest(event.durationSeconds.toString());
                      }
                    }
                  }}
                  className={`flex-1 mb-3 p-4 rounded-2xl border ${selectedEventIndex === index ? 'bg-zinc-800 border-green-500' : 'bg-zinc-900 border-zinc-800'}`}
                >
                  <View className="flex-row justify-between items-center">
                    <View>
                      <Text className="text-zinc-500 text-[8px] font-black uppercase mb-1">
                        {event.type === 'set' ? `${event.exerciseId?.replace(/_/g, ' ')} | ${event.rep_type} | ${event.rpe}` : 'Rest Period'}
                      </Text>
                      <Text className="text-white font-black text-lg">
                        {event.type === 'set' ? `${event.weightKg}kg × ${event.reps}` : `${event.durationSeconds}s`}
                      </Text>
                    </View>
                    <Text className="text-zinc-600 text-[9px] font-mono">{event.datetime}</Text>
                  </View>
                </Pressable>
              </View>
            ))}
          </ScrollView>

          {/* Sticky Controls Container */}
          <View className="bg-zinc-900 border-t border-zinc-800">
            <View className="p-5 pb-2">
              {/* Exercise Tabs */}
              <View className="flex-row gap-1 mb-4">
                {localBlock.exerciseIds.map((id: string) => (
                  <Pressable key={id} onPress={() => setActiveExerciseId(id)} className={`px-3 py-1.5 rounded-full border ${activeExerciseId === id ? 'bg-zinc-100 border-zinc-100' : 'bg-transparent border-zinc-800'}`}>
                    <Text className={`text-[9px] font-black uppercase ${activeExerciseId === id ? 'text-black' : 'text-zinc-500'}`}>{id.split('_')[0]}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Rest Actions */}
              <View className="flex-row gap-2 mb-4">
                <Pressable onPress={() => {
                  const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                  const dur = inputRest ? parseInt(inputRest) : currentDefaultRest;
                  setLocalBlock(produce(draft => { 
                    draft.events.push({ type: 'rest', durationSeconds: dur, datetime: now }); 
                  }));
                  setInputRest('');
                  scrollToBottom();
                }} className="flex-1 h-12 bg-purple-600 rounded-2xl items-center justify-center flex-row gap-2 active:bg-purple-700">
                  <Zap size={16} color="white" />
                  <Text className="text-white font-black text-[11px] uppercase">Add</Text>
                  <View className="bg-purple-900/40 px-2 py-1 rounded-lg border border-purple-400/30">
                    <TextInput 
                      placeholder={currentDefaultRest.toString()} 
                      placeholderTextColor="#d8b4fe" 
                      keyboardType="number-pad" 
                      className="text-white font-black text-sm p-0 min-w-[30px] text-center" 
                      value={inputRest} 
                      onChangeText={setInputRest}
                      onPress={(e) => e.stopPropagation()} 
                    />
                  </View>
                  <Text className="text-white font-black text-[11px] uppercase">s Rest</Text>
                </Pressable>
              </View>

              {/* Set Inputs */}
              <View className="flex-row gap-2">
                <View className="flex-1 h-16 flex-row bg-zinc-950 rounded-2xl border border-zinc-800 overflow-hidden">
                  <Pressable onPress={() => adjust('weight', -WEIGHT_STEP)} className="w-10 items-center justify-center border-r border-zinc-800"><Text className="text-zinc-500 font-bold">-</Text></Pressable>
                  <View className="flex-1 items-center justify-center">
                    <TextInput keyboardType="decimal-pad" value={inputWeight} onChangeText={setInputWeight} className="text-white font-black text-xl text-center w-full" selectTextOnFocus />
                    <Text className="text-zinc-700 text-[8px] font-black uppercase mt-[-4px]">kg</Text>
                  </View>
                  <Pressable onPress={() => adjust('weight', WEIGHT_STEP)} className="w-10 items-center justify-center border-l border-zinc-800"><Text className="text-zinc-500 font-bold">+</Text></Pressable>
                </View>
                <View className="w-28 h-16 flex-row bg-zinc-950 rounded-2xl border border-zinc-800 overflow-hidden">
                  <Pressable onPress={() => adjust('reps', -1)} className="w-8 items-center justify-center border-r border-zinc-800"><Text className="text-zinc-500 font-bold">-</Text></Pressable>
                  <View className="flex-1 items-center justify-center">
                    <TextInput keyboardType="number-pad" value={inputReps} onChangeText={setInputReps} className="text-white font-black text-xl text-center w-full" selectTextOnFocus />
                    <Text className="text-zinc-700 text-[8px] font-black uppercase mt-[-4px]">reps</Text>
                  </View>
                  <Pressable onPress={() => adjust('reps', 1)} className="w-8 items-center justify-center border-l border-zinc-800"><Text className="text-zinc-500 font-bold">+</Text></Pressable>
                </View>

                {selectedEventIndex !== null ? (
                  <Button variant="destructive" className="w-16 h-16 rounded-2xl" onPress={deleteSelected}>
                    <Trash2 color="white" size={24} />
                  </Button>
                ) : (
                  <Button className="w-16 h-16 rounded-2xl bg-green-600" onPress={handleApplyNewSet}>
                    <Check color="white" strokeWidth={4} size={24} />
                  </Button>
                )}
              </View>

              <Pressable onPress={() => setShowAdvanced(!showAdvanced)} className="mt-4 self-center"><Text className="text-zinc-600 text-[10px] font-black uppercase tracking-tighter">{showAdvanced ? 'Hide Settings' : 'Rep Type & RPE'}</Text></Pressable>
              {showAdvanced && (
                <View className="mt-4 p-4 bg-zinc-950 rounded-3xl border border-zinc-800 gap-4">
                  <View className="flex-row flex-wrap gap-2">
                    {REP_TYPES.map(t => (
                      <Pressable key={t} onPress={() => setRepType(t)} className={`px-3 py-2 rounded-xl border ${repType === t ? 'bg-zinc-100 border-zinc-100' : 'border-zinc-800'}`}>
                        <Text className={`text-[10px] font-black uppercase ${repType === t ? 'text-black' : 'text-zinc-600'}`}>{t}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View className="flex-row justify-between">
                    {[7, 8, 9, 10].map(v => (
                      <Pressable key={v} onPress={() => setInputRPE(v.toString())} className={`w-12 h-12 rounded-xl items-center justify-center ${inputRPE === v.toString() ? 'bg-green-500' : 'bg-zinc-900 border border-zinc-800'}`}>
                        <Text className={`font-black ${inputRPE === v.toString() ? 'text-white' : 'text-zinc-500'}`}>{v}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* Final Actions Footer */}
            <View className="p-6 pt-2 flex-row gap-3 bg-zinc-900">
               <Button variant="ghost" className="flex-1" onPress={() => setOpen(false)}><Text className="text-zinc-500 font-bold uppercase text-[10px]">Close</Text></Button>
               <Button className="flex-1 bg-white h-12 rounded-2xl" onPress={() => {saveEditedBlock(dateString, localBlock); setOpen(false);}}><Text className="text-black font-black uppercase text-[10px]">Save Workout</Text></Button>
            </View>
          </View>
        </KeyboardAvoidingView>
      </DialogContent>
    </Dialog>
  );
}