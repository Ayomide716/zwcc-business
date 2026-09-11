/**
 * Full-screen viewer for an applicant's documents.
 *
 * Previews used to open in a browser tab, which meant no usable zoom, no way to
 * turn a sideways photograph of an ID card the right way up, a fresh download
 * of the same file every time it was opened, and a signed URL one menu tap away
 * from the phone's shared browser history. All of that lands on people
 * verifying dozens of applications on metered data.
 *
 * Everything here is an image. A photograph is its own single page; a PDF has
 * been rasterised on the server, because a phone-side PDF engine would cost
 * megabytes of APK and still be slow on the hardware this runs on. So the
 * viewer only ever has to do one thing well: show an image, sharply, and let
 * someone move around it.
 *
 * Pages are cached on disk under their storage path rather than their signed
 * URL, so reopening a document costs nothing.
 */
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDocumentPages, type DocumentPagesInput } from '@/hooks/useDocumentPages';
import { useScreenCaptureGuard } from '@/hooks/useScreenCaptureGuard';
import { storageService } from '@/services/storage.service';
import { auditService } from '@/services/audit.service';
import { MIN_TOUCH_TARGET, colors, radius, spacing } from '@/theme';
import type { Role } from '@/types/roles';

import { Button } from '../ui/Button';
import { Text } from '../ui/Text';

const MAX_SCALE = 6;
const DOUBLE_TAP_SCALE = 2.5;

export interface DocumentViewerProps {
  visible: boolean;
  onClose: () => void;
  document: (DocumentPagesInput & { file_name?: string | null }) | null;
  /** Shown under the file name, e.g. the document type. */
  subtitle?: string;
  actor?: { id: string; role: Role };
  /**
   * Blocks screenshots. On by default: the usual reader of this screen is a
   * committee member looking at a stranger's identity documents. Pass false
   * when someone is looking at their own file.
   */
  secure?: boolean;
}

