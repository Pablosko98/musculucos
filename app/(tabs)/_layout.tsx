import { Tabs } from 'expo-router';
import { Image } from 'react-native';

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
          tabBarIcon: ({ color, focused }) => (
            <Image
              source={require('../../assets/images/notepad.png')}
              style={{
                width: 24,
                height: 24,
                tintColor: color, // This applies the active/inactive color to the image
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="workout_builder"
        options={{
          tabBarLabel: 'Routines',
          tabBarIcon: ({ color, focused }) => (
            <Image
              source={require('../../assets/images/book.png')}
              style={{
                width: 24,
                height: 24,
                tintColor: color, // This applies the active/inactive color to the image
              }}
            />
          ),
        }}
      />
    </Tabs>
  );
}
