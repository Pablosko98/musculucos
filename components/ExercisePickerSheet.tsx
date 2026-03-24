import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  Dimensions,
  Animated,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { X, Plus } from 'lucide-react-native';
import type { Exercise } from '@/lib/exercises';
import { ExerciseDAL } from '@/lib/db';
import type { ExerciseStat } from '@/lib/db';
import { router } from 'expo-router';
import { setPendingExerciseCallback } from '@/lib/pending-exercise-add';
import {
  useExerciseFilters,
  ExerciseGroupCard,
  ExerciseFilterBar,
  ExerciseSearchBar,
  FavouritesPill,
  variantLabel,
  type ExerciseGroup,
} from '@/components/exercises/shared';

const { width, height: screenHeight } = Dimensions.get('window');

// ─── ExercisePickerSheet ──────────────────────────────────────────────────────

export type ExercisePickerSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Called on single-select (tap a variant). If undefined, multi-select only. */
  onSelect?: (ex: Exercise) => void;
  /** Called when superset staged list is confirmed. Enables superset mode toggle. */
  onSelectMultiple?: (exs: Exercise[]) => void;
  /** These variant IDs are dimmed and unselectable (already in slot). */
  excludeIds?: Set<string>;
  /**
   * If set, "+ Create exercise" navigates to /create_exercise and, on save, the new
   * exercise is passed back via callback.
   */
  createContext?: { type: 'workout'; dateString: string } | { type: 'callback'; onCreated: (ex: Exercise) => void };
};

