import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { ChevronLeft, ChevronDown, ChevronUp, Copy, Share2, TriangleAlert } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { ExerciseDAL, RoutineDAL } from '@/lib/db';
import type { Exercise } from '@/lib/exercises';
import type { Routine } from '@/lib/types';
import {
  EXERCISE_IMPORT_PROMPT,
  PASTE_CHAR_LIMIT,
  ROUTINE_IMPORT_SCHEMA,
  applyExerciseImport,
  applyRoutineImport,
  buildRoutineImportPrompt,
  detectExerciseConflicts,
  detectRoutineConflicts,
  exDisplayName,
  exportExercisesAI,
  exportRoutinesAI,
  parseAIImport,
  type ExerciseConflict,
  type RoutineConflict,
} from '@/lib/ai-format';
import { CheckRow, SelectAllBar, SelectionSearch } from '@/components/AiSelection';

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

// ─── Collapsible selection panel ───────────────────────────────────────────────

function SelectionPanel({
  title,
  badge,
  allItems,
  selectedIds,
  search,
  onSearch,
  onToggle,
  onSelectAll,
  onDeselectAll,
  renderLabel,
  renderSub,
}: {
  title: string;
  badge?: string;
  allItems: { id: string }[];
  selectedIds: Set<string>;
  search: string;
  onSearch: (t: string) => void;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  renderLabel: (item: any) => string;
  renderSub?: (item: any) => string | undefined;
}) {
  const [open, setOpen] = useState(true);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return allItems;
    return allItems.filter((item: any) =>
      renderLabel(item).toLowerCase().includes(q) ||
      (renderSub?.(item) ?? '').toLowerCase().includes(q)
    );
  }, [allItems, search]);

  return (
    <View
      style={{
        backgroundColor: '#18181b',
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 12,
      }}>
      {/* Header row */}
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: 12,
          gap: 8,
        }}>
        <Text style={{ color: '#fafafa', fontWeight: '600', fontSize: 14, flex: 1 }}>
          {title}
        </Text>
        {badge ? (
          <View
            style={{
              backgroundColor: '#27272a',
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}>
            <Text style={{ color: '#a1a1aa', fontSize: 12, fontWeight: '600' }}>{badge}</Text>
          </View>
        ) : null}
        {open ? (
          <ChevronUp size={16} color="#52525b" />
        ) : (
          <ChevronDown size={16} color="#52525b" />
        )}
      </TouchableOpacity>

      {open && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
          <SelectionSearch value={search} onChangeText={onSearch} />
          <SelectAllBar
            total={allItems.length}
            selected={selectedIds.size}
            onSelectAll={onSelectAll}
            onDeselectAll={onDeselectAll}
          />
          {filtered.map((item: any) => (
            <CheckRow
              key={item.id}
              label={renderLabel(item)}
              sub={renderSub?.(item)}
              checked={selectedIds.has(item.id)}
              onToggle={() => onToggle(item.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AIImport() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('exercises');
  const [sharing, setSharing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [includeContext, setIncludeContext] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [phase, setPhase] = useState<Phase>('compose');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exerciseConflicts, setExerciseConflicts] = useState<ExerciseConflict[]>([]);
  const [routineConflicts, setRoutineConflicts] = useState<RoutineConflict[]>([]);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

  // Data
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [allRoutines, setAllRoutines] = useState<Routine[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Selection state
  const [selectedExIds, setSelectedExIds] = useState<Set<string>>(new Set());
  const [usedInRoutinesIds, setUsedInRoutinesIds] = useState<Set<string>>(new Set());
  const [selectedRoutineIds, setSelectedRoutineIds] = useState<Set<string>>(new Set());
  const [exSearch, setExSearch] = useState('');
  const [routineSearch, setRoutineSearch] = useState('');

  useEffect(() => {
    Promise.all([ExerciseDAL.getAll(), RoutineDAL.getAll()]).then(([exs, routines]) => {
      setAllExercises(exs);
      setAllRoutines(routines);
      const usedInRoutines = new Set<string>();
      for (const r of routines) {
        for (const re of r.exercises) {
          for (const group of re.exerciseGroups) {
            for (const id of group) usedInRoutines.add(id);
          }
        }
      }
      setUsedInRoutinesIds(usedInRoutines);
      setSelectedExIds(new Set(exs.map((e) => e.id)));
      setSelectedRoutineIds(new Set(routines.map((r) => r.id)));
      setDataLoading(false);
    });
  }, []);

  function switchMode(m: Mode) {
    if (m === mode) return;
    setMode(m);
    setPhase('compose');
    setPastedText('');
    setExerciseConflicts([]);
    setRoutineConflicts([]);
  }

  // ─── Build prompt ──────────────────────────────────────────────────────────

  async function buildPrompt(): Promise<string> {
    let finalPrompt: string;
    if (mode === 'exercises') {
      finalPrompt = EXERCISE_IMPORT_PROMPT;
      if (includeContext) {
        const data = await exportExercisesAI([...selectedExIds]);
        finalPrompt += `\n\nHere are my current exercises for reference:\n${data}`;
      }
    } else {
      finalPrompt = await buildRoutineImportPrompt([...usedInRoutinesIds]);
      if (includeContext) {
        const data = await exportRoutinesAI([...selectedRoutineIds]);
        finalPrompt += `\n\nHere are my current routines for reference:\n${data}`;
      }
    }
    return finalPrompt;
  }

  async function handleSharePrompt() {
    setSharing(true);
    try {
      await Share.share({ message: await buildPrompt() });
    } catch {
    } finally {
      setSharing(false);
    }
  }

  async function handleCopyPrompt() {
    setCopying(true);
    try {
      await Clipboard.setStringAsync(await buildPrompt());
    } catch (e: any) {
      Alert.alert('Copy failed', e?.message ?? 'Unknown error');
    } finally {
      setCopying(false);
    }
  }

  // ─── Parse ─────────────────────────────────────────────────────────────────

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
          Alert.alert('Wrong type', 'The pasted response contains exercises, but Routines mode is active.');
          return;
        }
        setExerciseConflicts(await detectExerciseConflicts(parsed.items));
      } else {
        if (mode !== 'routines') {
          Alert.alert('Wrong type', 'The pasted response contains routines, but Exercises mode is active.');
          return;
        }
        setRoutineConflicts(await detectRoutineConflicts(parsed.items));
      }
      setPhase('review');
    } finally {
      setParsing(false);
    }
  }

  // ─── Import ────────────────────────────────────────────────────────────────

  async function handleImport() {
    setImporting(true);
    try {
      const r =
        mode === 'exercises'
          ? await applyExerciseImport(exerciseConflicts)
          : await applyRoutineImport(routineConflicts, allExercises);
      setResult(r);
      setPhase('done');
    } catch (e: any) {
      Alert.alert('Import failed', e?.message ?? 'Unknown error');
    } finally {
      setImporting(false);
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const conflicts = mode === 'exercises' ? exerciseConflicts : routineConflicts;
  const nonSkipped = conflicts.filter((c) => c.resolution !== 'skip').length;
  const conflictCount = conflicts.filter((c) => c.existing !== null).length;

  const promptSummary =
    mode === 'exercises'
      ? includeContext
        ? `${selectedExIds.size} exercise${selectedExIds.size !== 1 ? 's' : ''} included as context`
        : null
      : `${usedInRoutinesIds.size} exercise${usedInRoutinesIds.size !== 1 ? 's' : ''} available to AI${includeContext ? ` · ${selectedRoutineIds.size} routine${selectedRoutineIds.size !== 1 ? 's' : ''} as context` : ''}`;

  // Rough character estimate — avoids async rebuild on every selection change
  // Per-exercise in JSON context ≈ 250 chars; per exercise in name list ≈ 28 chars; per routine ≈ 400 chars
  const estimatedChars = useMemo(() => {
    if (mode === 'exercises') {
      return (
        EXERCISE_IMPORT_PROMPT.length +
        (includeContext ? selectedExIds.size * 250 + 100 : 0)
      );
    }
    const exList = usedInRoutinesIds.size * 28;
    const base = ROUTINE_IMPORT_SCHEMA.length + exList + 80;
    return base + (includeContext ? selectedRoutineIds.size * 400 + 100 : 0);
  }, [mode, includeContext, selectedExIds.size, usedInRoutinesIds.size, selectedRoutineIds.size]);

  const promptTooLarge = estimatedChars > PASTE_CHAR_LIMIT;

  // ─── Layout ────────────────────────────────────────────────────────────────

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

      {/* Phase content */}
      {phase === 'done' && result ? (
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
            style={{ backgroundColor: '#ea580c', paddingHorizontal: 32, paddingVertical: 13, borderRadius: 10 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Done</Text>
          </TouchableOpacity>
        </View>

      ) : phase === 'review' ? (
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
                    onChange={(r) =>
                      setExerciseConflicts((prev) => {
                        const next = [...prev];
                        next[i] = { ...next[i], resolution: r };
                        return next;
                      })
                    }
                  />
                ))
              : routineConflicts.map((c, i) => (
                  <RoutineConflictRow
                    key={i}
                    conflict={c}
                    onChange={(r) =>
                      setRoutineConflicts((prev) => {
                        const next = [...prev];
                        next[i] = { ...next[i], resolution: r };
                        return next;
                      })
                    }
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
                <Text style={{ color: nonSkipped > 0 ? '#fff' : '#52525b', fontWeight: '700', fontSize: 15 }}>
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
        // ─── Compose ────────────────────────────────────────────────────────
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled">

          {/* ── Step 1: prompt ─────────────────────────────────────────── */}
          <Text style={{ color: '#71717a', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            Step 1 — Give this prompt to your AI chatbot
          </Text>

          {/* Prompt preview */}
          <View style={{ backgroundColor: '#18181b', borderRadius: 10, padding: 14, marginBottom: 8 }}>
            <Text style={{ color: '#a1a1aa', fontSize: 12, lineHeight: 18 }} numberOfLines={5}>
              {mode === 'exercises' ? EXERCISE_IMPORT_PROMPT : ROUTINE_IMPORT_SCHEMA}
            </Text>
          </View>

          {/* Prompt summary badge */}
          {promptSummary && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: '#18181b',
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 7,
                marginBottom: 10,
                alignSelf: 'flex-start',
              }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#ea580c' }} />
              <Text style={{ color: '#a1a1aa', fontSize: 12 }}>{promptSummary}</Text>
            </View>
          )}

          {/* ── Exercise selection ──────────────────────────────────────── */}
          {dataLoading ? (
            <ActivityIndicator color="#ea580c" style={{ marginVertical: 12 }} />
          ) : (
            <>
              {/* Include context toggle */}
              <TouchableOpacity
                onPress={() => setIncludeContext((v) => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, marginBottom: 8 }}>
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
              </TouchableOpacity>

              {/* Context pickers (shown when toggle is on) */}
              {includeContext && mode === 'exercises' && (
                <SelectionPanel
                  title="Exercises to include as context"
                  badge={`${selectedExIds.size}/${allExercises.length}`}
                  allItems={allExercises}
                  selectedIds={selectedExIds}
                  search={exSearch}
                  onSearch={setExSearch}
                  onToggle={(id) =>
                    setSelectedExIds((prev) => {
                      const next = new Set(prev);
                      next.has(id) ? next.delete(id) : next.add(id);
                      return next;
                    })
                  }
                  onSelectAll={() => setSelectedExIds(new Set(allExercises.map((e) => e.id)))}
                  onDeselectAll={() => setSelectedExIds(new Set())}
                  renderLabel={(ex: Exercise) => ex.name}
                  renderSub={(ex: Exercise) => exDisplayName(ex).match(/\((.+)\)/)?.[1]}
                />
              )}

              {includeContext && mode === 'routines' && (
                <SelectionPanel
                  title="Routines to include as context"
                  badge={`${selectedRoutineIds.size}/${allRoutines.length}`}
                  allItems={allRoutines}
                  selectedIds={selectedRoutineIds}
                  search={routineSearch}
                  onSearch={setRoutineSearch}
                  onToggle={(id) =>
                    setSelectedRoutineIds((prev) => {
                      const next = new Set(prev);
                      next.has(id) ? next.delete(id) : next.add(id);
                      return next;
                    })
                  }
                  onSelectAll={() => setSelectedRoutineIds(new Set(allRoutines.map((r) => r.id)))}
                  onDeselectAll={() => setSelectedRoutineIds(new Set())}
                  renderLabel={(r: Routine) => r.name}
                  renderSub={(r: Routine) =>
                    r.description || `${r.exercises.length} slot${r.exercises.length !== 1 ? 's' : ''}`
                  }
                />
              )}
            </>
          )}

          {/* Size warning */}
          {promptTooLarge && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 8,
                backgroundColor: '#2d1a06',
                borderWidth: 1,
                borderColor: '#92400e',
                borderRadius: 8,
                padding: 10,
                marginTop: 4,
                marginBottom: 8,
              }}>
              <TriangleAlert size={14} color="#fb923c" style={{ marginTop: 1 }} />
              <Text style={{ color: '#fb923c', fontSize: 13, flex: 1, lineHeight: 18 }}>
                Too large to copy (~{Math.round(estimatedChars / 1000)}K chars). Use Share or deselect items to bring it under {PASTE_CHAR_LIMIT / 1000}K.
              </Text>
            </View>
          )}

          {/* Prompt action buttons */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 28 }}>
            {!promptTooLarge && (
              <TouchableOpacity
                onPress={handleCopyPrompt}
                disabled={copying || sharing}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  backgroundColor: '#18181b',
                  borderWidth: 1,
                  borderColor: '#27272a',
                  paddingVertical: 11,
                  borderRadius: 10,
                }}>
                {copying ? (
                  <ActivityIndicator size="small" color="#ea580c" />
                ) : (
                  <>
                    <Copy size={14} color="#ea580c" />
                    <Text style={{ color: '#ea580c', fontWeight: '600', fontSize: 14 }}>Copy</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleSharePrompt}
              disabled={sharing || copying}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                backgroundColor: '#18181b',
                borderWidth: 1,
                borderColor: '#27272a',
                paddingVertical: 11,
                borderRadius: 10,
              }}>
              {sharing ? (
                <ActivityIndicator size="small" color="#ea580c" />
              ) : (
                <>
                  <Share2 size={14} color="#ea580c" />
                  <Text style={{ color: '#ea580c', fontWeight: '600', fontSize: 14 }}>Share</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Step 2: paste ───────────────────────────────────────────── */}
          <Text style={{ color: '#71717a', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
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
              <Text style={{ color: pastedText.trim() ? '#fff' : '#52525b', fontWeight: '700', fontSize: 15 }}>
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
        <View style={{ backgroundColor: existing ? '#431407' : '#052e16', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 }}>
          <Text style={{ color: existing ? '#fb923c' : '#4ade80', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
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
      {existing && <ResolutionToggle value={resolution} onChange={onChange} showUpdate />}
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
        <View style={{ backgroundColor: existing ? '#431407' : '#052e16', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 }}>
          <Text style={{ color: existing ? '#fb923c' : '#4ade80', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
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
        {item.slots.length} slot{item.slots.length !== 1 ? 's' : ''}
      </Text>
      {existing && <ResolutionToggle value={resolution} onChange={onChange} showUpdate />}
    </View>
  );
}
