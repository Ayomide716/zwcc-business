/**
 * ZWCC brand mark.
 *
 * Drawn as vector art rather than loaded from a bitmap so it stays crisp at
 * every size and can be recoloured for navy-on-white and white-on-navy
 * contexts.
 *
 * TO USE THE OFFICIAL ARTWORK: drop the supplied logo at
 * `assets/brand/zwcc-logo.png` and swap the `<Svg>` block below for an
 * `<Image source={require('@/../assets/brand/zwcc-logo.png')} />`. Nothing else
 * needs to change — every screen imports this component, never an image path.
 *
 * The mark: an upward chevron (growth, enterprise) inside a shield-like arch
 * (protection, stewardship), with a subtle cross implied by the vertical stem.
 * Faith-adjacent rather than overtly religious, per the brand direction.
 */
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors, spacing } from '@/theme';

import { Text } from '@/components/ui/Text';

export interface LogoMarkProps {
  size?: number;
  /** `onLight` draws navy on white; `onDark` draws white on navy. */
  scheme?: 'onLight' | 'onDark';
  style?: StyleProp<ViewStyle>;
}

export function LogoMark({ size = 48, scheme = 'onLight', style }: LogoMarkProps) {
  const primary = scheme === 'onDark' ? colors.onBrand : colors.brand;
  const accent = colors.accent;
  const plate = scheme === 'onDark' ? 'rgba(255,255,255,0.10)' : colors.brandSurfaceStrong;

  return (
    <View style={style} accessible accessibilityRole="image" accessibilityLabel="Zion World Christian Center">
      {/*
        Geometry matches scripts/generate-brand-assets.js exactly, so the
        in-app mark and the launcher icon are the same shape.
      */}
      <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
        {/* Rounded plate */}
        <Rect x="2" y="2" width="60" height="60" rx="18" fill={plate} />

        {/* Arch — a ring left open at the bottom (stewardship). */}
        <Path
          d="M20.83 49.29 A 19 19 0 1 1 43.17 49.29"
          stroke={primary}
          strokeWidth={2.9}
          strokeLinecap="round"
          fill="none"
        />

        {/* Ascending chevron — growth. */}
        <Path
          d="M21.12 40.32 32 30.08l10.88 10.24"
          stroke={primary}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Gold stem, implying a cross with the chevron's crossbar. */}
        <Path d="M32 30.08v16.64" stroke={accent} strokeWidth={2.9} strokeLinecap="round" />

        {/* Keystone dot. */}
        <Circle cx="32" cy="21.12" r="2.05" fill={accent} />
      </Svg>
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
