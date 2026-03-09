import React, { useEffect, useState } from 'react';
import { Pressable, TextInput, View, ScrollView } from 'react-native';
import { Text } from '@/components/ui/text';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { produce } from 'immer';
import { Timer, Weight } from 'lucide-react-native';

export default function ViewExerciseBlock({ 
  exerciseBlock, 
  saveEditedBlock, 
  dateString 
}: { 
  exerciseBlock: any, 
  saveEditedBlock: Function, 
  dateString: string 
}) {
  const [open, setOpen] = useState(false);
  const [localBlock, setLocalBlock] = useState(exerciseBlock);

  // Sync and Reset Logic
  useEffect(() => {
    setLocalBlock(exerciseBlock);
  }, [exerciseBlock, open]);

  const handleEdit = (index: number, key: string, value: string) => {
    setLocalBlock(produce((draft: any) => {
      const event = draft.events[index];
      if (['weightKg', 'reps', 'durationSeconds'].includes(key)) {
        draft.events[index][key] = value === '' ? 0 : parseFloat(value);
      } else {
        draft.events[index][key] = value;
      }
    }));
  };

  const onSave = async () => {
  // Just send the whole modified local state once
  await saveEditedBlock(dateString, localBlock);
  setOpen(false);
};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Pressable className="p-2">
          {localBlock.events.map((event: any, i: number) => (
            event.type === 'set' ? (
              <Text key={i} className="text-neutral-400">
                Set {event.setIndex + 1}: {event.weightKg}kg x {event.reps}
              </Text>
            ) : null
          ))}
        </Pressable>
      </DialogTrigger>

      <DialogContent className="bg-zinc-950 border-zinc-800">
        <DialogHeader>
          <Text className="text-xl font-bold text-white">{localBlock.name}</Text>
        </DialogHeader>
        <ScrollView style={{width: 300, height: 500}}>
          {localBlock.events.map((event: any, index: number) => (
            <View key={index} className="mb-4 p-3 bg-zinc-900 rounded-lg border border-zinc-800">
              {event.type === 'set' ? (
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Weight size={16} color="#71717a" />
                    <TextInput
                      className="text-white bg-zinc-800 p-2 rounded w-16"
                      keyboardType="numeric"
                      value={event.weightKg.toString()}
                      onChangeText={(v) => handleEdit(index, 'weightKg', v)}
                    />
                    <Text className="text-zinc-500">kg</Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Text className="text-zinc-500">x</Text>
                    <TextInput
                      className="text-white bg-zinc-800 p-2 rounded w-12"
                      keyboardType="number-pad"
                      value={event.reps.toString()}
                      onChangeText={(v) => handleEdit(index, 'reps', v)}
                    />
                    <Text className="text-zinc-500">reps</Text>
                  </View>
                </View>
              ) : (
                <View className="flex-row items-center gap-3">
                  <Timer size={16} color="#a855f7" />
                  <Text className="text-purple-400 font-medium">Rest:</Text>
                  <TextInput
                    className="text-white bg-zinc-800 p-2 rounded w-20"
                    keyboardType="number-pad"
                    value={event.durationSeconds.toString()}
                    onChangeText={(v) => handleEdit(index, 'durationSeconds', v)}
                  />
                  <Text className="text-zinc-500">sec</Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
        <View>
          <Text>New set</Text>
        </View>

        <DialogFooter className="flex-row gap-3">
          <Button variant="outline" className="flex-1" onPress={() => setOpen(false)}>
            <Text>Cancel</Text>
          </Button>
          <Button className="flex-1 bg-green-700" onPress={onSave}>
            <Text className="text-white font-bold">Save Changes</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}