export function ExercisePickerSheet({
  open,
  onClose,
  title = 'Select Exercise',
  onSelect,
  onSelectMultiple,
  excludeIds,
  createContext,
}: ExercisePickerSheetProps) {
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [stats, setStats] = useState<Record<string, ExerciseStat>>({});
  const [isSupersetMode, setIsSupersetMode] = useState(false);
  const [staged, setStaged] = useState<Exercise[]>([]);
  const [toastMessage, setToastMessage] = useState('');
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(message);
    Animated.timing(toastAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }, 2000);
  }, [toastAnim]);

  const filters = useExerciseFilters(allExercises);
  // Keep a ref to reset filters on close
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // Load exercises + stats when opened
  useEffect(() => {
    if (!open) return;
    Promise.all([ExerciseDAL.getAll(), ExerciseDAL.getExerciseStats()]).then(([exs, st]) => {
      setAllExercises(exs);
      setStats(st);
    });
  }, [open]);

  // Reset state on close
  useEffect(() => {
    if (!open) {
      filtersRef.current.setSearch('');
      filtersRef.current.setActiveGroup(null);
      filtersRef.current.setActiveSub(null);
      filtersRef.current.setActiveEquipment(null);
      filtersRef.current.setShowFavsOnly(false);
      setIsSupersetMode(false);
      setStaged([]);
    }
  }, [open]);

  const stagedIds = new Set(staged.map((e) => e.id));

  const handleSelect = useCallback((ex: Exercise) => {
    if (isSupersetMode) {
      setStaged((prev) =>
        prev.some((s) => s.id === ex.id) ? prev.filter((s) => s.id !== ex.id) : [...prev, ex]
      );
    } else {
      onSelect?.(ex);
      onClose();
    }
  }, [isSupersetMode, onSelect, onClose]);

  const handleHeaderPress = useCallback((group: ExerciseGroup) => {
    if (group.variants.length === 1) {
      handleSelect(group.variants[0]);
    } else {
      showToast('Select a variation below');
    }
  }, [handleSelect, showToast]);

  const handleConfirmSuperset = useCallback(() => {
    if (staged.length < 2) return;
    onSelectMultiple?.(staged);
    onClose();
  }, [staged, onSelectMultiple, onClose]);

  const handleCreateExercise = useCallback(() => {
    if (createContext?.type === 'workout') {
      onClose();
      setTimeout(() => router.push({
        pathname: '/create_exercise',
        params: { autoAdd: 'true', dateString: createContext.dateString },
      }), 350);
    } else if (createContext?.type === 'callback') {
      const { onCreated } = createContext;
      setPendingExerciseCallback((ids) => {
        ExerciseDAL.getAll().then((all) => {
          const ex = all.find((e) => e.id === ids[0]);
          if (ex) onCreated(ex);
        });
      });
      onClose();
      setTimeout(() => router.push({ pathname: '/create_exercise', params: { autoAdd: 'true' } }), 350);
    } else {
      onClose();
      setTimeout(() => router.push('/create_exercise'), 350);
    }
  }, [createContext, onClose]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="gap-0 p-0"
        showClose={false}
        style={{
          backgroundColor: '#1c1b22',
          borderColor: '#32303d',
          width: width - 24,
          height: screenHeight * 0.92,
          marginTop: 'auto',
          padding: 0,
          gap: 0,
        }}>
        {/* Drag handle */}
        <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 2 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#3d3b48' }} />
        </View>

        <View style={{ flex: 1 }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: 10,
            borderBottomWidth: 1,
            borderBottomColor: '#32303d',
          }}>
            <DialogTitle style={{ color: '#fafafa', fontSize: 20, fontWeight: '700', flex: 1, letterSpacing: -0.3 }}>
              {title}
            </DialogTitle>
            {onSelectMultiple && (
              <TouchableOpacity
                onPress={() => { setIsSupersetMode((v) => !v); setStaged([]); }}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 100,
                  marginRight: 10,
                  backgroundColor: isSupersetMode ? '#ea580c' : '#27272a',
                  borderWidth: 1,
                  borderColor: isSupersetMode ? '#ea580c' : '#3f3f46',
                }}>
                <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>
                  {isSupersetMode ? 'Superset ON' : 'Superset'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleCreateExercise}
              style={{
                padding: 8,
                backgroundColor: '#18181b',
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#27272a',
                marginRight: 8,
              }}>
              <Plus size={18} color="#ea580c" />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
              <X size={20} color="#71717a" />
            </TouchableOpacity>
          </View>

          {/* Search + Favourites */}
          <ExerciseSearchBar
            value={filters.search}
            onChangeText={filters.setSearch}
            style={{ marginHorizontal: 16, marginTop: 10, marginBottom: 6 }}
          />
          <FavouritesPill
            active={filters.showFavsOnly}
            onPress={() => filters.setShowFavsOnly(!filters.showFavsOnly)}
            style={{ marginHorizontal: 16, marginBottom: 8 }}
          />

          {/* Exercise list */}
          <FlatList
            data={filters.filteredGroups}
            keyExtractor={(item) => item.key}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={{ paddingTop: 60, alignItems: 'center' }}>
                <Text style={{ color: '#3f3f46', fontSize: 15 }}>No exercises found</Text>
              </View>
            }
            renderItem={({ item }) => (
              <ExerciseGroupCard
                group={item}
                stats={stats}
                onPressVariant={handleSelect}
                onPressHeader={handleHeaderPress}
                isVariantDisabled={(ex) => excludeIds?.has(ex.id) ?? false}
                getVariantRowStyle={(ex) => ({
                  backgroundColor: stagedIds.has(ex.id) ? 'rgba(234,88,12,0.12)' : 'transparent',
                  opacity: (excludeIds?.has(ex.id) ?? false) ? 0.35 : 1,
                })}
                getPillOverride={(ex) =>
                  stagedIds.has(ex.id) ? { bg: '#ea580c', text: 'white' } : null
                }
                renderVariantRight={(ex) =>
                  stagedIds.has(ex.id) ? (
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#ea580c' }} />
                  ) : null
                }
              />
            )}
          />

          {/* Superset confirm footer */}
          {isSupersetMode && staged.length >= 2 && (
            <TouchableOpacity
              onPress={handleConfirmSuperset}
              style={{
                margin: 16,
                marginTop: 0,
                padding: 16,
                backgroundColor: '#ea580c',
                borderRadius: 14,
                alignItems: 'center',
              }}>
              <Text style={{ color: 'white', fontSize: 15, fontWeight: '700' }}>
                Add Superset ({staged.length} exercises)
              </Text>
            </TouchableOpacity>
          )}

          {/* Filter bar */}
          <ExerciseFilterBar
            equipmentOptions={filters.equipmentOptions}
            activeEquipment={filters.activeEquipment}
            setActiveEquipment={filters.setActiveEquipment}
            subHeight={filters.subHeight}
            subOpacity={filters.subOpacity}
            subOptions={filters.subOptions}
            activeSub={filters.activeSub}
            setActiveSub={filters.setActiveSub}
            activeGroup={filters.activeGroup}
            lastGroupRef={filters.lastGroupRef}
            muscleGroups={filters.muscleGroups}
            handleGroupPress={filters.handleGroupPress}
            bottomInset={12}
          />

          {/* Floating toast */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: 100,
              alignSelf: 'center',
              opacity: toastAnim,
              transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
              backgroundColor: '#27272a',
              borderRadius: 100,
              paddingHorizontal: 16,
              paddingVertical: 9,
              borderWidth: 1,
              borderColor: '#3f3f46',
            }}>
            <Text style={{ color: '#d4d4d8', fontSize: 14, fontWeight: '500' }}>{toastMessage}</Text>
          </Animated.View>
        </View>
      </DialogContent>
    </Dialog>
  );
}
