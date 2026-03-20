import { Tabs } from 'expo-router';
import { Image } from 'react-native';
import { Settings, Dumbbell, NotebookPen, NotebookTabs } from 'lucide-react-native';

export default function TablLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#000',
        tabBarInactiveTintColor: '#888',
        tabBarStyle: { backgroundColor: '#fff', borderTopWidth: 0 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tracker',
          tabBarIcon: ({ color }) => <NotebookPen size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="workout_builder"
        options={{
          tabBarLabel: 'Routines',
          tabBarIcon: ({ color }) => <NotebookTabs size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="exercises"
        options={{
          tabBarLabel: 'Exercises',
          tabBarIcon: ({ color }) => <Dumbbell size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color }) => <Settings size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
