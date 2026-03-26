import type { Exercise } from '@/lib/exercises';

// ─── Constants ────────────────────────────────────────────────────────────────

export const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  cable: 'Cable',
  machine: 'Machine',
  bodyweight: 'Bodyweight',
  ez_bar: 'EZ Bar',
};
export const EQUIPMENT_COLORS: Record<string, { bg: string; text: string }> = {
  barbell: { bg: '#1c2e4a', text: '#60a5fa' },
  dumbbell: { bg: '#162d22', text: '#4ade80' },
  cable: { bg: '#2a1a3e', text: '#c084fc' },
  machine: { bg: '#2e1f0a', text: '#fb923c' },
  bodyweight: { bg: '#0f2e2e', text: '#2dd4bf' },
  ez_bar: { bg: '#2e1021', text: '#f472b6' },
};

export const MUSCLE_COLORS: Record<string, string> = {
  chest: '#ef4444',
  back: '#3b82f6',
  shoulders: '#a855f7',
  biceps: '#22c55e',
  triceps: '#f59e0b',
  legs: '#f97316',
  abs: '#06b6d4',
  forearms: '#ec4899',
};

// Canonical aliases — some exercises use alternate head names
export const KEY_CANON: Record<string, string> = {
  'chest/upper_chest': 'chest/upper',
  'chest/lower_chest': 'chest/lower',
};

export type MuscleHeadDef = {
  key: string;
  muscle: string;
  label: string;
  bodySlug: string;
};

export const MUSCLE_HEAD_DEFS: MuscleHeadDef[] = [
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
  // Forearms
  { key: 'forearms',           muscle: 'forearms',  label: 'Forearms',      bodySlug: 'forearm' },
  { key: 'forearms/brachioradialis', muscle: 'forearms', label: 'Brachioradialis', bodySlug: 'forearm' },
];

export const HEAD_DEF_MAP = new Map(MUSCLE_HEAD_DEFS.map((d) => [d.key, d]));

export const MUSCLE_GROUP_LABELS: Record<string, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  legs: 'Legs',
  abs: 'Abs',
  forearms: 'Forearms',
};

export const PERIODS = [
  { label: '1d', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: 'All', days: null },
] as const;

export type Period = (typeof PERIODS)[number];
export type Metric = 'frequency' | 'volume';
export type MuscleHead = MuscleHeadDef & {
  frequency: number;
  volume: number;
  lastDate: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function fmt(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function fmtEquipment(eq: string): string {
  return EQUIPMENT_LABELS[eq] ?? fmt(eq);
}

export function variantLabel(ex: Exercise): string {
  if (ex.equipmentVariant) {
    return `${fmt(ex.equipmentVariant)} ${fmtEquipment(ex.equipment)}`.trim();
  }
  return fmtEquipment(ex.equipment);
}

export function getStartDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

export function relativeDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diffDays = Math.floor(
    (Date.now() - new Date(dateStr + 'T00:00:00').getTime()) / 86_400_000
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 0) return `In ${Math.abs(diffDays)}d`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

export function fmtVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M kg`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k kg`;
  return `${Math.round(v)} kg`;
}

export function heatColor(intensity: number): string {
  if (intensity <= 0) return '#27272a';
  if (intensity < 0.15) return '#431407';
  if (intensity < 0.35) return '#7c2d12';
  if (intensity < 0.6) return '#c2410c';
  if (intensity < 0.82) return '#ea580c';
  return '#f97316';
}
