import React from 'react';
import { TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

// ─── Single selectable row ────────────────────────────────────────────────────

export const CheckRow = React.memo(function CheckRow({
  label,
  sub,
  checked,
  onToggle,
}: {
  label: string;
  sub?: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 12 }}>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: checked ? 0 : 1.5,
          borderColor: '#3f3f46',
          backgroundColor: checked ? '#ea580c' : 'transparent',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
        {checked && <Check size={14} color="#fff" strokeWidth={3} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fafafa', fontSize: 14 }} numberOfLines={1}>
          {label}
        </Text>
        {sub ? (
          <Text style={{ color: '#52525b', fontSize: 12, marginTop: 1 }} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

// ─── Select-all / none bar ────────────────────────────────────────────────────

export function SelectAllBar({
  total,
  selected,
  onSelectAll,
  onDeselectAll,
}: {
  total: number;
  selected: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
      }}>
      <Text style={{ color: '#71717a', fontSize: 13 }}>
        {t('selection.selected', { selected, total })}
      </Text>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <TouchableOpacity onPress={onSelectAll}>
          <Text style={{ color: '#ea580c', fontSize: 13, fontWeight: '600' }}>{t('selection.all')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDeselectAll}>
          <Text style={{ color: '#52525b', fontSize: 13, fontWeight: '600' }}>{t('selection.none')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Search input ─────────────────────────────────────────────────────────────

export function SelectionSearch({
  value,
  onChangeText,
  placeholder = 'Search…',
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#3f3f46"
      style={{
        backgroundColor: '#27272a',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        color: '#fafafa',
        fontSize: 14,
        marginBottom: 2,
      }}
    />
  );
}
