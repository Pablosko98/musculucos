import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dimensions, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import Carousel from 'react-native-reanimated-carousel';
import { useRef, useState, useEffect, useMemo } from 'react';
import { ScrollView } from 'react-native-gesture-handler';
import { addDays, format, startOfDay } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ICarouselInstance } from 'react-native-reanimated-carousel';

// Custom imports
import { WorkoutDAL, db, initDB, seedDatabase } from '@/lib/db';
import { exercises } from '@/lib/exercises'; // Imported from your new file
import AddExercise from '../add_exercise';
import AddRoutine from '../add_routine';
import ViewExerciseBlock from '../view_exercise_block';

const { width, height } = Dimensions.get('window');

export default function WorkoutTracker() {
  const [workoutMap, setWorkoutMap] = useState<Record<string, any>>({});
  const fetchedRanges = useRef<Set<string>>(new Set());
  const insets = useSafeAreaInsets();
  const carouselRef = useRef<ICarouselInstance>(null);

  const today = startOfDay(new Date());
  const ITEM_COUNT = 2000;
  const INITIAL_INDEX = ITEM_COUNT / 2;
  const CAROUSEL_HEIGHT = height - insets.top - insets.bottom - 100;

  // 1. Memoize exercise lookup for performance
  const exerciseLookup = useMemo(() => {
    return new Map(exercises.map((ex) => [ex.id, ex]));
  }, []);

  // 2. Helper to attach "Leg Pressss" names etc. to the raw DB data
  const decorateWorkout = (workout: any) => {
    if (!workout) return null;
    return {
      ...workout,
      blocks: workout.blocks.map((block: any) => ({
        ...block,
        events: block.events.map((event: any) => {
          if (event.type !== 'set') return event;
          return {
            ...event,
            subSets: event.subSets?.map((subSet: any) => ({
              ...subSet,
              // Inject the full exercise metadata here
              exercise: exerciseLookup.get(subSet.exerciseId) || null,
            })),
          };
        }),
      })),
    };
  };

  useEffect(() => {
    const setup = async () => {
      try {
        initDB();
        // await seedDatabase();
        await loadDateRange(today);
      } catch (err) {
        console.error('Setup error:', err);
      }
    };
    setup();
  }, []);

  const loadDateRange = async (centerDate: Date) => {
    const range = 10;
    const startDate = format(addDays(centerDate, -range), 'yyyy-MM-dd');
    const endDate = format(addDays(centerDate, range), 'yyyy-MM-dd');
    const rangeKey = `${startDate}_${endDate}`;

    if (fetchedRanges.current.has(rangeKey)) return;

    try {
      const results: any[] = await db.getAllAsync(
        'SELECT * FROM workouts WHERE date BETWEEN ? AND ?',
        [startDate, endDate]
      );

      const detailedWorkouts: Record<string, any> = {};
      for (const row of results) {
        detailedWorkouts[row.date] = await WorkoutDAL.getWorkoutByDate(row.date);
      }

      setWorkoutMap((prev) => ({ ...prev, ...detailedWorkouts }));
      fetchedRanges.current.add(rangeKey);
    } catch (error) {
      console.error('Failed to fetch workout range:', error);
    }
  };

  const saveEditedBlock = async (dateString: string, updatedBlock: any) => {
    try {
      const workout = workoutMap[dateString];
      if (!workout) return;

      const updatedWorkout = JSON.parse(JSON.stringify(workout));
      const blockIndex = updatedWorkout.blocks.findIndex((b: any) => b.id === updatedBlock.id);

      if (blockIndex !== -1) {
        updatedWorkout.blocks[blockIndex] = updatedBlock;
        for (const event of updatedBlock.events) {
          await WorkoutDAL.updateEvent(event.id, event);
        }
        setWorkoutMap((prev) => ({ ...prev, [dateString]: updatedWorkout }));
        await WorkoutDAL.saveFullWorkout(updatedWorkout);
      }
    } catch (error) {
      console.error('Save failed:', error);
    }
  };

  const handleAddExercise = async (dateString: string, selectedExercises: any[]) => {
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
      sets: 0,
      datetime: new Date().toISOString(),
      events: []
    };
    
    const updatedBlocks = existingWorkout ? [...existingWorkout.blocks, newBlock] : [newBlock];

    const updatedWorkout = {
      ...existingWorkout,
      id: workoutId,
      date: dateString,
      blocks: updatedBlocks,
    };

    setWorkoutMap((prev) => ({ ...prev, [dateString]: updatedWorkout }));
    await WorkoutDAL.saveFullWorkout(updatedWorkout);

    const finalWorkoutState = await WorkoutDAL.getWorkoutByDate(dateString);
    setWorkoutMap((prev) => ({ ...prev, [dateString]: finalWorkoutState }));
  };

  const handleDeleteBlock = async (dateString: string, blockId: string) => {
    const workout = workoutMap[dateString];
    if (!workout) return;

    const updatedBlocks = workout.blocks.filter((b: any) => b.id !== blockId);
    const updatedWorkout = { ...workout, blocks: updatedBlocks };

    setWorkoutMap(prev => ({ ...prev, [dateString]: updatedWorkout }));

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
    <View style={{ flex: 1, backgroundColor: 'black', paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', paddingVertical: 10, zIndex: 50 }}>
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

          // Get raw data and decorate it with names from lib/exercises
          const rawWorkout = workoutMap[dateString];
          const dailyWorkout = decorateWorkout(rawWorkout);

          return (
            <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 10 }}>
              <Card style={{ backgroundColor: '#121212', height: '100%', borderColor: '#262626', borderWidth: 1, borderRadius: 24, overflow: 'hidden' }}>
                <CardHeader>
                  <CardTitle style={{ color: 'white', fontSize: 22 }}>
                    {format(dateForCard, 'EEEE')}{' '}
                    {index === INITIAL_INDEX ? '(Today)' : ''}
                  </CardTitle>
                  <CardDescription style={{ color: '#a3a3a3' }}>
                    {format(dateForCard, 'MMM do, yyyy')}
                  </CardDescription>
                </CardHeader>

                <ScrollView className="flex-1 px-4">
                  {dailyWorkout ? (
                    dailyWorkout.blocks.map((block: any) => (
                      <ViewExerciseBlock 
                        key={block.id} 
                        exerciseBlock={block} 
                        saveEditedBlock={saveEditedBlock} 
                        dateString={dateString}
                        exerciseList={exercises} // Pass the raw list for child lookups
                        onDeleteBlock={(blockId) => handleDeleteBlock(dateString, blockId)}
                      />
                    ))
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100 }}>
                      <Text style={{ color: '#404040', fontSize: 18, fontWeight: '600' }}>REST DAY</Text>
                    </View>
                  )}
                </ScrollView>

                <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', paddingBottom: 20 }}>
                  <AddExercise onAdd={(exercises) => handleAddExercise(dateString, exercises)} />
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