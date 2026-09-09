/**
 * Transient feedback.
 *
 * `toast.error(unknownError)` accepts anything thrown anywhere and renders the
 * mapped, human-readable sentence — so no screen has to remember to call
 * `toUserError` before showing a failure.
 */
import { Ionicons } from '@expo/vector-icons';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { toUserError } from '@/lib/errors';
import { colors, radius, shadows, spacing } from '@/theme';

type ToastTone = 'success' | 'error' | 'info';

interface ToastState {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
}

interface ToastContextValue {
  success: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  /** Accepts a raw thrown value and renders the user-safe message. */
  error: (error: unknown, fallbackTitle?: string) => void;
  dismiss: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, { bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  success: { bg: colors.successStrong, icon: 'checkmark-circle' },
  error: { bg: colors.dangerStrong, icon: 'alert-circle' },
  info: { bg: colors.brand, icon: 'information-circle' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const insets = useSafeAreaInsets();
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);

  const show = useCallback((tone: ToastTone, title: string, message?: string) => {
    if (timeout.current) clearTimeout(timeout.current);

    nextId.current += 1;
    setToast({ id: nextId.current, tone, title, message });

    // Errors linger, successes get out of the way.
    timeout.current = setTimeout(() => setToast(null), tone === 'error' ? 6000 : 3500);
  }, []);

  const dismiss = useCallback(() => {
    if (timeout.current) clearTimeout(timeout.current);
    setToast(null);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (title, message) => show('success', title, message),
      info: (title, message) => show('info', title, message),
      error: (error, fallbackTitle) => {
        const userError = toUserError(error);
        show('error', fallbackTitle ?? userError.title, userError.message);
      },
      dismiss,
    }),
    [show, dismiss],
  );

  const palette = toast ? TONE_STYLES[toast.tone] : null;

  return (
    <ToastContext.Provider value={value}>
      {children}

      {toast && palette ? (
        <Animated.View
          key={toast.id}
          entering={FadeInUp.duration(220)}
          exiting={FadeOutUp.duration(180)}
          style={[styles.wrapper, { top: insets.top + spacing.sm }]}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={dismiss}
            accessibilityRole="alert"
            accessibilityLabel={`${toast.title}. ${toast.message ?? ''}`}
            style={[styles.toast, { backgroundColor: palette.bg }]}
          >
            <Ionicons name={palette.icon} size={20} color={colors.textInverse} />
            <View style={styles.body}>
              <Text variant="bodyMedium" color="textInverse">
                {toast.title}
              </Text>
              {toast.message ? (
                <Text variant="caption" color="textOnBrandMuted">
                  {toast.message}
                </Text>
              ) : null}
            </View>
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastProvider.');
  return context;
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: spacing.base,
    right: spacing.base,
    zIndex: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.md,
    ...shadows.lg,
  },
  body: {
    flex: 1,
    gap: spacing.xxs,
  },
});
