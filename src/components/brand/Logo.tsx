/**
 * ZWCC brand mark — the official artwork.
 *
 * This used to be vector art standing in for a logo nobody had supplied yet.
 * The real thing is a raster image, so it is loaded rather than drawn, and
 * `require` resolves it at build time into the bundle: it is always there, with
 * no network fetch and nothing to load before the first screen paints.
 *
 * The logo is drawn for a light ground. Its sphere is nearly the same navy as
 * the brand colour and its flame carries a soft pale glow, so cutting it out
 * and placing it on navy loses the sphere and leaves the glow hanging as a
 * fuzzy halo. On dark grounds it therefore sits on a white plate, which is how
 * the artwork is meant to be shown, rather than being recoloured to fit.
 */
import { Image } from 'expo-image';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, spacing } from '@/theme';

import { Text } from '@/components/ui/Text';

const ARTWORK = require('../../../assets/brand/zwcc-logo.png');

/** The artwork is taller than it is wide; `size` is its height. */
const ASPECT = 394 / 528;

export interface LogoMarkProps {
  size?: number;
  /** `onLight` places the logo directly; `onDark` puts it on a white plate. */
  scheme?: 'onLight' | 'onDark';
  style?: StyleProp<ViewStyle>;
}

export function LogoMark({ size = 48, scheme = 'onLight', style }: LogoMarkProps) {
  const onDark = scheme === 'onDark';

  /*
    A circle rather than a rounded square, and the artwork a little smaller
    inside it. The logo is itself a disc with a flame above it, so a rounded
    square around it read as a second, competing shape; a circle follows the
    mark it contains. The artwork sits in past the edge because the flame is
    the tallest part and looked pinned to the rim.
  */
  const plateSize = size;
  const artHeight = onDark ? size * 0.66 : size;

  return (
    <View
      style={[
        onDark && {
          width: plateSize,
          height: plateSize,
          borderRadius: plateSize / 2,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Zion World Christian Center"
    >
      <Image
        source={ARTWORK}
        style={{ width: artHeight * ASPECT, height: artHeight }}
        contentFit="contain"
        // Bundled, so there is nothing to fade in from.
        transition={0}
      />
    </View>
  );
}

export interface LogoProps extends LogoMarkProps {
  /** Show the organisation name beside the mark. */
  showWordmark?: boolean;
  /** Show the grant programme name under the organisation name. */
  showProgramme?: boolean;
  layout?: 'horizontal' | 'vertical';
}

export function Logo({
  size = 44,
  scheme = 'onLight',
  showWordmark = true,
  showProgramme = false,
  layout = 'horizontal',
  style,
}: LogoProps) {
  const textColor = scheme === 'onDark' ? colors.onBrand : colors.brand;
  const subColor = scheme === 'onDark' ? colors.textOnBrandMuted : colors.textSecondary;

  if (!showWordmark) return <LogoMark size={size} scheme={scheme} style={style} />;

  const vertical = layout === 'vertical';

  return (
    <View
      style={[
        {
          flexDirection: vertical ? 'column' : 'row',
          alignItems: 'center',
          gap: vertical ? spacing.md : spacing.md,
        },
        style,
      ]}
    >
      <LogoMark size={size} scheme={scheme} />

      <View style={{ alignItems: vertical ? 'center' : 'flex-start', gap: 1 }}>
        <Text
          variant={vertical ? 'title3' : 'bodyMedium'}
          color={textColor}
          align={vertical ? 'center' : 'left'}
        >
          Zion World Christian Center
        </Text>
        {showProgramme ? (
          <Text variant="caption" color={subColor} align={vertical ? 'center' : 'left'}>
            2026 Business Grant
          </Text>
        ) : null}
      </View>
    </View>
  );
}
