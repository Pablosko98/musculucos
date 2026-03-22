import {
  useState,
  useEffect,
  useCallback,
  useRef,
  memo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ExerciseDAL, db } from '@/lib/db';
import { setPendingExerciseAdd, takePendingExerciseCallback } from '@/lib/pending-exercise-add';
import { MUSCLE_GROUP_MAP, HEAD_LABELS } from '@/lib/exercises';
import type { MuscleEmphasis, MuscleRole } from '@/lib/exercises';
import { ChevronLeft, Trash2, Plus, X, Star } from 'lucide-react-native';

// ─── Constants ────────────────────────────────────────────────────────────────

const EQUIPMENT_OPTIONS = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'ez_bar'];
const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  cable: 'Cable',
  machine: 'Machine',
  bodyweight: 'Bodyweight',
  ez_bar: 'EZ Bar',
};

const MUSCLE_OPTIONS = Object.entries(MUSCLE_GROUP_MAP)
  .map(([id, { groupLabel }]) => ({ id, label: groupLabel }))
  .sort((a, b) => a.label.localeCompare(b.label));

// Available heads per top-level muscle group
const MUSCLE_HEADS: Record<string, string[]> = {
  back: ['lats', 'upper', 'lower', 'traps', 'rhomboids'],
  biceps: ['long_head', 'short_head', 'brachialis'],
  chest: ['upper_chest', 'middle', 'lower_chest'],
  legs: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'hip_flexors'],
  shoulders: ['front', 'side', 'rear'],
  triceps: ['long_head', 'lateral', 'medial'],
  abs: ['upper', 'lower', 'obliques'],
};

const ROLES: MuscleRole[] = ['primary', 'secondary', 'stabilizer'];

const ROLE_STYLE: Record<MuscleRole, { bg: string; text: string; label: string }> = {
  primary: { bg: '#1e3a8a', text: '#93c5fd', label: 'Primary' },
  secondary: { bg: '#14532d', text: '#86efac', label: 'Secondary' },
  stabilizer: { bg: '#451a03', text: '#fdba74', label: 'Stabilizer' },
};

