import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Copy, TriangleAlert } from 'lucide-react-native';
import { ExerciseDAL } from '@/lib/db';
import type { Exercise } from '@/lib/exercises';
import {
  EXERCISE_IMPORT_PROMPT,
  applyExerciseImport,
  applyRoutineImport,
  buildRoutineImportPrompt,
  detectExerciseConflicts,
  detectRoutineConflicts,
  exportExercisesAI,
  exportRoutinesAI,
  parseAIImport,
  type ExerciseConflict,
  type RoutineConflict,
} from '@/lib/ai-format';

type Mode = 'exercises' | 'routines';
type Phase = 'compose' | 'review' | 'done';
type Resolution = 'update' | 'add_new' | 'skip';

// ─── Resolution toggle ─────────────────────────────────────────────────────────

function ResolutionToggle({
  value,
  onChange,
  showUpdate,
}: {
  value: Resolution;
  onChange: (r: Resolution) => void;
  showUpdate: boolean;
}) {
  const options: { key: Resolution; label: string }[] = [
    ...(showUpdate ? [{ key: 'update' as Resolution, label: 'Update' }] : []),
    { key: 'add_new', label: 'Add as copy' },
    { key: 'skip', label: 'Skip' },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.key}
          onPress={() => onChange(opt.key)}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 5,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: value === opt.key ? '#ea580c' : '#3f3f46',
            backgroundColor: value === opt.key ? '#431407' : 'transparent',
          }}>
          <Text
            style={{
              color: value === opt.key ? '#fb923c' : '#71717a',
              fontSize: 12,
              fontWeight: '600',
            }}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AIImport() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('exercises');
  const [prompt, setPrompt] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);
  const [includeContext, setIncludeContext] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [phase, setPhase] = useState<Phase>('compose');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exerciseConflicts, setExerciseConflicts] = useState<ExerciseConflict[]>([]);
  const [routineConflicts, setRoutineConflicts] = useState<RoutineConflict[]>([]);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

  const loadPrompt = useCallback(async (m: Mode, include: boolean) => {
    setPromptLoading(true);
    try {
      let base = m === 'exercises' ? EXERCISE_IMPORT_PROMPT : await buildRoutineImportPrompt();
      if (include) {
        const data = m === 'exercises' ? await exportExercisesAI() : await exportRoutinesAI();
        base += `\n\nHere are my current ${m} for reference:\n${data}`;
      }
      setPrompt(base);
    } finally {
      setPromptLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrompt(mode, includeContext);
    ExerciseDAL.getAll().then(setAllExercises);
  }, [mode, includeContext]);

  function switchMode(m: Mode) {
    if (m === mode) return;
    setMode(m);
    setPhase('compose');
    setPastedText('');
    setExerciseConflicts([]);
    setRoutineConflicts([]);
    // keep includeContext state — it makes sense across modes
  }

  async function handleSharePrompt() {
    try {
      await Share.share({ message: prompt });
    } catch {}
  }

  async function handleParse() {
    if (!pastedText.trim()) {
      Alert.alert('Empty input', 'Paste the AI response first.');
      return;
    }
    setParsing(true);
    try {
      const parsed = parseAIImport(pastedText);
      if (parsed.type === 'error') {
        Alert.alert('Could not parse', parsed.message);
        return;
      }
      if (parsed.type === 'exercises') {
        if (mode !== 'exercises') {
          Alert.alert('Wrong type', 'The pasted response is for exercises, but Routines mode is active.');
          return;
        }
        const conflicts = await detectExerciseConflicts(parsed.items);
        setExerciseConflicts(conflicts);
      } else {
        if (mode !== 'routines') {
          Alert.alert('Wrong type', 'The pasted response is for routines, but Exercises mode is active.');
          return;
        }
        const conflicts = await detectRoutineConflicts(parsed.items);
        setRoutineConflicts(conflicts);
      }
      setPhase('review');
    } finally {
      setParsing(false);
    }
  }

  async function handleImport() {
    setImporting(true);
    try {
      let r: { imported: number; skipped: number };
      if (mode === 'exercises') {
        r = await applyExerciseImport(exerciseConflicts);
      } else {
        r = await applyRoutineImport(routineConflicts, allExercises);
      }
      setResult(r);
      setPhase('done');
    } catch (e: any) {
      Alert.alert('Import failed', e?.message ?? 'Unknown error');
    } finally {
      setImporting(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const conflicts = mode === 'exercises' ? exerciseConflicts : routineConflicts;
  const nonSkipped = conflicts.filter((c) => c.resolution !== 'skip').length;
  const conflictCount = conflicts.filter((c) => c.existing !== null).length;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#09090b' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + 10,
          paddingHorizontal: 16,
          paddingBottom: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <ChevronLeft size={22} color="#a1a1aa" />
        </TouchableOpacity>
        <Text style={{ color: '#fafafa', fontSize: 20, fontWeight: '700', flex: 1 }}>
          AI Import
        </Text>
      </View>

      {/* Mode selector */}
      <View
        style={{
          flexDirection: 'row',
          marginHorizontal: 16,
          marginBottom: 20,
          backgroundColor: '#18181b',
          borderRadius: 10,
          padding: 3,
          gap: 3,
        }}>
        {(['exercises', 'routines'] as Mode[]).map((m) => (
          <TouchableOpacity
            key={m}
            onPress={() => switchMode(m)}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 7,
              alignItems: 'center',
              backgroundColor: mode === m ? '#27272a' : 'transparent',
            }}>
            <Text
              style={{
                color: mode === m ? '#fafafa' : '#71717a',
                fontWeight: '600',
                fontSize: 14,
                textTransform: 'capitalize',
              }}>
              {m}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {phase === 'done' && result ? (
        // ─── Done ───────────────────────────────────────────────────────────
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>✓</Text>
          <Text style={{ color: '#fafafa', fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' }}>
            Import complete
          </Text>
          <Text style={{ color: '#71717a', fontSize: 15, textAlign: 'center', marginBottom: 32 }}>
            {result.imported} {mode} imported
            {result.skipped > 0 ? `, ${result.skipped} skipped` : ''}
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              backgroundColor: '#ea580c',
              paddingHorizontal: 32,
              paddingVertical: 13,
              borderRadius: 10,
            }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : phase === 'review' ? (
        // ─── Review ─────────────────────────────────────────────────────────
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
            <Text style={{ color: '#fafafa', fontSize: 16, fontWeight: '700' }}>
              Review — {conflicts.length} item{conflicts.length !== 1 ? 's' : ''}
            </Text>
            {conflictCount > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <TriangleAlert size={13} color="#fb923c" />
                <Text style={{ color: '#fb923c', fontSize: 13 }}>
                  {conflictCount} already exist{conflictCount !== 1 ? 's' : ''} — choose what to do below
                </Text>
              </View>
            )}
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled">
            {mode === 'exercises'
              ? exerciseConflicts.map((c, i) => (
                  <ExerciseConflictRow
                    key={i}
                    conflict={c}
                    onChange={(r) => {
                      setExerciseConflicts((prev) => {
                        const next = [...prev];
                        next[i] = { ...next[i], resolution: r };
                        return next;
                      });
                    }}
                  />
                ))
              : routineConflicts.map((c, i) => (
                  <RoutineConflictRow
                    key={i}
                    conflict={c}
                    onChange={(r) => {
                      setRoutineConflicts((prev) => {
                        const next = [...prev];
                        next[i] = { ...next[i], resolution: r };
                        return next;
                      });
                    }}
                  />
                ))}
          </ScrollView>

          <View
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              paddingBottom: insets.bottom + 16,
              paddingTop: 12,
              paddingHorizontal: 16,
              backgroundColor: '#09090b',
              borderTopWidth: 1,
              borderTopColor: '#18181b',
              gap: 10,
            }}>
            <TouchableOpacity
              onPress={handleImport}
              disabled={importing || nonSkipped === 0}
              style={{
                backgroundColor: nonSkipped > 0 ? '#ea580c' : '#27272a',
                paddingVertical: 14,
                borderRadius: 10,
                alignItems: 'center',
              }}>
              {importing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text
                  style={{
                    color: nonSkipped > 0 ? '#fff' : '#52525b',
                    fontWeight: '700',
                    fontSize: 15,
                  }}>
                  Import {nonSkipped > 0 ? `${nonSkipped} ` : ''}
                  {mode === 'exercises' ? 'exercise' : 'routine'}
                  {nonSkipped !== 1 ? 's' : ''}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setPhase('compose')}
              style={{ alignItems: 'center', paddingVertical: 8 }}>
              <Text style={{ color: '#71717a', fontSize: 14 }}>← Back to paste</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        // ─── Compose ─────────────────────────────────────────────────────────
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled">
          {/* Step 1 */}
          <Text
            style={{
              color: '#71717a',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 10,
            }}>
            Step 1 — Give this prompt to your AI chatbot
          </Text>

          <View
            style={{
              backgroundColor: '#18181b',
              borderRadius: 10,
              padding: 14,
              marginBottom: 8,
            }}>
            {promptLoading ? (
              <ActivityIndicator color="#ea580c" />
            ) : (
              <Text
                style={{ color: '#a1a1aa', fontSize: 12, lineHeight: 18 }}
                numberOfLines={6}>
                {prompt}
              </Text>
            )}
          </View>

          {/* Include context toggle */}
          <TouchableOpacity
            onPress={() => setIncludeContext((v) => !v)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingVertical: 10,
              marginBottom: 10,
            }}>
            <View
              style={{
                width: 38,
                height: 22,
                borderRadius: 11,
                backgroundColor: includeContext ? '#ea580c' : '#27272a',
                justifyContent: 'center',
                paddingHorizontal: 2,
              }}>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: '#fff',
                  alignSelf: includeContext ? 'flex-end' : 'flex-start',
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fafafa', fontSize: 13, fontWeight: '600' }}>
                Include my current {mode} as context
              </Text>
              <Text style={{ color: '#52525b', fontSize: 12, marginTop: 1 }}>
                Lets the AI see and improve your existing {mode}
              </Text>
            </View>
            {includeContext && promptLoading && (
              <ActivityIndicator size="small" color="#ea580c" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSharePrompt}
            disabled={promptLoading}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: '#18181b',
              borderWidth: 1,
              borderColor: '#27272a',
              paddingVertical: 11,
              borderRadius: 10,
              marginBottom: 28,
            }}>
            <Copy size={15} color="#ea580c" />
            <Text style={{ color: '#ea580c', fontWeight: '600', fontSize: 14 }}>
              Share / Copy Prompt
            </Text>
          </TouchableOpacity>

          {/* Step 2 */}
          <Text
            style={{
              color: '#71717a',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 10,
            }}>
            Step 2 — Paste the AI response here
          </Text>

          <TextInput
            value={pastedText}
            onChangeText={setPastedText}
            placeholder="Paste AI response…"
            placeholderTextColor="#3f3f46"
            multiline
            style={{
              backgroundColor: '#18181b',
              borderRadius: 10,
              padding: 14,
              color: '#fafafa',
              fontSize: 13,
              fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
              minHeight: 160,
              textAlignVertical: 'top',
              marginBottom: 12,
            }}
          />

          <TouchableOpacity
            onPress={handleParse}
            disabled={parsing || !pastedText.trim()}
            style={{
              backgroundColor: pastedText.trim() ? '#ea580c' : '#27272a',
              paddingVertical: 14,
              borderRadius: 10,
              alignItems: 'center',
            }}>
            {parsing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text
                style={{
                  color: pastedText.trim() ? '#fff' : '#52525b',
                  fontWeight: '700',
                  fontSize: 15,
                }}>
                Parse &amp; Review
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

// ─── Conflict row components ──────────────────────────────────────────────────

function ExerciseConflictRow({
  conflict,
  onChange,
}: {
  conflict: ExerciseConflict;
  onChange: (r: Resolution) => void;
}) {
  const { item, existing, resolution } = conflict;
  const displayName = `${item.name} (${item.equipment}${item.equipmentVariant ? `, ${item.equipmentVariant}` : ''})`;
  const primaryMuscle = item.muscleEmphasis.find((m) => m.role === 'primary');

  return (
    <View
      style={{
        backgroundColor: '#18181b',
        borderRadius: 10,
        padding: 14,
        borderLeftWidth: 3,
        borderLeftColor: existing ? '#f97316' : '#22c55e',
        opacity: resolution === 'skip' ? 0.5 : 1,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View
          style={{
            backgroundColor: existing ? '#431407' : '#052e16',
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderRadius: 4,
          }}>
          <Text
            style={{
              color: existing ? '#fb923c' : '#4ade80',
              fontSize: 10,
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}>
            {existing ? 'exists' : 'new'}
          </Text>
        </View>
        <Text style={{ color: '#fafafa', fontWeight: '600', fontSize: 14, flex: 1 }} numberOfLines={1}>
          {displayName}
        </Text>
      </View>
      {primaryMuscle && (
        <Text style={{ color: '#71717a', fontSize: 12, marginTop: 4 }}>
          {primaryMuscle.muscle}{primaryMuscle.head ? ` · ${primaryMuscle.head}` : ''}{' '}
          · {item.muscleEmphasis.length} muscle{item.muscleEmphasis.length !== 1 ? 's' : ''}
        </Text>
      )}
      {existing && (
        <ResolutionToggle value={resolution} onChange={onChange} showUpdate />
      )}
    </View>
  );
}

function RoutineConflictRow({
  conflict,
  onChange,
}: {
  conflict: RoutineConflict;
  onChange: (r: Resolution) => void;
}) {
  const { item, existing, resolution } = conflict;
  const slotCount = item.slots.length;

  return (
    <View
      style={{
        backgroundColor: '#18181b',
        borderRadius: 10,
        padding: 14,
        borderLeftWidth: 3,
        borderLeftColor: existing ? '#f97316' : '#22c55e',
        opacity: resolution === 'skip' ? 0.5 : 1,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View
          style={{
            backgroundColor: existing ? '#431407' : '#052e16',
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderRadius: 4,
          }}>
          <Text
            style={{
              color: existing ? '#fb923c' : '#4ade80',
              fontSize: 10,
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}>
            {existing ? 'exists' : 'new'}
          </Text>
        </View>
        <Text style={{ color: '#fafafa', fontWeight: '600', fontSize: 14, flex: 1 }} numberOfLines={1}>
          {item.name}
        </Text>
      </View>
      {item.description ? (
        <Text style={{ color: '#71717a', fontSize: 12, marginTop: 4 }} numberOfLines={1}>
          {item.description}
        </Text>
      ) : null}
      <Text style={{ color: '#52525b', fontSize: 12, marginTop: 2 }}>
        {slotCount} exercise slot{slotCount !== 1 ? 's' : ''}
      </Text>
      {existing && (
        <ResolutionToggle value={resolution} onChange={onChange} showUpdate />
      )}
    </View>
  );
}
