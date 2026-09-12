/**
 * Date input backed by the platform's own date picker.
 *
 * Typing a date is the single most error-prone thing we can ask for on a
 * phone: people write 23/04/1990, 04-23-90 or 23 April 1990, all of which a
 * `YYYY-MM-DD` text box rejects with an unhelpful "enter a valid date". The
 * field is therefore a button that opens the native picker, so an invalid
 * date cannot be produced in the first place.
 *
 * The value stays a `YYYY-MM-DD` string, so storage and validation are
 * unchanged.
 */
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { parseISODate, toISODate } from '@/lib/date';
import { formatDate } from '@/lib/format';
import { MIN_TOUCH_TARGET, colors, radius, spacing } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

export interface DateFieldProps {
  label?: string;
  /** `YYYY-MM-DD`, or empty when unanswered. */
  value: string;
  onChange: (value: string) => void;
  helpText?: string;
  error?: string | null;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  /** Where the picker opens first when nothing is chosen yet. */
  defaultDate?: Date;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export function DateField({
  label,
  value,
  onChange,
  helpText,
  error,
  required,
  disabled = false,
  placeholder = 'Tap to choose a date',
  minimumDate,
  maximumDate,
  defaultDate,
  containerStyle,
  testID,
}: DateFieldProps) {
  const selected = parseISODate(value);

  // iOS keeps the spinner inline until confirmed; Android shows a modal dialog
  // that dismisses itself, so `open` is short-lived there.
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date | null>(null);

  const initial = selected ?? defaultDate ?? maximumDate ?? new Date();

  function handleChange(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') {
      setOpen(false);
      if (event.type === 'set' && date) onChange(toISODate(date));
      return;
    }
    if (date) setDraft(date);
  }

  function confirm() {
    if (draft) onChange(toISODate(draft));
    setDraft(null);
    setOpen(false);
  }

  function cancel() {
    setDraft(null);
    setOpen(false);
  }

  return (
    <View style={[styles.container, containerStyle]} testID={testID}>
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

      <Pressable
        onPress={() => {
          if (!disabled) {
            setDraft(initial);
            setOpen(true);
          }
        }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label ?? 'Choose a date'}
        accessibilityValue={{ text: selected ? formatDate(selected) : 'Not set' }}
        accessibilityHint={helpText}
        accessibilityState={{ disabled }}
        style={({ pressed }) => [
          styles.field,
          error ? styles.errored : null,
          disabled && styles.disabled,
          pressed && !disabled && styles.pressed,
        ]}
      >
        <Text variant="body" style={selected ? undefined : styles.placeholder}>
          {selected ? formatDate(selected) : placeholder}
        </Text>
        <Ionicons
          name="calendar-outline"
          size={20}
          color={disabled ? colors.placeholder : colors.brand}
        />
      </Pressable>

      {error ? (
        <Text variant="caption" color="dangerStrong" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : helpText ? (
        <Text variant="caption" muted>
          {helpText}
        </Text>
      ) : null}

      {open ? (
        <>
          <DateTimePicker
            value={draft ?? initial}
            mode="date"
            /*
              Android gets its own standard dialog, iOS the inline spinner.

              Both platforms used to get the spinner, chosen so a birth year
              decades back could be dialled rather than scrolled to. On Android
              that renders a dialog this app draws no part of, and under the
              edge-to-edge theme its confirm button came out invisible — an
              unusable date field, which is worse than a longer path to 1985.
              The platform dialog is the well-trodden one, and its header year
              is tappable, so a distant year is two taps rather than a scroll.
            */
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onChange={handleChange}
          />

          {Platform.OS === 'ios' ? (
            <View style={styles.iosActions}>
              <Button label="Cancel" variant="ghost" size="sm" onPress={cancel} />
              <Button label="Use this date" size="sm" onPress={confirm} />
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  pressed: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSurface,
  },
  errored: {
    borderColor: colors.danger,
  },
  disabled: {
    backgroundColor: colors.background,
  },
  placeholder: {
    color: colors.placeholder,
  },
  iosActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
