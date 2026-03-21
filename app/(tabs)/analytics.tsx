import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import Body, { type Slug } from 'react-native-body-highlighter';
import { Text } from '@/components/ui/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { Search, X } from 'lucide-react-native';
import { ExerciseDAL, PrefsDAL } from '@/lib/db';
import type { Exercise } from '@/lib/exercises';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Constants ────────────────────────────────────────────────────────────────

const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  cable: 'Cable',
  machine: 'Machine',
  bodyweight: 'Bodyweight',
  ez_bar: 'EZ Bar',
};
const EQUIPMENT_COLORS: Record<string, { bg: string; text: string }> = {
  barbell: { bg: '#1c2e4a', text: '#60a5fa' },
  dumbbell: { bg: '#162d22', text: '#4ade80' },
  cable: { bg: '#2a1a3e', text: '#c084fc' },
  machine: { bg: '#2e1f0a', text: '#fb923c' },
  bodyweight: { bg: '#0f2e2e', text: '#2dd4bf' },
  ez_bar: { bg: '#2e1021', text: '#f472b6' },
};

// Per-group colors (used for the list dots + bars)
const MUSCLE_COLORS: Record<string, string> = {
  chest: '#ef4444',
  back: '#3b82f6',
  shoulders: '#a855f7',
  biceps: '#22c55e',
  triceps: '#f59e0b',
  legs: '#f97316',
  abs: '#06b6d4',
};

// Canonical aliases — some exercises use alternate head names
const KEY_CANON: Record<string, string> = {
  'chest/upper_chest': 'chest/upper',
  'chest/lower_chest': 'chest/lower',
};

type MuscleHeadDef = {
  key: string;      // canonical 'muscle/head' key (or just 'muscle' for catch-alls)
  muscle: string;   // top-level group → drives MUSCLE_COLORS
  label: string;    // display label in list
  bodySlug: string; // slug for react-native-body-highlighter
};

