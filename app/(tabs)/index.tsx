import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dimensions, View, InteractionManager } from 'react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import Carousel from 'react-native-reanimated-carousel';
import React, { useRef, useEffect, useCallback, useReducer, memo } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { setActiveBlock } from '@/lib/block-state';
import { restTimer } from '@/lib/rest-timer';
import { consumePendingWorkoutDate } from '@/lib/navigation-state';
import { ScrollView } from 'react-native-gesture-handler';
import { addDays, differenceInDays, format, startOfDay } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ICarouselInstance } from 'react-native-reanimated-carousel';

import { WorkoutDAL, db, initDB } from '@/lib/db';
import type { Workout, Block } from '@/lib/types';
import type { Exercise } from '@/lib/exercises';
import AddExercise from '../add_exercise';
import AddRoutine from '../add_routine';
import ViewExerciseBlock from '../view_exercise_block';

const { width, height } = Dimensions.get('window');

// ─── Optimized Module-level cache ─────────────────────────────────────────────
// Adding 'version' to the workout type to track changes without JSON.stringify
type EnhancedWorkout = Workout & { version: number };

const _cache: Record<string, EnhancedWorkout> = {};
const _fetched = new Set<string>();

// Scoped subscribers: Map<dateString, Set<updaterFunction>>
const _subscribers = new Map<string, Set<() => void>>();

const _subscribe = (date: string, fn: () => void) => {
  if (!_subscribers.has(date)) _subscribers.set(date, new Set());
  _subscribers.get(date)!.add(fn);
  return () => _subscribers.get(date)?.delete(fn);
};

const _notifyDate = (date: string) => {
  _subscribers.get(date)?.forEach((fn) => fn());
};

const ITEM_COUNT = 2000;
const INITIAL_INDEX = ITEM_COUNT / 2;
const CAROUSEL_DATA = [...new Array(ITEM_COUNT).keys()];

// ─── Module-level actions ────────────────────────────────────────────────────
async function loadDateRange(centerDate: Date) {
  const range = 10;
  const startDate = format(addDays(centerDate, -range), 'yyyy-MM-dd');
  const endDate = format(addDays(centerDate, range), 'yyyy-MM-dd');
  const rangeKey = `${startDate}_${endDate}`;
  if (_fetched.has(rangeKey)) return;
  _fetched.add(rangeKey);
  try {
    const results = await db.getAllAsync<{ date: string }>(
      'SELECT date FROM workouts WHERE date BETWEEN ? AND ?',
      [startDate, endDate]
    );
    for (const row of results) {
      const w = await WorkoutDAL.getWorkoutByDate(row.date);
      if (w) {
        _cache[row.date] = { ...w, version: Date.now() };
        _notifyDate(row.date);
      }
    }
  } catch (err) {
    _fetched.delete(rangeKey);
  }
}

async function saveEditedBlock(dateString: string, updatedBlock: Block) {
  const workout = _cache[dateString];
  if (!workout) return;
  const updatedBlocks = [...workout.blocks];
  const idx = updatedBlocks.findIndex((b) => b.id === updatedBlock.id);
  if (idx === -1) return;

  updatedBlocks[idx] = updatedBlock;
  _cache[dateString] = { ...workout, blocks: updatedBlocks, version: Date.now() };

  _notifyDate(dateString);
  WorkoutDAL.saveFullWorkout(_cache[dateString]).catch(console.error);
}

function deleteBlock(dateString: string, blockId: string) {
  const workout = _cache[dateString];
  if (!workout) return;
  if (restTimer.isActiveBlock(blockId)) restTimer.clear();

  _cache[dateString] = {
    ...workout,
    blocks: workout.blocks.filter((b) => b.id !== blockId),
    version: Date.now(),
  };

  _notifyDate(dateString);
  WorkoutDAL.saveFullWorkout(_cache[dateString]).catch(console.error);
}

// ─── Performance-critical Sub-Component ──────────────────────────────────────
const MemoizedWorkoutList = memo(
  ({ blocks, dateString, version }: { blocks: Block[]; dateString: string; version: number }) => {
    return (
      <>
        {blocks.map((block) => (
          <ViewExerciseBlock
            key={block.id}
            exerciseBlock={block}
            saveEditedBlock={saveEditedBlock}
            dateString={dateString}
            exerciseList={block.exercises ?? []}
            onDeleteBlock={(id) => deleteBlock(dateString, id)}
          />
        ))}
      </>
    );
  },
  (prev, next) => prev.version === next.version
); // Comparison is now O(1) instead of O(N)