export function DocumentViewer({
  visible,
  onClose,
  document,
  subtitle,
  actor,
  secure = true,
}: DocumentViewerProps) {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [rotation, setRotation] = useState(0);
  const { width, height } = Dimensions.get('window');

  const { pages, preparing, loading, failed, retry } = useDocumentPages(document, {
    enabled: visible,
  });

  useScreenCaptureGuard({
    enabled: visible && secure,
    documentId: document?.id,
    actorId: actor?.id,
    actorRole: actor?.role,
  });

  // Opening someone's identity document is itself worth a record. Written once
  // per opening rather than per page, and never for a person's own file.
  const openedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!visible || !document || !secure) return;
    if (openedRef.current === document.id) return;
    openedRef.current = document.id;
    void auditService.record({
      action: 'document.viewed',
      entityType: 'document',
      entityId: document.id,
      actorId: actor?.id,
      actorRole: actor?.role,
    });
  }, [visible, document, secure, actor?.id, actor?.role]);

  // Each opening starts at the first page, upright.
  useEffect(() => {
    if (!visible) {
      setIndex(0);
      setRotation(0);
      openedRef.current = null;
    }
  }, [visible]);

  const onScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
    },
    [width],
  );

  const openOriginal = useCallback(async () => {
    if (!document) return;
    const url = await storageService.getDocumentUrl(document.storage_path, 120);
    await WebBrowser.openBrowserAsync(url);
  }, [document]);

  const renderPage = useCallback(
    ({ item }: ListRenderItemInfo<{ path: string; url: string }>) => (
      <ZoomablePage
        uri={item.url}
        cacheKey={item.path}
        rotation={rotation}
        width={width}
        height={height}
      />
    ),
    [rotation, width, height],
  );

  const body = useMemo(() => {
    if (loading || preparing) {
      return (
        <View style={styles.centre}>
          <ActivityIndicator color={colors.onBrand} />
          <Text variant="callout" style={styles.overlayText}>
            {preparing ? 'Preparing the document…' : 'Loading…'}
          </Text>
          {preparing ? (
            <Text variant="caption" style={styles.overlayMuted}>
              This happens once. It will open instantly next time.
            </Text>
          ) : null}
        </View>
      );
    }

    if (failed || pages.length === 0) {
      return (
        <View style={styles.centre}>
          <Ionicons name="document-outline" size={40} color={colors.textOnBrandMuted} />
          <Text variant="body" style={styles.overlayText}>
            This document could not be shown here.
          </Text>
          <View style={styles.fallbackActions}>
            <Button label="Try again" variant="secondary" onPress={retry} />
            <Button label="Open the file" variant="ghost" onPress={() => void openOriginal()} />
          </View>
        </View>
      );
    }

    return (
      <FlatList
        data={pages}
        keyExtractor={(page) => page.path}
        renderItem={renderPage}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        // A document is a handful of pages, and keeping them mounted means
        // flicking back a page is instant rather than a re-decode.
        initialNumToRender={2}
        windowSize={3}
      />
    );
  }, [loading, preparing, failed, pages, retry, openOriginal, renderPage, onScrollEnd]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={styles.backdrop}>
        {body}

        {/* Controls float over the document rather than boxing it in, so the
            page itself gets the whole screen. */}
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable
            onPress={onClose}
            style={styles.control}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
          >
            <Ionicons name="close" size={22} color={colors.onBrand} />
          </Pressable>

          <View style={styles.headerText}>
            <Text variant="bodyMedium" numberOfLines={1} style={styles.overlayText}>
              {document?.file_name ?? 'Document'}
            </Text>
            {subtitle ? (
              <Text variant="caption" numberOfLines={1} style={styles.overlayMuted}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          {pages.length > 0 ? (
            <Pressable
              onPress={() => setRotation((current) => (current + 90) % 360)}
              style={styles.control}
              accessibilityRole="button"
              accessibilityLabel="Rotate"
              hitSlop={8}
            >
              <Ionicons name="refresh-outline" size={20} color={colors.onBrand} />
            </Pressable>
          ) : (
            <View style={styles.control} />
          )}
        </View>

        {pages.length > 1 ? (
          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.base }]}>
            <View style={styles.pagePill}>
              <Text variant="caption" style={styles.overlayText}>
                Page {index + 1} of {pages.length}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One page, pinchable and pannable.
 *
 * Pan is only allowed once the page is zoomed in; at rest the horizontal
 * gesture has to reach the pager underneath, or swiping between pages would
 * stop working the moment a finger landed on the image.
 */
function ZoomablePage({
  uri,
  cacheKey,
  rotation,
  width,
  height,
}: {
  uri: string;
  cacheKey: string;
  rotation: number;
  width: number;
  height: number;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const [zoomed, setZoomed] = useState(false);

  const settle = useCallback((next: number) => setZoomed(next > 1.01), []);

  const reset = () => {
    'worklet';
    scale.value = withTiming(1);
    savedScale.value = 1;
    x.value = withTiming(0);
    y.value = withTiming(0);
    savedX.value = 0;
    savedY.value = 0;
    runOnJS(settle)(1);
  };

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.min(Math.max(savedScale.value * event.scale, 0.8), MAX_SCALE);
    })
    .onEnd(() => {
      if (scale.value <= 1) {
        reset();
      } else {
        savedScale.value = scale.value;
        runOnJS(settle)(scale.value);
      }
    });

  const pan = Gesture.Pan()
    .enabled(zoomed)
    .onUpdate((event) => {
      x.value = savedX.value + event.translationX;
      y.value = savedY.value + event.translationY;
    })
    .onEnd(() => {
      savedX.value = x.value;
      savedY.value = y.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.01) {
        reset();
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
        runOnJS(settle)(DOUBLE_TAP_SCALE);
      }
    });

  const gesture = Gesture.Simultaneous(pinch, Gesture.Exclusive(doubleTap, pan));

  const animated = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: scale.value },
    ],
  }));

  // Rotating by a quarter turn swaps the axes, so the page has to be measured
  // against the other dimension or a sideways ID ends up cropped.
  const quarterTurned = rotation === 90 || rotation === 270;

  return (
    <View style={{ width, height }}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.pageFill, animated]}>
          <Image
            // The path, not the URL: signing produces a new URL every few
            // minutes, and caching on that would re-download every page.
            source={{ uri, cacheKey }}
            style={{
              width: quarterTurned ? height : width,
              height: quarterTurned ? width : height,
              transform: [{ rotate: `${rotation}deg` }],
            }}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={120}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  // Near-black rather than the brand navy: a document is the only thing on this
  // screen and anything else competes with it.
  backdrop: {
    flex: 1,
    backgroundColor: '#0A0C0F',
  },
  pageFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
    backgroundColor: 'rgba(10, 12, 15, 0.72)',
  },
  headerText: {
    flex: 1,
  },
  control: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  pagePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(10, 12, 15, 0.72)',
  },
  fallbackActions: {
    gap: spacing.sm,
    alignSelf: 'stretch',
  },
  overlayText: {
    color: colors.onBrand,
    textAlign: 'center',
  },
  overlayMuted: {
    color: colors.textOnBrandMuted,
    textAlign: 'center',
  },
});
