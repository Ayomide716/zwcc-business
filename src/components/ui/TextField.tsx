/**
 * Text input with a label, help text, error state and character counter.
 *
 * The error is rendered as text, not just a red border: colour alone is not an
 * accessible way to signal a problem, and `accessibilityLiveRegion` means a
 * screen reader announces it when it appears.
 */
import { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { MIN_TOUCH_TARGET, colors, radius, spacing, typography } from '@/theme';

import { Text } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  helpText?: string;
  error?: string | null;
  required?: boolean;
  /** Renders a taller box and enables multiline. */
  rows?: number;
  maxLength?: number;
  showCounter?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  /** Text shown inside the field's leading edge, e.g. a currency symbol. */
  prefix?: string;
}

export function TextField({
  label,
  helpText,
  error,
  required,
  rows,
  maxLength,
  showCounter,
  containerStyle,
  prefix,
  value,
  onFocus,
  onBlur,
  ...rest
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const multiline = Boolean(rows && rows > 1);
  const characterCount = typeof value === 'string' ? value.length : 0;

  return (
    <View style={[styles.container, containerStyle]}>
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

      <View
        style={[
          styles.inputWrapper,
          multiline && { minHeight: 22 * rows! + spacing.lg },
          focused && styles.focused,
          error ? styles.errored : null,
        ]}
      >
        {prefix ? (
          <Text variant="body" muted style={styles.prefix}>
            {prefix}
          </Text>
        ) : null}

        <TextInput
          {...rest}
          value={value}
          multiline={multiline}
          maxLength={maxLength}
          textAlignVertical={multiline ? 'top' : 'center'}
          placeholderTextColor={colors.placeholder}
          style={[styles.input, multiline && styles.inputMultiline]}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          accessibilityLabel={label}
          accessibilityHint={helpText}
          // Announces the field as invalid rather than relying on the red border.
          accessibilityState={{ disabled: rest.editable === false }}
        />
      </View>

      <View style={styles.footerRow}>
        <View style={styles.footerText}>
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

        {showCounter && maxLength ? (
          <Text
            variant="caption"
            color={characterCount > maxLength * 0.9 ? 'warningStrong' : 'textMuted'}
          >
            {characterCount}/{maxLength}
          </Text>
        ) : null}
      </View>
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
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  focused: {
    borderColor: colors.focusRing,
    borderWidth: 2,
    // Compensate so the field does not shift when the border thickens.
    paddingHorizontal: spacing.md - 1,
  },
  errored: {
    borderColor: colors.danger,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    color: colors.text,
    ...typography.body,
  },
  inputMultiline: {
    paddingTop: spacing.md,
  },
  prefix: {
    marginRight: spacing.xs,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  footerText: {
    flex: 1,
  },
});