// ─── WorkoutCard ─────────────────────────────────────────────────────────────
function WorkoutCard({ index }: { index: number }) {
  const [, rerender] = useReducer((x) => x + 1, 0);
  const today = startOfDay(new Date());
  const dateForCard = addDays(today, index - INITIAL_INDEX);
  const dateString = format(dateForCard, 'yyyy-MM-dd');

  useEffect(() => {
    return _subscribe(dateString, rerender);
  }, [dateString]);

  const dailyWorkout = _cache[dateString];
  const dayDiff = index - INITIAL_INDEX;
  const relativeLabel =
    dayDiff === 0
      ? 'Today'
      : dayDiff === -1
        ? 'Yesterday'
        : dayDiff === 1
          ? 'Tomorrow'
          : dayDiff < 0
            ? `${Math.abs(dayDiff)}d ago`
            : `In ${dayDiff}d`;

  return (
    <View style={{ flex: 1, paddingHorizontal: 10, marginBottom: 50 }}>
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
          <CardTitle style={{ color: 'white', fontSize: 20 }}>
            {format(dateForCard, 'EEEE')}
          </CardTitle>
          <CardDescription style={{ color: '#a3a3a3' }}>
            {format(dateForCard, 'MMM do')} · {relativeLabel}
          </CardDescription>
        </CardHeader>

        <ScrollView className="flex-1 px-4" removeClippedSubviews={true}>
          {dailyWorkout && dailyWorkout.blocks.length > 0 ? (
            <MemoizedWorkoutList
              blocks={dailyWorkout.blocks}
              dateString={dateString}
              version={dailyWorkout.version}
            />
          ) : (
            <View
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 80 }}>
              <Text style={{ color: '#404040', fontSize: 16, fontWeight: '700' }}>REST DAY</Text>
            </View>
          )}
        </ScrollView>

        <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', paddingBottom: 15 }}>
          <AddExercise dateString={dateString} onAdd={(exs) => {}} />
          <AddRoutine onAdd={() => {}} />
        </View>
      </Card>
    </View>
  );
}

// ─── Main Tracker ────────────────────────────────────────────────────────────
export default function WorkoutTracker() {
  const insets = useSafeAreaInsets();
  const carouselRef = useRef<ICarouselInstance>(null);
  const today = startOfDay(new Date());
  const CAROUSEL_HEIGHT = height - insets.top - insets.bottom - 60;

  useEffect(() => {
    initDB();
    loadDateRange(today);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        // Only notify the currently visible cards to save CPU
        const currentIdx = carouselRef.current?.getCurrentIndex() ?? INITIAL_INDEX;
        for (let i = -1; i <= 1; i++) {
          const d = format(addDays(today, currentIdx + i - INITIAL_INDEX), 'yyyy-MM-dd');
          _notifyDate(d);
        }

        const pendingDate = consumePendingWorkoutDate();
        if (pendingDate) {
          const target = startOfDay(new Date(pendingDate + 'T00:00:00'));
          const targetIndex = INITIAL_INDEX + differenceInDays(target, today);
          carouselRef.current?.scrollTo({ index: targetIndex, animated: false });
        }
      });
      return () => task.cancel();
    }, [])
  );

  return (
    <View style={{ flex: 1, backgroundColor: 'black' }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-evenly',
          paddingVertical: 10,
          zIndex: 50,
        }}>
        <Button style={{ backgroundColor: '#6b21a8', width: 130 }}>
          <Text style={{ color: 'white' }}>Calendar</Text>
        </Button>
        <Button
          style={{ backgroundColor: '#166534', width: 130 }}
          onPress={() => carouselRef.current?.scrollTo({ index: INITIAL_INDEX, animated: true })}>
          <Text style={{ color: 'white' }}>Today</Text>
        </Button>
      </View>

      <Carousel
        ref={carouselRef}
        width={width}
        height={CAROUSEL_HEIGHT}
        data={CAROUSEL_DATA}
        defaultIndex={INITIAL_INDEX}
        windowSize={3} // Keep it small to prevent background lag
        mode="parallax"
        modeConfig={{ parallaxScrollingScale: 0.94, parallaxScrollingOffset: 40 }}
        onSnapToItem={(index) => loadDateRange(addDays(today, index - INITIAL_INDEX))}
        renderItem={({ index }) => <WorkoutCard index={index} />}
      />
    </View>
  );
}