// Ordered by group then specificity. Only entries with data > 0 are rendered.
const MUSCLE_HEAD_DEFS: MuscleHeadDef[] = [
  // Chest
  { key: 'chest/upper',        muscle: 'chest',     label: 'Upper Chest',   bodySlug: 'chest' },
  { key: 'chest/middle',       muscle: 'chest',     label: 'Mid Chest',     bodySlug: 'chest' },
  { key: 'chest/lower',        muscle: 'chest',     label: 'Lower Chest',   bodySlug: 'chest' },
  { key: 'chest',              muscle: 'chest',     label: 'Chest',         bodySlug: 'chest' },
  // Back
  { key: 'back/lats',          muscle: 'back',      label: 'Lats',          bodySlug: 'upper-back' },
  { key: 'back/upper',         muscle: 'back',      label: 'Upper Back',    bodySlug: 'upper-back' },
  { key: 'back/rhomboids',     muscle: 'back',      label: 'Rhomboids',     bodySlug: 'upper-back' },
  { key: 'back/traps',         muscle: 'back',      label: 'Traps',         bodySlug: 'trapezius' },
  { key: 'back/lower',         muscle: 'back',      label: 'Lower Back',    bodySlug: 'lower-back' },
  { key: 'back',               muscle: 'back',      label: 'Back',          bodySlug: 'upper-back' },
  // Shoulders
  { key: 'shoulders/front',    muscle: 'shoulders', label: 'Front Delt',    bodySlug: 'deltoids' },
  { key: 'shoulders/side',     muscle: 'shoulders', label: 'Side Delt',     bodySlug: 'deltoids' },
  { key: 'shoulders/rear',     muscle: 'shoulders', label: 'Rear Delt',     bodySlug: 'deltoids' },
  { key: 'shoulders',          muscle: 'shoulders', label: 'Shoulders',     bodySlug: 'deltoids' },
  // Biceps
  { key: 'biceps/long_head',   muscle: 'biceps',    label: 'Long Head',     bodySlug: 'biceps' },
  { key: 'biceps/short_head',  muscle: 'biceps',    label: 'Short Head',    bodySlug: 'biceps' },
  { key: 'biceps/brachialis',  muscle: 'biceps',    label: 'Brachialis',    bodySlug: 'biceps' },
  { key: 'biceps',             muscle: 'biceps',    label: 'Biceps',        bodySlug: 'biceps' },
  // Triceps
  { key: 'triceps/long_head',  muscle: 'triceps',   label: 'Long Head',     bodySlug: 'triceps' },
  { key: 'triceps/lateral',    muscle: 'triceps',   label: 'Lateral Head',  bodySlug: 'triceps' },
  { key: 'triceps/medial',     muscle: 'triceps',   label: 'Medial Head',   bodySlug: 'triceps' },
  { key: 'triceps',            muscle: 'triceps',   label: 'Triceps',       bodySlug: 'triceps' },
  // Legs
  { key: 'legs/quads',         muscle: 'legs',      label: 'Quads',         bodySlug: 'quadriceps' },
  { key: 'legs/hamstrings',    muscle: 'legs',      label: 'Hamstrings',    bodySlug: 'hamstring' },
  { key: 'legs/glutes',        muscle: 'legs',      label: 'Glutes',        bodySlug: 'gluteal' },
  { key: 'legs/calves',        muscle: 'legs',      label: 'Calves',        bodySlug: 'calves' },
  { key: 'legs/adductors',     muscle: 'legs',      label: 'Adductors',     bodySlug: 'adductors' },
  { key: 'legs/hip_flexors',   muscle: 'legs',      label: 'Hip Flexors',   bodySlug: 'quadriceps' },
  { key: 'legs',               muscle: 'legs',      label: 'Legs',          bodySlug: 'quadriceps' },
  // Abs
  { key: 'abs',                muscle: 'abs',       label: 'Abs',           bodySlug: 'abs' },
  { key: 'abs/obliques',       muscle: 'abs',       label: 'Obliques',      bodySlug: 'obliques' },
];

const HEAD_DEF_MAP = new Map(MUSCLE_HEAD_DEFS.map((d) => [d.key, d]));

const PERIODS = [
  { label: '1d', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: 'All', days: null },
] as const;

