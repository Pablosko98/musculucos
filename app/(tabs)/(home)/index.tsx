import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dimensions, View, type LayoutChangeEvent } from 'react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import Carousel from 'react-native-reanimated-carousel';
import { useRef, useEffect, useCallback, useReducer, useState } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { setActiveBlock } from '@/lib/block-state';
import { restTimer } from '@/lib/rest-timer';
import { consumePendingWorkoutDate } from '@/lib/navigation-state';
import { ScrollView } from 'react-native-gesture-handler';
import { addDays, differenceInDays, format, startOfDay } from 'date-fns';
import type { ICarouselInstance } from 'react-native-reanimated-carousel';

import { WorkoutDAL, db, initDB } from '@/lib/db';
import { queryClient, prefetchedRanges } from '@/lib/queryClient';
import type { Workout, Block } from '@/lib/types';
import type { Exercise } from '@/lib/exercises';
import AddExercise from '../../add_exercise';
import AddRoutine from '../../add_routine';
import ViewExerciseBlock from '../../view_exercise_block';

const { width } = Dimensions.get('window');

const ITEM_COUNT = 2000;
const INITIAL_INDEX = ITEM_COUNT / 2;
const CAROUSEL_DATA = [...new Array(ITEM_COUNT).keys()];

function workoutKey(date: string) {
  return ['workout', date] as const;
}

// ─── Prefetch a ±10 day window around a center date ──────────────────────────
async function prefetchRange(centerDate: Date) {
  const range = 10;
  const startDate = format(addDays(centerDate, -range), 'yyyy-MM-dd');
  const endDate = format(addDays(centerDate, range), 'yyyy-MM-dd');
  const rangeKey = `${startDate}_${endDate}`;
  if (prefetchedRanges.has(rangeKey)) return;
  prefetchedRanges.add(rangeKey);
  try {
    const rows = await db.getAllAsync<{ date: string }>(
      'SELECT date FROM workouts WHERE date BETWEEN ? AND ?',
      [startDate, endDate]
    );
    // Dates with no workout row → cache null so cards show REST DAY immediately
    for (
      let d = new Date(startDate + 'T00:00:00');
      d <= new Date(endDate + 'T00:00:00');
      d = addDays(d, 1)
    ) {
      const key = format(d, 'yyyy-MM-dd');
      if (!queryClient.getQueryData(workoutKey(key))) {
        queryClient.setQueryData(workoutKey(key), null);
      }
    }
    // Fill in dates that actually have workouts
    await Promise.all(
      rows.map(async (row) => {
        const w = await WorkoutDAL.getWorkoutByDate(row.date);
        queryClient.setQueryData(workoutKey(row.date), w ?? null);
      })
    );
  } catch (err) {
    prefetchedRanges.delete(rangeKey);
    console.error('Failed to prefetch range:', err);
  }
}

// ─── Module-level mutations (accessible from exercise_block etc.) ─────────────

export async function saveEditedBlock(dateString: string, updatedBlock: Block) {
  const workout = queryClient.getQueryData<Workout | null>(workoutKey(dateString));
  if (!workout) return;
  const updatedBlocks = workout.blocks.map((b) => (b.id === updatedBlock.id ? updatedBlock : b));
  const updated = { ...workout, blocks: updatedBlocks };
  // Instant optimistic update — no flash
  queryClient.setQueryData(workoutKey(dateString), updated);
  const oldBlock = workout.blocks.find((b) => b.id === updatedBlock.id);
  if (!oldBlock) return;
  const countDiff = updatedBlock.events.length - oldBlock.events.length;
  const lastOld = oldBlock.events[oldBlock.events.length - 1];
  const matchNew = updatedBlock.events[oldBlock.events.length - 1];
  const existingModified =
    lastOld != null &&
    matchNew != null &&
    lastOld.id === matchNew.id &&
    JSON.stringify(lastOld) !== JSON.stringify(matchNew);
  try {
    if (countDiff === 1 && !existingModified) {
      await WorkoutDAL.addEvent(
        updatedBlock.id,
        updatedBlock.events[updatedBlock.events.length - 1]
      );
    } else {
      await WorkoutDAL.saveFullWorkout(updated);
    }
  } catch (err) {
    console.error('Background save failed:', err);
  }
}

export function deleteBlock(dateString: string, blockId: string) {
  const workout = queryClient.getQueryData<Workout | null>(workoutKey(dateString));
  if (!workout) return;
  if (restTimer.isActiveBlock(blockId)) restTimer.clear();
  const updated = { ...workout, blocks: workout.blocks.filter((b) => b.id !== blockId) };
  queryClient.setQueryData(workoutKey(dateString), updated);
  WorkoutDAL.saveFullWorkout(updated).catch(console.error);
}

export function addExercise(dateString: string, selectedExercises: Exercise[]) {
  if (!selectedExercises || selectedExercises.length === 0) return;
  const existing = queryClient.getQueryData<Workout | null>(workoutKey(dateString));
  const workoutId = existing?.id ?? `workout-${Date.now()}`;
  const newBlock = {
    id: `block-${Date.now()}`,
    workoutId,
    order: existing ? existing.blocks.length : 0,
    type: selectedExercises.length > 1 ? 'superset' : 'standard',
    name: selectedExercises.map((e) => e.name).join(' / '),
    exerciseIds: selectedExercises.map((e) => e.id),
    exercises: selectedExercises,
    sets: 0,
    datetime: new Date().toISOString(),
    events: [],
  };
  const updated: Workout = {
    ...existing,
    id: workoutId,
    date: dateString,
    blocks: [...(existing?.blocks ?? []), newBlock],
  };
  queryClient.setQueryData(workoutKey(dateString), updated);
  setActiveBlock({
    block: newBlock,
    dateString,
    saveEditedBlock,
    onDeleteBlock: (blockId) => deleteBlock(dateString, blockId),
  });
  router.push('/exercise_block');
  WorkoutDAL.saveFullWorkout(updated).catch(console.error);
}

