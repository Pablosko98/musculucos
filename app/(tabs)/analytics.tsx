import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text } from '@/components/ui/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { ExerciseDAL, PrefsDAL } from '@/lib/db';
import type { Exercise } from '@/lib/exercises';
import {
  PERIODS,
  MUSCLE_HEAD_DEFS,
  KEY_CANON,
  getStartDate,
  type Period,
  type Metric,
  type MuscleHead,
} from '@/components/analytics/analyticsUtils';
import { ExercisesTab, buildGroups } from '@/components/analytics/ExercisesTab';
import { MusclesTab } from '@/components/analytics/MusclesTab';

export default function Analytics() {
  const insets = useSafeAreaInsets();

  // Tab — default to muscles
  const [tab, setTab] = useState<'muscles' | 'exercises'>('muscles');

  // Exercises tab
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exLoading, setExLoading] = useState(true);

  // Muscles tab
  const [period, setPeriod] = useState<Period>(PERIODS[0]);
  const [metric, setMetric] = useState<Metric>('frequency');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [muscleHeads, setMuscleHeads] = useState<MuscleHead[]>([]);
  const [muscleLoading, setMuscleLoading] = useState(false);
  const muscleInitialized = useRef(false);

  useEffect(() => {
    PrefsDAL.get('bodyGender').then((v) => {
      if (v === 'male' || v === 'female') setGender(v);
    });
  }, []);

  // ── Data loading ──

  const loadExercises = useCallback(async () => {
    const exs = await ExerciseDAL.getAll();
    setExercises(exs);
    setExLoading(false);
  }, []);

  const loadMuscleStats = useCallback(async () => {
    if (!muscleInitialized.current) setMuscleLoading(true);
    try {
      const startDate = period.days !== null ? getStartDate(period.days) : null;
      const [rows, allExercises] = await Promise.all([
        ExerciseDAL.getMuscleStats(startDate),
        ExerciseDAL.getAll(),
      ]);

      const exMap = new Map(allExercises.map((e) => [e.id, e]));
      const headSets: Record<string, number> = {};
      const headVolume: Record<string, number> = {};
      const headLastDate: Record<string, string> = {};

      for (const { exerciseId, date, volume, sets } of rows) {
        const ex = exMap.get(exerciseId);
        if (!ex) continue;
        for (const me of ex.muscleEmphasis.filter((m) => m.role === 'primary')) {
          const raw = me.head ? `${me.muscle}/${me.head}` : me.muscle;
          const key = KEY_CANON[raw] ?? raw;
          headSets[key] = (headSets[key] ?? 0) + sets;
          headVolume[key] = (headVolume[key] ?? 0) + volume;
          if (!headLastDate[key] || date > headLastDate[key]) headLastDate[key] = date;
        }
      }

      const computed: MuscleHead[] = MUSCLE_HEAD_DEFS.filter(
        (def) => (headSets[def.key] ?? 0) > 0
      ).map((def) => ({
        ...def,
        frequency: headSets[def.key] ?? 0,
        volume: headVolume[def.key] ?? 0,
        lastDate: headLastDate[def.key] ?? null,
      }));

      setMuscleHeads(computed);
      muscleInitialized.current = true;
    } finally {
      setMuscleLoading(false);
    }
  }, [period]);

  useFocusEffect(
    useCallback(() => {
      loadExercises();
      if (tab === 'muscles') loadMuscleStats();
      PrefsDAL.get('bodyGender').then((v) => {
        if (v === 'male' || v === 'female') setGender(v);
      });
    }, [tab])
  );

  useEffect(() => {
    if (tab === 'muscles') loadMuscleStats();
  }, [tab, period]);

  // ── Derived data ──

  const allGroups = useMemo(() => buildGroups(exercises), [exercises]);

  const handleSelectVariant = (v: Exercise) => {
    router.push({
      pathname: '/exercise_history',
      params: { exerciseId: v.id, exerciseName: v.name },
    });
  };

  // ── Render ──

  return (
    <View style={{ flex: 1, backgroundColor: '#09090b', paddingTop: insets.top }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: '#fafafa', letterSpacing: -0.5 }}>
          Analytics
        </Text>
      </View>

      {/* Tab bar */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 }}>
        {(['muscles', 'exercises'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={{
              flex: 1,
              paddingVertical: 9,
              borderRadius: 11,
              alignItems: 'center',
              backgroundColor: tab === t ? '#27272a' : 'transparent',
              borderWidth: 1,
              borderColor: tab === t ? '#3f3f46' : 'transparent',
            }}>
            <Text
              style={{ color: tab === t ? '#fafafa' : '#52525b', fontSize: 14, fontWeight: '600' }}>
              {t === 'muscles' ? 'Muscles' : 'Exercises'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Muscles tab ── */}
      {tab === 'muscles' && (
        <MusclesTab
          period={period}
          setPeriod={setPeriod}
          metric={metric}
          setMetric={setMetric}
          gender={gender}
          muscleHeads={muscleHeads}
          loading={muscleLoading}
          bottomInset={insets.bottom}
        />
      )}

      {/* ── Exercises tab ── */}
      {tab === 'exercises' && (
        <ExercisesTab
          groups={allGroups}
          loading={exLoading}
          bottomInset={insets.bottom}
          onSelectVariant={handleSelectVariant}
        />
      )}
    </View>
  );
}