type Period = (typeof PERIODS)[number];
type Metric = 'frequency' | 'volume';
type MuscleHead = MuscleHeadDef & {
  frequency: number;
  volume: number;
  lastDate: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function fmtEquipment(eq: string): string {
  return EQUIPMENT_LABELS[eq] ?? fmt(eq);
}
function variantLabel(ex: Exercise): string {
  if (ex.equipmentVariant) {
    return `${fmt(ex.equipmentVariant)} ${fmtEquipment(ex.equipment)}`.trim();
  }
  const suffix = ex.id.startsWith(`${ex.baseId}_`) ? ex.id.slice(ex.baseId.length + 1) : '';
  if (suffix) {
    return suffix
      .replace('ez_bar', 'EZ Bar')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return fmtEquipment(ex.equipment);
}

function getStartDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

function relativeDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diffDays = Math.floor(
    (Date.now() - new Date(dateStr + 'T00:00:00').getTime()) / 86_400_000
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function fmtVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M kg`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k kg`;
  return `${Math.round(v)} kg`;
}

function heatColor(intensity: number): string {
  if (intensity <= 0) return '#27272a';
  if (intensity < 0.15) return '#431407';
  if (intensity < 0.35) return '#7c2d12';
  if (intensity < 0.6) return '#c2410c';
  if (intensity < 0.82) return '#ea580c';
  return '#f97316';
}

// ─── Exercise list components ─────────────────────────────────────────────────

type ExerciseGroup = { baseId: string; name: string; variants: Exercise[] };

function buildGroups(exs: Exercise[]): ExerciseGroup[] {
  const map = new Map<string, Exercise[]>();
  for (const ex of exs) {
    if (!map.has(ex.baseId)) map.set(ex.baseId, []);
    map.get(ex.baseId)!.push(ex);
  }
  return Array.from(map.entries()).map(([baseId, variants]) => ({
    baseId,
    name: variants[0].name,
    variants,
  }));
}

function GroupCard({
  group,
  onSelectVariant,
}: {
  group: ExerciseGroup;
  onSelectVariant: (v: Exercise) => void;
}) {
  return (
    <View
      style={{
        backgroundColor: '#18181b',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#27272a',
        marginBottom: 8,
        overflow: 'hidden',
      }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }}>
        <Text style={{ color: '#fafafa', fontSize: 16, fontWeight: '600' }}>{group.name}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
          {group.variants.map((v) => {
            const colors = EQUIPMENT_COLORS[v.equipment] ?? { bg: '#27272a', text: '#a1a1aa' };
            return (
              <TouchableOpacity
                key={v.id}
                onPress={() => onSelectVariant(v)}
                activeOpacity={0.7}
                style={{
                  backgroundColor: colors.bg,
                  borderRadius: 8,
                  paddingHorizontal: 11,
                  paddingVertical: 5,
                }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '500' }}>
                  {variantLabel(v)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ─── Body figure ──────────────────────────────────────────────────────────────

// Library renders at width=200*scale, height=400*scale
const BODY_SCALE = (SCREEN_W - 56) / 2 / 200;

// Map body slugs → heat colors, per view
function buildBodyData(slugIntensity: Record<string, number>, side: 'front' | 'back') {
  const f = (slug: Slug) => heatColor(slugIntensity[slug] ?? 0);
  const s = (slug: Slug) => ({ slug, styles: { fill: f(slug) } });
  const shared = [s('deltoids')];

  if (side === 'front') {
    return [
      ...shared,
      s('chest'), s('biceps'), s('abs'), s('obliques'),
      s('quadriceps'), s('calves'), s('adductors'),
    ];
  }
  return [
    ...shared,
    s('upper-back'), s('lower-back'), s('trapezius'),
    s('triceps'), s('hamstring'), s('gluteal'), s('calves'), s('adductors'),
  ];
}

function BodyFigure({
  view,
  slugIntensity,
  gender,
}: {
  view: 'front' | 'back';
  slugIntensity: Record<string, number>;
  gender: 'male' | 'female';
}) {
  return (
    <Body
      data={buildBodyData(slugIntensity, view)}
      side={view}
      gender={gender}
      scale={BODY_SCALE}
      defaultFill="#27272a"
      border="#3f3f46"
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Analytics() {
  const insets = useSafeAreaInsets();

  // Tab
  const [tab, setTab] = useState<'exercises' | 'muscles'>('exercises');

  // Exercises tab
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [search, setSearch] = useState('');
  const [exLoading, setExLoading] = useState(true);

  // Muscles tab
  const [period, setPeriod] = useState<Period>(PERIODS[1]);
  const [metric, setMetric] = useState<Metric>('frequency');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [muscleHeads, setMuscleHeads] = useState<MuscleHead[]>([]);

  useEffect(() => {
    PrefsDAL.get('bodyGender').then((v) => {
      if (v === 'male' || v === 'female') setGender(v);
    });
  }, []);
  const [muscleLoading, setMuscleLoading] = useState(false);
  const muscleInitialized = useRef(false);

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
      const headDates: Record<string, Set<string>> = {};
      const headVolume: Record<string, number> = {};
      const headLastDate: Record<string, string> = {};

      for (const { exerciseId, date, volume } of rows) {
        const ex = exMap.get(exerciseId);
        if (!ex) continue;
        for (const me of ex.muscleEmphasis.filter((m) => m.role === 'primary')) {
          const raw = me.head ? `${me.muscle}/${me.head}` : me.muscle;
          const key = KEY_CANON[raw] ?? raw;
          if (!headDates[key]) headDates[key] = new Set();
          headDates[key].add(date);
          headVolume[key] = (headVolume[key] ?? 0) + volume;
          if (!headLastDate[key] || date > headLastDate[key]) headLastDate[key] = date;
        }
      }

      // Only show heads that have data; preserve MUSCLE_HEAD_DEFS order
      const computed: MuscleHead[] = MUSCLE_HEAD_DEFS.filter(
        (def) => (headDates[def.key]?.size ?? 0) > 0
      ).map((def) => ({
        ...def,
        frequency: headDates[def.key]?.size ?? 0,
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

  // Load muscles when switching to tab or changing period
  useEffect(() => {
    if (tab === 'muscles') loadMuscleStats();
  }, [tab, period]);

  // ── Derived data ──

  const allGroups = useMemo(() => buildGroups(exercises), [exercises]);
  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? allGroups.filter((g) => g.name.toLowerCase().includes(q)) : allGroups;
  }, [allGroups, search]);

  const sortedMuscles = useMemo(
    () =>
      [...muscleHeads].sort((a, b) =>
        metric === 'frequency' ? b.frequency - a.frequency : b.volume - a.volume
      ),
    [muscleHeads, metric]
  );
  const maxValue = useMemo(
    () =>
      Math.max(...sortedMuscles.map((m) => (metric === 'frequency' ? m.frequency : m.volume)), 1),
    [sortedMuscles, metric]
  );
  // Per body-slug intensity for the diagram: max of all heads mapped to that slug
  const slugIntensity = useMemo(() => {
    const slugMax: Record<string, number> = {};
    for (const m of muscleHeads) {
      const val = metric === 'frequency' ? m.frequency : m.volume;
      slugMax[m.bodySlug] = Math.max(slugMax[m.bodySlug] ?? 0, val);
    }
    const globalMax = Math.max(...Object.values(slugMax), 1);
    const result: Record<string, number> = {};
    for (const [slug, val] of Object.entries(slugMax)) result[slug] = val / globalMax;
    return result;
  }, [muscleHeads, metric]);

  // ── Handlers ──

  const handleSelectVariant = (v: Exercise) => {
    router.push({
      pathname: '/exercise_history',
      params: { exerciseId: v.id, exerciseName: v.name, baseId: v.baseId },
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
        {(['exercises', 'muscles'] as const).map((t) => (
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
              {t === 'exercises' ? 'Exercises' : 'Muscles'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Exercises tab ── */}
      {tab === 'exercises' && (
        <>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginHorizontal: 16,
              marginBottom: 12,
              backgroundColor: '#18181b',
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderWidth: 1,
              borderColor: '#27272a',
            }}>
            <Search size={17} color="#71717a" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search exercises…"
              placeholderTextColor="#52525b"
              style={{ flex: 1, color: '#fafafa', fontSize: 15, marginLeft: 8 }}
            />
            {search.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearch('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={16} color="#71717a" />
              </TouchableOpacity>
            )}
          </View>
          <FlatList
            data={filteredGroups}
            keyExtractor={(item) => item.baseId}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 16 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <GroupCard group={item} onSelectVariant={handleSelectVariant} />
            )}
            ListHeaderComponent={
              <Text style={{ color: '#52525b', fontSize: 13, marginBottom: 10 }}>
                {exLoading
                  ? 'Loading…'
                  : `${filteredGroups.length} exercise${filteredGroups.length !== 1 ? 's' : ''} — tap a variant to view history`}
              </Text>
            }
            ListEmptyComponent={
              exLoading ? null : (
                <View style={{ paddingTop: 60, alignItems: 'center' }}>
                  <Text style={{ color: '#3f3f46', fontSize: 15 }}>No exercises found</Text>
                </View>
              )
            }
          />
        </>
      )}

      {/* ── Muscles tab ── */}
      {tab === 'muscles' && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>
          {/* Period selector */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            {PERIODS.map((p) => (
              <TouchableOpacity
                key={p.label}
                onPress={() => setPeriod(p)}
                style={{
                  flex: 1,
                  paddingVertical: 7,
                  borderRadius: 9,
                  alignItems: 'center',
                  backgroundColor: period.label === p.label ? '#ea580c' : '#18181b',
                  borderWidth: 1,
                  borderColor: period.label === p.label ? '#ea580c' : '#27272a',
                }}>
                <Text
                  style={{
                    color: period.label === p.label ? '#fff' : '#71717a',
                    fontSize: 13,
                    fontWeight: '700',
                  }}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Metric toggle */}
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: '#18181b',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#27272a',
              padding: 3,
              marginBottom: 20,
            }}>
            {(['frequency', 'volume'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setMetric(m)}
                style={{
                  flex: 1,
                  paddingVertical: 7,
                  borderRadius: 8,
                  alignItems: 'center',
                  backgroundColor: metric === m ? '#27272a' : 'transparent',
                }}>
                <Text
                  style={{
                    color: metric === m ? '#fafafa' : '#52525b',
                    fontSize: 13,
                    fontWeight: '600',
                  }}>
                  {m === 'frequency' ? 'Frequency' : 'Volume'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {muscleLoading ? (
            <View style={{ paddingTop: 60, alignItems: 'center' }}>
              <ActivityIndicator color="#ea580c" />
            </View>
          ) : (
            <>
              {/* Body figures */}
              <View
                style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 }}>
                {(['front', 'back'] as const).map((view) => (
                  <View key={view} style={{ alignItems: 'center', gap: 8 }}>
                    <BodyFigure view={view} slugIntensity={slugIntensity} gender={gender} />
                    <Text
                      style={{
                        color: '#3f3f46',
                        fontSize: 11,
                        fontWeight: '800',
                        textTransform: 'uppercase',
                        letterSpacing: 1.2,
                      }}>
                      {view}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Heat scale legend */}
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 }}>
                <Text style={{ color: '#3f3f46', fontSize: 11 }}>Less</Text>
                {['#431407', '#7c2d12', '#c2410c', '#ea580c', '#f97316'].map((col) => (
                  <View
                    key={col}
                    style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: col }}
                  />
                ))}
                <Text style={{ color: '#3f3f46', fontSize: 11 }}>More</Text>
              </View>

              {/* Muscle head list */}
              <View style={{ gap: 12 }}>
                {sortedMuscles.map((m) => {
                  const val = metric === 'frequency' ? m.frequency : m.volume;
                  const pct = maxValue > 0 ? val / maxValue : 0;
                  const color = MUSCLE_COLORS[m.muscle] ?? '#52525b';
                  return (
                    <View key={m.key}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 5,
                        }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 4,
                              backgroundColor: color,
                            }}
                          />
                          <Text style={{ color: '#fafafa', fontSize: 14, fontWeight: '600' }}>
                            {m.label}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <Text style={{ color: '#52525b', fontSize: 12 }}>
                            {relativeDate(m.lastDate)}
                          </Text>
                          <Text
                            style={{
                              color: '#a1a1aa',
                              fontSize: 13,
                              fontWeight: '700',
                              minWidth: 52,
                              textAlign: 'right',
                            }}>
                            {metric === 'frequency' ? `${m.frequency}×` : fmtVolume(m.volume)}
                          </Text>
                        </View>
                      </View>
                      <View
                        style={{
                          height: 4,
                          backgroundColor: '#27272a',
                          borderRadius: 2,
                          overflow: 'hidden',
                        }}>
                        <View
                          style={{
                            height: '100%',
                            width: `${pct * 100}%`,
                            backgroundColor: color,
                            borderRadius: 2,
                          }}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>

              {sortedMuscles.length === 0 && (
                <View style={{ paddingTop: 20, alignItems: 'center' }}>
                  <Text style={{ color: '#3f3f46', fontSize: 15 }}>No workouts in this period</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