const REST_PRESETS = [
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '1m 30s', value: 90 },
  { label: '2m', value: 120 },
  { label: '3m', value: 180 },
  { label: '4m', value: 240 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `ex_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function fmt(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function fmtMuscle(muscle: string): string {
  return MUSCLE_GROUP_MAP[muscle]?.groupLabel ?? fmt(muscle);
}
function fmtHead(head: string): string {
  return HEAD_LABELS[head] ?? fmt(head);
}

function formatEquipmentLabel(eq: string): string {
  return EQUIPMENT_LABELS[eq] ?? eq.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function nextRole(role: MuscleRole): MuscleRole {
  return ROLES[(ROLES.indexOf(role) + 1) % ROLES.length];
}

function generateWeightStack(step: number): string[] {
  const safeStep = Math.max(0.25, step);
  const count = Math.floor(100 / safeStep) + 1;
  return Array.from({ length: count }, (_, i) => String(Math.round(i * safeStep * 100) / 100));
}

// ─── EmphasisBuilder ──────────────────────────────────────────────────────────

type Emphasis = { muscle: string; head?: string; role: MuscleRole };
type OpenPicker = { idx: number; field: 'muscle' | 'head' } | null;

// Exposed via ref so the parent can read draft values before any structural action
type EmphasisRowHandle = { getMuscle: () => string; getHead: () => string };

type EmphasisRowProps = {
  em: Emphasis;
  openField: 'muscle' | 'head' | null;
  onToggle: (field: 'muscle' | 'head') => void;
  onSetMuscle: (muscle: string) => void;
  onCommitMuscle: (muscle: string) => void;
  onSetHead: (head: string | undefined) => void;
  onCycleRole: () => void;
  onRemove: () => void;
};

// Each row owns its custom-text state so typing only re-renders that row
const EmphasisRowBase = forwardRef<EmphasisRowHandle, EmphasisRowProps>(function EmphasisRow(
  { em, openField, onToggle, onSetMuscle, onCommitMuscle, onSetHead, onCycleRole, onRemove },
  ref
) {
  const [customMuscleText, setCustomMuscleText] = useState('');
  const [customHeadText, setCustomHeadText] = useState('');
  // Keep refs in sync with state so useImperativeHandle always returns the latest value
  const muscleTextRef = useRef('');
  const headTextRef = useRef('');

  useImperativeHandle(ref, () => ({
    getMuscle: () => muscleTextRef.current,
    getHead: () => headTextRef.current,
  }));

  // When a picker opens, pre-populate the custom input if the current value is custom
  useEffect(() => {
    if (openField === 'muscle') {
      const isCustom = em.muscle && !MUSCLE_GROUP_MAP[em.muscle];
      const text = isCustom ? fmt(em.muscle) : '';
      setCustomMuscleText(text);
      muscleTextRef.current = text;
      setCustomHeadText('');
      headTextRef.current = '';
    } else if (openField === 'head') {
      const isCustom = em.head && !HEAD_LABELS[em.head];
      const text = isCustom ? fmt(em.head) : '';
      setCustomHeadText(text);
      headTextRef.current = text;
      setCustomMuscleText('');
      muscleTextRef.current = '';
    } else {
      setCustomMuscleText('');
      muscleTextRef.current = '';
      setCustomHeadText('');
      headTextRef.current = '';
    }
  }, [openField]);

  const heads = em.muscle ? (MUSCLE_HEADS[em.muscle] ?? []) : [];
  const musclePicking = openField === 'muscle';
  const headPicking = openField === 'head';
  const rs = ROLE_STYLE[em.role];

  // Duplicate detection — custom input matches a known preset
  const muscleDuplicate =
    !!customMuscleText.trim() && !!MUSCLE_GROUP_MAP[slugify(customMuscleText)];
  const headDuplicate = !!customHeadText.trim() && !!HEAD_LABELS[slugify(customHeadText)];

  // Head is accessible if muscle is committed OR if there's pending custom text
  const hasMuscle = !!em.muscle || !!customMuscleText;

  // Live-preview typed text in the button while the picker is open
  const muscleDisplay =
    musclePicking && customMuscleText
      ? fmt(customMuscleText)
      : em.muscle
        ? fmtMuscle(em.muscle)
        : 'Muscle…';
  const headDisplay =
    headPicking && customHeadText ? fmt(customHeadText) : em.head ? fmtHead(em.head) : 'Head…';

  return (
    <View>
      {/* Row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <TouchableOpacity
          onPress={() => onToggle('muscle')}
          style={[
            rowChip,
            {
              flex: 1,
              backgroundColor: musclePicking ? '#3f3f46' : '#27272a',
              borderColor: musclePicking ? '#71717a' : '#3f3f46',
            },
          ]}>
          <Text
            style={{ color: hasMuscle ? '#fafafa' : '#52525b', fontSize: 13, fontWeight: '500' }}>
            {muscleDisplay}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => hasMuscle && onToggle('head')}
          style={[
            rowChip,
            {
              flex: 1,
              backgroundColor: headPicking ? '#3f3f46' : '#1c1c1e',
              borderColor: headPicking ? '#71717a' : '#27272a',
              opacity: hasMuscle ? 1 : 0.35,
            },
          ]}>
          <Text
            style={{
              color: em.head || (headPicking && customHeadText) ? '#d4d4d8' : '#52525b',
              fontSize: 13,
            }}>
            {headDisplay}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onCycleRole}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 8,
            backgroundColor: rs.bg,
            minWidth: 78,
            alignItems: 'center',
          }}>
          <Text style={{ color: rs.text, fontSize: 12, fontWeight: '600' }}>{rs.label}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <X size={16} color="#52525b" />
        </TouchableOpacity>
      </View>

      {/* Muscle picker */}
      {musclePicking && (
        <View style={pickerBox}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 6, paddingVertical: 2, alignItems: 'center' }}>
            {MUSCLE_OPTIONS.map((m) => {
              const active = em.muscle === m.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => onSetMuscle(m.id)}
                  style={[
                    inlineChip,
                    {
                      backgroundColor: active ? '#3b82f6' : '#27272a',
                      borderColor: active ? '#3b82f6' : '#3f3f46',
                    },
                  ]}>
                  <Text
                    style={{
                      color: active ? '#fff' : '#a1a1aa',
                      fontSize: 13,
                      fontWeight: active ? '600' : '400',
                    }}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TextInput
              value={customMuscleText}
              onChangeText={(t) => {
                setCustomMuscleText(t);
                muscleTextRef.current = t;
              }}
              onSubmitEditing={() => {
                const t = customMuscleText.trim();
                if (t && !muscleDuplicate) onCommitMuscle(slugify(t));
              }}
              onBlur={() => {
                const t = customMuscleText.trim();
                if (t && !muscleDuplicate) onCommitMuscle(slugify(t));
              }}
              placeholder="Custom…"
              placeholderTextColor="#3f3f46"
              returnKeyType="done"
              style={customInputStyle(!!customMuscleText, muscleDuplicate)}
            />
          </ScrollView>
        </View>
      )}

      {/* Head picker */}
      {headPicking && (
        <View style={pickerBox}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 6, paddingVertical: 2, alignItems: 'center' }}>
            <TouchableOpacity
              onPress={() => onSetHead(undefined)}
              style={[
                inlineChip,
                {
                  backgroundColor: !em.head ? '#3f3f46' : '#27272a',
                  borderColor: !em.head ? '#71717a' : '#3f3f46',
                },
              ]}>
              <Text style={{ color: !em.head ? '#fff' : '#71717a', fontSize: 13 }}>Any</Text>
            </TouchableOpacity>
            {heads.map((h) => {
              const active = em.head === h;
              return (
                <TouchableOpacity
                  key={h}
                  onPress={() => onSetHead(h)}
                  style={[
                    inlineChip,
                    {
                      backgroundColor: active ? '#3b82f6' : '#27272a',
                      borderColor: active ? '#3b82f6' : '#3f3f46',
                    },
                  ]}>
                  <Text
                    style={{
                      color: active ? '#fff' : '#a1a1aa',
                      fontSize: 13,
                      fontWeight: active ? '600' : '400',
                    }}>
                    {fmtHead(h)}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TextInput
              value={customHeadText}
              onChangeText={(t) => {
                setCustomHeadText(t);
                headTextRef.current = t;
              }}
              onSubmitEditing={() => {
                const t = customHeadText.trim();
                if (t && !headDuplicate) onSetHead(slugify(t));
              }}
              onBlur={() => {
                const t = customHeadText.trim();
                if (t && !headDuplicate) onSetHead(slugify(t));
              }}
              placeholder="Custom…"
              placeholderTextColor="#3f3f46"
              returnKeyType="done"
              style={customInputStyle(!!customHeadText, headDuplicate)}
            />
          </ScrollView>
        </View>
      )}
    </View>
  );
});

const EmphasisRow = memo(EmphasisRowBase);

type EmphasisBuilderHandle = { getDraftValue: () => Emphasis[] };

const EmphasisBuilderBase = forwardRef<
  EmphasisBuilderHandle,
  {
    value: Emphasis[];
    onChange: (fn: (prev: Emphasis[]) => Emphasis[]) => void;
  }
>(function EmphasisBuilder({ value, onChange }, builderRef) {
  const [open, setOpen] = useState<OpenPicker>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Direct refs to each row — used to read typed-but-uncommitted text imperatively
  const rowRefs = useRef<(EmphasisRowHandle | null)[]>([]);

  // Expose a way for the Save button to read the fully-committed value including any pending drafts
  useImperativeHandle(builderRef, () => ({
    getDraftValue: () =>
      valueRef.current.map((e, i) => {
        const row = rowRefs.current[i];
        if (!row) return e;
        const muscleDraft = row.getMuscle().trim();
        const headDraft = row.getHead().trim();
        return {
          ...e,
          ...(muscleDraft ? { muscle: slugify(muscleDraft) } : {}),
          ...(headDraft ? { head: slugify(headDraft) } : {}),
        };
      }),
  }));

  // Read all row refs and flush any pending custom text into state
  const commitAllDrafts = useCallback(() => {
    onChange((prev) => {
      let globalChanged = false;
      const next = prev.map((e, i) => {
        const row = rowRefs.current[i];
        if (!row) return e;
        let updated = e;
        const muscleDraft = row.getMuscle().trim();
        const headDraft = row.getHead().trim();
        if (muscleDraft) {
          const slug = slugify(muscleDraft);
          if (slug !== e.muscle) {
            updated = { ...updated, muscle: slug };
            globalChanged = true;
          }
        }
        if (headDraft) {
          const slug = slugify(headDraft);
          if (slug !== e.head) {
            updated = { ...updated, head: slug };
            globalChanged = true;
          }
        }
        return updated;
      });
      return globalChanged ? next : prev;
    });
  }, [onChange]);

  const toggle = useCallback(
    (idx: number, field: 'muscle' | 'head') => {
      commitAllDrafts();
      setOpen((prev) => (prev?.idx === idx && prev?.field === field ? null : { idx, field }));
    },
    [commitAllDrafts]
  );

  // Called from chip taps — clears head, auto-opens head picker if presets exist
  const setMuscle = useCallback(
    (idx: number, muscle: string) => {
      onChange((prev) => prev.map((e, i) => (i === idx ? { ...e, muscle, head: undefined } : e)));
      if ((MUSCLE_HEADS[muscle]?.length ?? 0) > 0) {
        setOpen({ idx, field: 'head' });
      } else {
        setOpen(null);
      }
    },
    [onChange]
  );

  // Called from onBlur/onSubmit — only updates value, never touches open
  const commitMuscle = useCallback(
    (idx: number, muscle: string) => {
      onChange((prev) => prev.map((e, i) => (i === idx ? { ...e, muscle } : e)));
    },
    [onChange]
  );

  const setHead = useCallback(
    (idx: number, head: string | undefined) => {
      onChange((prev) => prev.map((e, i) => (i === idx ? { ...e, head } : e)));
      setOpen(null);
    },
    [onChange]
  );

  const cycleRole = useCallback(
    (idx: number) => {
      onChange((prev) => prev.map((e, i) => (i === idx ? { ...e, role: nextRole(e.role) } : e)));
    },
    [onChange]
  );

  const remove = useCallback(
    (idx: number) => {
      rowRefs.current.splice(idx, 1);
      setOpen(null);
      onChange((prev) => prev.filter((_, i) => i !== idx));
    },
    [onChange]
  );

  const addEntry = useCallback(() => {
    commitAllDrafts();
    const newIdx = valueRef.current.length;
    onChange((prev) => {
      const role: MuscleRole = prev.length === 0 ? 'primary' : 'secondary';
      return [...prev, { muscle: '', role }];
    });
    setOpen({ idx: newIdx, field: 'muscle' });
  }, [onChange, commitAllDrafts]);

  return (
    <View style={{ gap: 6 }}>
      {value.map((em, idx) => (
        <EmphasisRow
          key={idx}
          ref={(r) => {
            rowRefs.current[idx] = r;
          }}
          em={em}
          openField={open?.idx === idx ? open.field : null}
          onToggle={(field) => toggle(idx, field)}
          onSetMuscle={(muscle) => setMuscle(idx, muscle)}
          onCommitMuscle={(muscle) => commitMuscle(idx, muscle)}
          onSetHead={(head) => setHead(idx, head)}
          onCycleRole={() => cycleRole(idx)}
          onRemove={() => remove(idx)}
        />
      ))}
      <TouchableOpacity
        onPress={addEntry}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 8,
          paddingHorizontal: 2,
        }}>
        <Plus size={14} color="#ea580c" />
        <Text style={{ color: '#ea580c', fontSize: 13, fontWeight: '600' }}>Add muscle</Text>
      </TouchableOpacity>
    </View>
  );
});

const EmphasisBuilder = memo(EmphasisBuilderBase);

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CreateExercise() {
  const insets = useSafeAreaInsets();
  const { exerciseId, autoAdd, dateString, prefillName, prefillEquipment, prefillData } =
    useLocalSearchParams<{
      exerciseId?: string;
      autoAdd?: string;
      dateString?: string;
      prefillName?: string;
      prefillEquipment?: string;
      prefillData?: string;
    }>();
  const isEditing = !!exerciseId;
  const shouldAutoAdd = autoAdd === 'true' && !!dateString;

  // Parse any prefilled exercise data (carries over muscles, rest, weight, etc. when copying)
  const pd =
    !isEditing && prefillData
      ? (() => {
          try {
            return JSON.parse(prefillData) as Record<string, unknown>;
          } catch {
            return null;
          }
        })()
      : null;

  const [name, setName] = useState(prefillName ?? '');
  const [equipment, setEquipment] = useState(prefillEquipment ?? '');
  const [equipmentVariant, setEquipmentVariant] = useState('');
  const [emphasis, setEmphasis] = useState<Emphasis[]>(
    (pd?.emphasis as Emphasis[]) ?? [{ muscle: '', role: 'primary' }]
  );
  const [defaultRestSeconds, setDefaultRestSeconds] = useState<number | null>(
    (pd?.defaultRestSeconds as number) ?? null
  );
  const [baseWeightKg, setBaseWeightKg] = useState((pd?.baseWeightKg as string) ?? '');
  const [weightMode, setWeightMode] = useState<'total' | 'per_side' | null>(
    (pd?.weightMode as 'total' | 'per_side') ?? null
  );
  const [weightStep, setWeightStep] = useState((pd?.weightStep as string) ?? '');
  const [weightStackItems, setWeightStackItems] = useState<string[]>(
    (pd?.weightStackItems as string[]) ?? []
  );
  const [showAdvancedStack, setShowAdvancedStack] = useState(
    (pd?.showAdvancedStack as boolean) ?? false
  );
  const [showStackEditor, setShowStackEditor] = useState(false);
  const stackInputRefs = useRef<(TextInput | null)[]>([]);
  const [description, setDescription] = useState((pd?.description as string) ?? '');
  const [videoUrl, setVideoUrl] = useState((pd?.videoUrl as string) ?? '');
  const [isFavourite, setIsFavourite] = useState(false);
  const [showCustomEquipmentInput, setShowCustomEquipmentInput] = useState(false);
  const [customEquipmentText, setCustomEquipmentText] = useState('');
  const [persistedCustomEquipment, setPersistedCustomEquipment] = useState<string[]>([]);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const emphasisBuilderRef = useRef<EmphasisBuilderHandle>(null);
  const originalBaseWeightRef = useRef<number | null>(null);

  // Load persisted custom equipment on mount (for all exercises)
  useEffect(() => {
    ExerciseDAL.getCustomEquipment().then(setPersistedCustomEquipment);
  }, []);

  // Load exercise data in edit mode
  useEffect(() => {
    if (!exerciseId) return;
    (async () => {
      try {
        const all = await ExerciseDAL.getAll();
        const ex = all.find((e) => e.id === exerciseId);
        if (ex) {
          setName(ex.name);
          const eq = ex.equipment ?? '';
          setEquipment(eq);
          setEquipmentVariant(ex.equipmentVariant ?? '');
          setEmphasis(
            ex.muscleEmphasis.length > 0
              ? ex.muscleEmphasis.map((m) => ({
                  muscle: m.muscle,
                  head: m.head,
                  role: m.role as MuscleRole,
                }))
              : [{ muscle: '', role: 'primary' as MuscleRole }]
          );
          setDefaultRestSeconds(ex.defaultRestSeconds ?? null);
          setBaseWeightKg(ex.baseWeightKg != null ? String(ex.baseWeightKg) : '');
          originalBaseWeightRef.current = ex.baseWeightKg ?? null;
          setWeightMode(ex.weightMode ?? null);
          setWeightStep(ex.weightStep != null ? String(ex.weightStep) : '');
          if (ex.weightStack && ex.weightStack.length > 0) {
            setWeightStackItems(ex.weightStack.map(String));
            setShowAdvancedStack(true);
          }
          setDescription(ex.description ?? '');
          setVideoUrl(ex.videoUrl ?? '');
          setIsFavourite((ex.isFavourite ?? 0) === 1);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [exerciseId]);

  const navigateToCopy = (targetEquipment?: string) => {
    router.push({
      pathname: '/create_exercise',
      params: {
        prefillName: name,
        ...(targetEquipment ? { prefillEquipment: targetEquipment } : {}),
        prefillData: JSON.stringify({
          emphasis,
          defaultRestSeconds,
          baseWeightKg,
          weightMode,
          weightStep,
          weightStackItems,
          showAdvancedStack,
          description,
          videoUrl,
        }),
      },
    });
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Name required', 'Please enter an exercise name.');
      return;
    }
    const resolvedEquipment = showCustomEquipmentInput
      ? slugify(customEquipmentText.trim())
      : equipment;
    if (!resolvedEquipment) {
      Alert.alert('Equipment required', 'Please select an equipment type.');
      return;
    }
    const currentEmphasis = emphasisBuilderRef.current?.getDraftValue() ?? emphasis;
    const validEmphasis = currentEmphasis.filter((e) => e.muscle);
    if (validEmphasis.length === 0 || !validEmphasis.some((e) => e.role === 'primary')) {
      Alert.alert('Muscle required', 'Please add at least one primary muscle.');
      return;
    }

    setSaving(true);
    try {
      const muscleEmphasis: MuscleEmphasis[] = validEmphasis.map((e) => ({
        muscle: e.muscle,
        ...(e.head ? { head: e.head } : {}),
        role: e.role,
      }));
      const parsedBaseWeight = baseWeightKg.trim() ? parseFloat(baseWeightKg) : null;
      const parsedWeightStep = weightStep.trim() ? parseFloat(weightStep) : null;
      const parsedWeightStack: number[] | null =
        showAdvancedStack && weightStackItems.length >= 2
          ? weightStackItems.map((s) => parseFloat(s)).filter((n) => !isNaN(n) && n >= 0)
          : null;
      const variantValue = equipmentVariant.trim() || null;
      const payload = {
        name: trimmedName,
        equipment: resolvedEquipment,
        equipmentVariant: variantValue,
        muscleEmphasis,
        description: description.trim(),
        videoUrl: videoUrl.trim(),
        defaultRestSeconds,
        baseWeightKg: parsedBaseWeight,
        weightMode,
        weightStep: parsedWeightStep,
        weightStack: parsedWeightStack,
      };

      if (isEditing) {
        // ID never changes — just update the fields directly
        await ExerciseDAL.update(exerciseId, payload);

        const oldBase = originalBaseWeightRef.current ?? 0;
        const newBase = parsedBaseWeight ?? 0;
        if (newBase !== oldBase) {
          const delta = newBase - oldBase;
          const sign = delta > 0 ? `+${delta}` : String(delta);
          Alert.alert(
            'Update history?',
            `Base weight changed by ${sign}kg. Apply this to all previously recorded sets for this exercise?`,
            [
              { text: 'No', style: 'cancel' },
              {
                text: 'Yes, update all',
                onPress: () =>
                  ExerciseDAL.adjustSetWeights(exerciseId!, delta).catch(console.error),
              },
            ]
          );
        }
        if (shouldAutoAdd) {
          setPendingExerciseAdd([exerciseId!], dateString!);
          const _cb = takePendingExerciseCallback();
          if (_cb) _cb([exerciseId!]);
        }
      } else {
        // Create — opaque ID
        const all = await ExerciseDAL.getAll();
        const id = generateId();

        // Warn if exact name+equipment+variant combo already exists
        const conflict = all.find(
          (e) =>
            slugify(e.name) === slugify(trimmedName) &&
            e.equipment === resolvedEquipment &&
            (e.equipmentVariant ?? '') === (variantValue ?? '')
        );
        if (conflict) {
          Alert.alert(
            'Already exists',
            `"${trimmedName}" (${formatEquipmentLabel(resolvedEquipment)}${variantValue ? ` · ${variantValue}` : ''}) already exists.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Go to Exercise',
                onPress: () => {
                  router.back();
                  router.push({
                    pathname: '/create_exercise',
                    params: { exerciseId: conflict.id },
                  });
                },
              },
            ]
          );
          setSaving(false);
          return;
        }

        if (!EQUIPMENT_OPTIONS.includes(resolvedEquipment)) {
          await ExerciseDAL.saveCustomEquipment(resolvedEquipment);
        }
        await ExerciseDAL.save({ id, ...payload, isFavourite: isFavourite ? 1 : 0 });
        if (shouldAutoAdd) {
          setPendingExerciseAdd([id], dateString!);
          const _cb = takePendingExerciseCallback();
          if (_cb) _cb([id]);
          router.back();
        } else {
          router.replace({ pathname: '/(tabs)/exercises', params: { focusName: trimmedName } });
        }
        return;
      }
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to save exercise.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    // Count blocks referencing this exercise, split by logged (has events) vs todo (no events)
    const rows = await db.getAllAsync<{ blockId: string; hasEvents: number }>(
      `SELECT b.id as blockId, CASE WHEN COUNT(e.id) > 0 THEN 1 ELSE 0 END as hasEvents
       FROM blocks b LEFT JOIN events e ON e.blockId = b.id
       WHERE b.exerciseIds LIKE ?
       GROUP BY b.id`,
      [`%${exerciseId}%`]
    );
    const loggedCount = rows.filter((r) => r.hasEvents === 1).length;
    const todoCount = rows.filter((r) => r.hasEvents === 0).length;

    const parts: string[] = [];
    if (loggedCount > 0)
      parts.push(`logged in ${loggedCount} workout${loggedCount === 1 ? '' : 's'}`);
    if (todoCount > 0) parts.push(`pending in ${todoCount} workout${todoCount === 1 ? '' : 's'}`);

    const message =
      parts.length > 0
        ? `"${name}" is ${parts.join(' and ')}. Deleting it will leave those sessions without exercise info.`
        : `Delete "${name}"? This cannot be undone.`;

    Alert.alert('Delete Exercise', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await ExerciseDAL.delete(exerciseId!);
          router.back();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#09090b',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
        <Text style={{ color: '#52525b' }}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#09090b', paddingTop: insets.top }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: '#18181b',
        }}>
        <TouchableOpacity
          onPress={() => (isEditing ? router.replace('/(tabs)/exercises') : router.back())}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ChevronLeft size={24} color="#a1a1aa" />
        </TouchableOpacity>
        <Text style={{ flex: 1, color: '#fafafa', fontSize: 18, fontWeight: '600', marginLeft: 8 }}>
          {isEditing ? 'Edit Exercise' : 'New Exercise'}
        </Text>
        <TouchableOpacity
          onPress={async () => {
            const next = !isFavourite;
            setIsFavourite(next);
            if (isEditing) {
              await ExerciseDAL.setFavourite(exerciseId!, next);
            }
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ marginRight: isEditing ? 16 : 0 }}>
          <Star size={20} color="#f59e0b" fill={isFavourite ? '#f59e0b' : 'transparent'} />
        </TouchableOpacity>
        {isEditing && (
          <TouchableOpacity
            onPress={handleDelete}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Trash2 size={20} color="#ef4444" />
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={insets.top + 56}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: insets.bottom + 32 }}>
          {/* Name */}
          <View style={{ gap: 8 }}>
            <Text style={labelStyle}>Exercise Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Cable Fly"
              placeholderTextColor="#3f3f46"
              style={inputStyle}
            />
          </View>

          {/* Equipment */}
          {isEditing ? null : (
            <View style={{ gap: 8 }}>
              <Text style={labelStyle}>Equipment</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[
                  ...EQUIPMENT_OPTIONS,
                  ...persistedCustomEquipment.filter((eq) => !EQUIPMENT_OPTIONS.includes(eq)),
                ].map((eq) => {
                  const active = equipment === eq;
                  return (
                    <TouchableOpacity
                      key={eq}
                      onPress={() => {
                        setEquipment(eq);
                        setShowCustomEquipmentInput(false);
                        setCustomEquipmentText('');
                      }}
                      style={[
                        chipStyle,
                        {
                          backgroundColor: active ? '#ea580c' : '#27272a',
                          borderColor: active ? '#ea580c' : '#3f3f46',
                        },
                      ]}>
                      <Text
                        style={{
                          color: active ? '#fff' : '#a1a1aa',
                          fontSize: 14,
                          fontWeight: active ? '600' : '400',
                        }}>
                        {formatEquipmentLabel(eq)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  onPress={() => {
                    setShowCustomEquipmentInput(true);
                    setEquipment('');
                  }}
                  style={[
                    chipStyle,
                    {
                      backgroundColor: showCustomEquipmentInput ? '#ea580c' : '#27272a',
                      borderColor: showCustomEquipmentInput ? '#ea580c' : '#3f3f46',
                    },
                  ]}>
                  <Text
                    style={{ color: showCustomEquipmentInput ? '#fff' : '#71717a', fontSize: 14 }}>
                    + Custom
                  </Text>
                </TouchableOpacity>
              </View>
              {showCustomEquipmentInput && (
                <TextInput
                  value={customEquipmentText}
                  onChangeText={setCustomEquipmentText}
                  placeholder="e.g. Resistance Band"
                  placeholderTextColor="#3f3f46"
                  autoFocus
                  style={inputStyle}
                />
              )}
            </View>
          )}

          {/* Equipment + Variant (edit: pills + copy button) */}
          {isEditing && (
            <View style={{ gap: 10 }}>
              <Text style={labelStyle}>Equipment &amp; Variant</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 7,
                    backgroundColor: '#27272a',
                  }}>
                  <Text style={{ color: '#a1a1aa', fontSize: 13 }}>
                    {formatEquipmentLabel(equipment)}
                  </Text>
                </View>
                {equipmentVariant.trim() ? (
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 7,
                      backgroundColor: '#27272a',
                    }}>
                    <Text style={{ color: '#a1a1aa', fontSize: 13 }}>
                      {equipmentVariant.trim()}
                    </Text>
                  </View>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={() => navigateToCopy('')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Plus size={13} color="#ea580c" />
                <Text style={{ color: '#ea580c', fontSize: 13, fontWeight: '600' }}>
                  Create copy with different equipment
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Equipment Variant (create only) */}
          {!isEditing && (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text style={labelStyle}>Type / Variant</Text>
                <Text style={{ color: '#52525b', fontSize: 11 }}>
                  optional · e.g. Seated, Smith, Wide Grip
                </Text>
              </View>
              <TextInput
                value={equipmentVariant}
                onChangeText={setEquipmentVariant}
                placeholder="e.g. Seated"
                placeholderTextColor="#3f3f46"
                style={inputStyle}
              />
            </View>
          )}

          {/* Muscle Emphasis */}
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text style={labelStyle}>Muscles</Text>
              <Text style={{ color: '#52525b', fontSize: 11 }}>
                tap role to cycle · first = primary by default
              </Text>
            </View>
            <EmphasisBuilder
              ref={emphasisBuilderRef}
              value={emphasis}
              onChange={(fn) => setEmphasis(fn)}
            />
          </View>

          {/* Default Rest */}
          <View style={{ gap: 8 }}>
            <Text style={labelStyle}>
              Default Rest <Text style={optStyle}>(optional)</Text>
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {REST_PRESETS.map((p) => {
                const active = defaultRestSeconds === p.value;
                return (
                  <TouchableOpacity
                    key={p.value}
                    onPress={() => setDefaultRestSeconds(active ? null : p.value)}
                    style={[
                      chipStyle,
                      {
                        backgroundColor: active ? '#7c3aed' : '#27272a',
                        borderColor: active ? '#7c3aed' : '#3f3f46',
                      },
                    ]}>
                    <Text
                      style={{
                        color: active ? '#fff' : '#a1a1aa',
                        fontSize: 14,
                        fontWeight: active ? '600' : '400',
                      }}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Equipment Weight */}
          <View style={{ gap: 6 }}>
            <Text style={labelStyle}>
              Equipment Weight <Text style={optStyle}>(optional)</Text>
            </Text>
            <Text style={{ color: '#52525b', fontSize: 12 }}>
              Inherent weight of the bar or machine — e.g. 20 kg for Olympic bar, 10 kg for EZ bar
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                value={baseWeightKg}
                onChangeText={(t) => setBaseWeightKg(t.replace(/[^0-9.]/g, ''))}
                placeholder="0"
                placeholderTextColor="#3f3f46"
                keyboardType="decimal-pad"
                style={[inputStyle, { width: 100 }]}
              />
              <Text style={{ color: '#71717a', fontSize: 15 }}>kg</Text>
            </View>
          </View>

          {/* Weight Mode */}
          <View style={{ gap: 8 }}>
            <Text style={labelStyle}>Weight Mode</Text>
            <Text style={{ color: '#52525b', fontSize: 12 }}>
              Per side: enter weight for one side (e.g. 12kg dumbbell → stores 24kg total)
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([null, 'total', 'per_side'] as const).map((mode) => {
                const active = weightMode === mode;
                return (
                  <TouchableOpacity
                    key={String(mode)}
                    onPress={() => setWeightMode(mode)}
                    style={[
                      chipStyle,
                      {
                        backgroundColor: active ? '#ea580c' : '#27272a',
                        borderColor: active ? '#ea580c' : '#3f3f46',
                      },
                    ]}>
                    <Text
                      style={{
                        color: active ? '#fff' : '#a1a1aa',
                        fontSize: 14,
                        fontWeight: active ? '600' : '400',
                      }}>
                      {mode === null ? 'Global' : mode === 'total' ? 'Total' : 'Per side'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Weight Increment */}
          {(() => {
            const effectiveStep = parseFloat(weightStep) || 2.5;
            const baseVal = parseFloat(baseWeightKg) || 0;
            let previewPrev: string;
            let previewNext: string;
            if (showAdvancedStack && weightStackItems.length >= 2) {
              const nums = weightStackItems
                .map((s) => parseFloat(s))
                .filter((n) => !isNaN(n) && n >= 0)
                .sort((a, b) => a - b);
              const afterBase = nums.find((v) => v > baseVal);
              const beforeBase = [...nums].reverse().find((v) => v < baseVal);
              previewNext = afterBase != null ? String(afterBase) : '—';
              previewPrev = beforeBase != null ? String(beforeBase) : '—';
            } else {
              previewNext = String(Math.round((baseVal + effectiveStep) * 100) / 100);
              previewPrev = String(Math.max(0, Math.round((baseVal - effectiveStep) * 100) / 100));
            }

            return (
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  <Text style={labelStyle}>Weight Increment</Text>
                  <Text style={optStyle}>used by + / − buttons</Text>
                </View>

                {/* Step / Custom segmented toggle */}
                <View
                  style={{
                    flexDirection: 'row',
                    backgroundColor: '#18181b',
                    borderRadius: 8,
                    padding: 2,
                  }}>
                  <TouchableOpacity
                    onPress={() => {
                      if (showAdvancedStack) {
                        setShowAdvancedStack(false);
                        setShowStackEditor(false);
                        setWeightStackItems([]);
                      }
                    }}
                    style={{
                      flex: 1,
                      paddingVertical: 7,
                      alignItems: 'center',
                      borderRadius: 6,
                      backgroundColor: !showAdvancedStack ? '#27272a' : 'transparent',
                    }}>
                    <Text
                      style={{
                        color: !showAdvancedStack ? '#e4e4e7' : '#52525b',
                        fontSize: 13,
                        fontWeight: !showAdvancedStack ? '600' : '400',
                      }}>
                      Step
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      if (!showAdvancedStack) {
                        setWeightStackItems(generateWeightStack(effectiveStep));
                        setShowAdvancedStack(true);
                        setShowStackEditor(true);
                      }
                    }}
                    style={{
                      flex: 1,
                      paddingVertical: 7,
                      alignItems: 'center',
                      borderRadius: 6,
                      backgroundColor: showAdvancedStack ? '#27272a' : 'transparent',
                    }}>
                    <Text
                      style={{
                        color: showAdvancedStack ? '#e4e4e7' : '#52525b',
                        fontSize: 13,
                        fontWeight: showAdvancedStack ? '600' : '400',
                      }}>
                      Custom
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Step mode */}
                {!showAdvancedStack && (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TextInput
                        value={weightStep}
                        onChangeText={(t) => setWeightStep(t.replace(/[^0-9.]/g, ''))}
                        placeholder="2.5"
                        placeholderTextColor="#3f3f46"
                        keyboardType="decimal-pad"
                        style={[inputStyle, { width: 90 }]}
                      />
                      <Text style={{ color: '#71717a', fontSize: 15 }}>kg per press</Text>
                    </View>
                    <Text style={{ color: '#52525b', fontSize: 12 }}>
                      {baseWeightKg.trim()
                        ? `From ${baseVal} kg  ↑ ${previewNext} kg  ↓ ${previewPrev} kg`
                        : `± ${effectiveStep} kg per press`}
                    </Text>
                  </>
                )}

                {/* Custom mode — summary (taps to open modal) */}
                {showAdvancedStack && (
                  <TouchableOpacity
                    onPress={() => setShowStackEditor(true)}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: '#1c1c1f',
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: '#27272a',
                      paddingHorizontal: 14,
                      paddingVertical: 11,
                    }}>
                    <Text style={{ color: '#a1a1aa', fontSize: 13, fontWeight: '500' }}>
                      {weightStackItems.length} custom values
                    </Text>
                    <Text style={{ color: '#71717a', fontSize: 13 }}>Arrange ›</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })()}

          {/* Description */}
          <View style={{ gap: 8 }}>
            <Text style={labelStyle}>
              Description <Text style={optStyle}>(optional)</Text>
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Brief description…"
              placeholderTextColor="#3f3f46"
              multiline
              numberOfLines={3}
              style={[inputStyle, { textAlignVertical: 'top', minHeight: 80 }]}
            />
          </View>

          {/* Video URL */}
          <View style={{ gap: 8 }}>
            <Text style={labelStyle}>
              Video URL <Text style={optStyle}>(optional)</Text>
            </Text>
            <TextInput
              value={videoUrl}
              onChangeText={setVideoUrl}
              placeholder="YouTube or video link…"
              placeholderTextColor="#3f3f46"
              autoCapitalize="none"
              keyboardType="url"
              style={inputStyle}
            />
          </View>

          {/* Save */}
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={{
              backgroundColor: saving ? '#ea580c80' : '#ea580c',
              borderRadius: 12,
              padding: 16,
              alignItems: 'center',
              marginTop: 4,
            }}>
            <Text style={{ color: 'white', fontSize: 16, fontWeight: '700' }}>
              {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Exercise'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Custom weight stack modal */}
      <Modal
        visible={showStackEditor}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStackEditor(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: 'rgba(0,0,0,0.65)',
            }}>
            <View
              style={{
                backgroundColor: '#18181b',
                borderRadius: 16,
                // 4 cols × 66px + 3 gaps × 8px + 2 × 12px padding
                width: 4 * 66 + 3 * 8 + 2 * 12,
                maxHeight: '80%',
              }}>
              {/* Modal header */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: '#27272a',
                }}>
                <TouchableOpacity
                  onPress={() => {
                    const effectiveStep = parseFloat(weightStep) || 2.5;
                    setWeightStackItems(generateWeightStack(effectiveStep));
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ color: '#52525b', fontSize: 13 }}>↺ Regenerate</Text>
                </TouchableOpacity>
                <Text style={{ color: '#a1a1aa', fontSize: 13, fontWeight: '600' }}>
                  Custom values
                </Text>
                <TouchableOpacity
                  onPress={() => setShowStackEditor(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ color: '#fafafa', fontSize: 14, fontWeight: '600' }}>Done</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                contentContainerStyle={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  padding: 12,
                  gap: 8,
                }}
                keyboardShouldPersistTaps="handled">
                {weightStackItems.map((val, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => stackInputRefs.current[idx]?.focus()}
                    activeOpacity={0.8}
                    style={{
                      width: 66,
                      borderRadius: 8,
                      borderWidth: 1.5,
                      borderColor: '#2d2d30',
                      backgroundColor: '#1c1c1f',
                      overflow: 'hidden',
                    }}>
                    <TextInput
                      ref={(r) => {
                        stackInputRefs.current[idx] = r;
                      }}
                      value={val}
                      onChangeText={(t) => {
                        setWeightStackItems((prev) => {
                          const next = [...prev];
                          next[idx] = t.replace(/[^0-9.]/g, '');
                          return next;
                        });
                      }}
                      keyboardType="decimal-pad"
                      selectTextOnFocus
                      style={{
                        color: '#e4e4e7',
                        fontSize: 14,
                        fontWeight: '600',
                        textAlign: 'center',
                        paddingTop: 8,
                        paddingBottom: 2,
                        paddingHorizontal: 4,
                      }}
                    />
                    <Text
                      style={{
                        color: '#52525b',
                        fontSize: 9,
                        textAlign: 'center',
                        paddingBottom: 6,
                      }}>
                      kg
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        setWeightStackItems((prev) => prev.filter((_, i) => i !== idx))
                      }
                      style={{
                        position: 'absolute',
                        top: 2,
                        right: 2,
                        width: 14,
                        height: 14,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}>
                      <Text style={{ color: '#3f3f46', fontSize: 10, lineHeight: 12 }}>✕</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  onPress={() => {
                    setWeightStackItems((prev) => {
                      const effectiveStep = parseFloat(weightStep) || 2.5;
                      const last = prev.length > 0 ? parseFloat(prev[prev.length - 1]) : 0;
                      const newVal = isNaN(last)
                        ? 0
                        : Math.round((last + effectiveStep) * 100) / 100;
                      return [...prev, String(newVal)];
                    });
                  }}
                  style={{
                    width: 66,
                    height: 52,
                    borderRadius: 8,
                    borderWidth: 1.5,
                    borderColor: '#2d2d30',
                    borderStyle: 'dashed',
                    backgroundColor: '#18181b',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Text style={{ color: '#52525b', fontSize: 20, lineHeight: 22 }}>+</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const labelStyle = {
  color: '#a1a1aa',
  fontSize: 12,
  fontWeight: '600' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.8,
};

const optStyle = {
  color: '#3f3f46' as const,
  fontSize: 11,
  fontWeight: '400' as const,
  textTransform: 'none' as const,
  letterSpacing: 0,
};

const inputStyle = {
  backgroundColor: '#18181b',
  borderRadius: 10,
  borderWidth: 1,
  borderColor: '#27272a',
  color: '#fafafa',
  fontSize: 15,
  padding: 12,
};

const chipStyle = {
  paddingHorizontal: 14,
  paddingVertical: 8,
  borderRadius: 100,
  borderWidth: 1,
};

const rowChip = {
  paddingHorizontal: 10,
  paddingVertical: 7,
  borderRadius: 8,
  borderWidth: 1,
};

const pickerBox = {
  marginTop: 6,
  marginBottom: 2,
  paddingHorizontal: 4,
};

const inlineChip = {
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: 100,
  borderWidth: 1,
};

function customInputStyle(hasText: boolean, isDuplicate = false) {
  return {
    backgroundColor: isDuplicate ? '#450a0a' : hasText ? '#1e3a5f' : '#27272a',
    borderWidth: 1,
    borderColor: isDuplicate ? '#dc2626' : hasText ? '#3b82f6' : '#3f3f46',
    borderRadius: 100,
    color: isDuplicate ? '#fca5a5' : '#fafafa',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 90,
  };
}
