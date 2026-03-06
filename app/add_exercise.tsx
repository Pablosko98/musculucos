import React, { useState, useMemo } from 'react';
import { Dimensions, View, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { exercises } from '@/lib/exercises';
import { Search, Link, ChevronRight, X } from 'lucide-react-native';

const { width } = Dimensions.get('window');

interface exercise {
  id: string;
  name: string;
  description: string;
  muscleGroups: string[];
  equipment: string;
  videoUrl: string;
}

export default function AddExercise({ onAdd }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSupersetMode, setIsSupersetMode] = useState(false);
  const [staged, setStaged] = useState([]);
  const [open, setOpen] = useState(false);

  const filtered = useMemo(
    () => exercises.filter((ex) => ex.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [searchQuery]
  );

  const handleSelect = (exercise: exercise) => {
    if (isSupersetMode) {
      setStaged([...staged, exercise]);
    } else {
      // 99% Use Case: Add one and GTFO
      onAdd([exercise]);
      resetAndClose();
    }
  };

  const resetAndClose = () => {
    setOpen(false);
    setSearchQuery('');
    setStaged([]);
    setIsSupersetMode(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full bg-orange-600 py-3">
          <Text className="font-bold text-white">+ Add Exercise</Text>
        </Button>
      </DialogTrigger>

      <DialogContent
        style={{ backgroundColor: '#09090b', width: width * 0.95, height: '80%', padding: 0 }}>
        <View className="flex-row items-center border-b border-neutral-800 p-4">
          <DialogTitle className="text-white">Add Movement</DialogTitle>
          <TouchableOpacity
            style={{ marginLeft: 10 }}
            onPress={() => setIsSupersetMode(!isSupersetMode)}
            className={`flex-row items-center rounded-full px-3 py-1 ${isSupersetMode ? 'bg-orange-500' : 'bg-neutral-800'}`}>
            <Link size={14} color="white" />
            <Text className="ml-1 text-xs font-bold text-white">
              {isSupersetMode ? 'Superset ON' : 'Superset'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search Header */}
        <View className="flex-row items-center bg-neutral-900/50 px-4 py-3">
          <Search size={18} color="#71717a" />
          <TextInput
            placeholder="Search (e.g. 'Bench')"
            placeholderTextColor="#71717a"
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="ml-3 h-10 flex-1 text-base text-white"
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={18} color="#71717a" />
            </TouchableOpacity>
          )}
        </View>

        {/* Selected Chain (Only shows if building superset) */}
        {staged.length > 0 && (
          <View className="flex-row flex-wrap gap-2 border-b border-orange-500/20 bg-orange-500/10 px-4 py-2">
            {staged.map((s, i) => (
              <Text key={i} className="text-xs font-bold text-orange-400">
                {s.name}
                {i < staged.length - 1 ? ' + ' : ''}
              </Text>
            ))}
          </View>
        )}

        <ScrollView className="flex-1">
          {filtered.map((ex) => (
            <TouchableOpacity
              key={ex.id}
              onPress={() => handleSelect(ex)}
              className="flex-row items-center justify-between border-b border-neutral-900 px-5 py-4 active:bg-neutral-800">
              <View>
                <Text className="text-lg font-medium text-white">{ex.name}</Text>
                <Text className="text-xs uppercase tracking-widest text-neutral-500">
                  {ex.muscleGroup}
                </Text>
              </View>
              <ChevronRight size={20} color="#3f3f46" />
            </TouchableOpacity>
          ))}
        </ScrollView>

        {isSupersetMode && staged.length > 0 && (
          <View className="border-t border-neutral-800 p-4">
            <Button
              className="w-full bg-orange-600"
              onPress={() => {
                onAdd(staged);
                resetAndClose();
              }}>
              <Text className="font-bold text-white">Finish Superset ({staged.length})</Text>
            </Button>
          </View>
        )}
      </DialogContent>
    </Dialog>
  );
}
