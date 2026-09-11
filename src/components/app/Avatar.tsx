/**
 * A person's picture, falling back to their initials.
 *
 * The avatars bucket is private like every other, so there is no URL to render
 * directly — a signed one is minted on demand and cached by React Query for
 * rather less than it lives, so a screen never paints a link that has just
 * expired.
 *
 * Initials are not a placeholder waiting to be replaced. Most applicants will
 * never set a picture, and a coloured monogram is a finished state rather than
 * an empty one.
 */
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ImageStyle } from 'expo-image';

import { initials } from '@/lib/format';
import { BUCKETS } from '@/lib/supabase';
import { storageService } from '@/services/storage.service';
import { colors, radius } from '@/theme';

import { Text } from '../ui/Text';

/** Signed URLs last an hour; re-mint well before that. */
const SIGNED_URL_TTL_SECONDS = 3600;
const REFRESH_BEFORE_MS = 45 * 60 * 1000;

export interface AvatarProps {
  /** Storage path held in `profiles.avatar_url`. Null shows initials. */
  path?: string | null;
  name?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function Avatar({ path, name, size = 76, style }: AvatarProps) {
  const signed = useQuery({
    queryKey: ['avatar-url', path],
    queryFn: () => storageService.getSignedUrl(BUCKETS.avatars, path!, SIGNED_URL_TTL_SECONDS),
    enabled: Boolean(path),
    staleTime: REFRESH_BEFORE_MS,
    gcTime: REFRESH_BEFORE_MS,
    // A missing picture must never surface as an error state on a profile.
    retry: false,
  });

  const dimensions = { width: size, height: size, borderRadius: radius.pill };

  if (path && signed.data) {
    return (
      <Image
        source={{ uri: signed.data }}
        // The picture and the monogram are different element types with
        // incompatible style unions; only layout properties are ever passed.
        style={[styles.image, dimensions, style as StyleProp<ImageStyle>]}
        contentFit="cover"
        // Held on disk so the picture is there instantly next launch, before
        // a new signed URL has even been requested.
        cachePolicy="memory-disk"
        transition={180}
        accessibilityLabel={name ? `${name}'s profile picture` : 'Profile picture'}
      />
    );
  }

  return (
    <View style={[styles.fallback, dimensions, style]}>
      <Text
        variant={size >= 64 ? 'title2' : 'label'}
        color="brand"
        accessibilityLabel={name ? `${name}, no profile picture` : undefined}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.brandSurfaceStrong,
  },
  fallback: {
    backgroundColor: colors.brandSurfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
