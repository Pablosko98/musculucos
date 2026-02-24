import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dimensions, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import Carousel from 'react-native-reanimated-carousel';
import { useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ScrollView } from 'react-native-gesture-handler';
import { workouts } from '@/lib/workouts';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { exercises } from '@/lib/exercises';
import AddExercise from '../add_exercise';
import AddRoutine from '../add_routine';
import { Input } from '@/components/ui/input';

const { width, height } = Dimensions.get('window');

export default function WorkoutTracker() {
  const [workoutData, setWorkoutData] = useState(workouts);
  return (
    <View style={{ flex: 1, backgroundColor: 'black' }}>
      <Carousel
        loop={true}
        // Set width slightly smaller than screen to see side cards
        width={width}
        height={height}
        autoPlay={false}
        data={[...new Array(14).keys()]}
        mode="parallax"
        modeConfig={{
          // How much the side cards shrink (0.9 = 90% of size)
          parallaxScrollingScale: 0.9,
          // How much of the side cards are visible
          parallaxScrollingOffset: 50,
          // Controls how far side cards are pushed away
          parallaxAdjacentItemScale: 0.8,
        }}
        onSnapToItem={(index) => console.log(index)}
        renderItem={({ index }) => (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Card
              style={{
                backgroundColor: '#121212',
                // Use a percentage of the slide container, not the screen width
                height: height * 0.95,
                width: '100%',
                borderColor: '#333',
                borderWidth: 1,
              }}>
              <CardHeader>
                <CardTitle style={{ color: 'white' }}>Day {index + 1}</CardTitle>
                <CardDescription style={{ color: 'gray' }}>
                  {index % 7 === 0 ? 'Rest Day' : 'Workout Day'}
                </CardDescription>
              </CardHeader>

              <View className="flex-1 items-center justify-center p-4">
                <View className="w-full flex-1 p-2">
                  <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
                    <Accordion type="multiple" className="w-full">
                      {workoutData[0].blocks.map((block) => (
                        <AccordionItem
                          key={block.id}
                          value={block.id}
                          className="mb-3 rounded-xl border border-neutral-800 bg-neutral-900/50">
                          <AccordionTrigger className="px-4 py-3">
                            <View className="w-[90%] flex-row items-center justify-between">
                              <View>
                                <Text className="text-lg font-bold text-white">{block.name}</Text>
                                <Text className="text-sm text-muted-foreground">
                                  {block.sets} sets |{' '}
                                  {block.events.reduce((total, event) => {
                                    if (event.type === 'set') {
                                      return total + (event?.weightKg || 0) * (event?.reps || 0);
                                    }
                                    return total;
                                  }, 0)}{' '}
                                  kg
                                </Text>
                              </View>
                            </View>
                          </AccordionTrigger>

                          <AccordionContent className="px-4 pb-4">
                            <View className="border-t border-neutral-800 pt-2">
                              {block.events.map((event, eventIdx) => {
                                if (event.type === 'rest') {
                                  return (
                                    <View
                                      key={eventIdx}
                                      className="my-3 flex-row items-center justify-center">
                                      <View className="h-[1px] flex-1 bg-neutral-800" />
                                      <Text className="mx-4 text-xs font-bold uppercase tracking-tighter text-orange-500">
                                        ⏱ {event.durationSeconds}s Rest
                                      </Text>
                                      <View className="h-[1px] flex-1 bg-neutral-800" />
                                    </View>
                                  );
                                }

                                // Logic for Exercise/Set events
                                const isPartial = event.rep_type !== 'full';
                                return (
                                  <View
                                    key={eventIdx}
                                    className={`flex-row items-center px-2 py-2 ${
                                      isPartial ? 'border-l-2 border-orange-500/50' : ''
                                    }`}>
                                    {/* <Text style={{ width: 60 }}>{event?.dateTime}</Text> */}
                                    {/* Column 1: Exercise Label (Fixed Width) */}
                                    <View style={{ width: 80, marginRight: 15 }}>
                                      {!isPartial && (
                                        <Text
                                          numberOfLines={2} // Allows the text to break into a second line
                                          ellipsizeMode="tail" // Adds '...' if it exceeds 2 lines
                                          className="text-[10px] font-bold uppercase text-zinc-500"
                                          style={{
                                            lineHeight: 12, // Provides enough vertical space for two lines
                                          }}>
                                          {event?.exerciseId?.replace(/_/g, ' ')}
                                        </Text>
                                      )}
                                    </View>
                                    {/* Column 2: Weight (Fixed Width & Right Aligned) */}
                                    <View style={{ flexDirection: 'row' }}>
                                      <Input
                                        style={{ width: 60 }}
                                        className="text-base font-bold text-white"
                                        keyboardType="numeric"
                                        maxLength={4}
                                        textAlign="center"
                                        selectTextOnFocus>
                                        {event.weightKg}
                                      </Input>
                                      <Text
                                        className="ml-0.5 text-[10px] text-zinc-500"
                                        style={{
                                          textAlignVertical: 'center',
                                          marginLeft: 5,
                                          marginRight: 10,
                                        }}>
                                        kg
                                      </Text>
                                    </View>

                                    {/* Column 3: Multiplication Sign (Visual separator) */}
                                    <View
                                      style={{ width: 5, marginRight: 5 }}
                                      className="items-center">
                                      <Text className="text-xs text-zinc-600">×</Text>
                                    </View>

                                    {/* Column 4: Reps & Type (Fixed Width) */}
                                    <View style={{ width: 100 }} className="flex-row items-center">
                                      <View
                                        className={`flex-row items-center rounded px-2 py-1 ${isPartial ? 'bg-orange-500/20' : 'bg-blue-500/20'}`}
                                        style={{ width: 120, minHeight: 40 }} // Increased min-height to accommodate two lines
                                      >
                                        {/* The Number */}
                                        <Input
                                          selectTextOnFocus
                                          keyboardType="numeric"
                                          maxLength={2}
                                          style={{
                                            width: 50,
                                            textAlign: 'center',
                                            marginRight: 4,
                                          }}>
                                          {event.reps}
                                        </Input>

                                        {/* The Label (will wrap "Top Half" into two lines) */}
                                        <Text
                                          className={`text-[10px] font-bold leading-3 ${isPartial ? 'text-orange-400' : 'text-blue-400'}`}
                                          style={{
                                            flex: 1, // Takes up remaining space
                                            flexWrap: 'wrap', // Forces text to next line if it hits the edge
                                            textAlign: 'center',
                                          }}>
                                          {isPartial ? event?.rep_type : 'REPS'}
                                        </Text>
                                      </View>
                                    </View>
                                  </View>
                                );
                              })}
                            </View>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </ScrollView>
                </View>
                <AddExercise onAdd={() => {}} />
                <AddRoutine onAdd={() => {}} />
              </View>
            </Card>
          </View>
        )}
      />
    </View>
  );
}
