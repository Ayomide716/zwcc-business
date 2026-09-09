/**
 * Choice inputs: radio group, checkbox, and a select that opens a sheet.
 *
 * A native picker is deliberately avoided — its look differs sharply between
 * iOS and Android and cannot be brand-styled. A sheet of large, tappable rows
 * is also easier to use one-handed, which matters for a long form.
 */
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MIN_TOUCH_TARGET, colors, radius, shadows, spacing } from '@/theme';

import { Text } from './Text';

export interface Option {
  value: string;
  label: string;
}

/* -------------------------------------------------------------------------- */
/* Field wrapper                                                               */
/* -------------------------------------------------------------------------- */

function FieldShell({
  label,
  required,
  error,
  helpText,
  children,
  style,
}: {
  label?: string;
  required?: boolean;
  error?: string | null;
  helpText?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ gap: spacing.xs }, style]}>
      {label ? (
        <View style={styles.labelRow}>
          <Text variant="label">{label}</Text>
          {required ? (
            <Text variant="label" color="danger" accessibilityLabel="required">
              {' *'}
            </Text>
          ) : (
            <Text variant="caption" muted>
              {'  Optional'}
            </Text>
          )}
        </View>
      ) : null}

      {children}

      {error ? (
        <Text variant="caption" color="dangerStrong" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : helpText ? (
        <Text variant="caption" muted>
          {helpText}
        </Text>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Radio group                                                                 */
/* -------------------------------------------------------------------------- */

export interface RadioGroupProps {
  label?: string;
  options: Option[];
  value?: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string | null;
  helpText?: string;
  style?: StyleProp<ViewStyle>;
}

export function RadioGroup({
  label,
  options,
  value,
  onChange,
  required,
  error,
  helpText,
  style,
}: RadioGroupProps) {
  return (
    <FieldShell
      label={label}
      required={required}
      error={error}
      helpText={helpText}
      style={style}
    >
      <View accessibilityRole="radiogroup" style={styles.optionList}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={option.label}
              style={({ pressed }) => [
                styles.optionRow,
                selected && styles.optionRowSelected,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                {selected ? <View style={styles.radioInner} /> : null}
              </View>
              <Text variant="body" style={styles.optionLabel}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </FieldShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Checkbox                                                                    */
/* -------------------------------------------------------------------------- */

export interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string | null;
  required?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Checkbox({ label, checked, onChange, error, style }: CheckboxProps) {
  return (
    <View style={style}>
      <Pressable
        onPress={() => onChange(!checked)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.checkboxRow,
          checked && styles.optionRowSelected,
          pressed && styles.pressed,
          error ? styles.erroredBorder : null,
        ]}
      >
        <View style={[styles.checkboxBox, checked && styles.checkboxBoxChecked]}>
          {checked ? <Ionicons name="checkmark" size={16} color={colors.onBrand} /> : null}
        </View>
        <Text variant="callout" style={styles.optionLabel}>
          {label}
        </Text>
      </Pressable>

      {error ? (
        <Text variant="caption" color="dangerStrong" style={{ marginTop: spacing.xs }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Select                                                                      */
/* -------------------------------------------------------------------------- */

export interface SelectProps {
  label?: string;
  options: Option[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: string | null;
  helpText?: string;
  /** Sheet title; defaults to the field label. */
  title?: string;
  style?: StyleProp<ViewStyle>;
}

export function Select({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  required,
  error,
  helpText,
  title,
  style,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const selected = options.find((option) => option.value === value);

  return (
    <FieldShell label={label} required={required} error={error} helpText={helpText} style={style}>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label ?? placeholder}
        accessibilityValue={{ text: selected?.label ?? 'Not selected' }}
        accessibilityHint="Opens a list of options"
        style={({ pressed }) => [
          styles.selectTrigger,
          error ? styles.erroredBorder : null,
          pressed && styles.pressed,
        ]}
      >
        <Text variant="body" color={selected ? 'text' : 'placeholder'} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close" />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.base) }]}>
          <View style={styles.sheetHandle} />
          <Text variant="title3" style={styles.sheetTitle}>
            {title ?? label ?? 'Select'}
          </Text>

          <FlatList
            data={options}
            keyExtractor={(option) => option.value}
            style={styles.sheetList}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isSelected = item.value === value;
              return (
                <Pressable
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
                >
                  <Text variant="body" color={isSelected ? 'brand' : 'text'}>
                    {item.label}
                  </Text>
                  {isSelected ? (
                    <Ionicons name="checkmark" size={20} color={colors.brand} />
                  ) : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </FieldShell>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionList: {
    gap: spacing.sm,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionRowSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSurface,
  },
  optionLabel: {
    flex: 1,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: colors.brand,
  },
  radioInner: {
    width: 11,
    height: 11,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: MIN_TOUCH_TARGET,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxBoxChecked: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  selectTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  erroredBorder: {
    borderColor: colors.danger,
  },
  pressed: {
    opacity: 0.7,
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.md,
    maxHeight: '70%',
    ...shadows.lg,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.md,
  },
  sheetTitle: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  sheetList: {
    paddingHorizontal: spacing.base,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
});
