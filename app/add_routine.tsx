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
import { Search, Link, ChevronRight, X } from 'lucide-react-native';

const { width } = Dimensions.get('window');

export default function AddRoutine({ onAdd }) {
  return (
    <Dialog open={false} onOpenChange={() => {}}>
      <DialogTrigger asChild>
        <Button className="rounded-full bg-blue-600 py-3">
          <Text className="font-bold text-white">+ Add routine</Text>
        </Button>
      </DialogTrigger>
    </Dialog>
  );
}