// ─── WorkoutCard ──────────────────────────────────────────────────────────────
// useQuery returns cached data synchronously if available → zero flash.

function WorkoutCard({ index }: { index: number }) {
  const today = startOfDay(new Date());
  const dateForCard = addDays(today, index - INITIAL_INDEX);
  const dateString = format(dateForCard, 'yyyy-MM-dd');
  const dayDiff = index - INITIAL_INDEX;

  const { data: dailyWorkout } = useQuery({
    queryKey: workoutKey(dateString),
    queryFn: () => WorkoutDAL.getWorkoutByDate(dateString),
    staleTime: Infinity,
  });

  const hasBlocks = !!dailyWorkout && dailyWorkout.blocks.length > 0;

  const relativeLabel =
    dayDiff === 0
      ? 'Today'
      : dayDiff === -1
        ? 'Yesterday'
        : dayDiff === 1
          ? 'Tomorrow'
          : dayDiff < 0
            ? `${Math.abs(dayDiff)} days ago`
            : `In ${dayDiff} days`;

  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 10, marginBottom: 50 }}>
      <Card
        style={{
          backgroundColor: '#121212',
          height: '100%',
          borderColor: '#262626',
          borderWidth: 1,
          borderRadius: 24,
          overflow: 'hidden',
        }}>
        <CardHeader>
          <CardTitle style={{ color: 'white', fontSize: 22 }}>
            {format(dateForCard, 'EEEE')}
          </CardTitle>
          <CardDescription style={{ color: '#a3a3a3' }}>
            {format(dateForCard, 'MMM do, yyyy')} · {relativeLabel}
          </CardDescription>
        </CardHeader>

        <ScrollView className="flex-1 px-4">
          {hasBlocks ? (
            dailyWorkout.blocks.map((block: any) => (
              <ViewExerciseBlock
                key={block.id}
                exerciseBlock={block}
                saveEditedBlock={saveEditedBlock}
                dateString={dateString}
                exerciseList={block.exercises ?? []}
                onDeleteBlock={(blockId) => deleteBlock(dateString, blockId)}
              />
            ))
          ) : (
            <View style={{ alignItems: 'center', justifyContent: 'center', marginTop: 100 }}>
              <Text style={{ color: '#404040', fontSize: 18, fontWeight: '600' }}>REST DAY</Text>
            </View>
          )}
        </ScrollView>

        <View style={{ flexDirection: 'row', justifyContent: 'space-evenly' }}>
          <AddExercise
            dateString={dateString}
            onAdd={(exercises) => addExercise(dateString, exercises)}
          />
          <AddRoutine onAdd={() => {}} />
        </View>
      </Card>
    </View>
  );
}

// ─── WorkoutTracker ───────────────────────────────────────────────────────────

export default function WorkoutTracker() {
  const carouselRef = useRef<ICarouselInstance>(null);
  const today = startOfDay(new Date());
  const [carouselHeight, setCarouselHeight] = useState(0);

  useEffect(() => {
    initDB();
    prefetchRange(today);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const pendingDate = consumePendingWorkoutDate();
      if (!pendingDate) return;
      const target = startOfDay(new Date(pendingDate + 'T00:00:00'));
      const dayDiff = differenceInDays(target, today);
      const targetIndex = INITIAL_INDEX + dayDiff;
      if (carouselRef.current?.getCurrentIndex() !== targetIndex) {
        carouselRef.current?.scrollTo({ index: targetIndex, animated: false });
      }
      prefetchRange(target);
    }, [])
  );

  const renderCarouselItem = useCallback(
    ({ index }: { index: number }) => <WorkoutCard index={index} />,
    []
  );

  return (
    <View style={{ flex: 1, backgroundColor: 'black' }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-evenly',
          paddingTop: 10,
          zIndex: 50,
        }}>
        <Button style={{ backgroundColor: '#6b21a8', width: 140 }}>
          <Text style={{ color: 'white' }}>Calendar</Text>
        </Button>
        <Button
          style={{ backgroundColor: '#166534', width: 140 }}
          onPress={() => carouselRef.current?.scrollTo({ index: INITIAL_INDEX, animated: true })}>
          <Text style={{ color: 'white' }}>Today</Text>
        </Button>
      </View>

      <View
        style={{ flex: 1 }}
        onLayout={(e) => setCarouselHeight(e.nativeEvent.layout.height + 50)}>
        {carouselHeight > 0 && (
          <Carousel
            ref={carouselRef}
            width={width}
            height={carouselHeight}
            data={CAROUSEL_DATA}
            defaultIndex={INITIAL_INDEX}
            windowSize={11}
            mode="parallax"
            modeConfig={{ parallaxScrollingScale: 0.94, parallaxScrollingOffset: 40 }}
            onSnapToItem={(index) => prefetchRange(addDays(today, index - INITIAL_INDEX))}
            renderItem={renderCarouselItem}
          />
        )}
      </View>
    </View>
  );
}
