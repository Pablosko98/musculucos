import React, { useMemo, useState } from 'react';
import { View, TouchableOpacity, Pressable, ScrollView, Dimensions, ActivityIndicator } from 'react-native';
import Body, { type Slug } from 'react-native-body-highlighter';
import { Text } from '@/components/ui/text';
import {
  PERIODS,
  MUSCLE_COLORS,
  MUSCLE_GROUP_LABELS,
  heatColor,
  relativeDate,
  fmtVolume,
  type Period,
  type Metric,
  type MuscleHead,
} from './analyticsUtils';

// ─── Body figure ──────────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');
const BODY_SCALE = (SCREEN_W - 56) / 2 / 200;

function buildBodyData(
  slugIntensity: Record<string, number>,
  side: 'front' | 'back',
  selectedSlug: string | null,
) {
  const f = (slug: Slug) => {
    if (selectedSlug !== null) {
      return slug === selectedSlug ? heatColor(Math.max(slugIntensity[slug] ?? 0, 0.6)) : '#27272a';
    }
    return heatColor(slugIntensity[slug] ?? 0);
  };
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
    s('triceps'), s('forearm'), s('hamstring'), s('gluteal'), s('calves'), s('adductors'),
  ];
}

function BodyFigure({
  view,
  slugIntensity,
  gender,
  selectedSlug,
}: {
  view: 'front' | 'back';
  slugIntensity: Record<string, number>;
  gender: 'male' | 'female';
  selectedSlug: string | null;
}) {
  return (
    <Body
      data={buildBodyData(slugIntensity, view, selectedSlug)}
      side={view}
      gender={gender}
      scale={BODY_SCALE}
      defaultFill="#27272a"
      border="#3f3f46"
    />
  );
}

// ─── MusclesTab ───────────────────────────────────────────────────────────────

export function MusclesTab({
  period,
  setPeriod,
  metric,
  setMetric,
  gender,
  muscleHeads,
  loading,
  bottomInset,
}: {
  period: Period;
  setPeriod: (p: Period) => void;
  metric: Metric;
  setMetric: (m: Metric) => void;
  gender: 'male' | 'female';
  muscleHeads: MuscleHead[];
  loading: boolean;
  bottomInset: number;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selectedSlug = useMemo(() => {
    if (!selectedKey) return null;
    return muscleHeads.find((m) => m.key === selectedKey)?.bodySlug ?? null;
  }, [selectedKey, muscleHeads]);

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

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomInset + 24 }}>
      {/* Period selector */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p.label}
            onPress={() => { setPeriod(p); setSelectedKey(null); }}
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
            onPress={() => { setMetric(m); setSelectedKey(null); }}
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
              {m === 'frequency' ? 'Sets' : 'Volume'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
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
                <BodyFigure view={view} slugIntensity={slugIntensity} gender={gender} selectedSlug={selectedSlug} />
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
          <View style={{ gap: 8 }}>
            {sortedMuscles.map((m) => {
              const val = metric === 'frequency' ? m.frequency : m.volume;
              const pct = maxValue > 0 ? val / maxValue : 0;
              const color = MUSCLE_COLORS[m.muscle] ?? '#52525b';
              const isSelected = selectedKey === m.key;
              const groupLabel = MUSCLE_GROUP_LABELS[m.muscle];
              // Only show group label as subtitle when the head label doesn't already represent the group
              const showGroup = groupLabel && m.label !== groupLabel;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => setSelectedKey(isSelected ? null : m.key)}
                  style={{
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: isSelected ? color : '#27272a',
                    backgroundColor: isSelected ? `${color}18` : 'transparent',
                    padding: 10,
                  }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 8,
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
                      <View>
                        <Text style={{ color: '#fafafa', fontSize: 14, fontWeight: '600' }}>
                          {m.label}
                        </Text>
                        {showGroup && (
                          <Text style={{ color: '#52525b', fontSize: 11, fontWeight: '500', marginTop: 1 }}>
                            {groupLabel}
                          </Text>
                        )}
                      </View>
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
                </Pressable>
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
  );
}
