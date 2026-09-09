/**
 * The registration code, displayed prominently (brief §12).
 *
 * Presentation choices that matter: the code is set in a monospaced-feeling
 * letter-spaced style so characters are unambiguous when read aloud, it is
 * copyable, and it is exposed to screen readers character by character rather
 * than as an unpronounceable word.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { colors, radius, spacing } from '@/theme';

export interface RegistrationCodeCardProps {
  code: string;
  /** Shows the "keep this safe" guidance. */
  showGuidance?: boolean;
  onCopied?: () => void;
}

export function RegistrationCodeCard({
  code,
  showGuidance = true,
  onCopied,
}: RegistrationCodeCardProps) {
  const handleCopy = async () => {
    await Clipboard.setStringAsync(code);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onCopied?.();
  };

  return (
    <Card variant="brand" padding="lg" style={styles.card}>
      <Text variant="overline" color="textOnBrandMuted">
        REGISTRATION CODE
      </Text>

      <Pressable
        onPress={handleCopy}
        accessibilityRole="button"
        accessibilityLabel={`Registration code ${code.split('').join(' ')}`}
        accessibilityHint="Double tap to copy"
        style={({ pressed }) => [styles.codeRow, pressed && styles.pressed]}
      >
        <Text
          variant="title1"
          color="onBrand"
          style={styles.code}
          selectable
          // The code must read as one unbroken string. Wrapping split it mid-code
          // on narrower phones, which invites someone to copy down half of it.
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {code}
        </Text>
        <Ionicons name="copy-outline" size={18} color={colors.textOnBrandMuted} />
      </Pressable>

      {showGuidance ? (
        <View style={styles.guidance}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.accent} />
          <Text variant="caption" color="textOnBrandMuted" style={styles.guidanceText}>
            Please keep this code safe. You may need it for future verification.
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  pressed: {
    opacity: 0.75,
  },
  code: {
    // Wide tracking so 4 / A / 7 stay distinguishable when read out.
    letterSpacing: 1.5,
    flex: 1,
  },
  guidance: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  guidanceText: {
    flex: 1,
  },
});
