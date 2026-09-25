/**
 * An email address field that helps with the mistakes phones make.
 *
 * - Spaces are removed as they are typed. Keyboards add one after an
 *   autocompleted word, and "name@gmail.com " failed the format check with
 *   nothing visibly wrong.
 * - Leaving the field trims and lower-cases the address, so what is saved is
 *   what the sign-in and the emails will use.
 * - A misspelled provider ("gmil.com") is answered with the likely address and
 *   a one-tap "Use it", rather than an error the person has to fix by retyping
 *   on a small keyboard.
 *
 * The suggestion waits until the field has been left once (or the form has
 *   already flagged it), because "gmail.co" is an ordinary moment on the way
 *   to typing "gmail.com" and should not be interrupted.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TextField, type TextFieldProps } from '@/components/ui/TextField';
import { Text } from '@/components/ui/Text';
import { colors, radius, spacing } from '@/theme';
import { suggestEmailCorrection } from '@/validation/email';

export type EmailFieldProps = Omit<TextFieldProps, 'onChangeText' | 'value'> & {
  value: string;
  onChangeText: (value: string) => void;
};

export function EmailField({ value, onChangeText, onBlur, error, ...rest }: EmailFieldProps) {
  const [left, setLeft] = useState(false);

  const suggestion = left || error ? suggestEmailCorrection(value) : null;

  return (
    <View style={styles.container}>
      <TextField
        keyboardType="email-address"
        inputMode="email"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        {...rest}
        value={value}
        onChangeText={(text) => onChangeText(text.replace(/\s+/g, ''))}
        onBlur={(event) => {
          setLeft(true);
          const tidy = value.trim().toLowerCase();
          if (tidy !== value) onChangeText(tidy);
          onBlur?.(event);
        }}
        // The suggestion below says it better than a second copy of the error.
        error={suggestion ? 'Check the spelling of your email address.' : error}
      />

      {suggestion ? (
        <Pressable
          onPress={() => onChangeText(suggestion)}
          style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Did you mean ${suggestion}? Use it`}
          hitSlop={6}
        >
          <Text variant="caption" color="textSecondary" style={styles.suggestionText}>
            Did you mean <Text variant="caption" color="text" style={styles.strong}>{suggestion}</Text>?
          </Text>
          <Text variant="label" color="brand">
            Use it
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandSurface,
  },
  pressed: { opacity: 0.7 },
  suggestionText: { flex: 1 },
  strong: { fontWeight: '600' },
});
