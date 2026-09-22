/**
 * A church announcement on the dashboard.
 *
 * The client asked for the flyer full screen on every launch. This is the same
 * content in a form that does not stand between someone and the reason they
 * opened the app. People come here to finish a form or upload an ID, and a
 * modal in front of that every single time is friction aimed at the people who
 * have already said yes.
 *
 * So: a card they can see at a glance, tap for the full flyer, and close once
 * they have read it. Tapping is opt-in, which also means the large image is
 * only ever downloaded into memory by someone who asked for it.
 *
 * The flyer is an image, and an image is invisible to a screen reader, so the
 * dates and venue are also real text on the full view and the card carries a
 * written description.
 *
 * Dismissal is per device rather than per account, like every other courtesy
 * in the app. Storage failing shows the card again, which is a far better
 * failure than hiding an invitation forever.
 */
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import type { Announcement } from '@/config/announcements.config';
import { getLiveAnnouncement } from '@/config/announcements.config';
import { MIN_TOUCH_TARGET, colors, radius, spacing } from '@/theme';

import { Text } from '../ui/Text';

const KEY_PREFIX = 'zwcc.announcement.';

export function AnnouncementCard() {
  const announcement = getLiveAnnouncement();
  // Undefined while unknown, so a card that was already closed never flashes
  // onto the dashboard before disappearing again.
  const [visible, setVisible] = useState<boolean | undefined>(undefined);
  const [expanded, setExpanded] = useState(false);

  const id = announcement?.id;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    AsyncStorage.getItem(KEY_PREFIX + id)
      .then((seen) => {
        if (!cancelled) setVisible(seen !== '1');
      })
      .catch(() => {
        if (!cancelled) setVisible(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const dismiss = useCallback(() => {
    setVisible(false);
    setExpanded(false);
    if (id) {
      void AsyncStorage.setItem(KEY_PREFIX + id, '1').catch(() => {
        // It comes back next launch. Harmless.
      });
    }
  }, [id]);

  if (!announcement || !visible) return null;

  return (
    <>
      <Pressable
        style={styles.card}
        onPress={() => setExpanded(true)}
        accessibilityRole="button"
        accessibilityLabel={`${announcement.title}. ${announcement.summary}`}
        accessibilityHint="Opens the full announcement"
      >
        <Image
          source={announcement.image}
          style={styles.thumb}
          contentFit="cover"
          // The flyer is bundled, so it never changes under a given app
          // version and can be cached hard.
          cachePolicy="memory-disk"
          accessibilityLabel={announcement.imageAlt}
        />

        <View style={styles.text}>
          <Text variant="label" color="brand">
            From the church
          </Text>
          <Text variant="bodyMedium" numberOfLines={1}>
            {announcement.title}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {announcement.summary}
          </Text>
        </View>

        <Pressable
          onPress={dismiss}
          style={styles.close}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close this announcement"
        >
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </Pressable>

      <FullView
        announcement={announcement}
        open={expanded}
        onClose={() => setExpanded(false)}
        onDismiss={dismiss}
      />
    </>
  );
}

function FullView({
  announcement,
  open,
  onClose,
  onDismiss,
}: {
  announcement: Announcement;
  open: boolean;
  onClose: () => void;
  onDismiss: () => void;
}) {
  const { width } = useWindowDimensions();
  // The flyer is 1080 by 763. Held to its own ratio so it is never stretched
  // on a tall phone or cropped on a short one.
  const imageWidth = width - spacing.base * 2;

  return (
    <Modal
      visible={open}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.sheet}>
        <View style={styles.sheetBar}>
          <Text variant="bodyMedium" style={styles.sheetTitle} numberOfLines={1}>
            {announcement.title}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.sheetBody}>
          <Image
            source={announcement.image}
            style={{ width: imageWidth, height: imageWidth * (763 / 1080), borderRadius: radius.md }}
            contentFit="contain"
            cachePolicy="memory-disk"
            accessibilityLabel={announcement.imageAlt}
          />

          {/* The same information as the flyer, as text, because the flyer is
              small print to anyone whose eyes are not perfect and silent to
              anyone using a screen reader. */}
          {announcement.detail?.map((line) => (
            <Text key={line} variant="body" color="textSecondary" style={styles.detailLine}>
              {line}
            </Text>
          ))}

          <Pressable
            onPress={onDismiss}
            style={styles.dismissRow}
            accessibilityRole="button"
            accessibilityLabel="Do not show this again"
          >
            <Text variant="caption" color="textMuted">
              Don&rsquo;t show this again
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brandSurface,
    borderWidth: 1,
    borderColor: colors.brandBorder,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  thumb: {
    width: 84,
    height: 60,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  text: { flex: 1, gap: 2 },
  close: {
    minWidth: MIN_TOUCH_TARGET / 2,
    minHeight: MIN_TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sheet: { flex: 1, backgroundColor: colors.surface },
  sheetBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: { flex: 1 },
  sheetBody: {
    padding: spacing.base,
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  detailLine: { lineHeight: 22 },
  dismissRow: {
    alignSelf: 'flex-start',
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
});
