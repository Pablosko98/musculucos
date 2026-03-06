import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dimensions, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import Carousel from 'react-native-reanimated-carousel';
import { useRef, useState, useEffect } from 'react';
import { ScrollView } from 'react-native-gesture-handler';
import { addDays, format, startOfDay } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ICarouselInstance } from 'react-native-reanimated-carousel';

// Custom imports - Ensure these match your project structure
import { WorkoutDAL, db, initDB, seedDatabase } from '@/lib/db';
import AddExercise from '../add_exercise';
import AddRoutine from '../add_routine';

const { width, height } = Dimensions.get('window');

export default function WorkoutTracker() {
  useEffect(() => {
    const setup = async () => {
      try {
        initDB();
        // Wait for seeding to finish completely
        await seedDatabase();
        // Now fetch the range for the UI
        await loadDateRange(today);
      } catch (err) {
        console.error('Setup error:', err);
      }
    };
    setup();
    // REMOVE the second useEffect further down in your code
  }, []);
  // 1. Storage: Map for O(1) lookups by date string "YYYY-MM-DD"
  const [workoutMap, setWorkoutMap] = useState<Record<string, any>>({});
  const fetchedRanges = useRef<Set<string>>(new Set());

  const today = startOfDay(new Date());
  const ITEM_COUNT = 2000;
  const INITIAL_INDEX = ITEM_COUNT / 2;

  const insets = useSafeAreaInsets();
  const carouselRef = useRef<ICarouselInstance>(null);

  // Calculate carousel height to fit within safe areas
  const CAROUSEL_HEIGHT = height - insets.top - insets.bottom - 100;

  // 2. Optimized Fetcher: Loads a range of dates around the center
  const loadDateRange = async (centerDate: Date) => {
    const range = 10; // Days to buffer in each direction
    const startDate = format(addDays(centerDate, -range), 'yyyy-MM-dd');
    const endDate = format(addDays(centerDate, range), 'yyyy-MM-dd');
    const rangeKey = `${startDate}_${endDate}`;

    if (fetchedRanges.current.has(rangeKey)) return;

    try {
      // Fetch only the IDs/Dates first to see what exists
      const results: any[] = await db.getAllAsync(
        'SELECT * FROM workouts WHERE date BETWEEN ? AND ?',
        [startDate, endDate]
      );

      const detailedWorkouts: Record<string, any> = {};
      console.log(results);
      for (const row of results) {
        // Fetch nested blocks and events for each found workout
        detailedWorkouts[row.date] = await WorkoutDAL.getWorkoutByDate(row.date);
      }
      console.log(detailedWorkouts);

      setWorkoutMap((prev) => ({ ...prev, ...detailedWorkouts }));
      fetchedRanges.current.add(rangeKey);
    } catch (error) {
      console.error('Failed to fetch workout range:', error);
    }
  };

  const handleGoToToday = () => {
    carouselRef.current?.scrollTo({
      index: INITIAL_INDEX,
      animated: true,
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'black', paddingTop: insets.top }}>
      {/* Header Buttons */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-evenly',
          paddingVertical: 10,
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
        windowSize={11} // Keeps 5 cards on each side in memory
        mode="parallax"
        modeConfig={{
          parallaxScrollingScale: 0.94, // Large center card
          parallaxScrollingOffset: 40, // Visible "peek" for next/prev days
        }}
        onSnapToItem={(index) => {
          const newCenterDate = addDays(today, index - INITIAL_INDEX);
          loadDateRange(newCenterDate);
        }}
        renderItem={({ index }) => {
          const dateForCard = addDays(today, index - INITIAL_INDEX);
          const dateString = format(dateForCard, 'yyyy-MM-dd');

          // O(1) Lookup instead of .find()
          const dailyWorkout = workoutMap[dateString];

          return (
            <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 10 }}>
              <Card
                style={{
                  backgroundColor: '#121212',
                  height: '100%',
                  width: '100%',
                  borderColor: '#262626',
                  borderWidth: 1,
                  borderRadius: 24,
                  overflow: 'hidden',
                }}>
                <CardHeader>
                  <CardTitle style={{ color: 'white', fontSize: 22 }}>
                    {format(dateForCard, 'EEEE')}{' '}
                    {index === INITIAL_INDEX
                      ? '(Today)'
                      : index === INITIAL_INDEX + 1
                        ? '(Tomorrow)'
                        : index === INITIAL_INDEX - 1
                          ? '(Yesterday)'
                          : ''}
                  </CardTitle>
                  <CardDescription style={{ color: '#a3a3a3' }}>
                    {format(dateForCard, 'MMM do, yyyy')}
                  </CardDescription>
                  {dailyWorkout?.notes && (
                    <Text style={{ color: '#737373', marginTop: 4, fontStyle: 'italic' }}>
                      "{dailyWorkout.notes}"
                    </Text>
                  )}
                </CardHeader>

                <ScrollView className="flex-1 px-4">
                  {dailyWorkout ? (
                    dailyWorkout.blocks.map((block: any) => (
                      <View key={block.id}>
                        <Text
                          style={{
                            color: '#60a5fa',
                            fontWeight: '700',
                            fontSize: 16,
                            marginBottom: 8,
                          }}>
                          {block.name}
                        </Text>
                        {block.events
                          .filter((e: any) => e.type === 'set')
                          .map((set: any, idx: number) => (
                            <View
                              key={idx}
                              style={{
                                flexDirection: 'row',
                                marginBottom: 4,
                                alignItems: 'center',
                              }}>
                              <View
                                style={{
                                  width: 70,
                                  height: 24,
                                  borderRadius: 12,
                                  backgroundColor: '#262626',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  marginRight: 8,
                                }}>
                                <Text style={{ color: 'white', fontSize: 12 }}>{set.dateTime}</Text>
                              </View>
                              <Text style={{ color: '#e5e5e5', fontSize: 15 }}>
                                {set.weightKg}kg × {set.reps}
                                <Text style={{ color: '#737373', fontSize: 13 }}>
                                  {' '}
                                  ({set.rep_type})
                                </Text>
                              </Text>
                            </View>
                          ))}
                      </View>
                    ))
                  ) : (
                    <View
                      style={{
                        flex: 1,
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
                    alignItems: 'center',
                    alignContent: 'center',
                  }}>
                  <AddExercise onAdd={() => {}} />
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
