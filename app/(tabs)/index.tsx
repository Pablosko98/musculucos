import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dimensions, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import Carousel from 'react-native-reanimated-carousel';
import { useRef, useState, useEffect, useCallback } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { setActiveBlock } from '@/lib/block-state';
import { ScrollView } from 'react-native-gesture-handler';
import { addDays, format, startOfDay } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ICarouselInstance } from 'react-native-reanimated-carousel';

// Custom imports
import { WorkoutDAL, db, initDB, seedDatabase } from '@/lib/db';
import type { Workout, Block } from '@/lib/types';
import type { Exercise } from '@/lib/exercises';
import AddExercise from '../add_exercise';
import AddRoutine from '../add_routine';
import ViewExerciseBlock from '../view_exercise_block';

const { width, height } = Dimensions.get('window');

export default function WorkoutTracker() {
  const [workoutMap, setWorkoutMap] = useState<Record<string, Workout>>({});
  const workoutMapRef = useRef<Record<string, Workout>>({});
  const fetchedRanges = useRef<Set<string>>(new Set());
  const insets = useSafeAreaInsets();
  const carouselRef = useRef<ICarouselInstance>(null);

  const today = startOfDay(new Date());
  const ITEM_COUNT = 2000;
  const INITIAL_INDEX = ITEM_COUNT / 2;
  const CAROUSEL_HEIGHT = height - insets.top - insets.bottom - 50;

  useEffect(() => {
    initDB();
  }, []);

  useEffect(() => {
    workoutMapRef.current = workoutMap;
  }, [workoutMap]);


  useFocusEffect(
    useCallback(() => {
      fetchedRanges.current.clear();
      loadDateRange(today, true);
    }, [])
  );

  const loadDateRange = async (centerDate: Date, replace = false) => {
    const range = 10;
    const startDate = format(addDays(centerDate, -range), 'yyyy-MM-dd');
    const endDate = format(addDays(centerDate, range), 'yyyy-MM-dd');
    const rangeKey = `${startDate}_${endDate}`;

    if (fetchedRanges.current.has(rangeKey)) return;

    try {
      const results = await db.getAllAsync<{ date: string }>(
        'SELECT date FROM workouts WHERE date BETWEEN ? AND ?',
        [startDate, endDate]
      );

      const detailedWorkouts: Record<string, Workout> = {};
      for (const row of results) {
        const w = await WorkoutDAL.getWorkoutByDate(row.date);
        if (w) detailedWorkouts[row.date] = w;
      }

      setWorkoutMap((prev) => replace ? detailedWorkouts : { ...prev, ...detailedWorkouts });
      fetchedRanges.current.add(rangeKey);
    } catch (error) {
      console.error('Failed to fetch workout range:', error);
    }
  };

  const saveEditedBlock = async (dateString: string, updatedBlock: Block) => {
    const workout = workoutMapRef.current[dateString];
    if (!workout) return;

    // 1. Update local state immediately for responsiveness
    const updatedWorkout = { ...workout };
    const blockIndex = updatedWorkout.blocks.findIndex((b) => b.id === updatedBlock.id);
    if (blockIndex === -1) return;
    const oldBlock = workout.blocks[blockIndex];

    updatedWorkout.blocks[blockIndex] = updatedBlock;
    setWorkoutMap((prev) => ({ ...prev, [dateString]: updatedWorkout }));

    // 2. Determine the Delta (What changed?)
    const isAddition = updatedBlock.events.length > oldBlock.events.length;
    const isDeletion = updatedBlock.events.length < oldBlock.events.length;

    try {
      if (isAddition) {
        // Just save the new event
        const newEvent = updatedBlock.events[updatedBlock.events.length - 1];
        await WorkoutDAL.addEvent(updatedBlock.id, newEvent);
      } else if (isDeletion) {
        // This is a bit more complex, for now, full save on delete is safer
        // but we do it in the background
        await WorkoutDAL.saveFullWorkout(updatedWorkout);
      } else {
        // Re-order or Edit: Full save (usually infrequent compared to adding sets)
        await WorkoutDAL.saveFullWorkout(updatedWorkout);
      }
    } catch (error) {
      console.error('Background save failed:', error);
    }
  };

  const handleAddExercise = async (dateString: string, selectedExercises: Exercise[]) => {
    if (!selectedExercises || selectedExercises.length === 0) return;

    const existingWorkout = workoutMap[dateString];

    const workoutId = existingWorkout ? existingWorkout.id : `workout-${Date.now()}`;

    const newBlock = {
      id: `block-${Date.now()}`,
      workoutId: workoutId,
      order: existingWorkout ? existingWorkout.blocks.length : 0,
      type: selectedExercises.length > 1 ? 'superset' : 'standard',
      name: selectedExercises.map((e) => e.name).join(' / '),
      exerciseIds: selectedExercises.map((e) => e.id),
      exercises: selectedExercises,
      sets: 0,
      datetime: new Date().toISOString(),
      events: [],
    };

    const updatedBlocks = existingWorkout ? [...existingWorkout.blocks, newBlock] : [newBlock];

    const updatedWorkout = {
      ...existingWorkout,
      id: workoutId,
      date: dateString,
      blocks: updatedBlocks,
    };

    setWorkoutMap((prev) => ({ ...prev, [dateString]: updatedWorkout }));

    setActiveBlock({
      block: newBlock,
      dateString,
      saveEditedBlock,
      onDeleteBlock: (blockId) => handleDeleteBlock(dateString, blockId),
    });
    router.push('/exercise_block');

    await WorkoutDAL.saveFullWorkout(updatedWorkout);
    const finalWorkoutState = await WorkoutDAL.getWorkoutByDate(dateString);
    setWorkoutMap((prev) => ({ ...prev, [dateString]: finalWorkoutState }));
  };

  const handleDeleteBlock = async (dateString: string, blockId: string) => {
    const workout = workoutMap[dateString];
    if (!workout) return;

    const updatedBlocks = workout.blocks.filter((b) => b.id !== blockId);
    const updatedWorkout = { ...workout, blocks: updatedBlocks };

    setWorkoutMap((prev) => ({ ...prev, [dateString]: updatedWorkout }));

    await WorkoutDAL.saveFullWorkout(updatedWorkout);

    const finalWorkoutState = await WorkoutDAL.getWorkoutByDate(dateString);
    setWorkoutMap((prev) => ({ ...prev, [dateString]: finalWorkoutState }));
  };

  const handleGoToToday = () => {
    const currentIndex = carouselRef.current?.getCurrentIndex() || 0;

    // Calculate the distance.
    // If currentIndex is 1005 and INITIAL_INDEX is 1000, shift is -5.
    const shift = INITIAL_INDEX - currentIndex;

    if (shift === 0) return; // Already there

    carouselRef.current?.scrollTo({
      count: shift, // Forces the direction based on the math
      animated: true,
    });
  };

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
        <Button style={{ backgroundColor: '#166534', width: 140 }} onPress={handleGoToToday}>
          <Text style={{ color: 'white' }}>Today</Text>
        </Button>
      </View>

      <Carousel
        ref={carouselRef}
        width={width}
        height={CAROUSEL_HEIGHT}
        data={[...new Array(ITEM_COUNT).keys()]}
        defaultIndex={INITIAL_INDEX}
        windowSize={11}
        mode="parallax"
        modeConfig={{ parallaxScrollingScale: 0.94, parallaxScrollingOffset: 40 }}
        onSnapToItem={(index) => {
          const newCenterDate = addDays(today, index - INITIAL_INDEX);
          loadDateRange(newCenterDate);
        }}
        renderItem={({ index }) => {
          const dateForCard = addDays(today, index - INITIAL_INDEX);
          const dateString = format(dateForCard, 'yyyy-MM-dd');
          const dayDiff = index - INITIAL_INDEX;

          const dailyWorkout = workoutMap[dateString] ?? null;
          const hasBlocks = dailyWorkout && dailyWorkout.blocks.length > 0;

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
            <View
              style={{
                flex: 1,
                justifyContent: 'center',
                paddingHorizontal: 10,
                marginBottom: 50,
              }}>
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
                        onDeleteBlock={(blockId) => handleDeleteBlock(dateString, blockId)}
                      />
                    ))
                  ) : (
                    <View
                      style={{
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: 100,
                      }}>
                      <Text style={{ color: '#404040', fontSize: 18, fontWeight: '600' }}>
                        REST DAY
                      </Text>
                    </View>
                  )}
                </ScrollView>

                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-evenly',
                  }}>
                  <AddExercise dateString={dateString} onAdd={(exercises) => handleAddExercise(dateString, exercises)} />
                  <AddRoutine onAdd={() => {}} />
                </View>
              </Card>
            </View>
          );
        }}
      />
    </View>
  );
}
