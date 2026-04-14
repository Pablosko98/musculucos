import { Tabs } from 'expo-router';
import { Image } from 'react-native';
import { Settings, Dumbbell, NotebookPen, NotebookTabs, TrendingUp } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

export default function TablLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#000',
        tabBarInactiveTintColor: '#888',
        tabBarStyle: { backgroundColor: '#fff', borderTopWidth: 0 },
      }}>
      <Tabs.Screen
        name="(home)"
        options={{
          title: t('tabs.tracker'),
          tabBarIcon: ({ color }) => <NotebookPen size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="workout_builder"
        options={{
          tabBarLabel: t('tabs.routines'),
          tabBarIcon: ({ color }) => <NotebookTabs size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="exercises"
        options={{
          tabBarLabel: t('tabs.exercises'),
          tabBarIcon: ({ color }) => <Dumbbell size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          tabBarLabel: t('tabs.analytics'),
          tabBarIcon: ({ color }) => <TrendingUp size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarLabel: t('tabs.settings'),
          tabBarIcon: ({ color }) => <Settings size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
