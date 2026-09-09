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
      <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
        {/* Rounded plate */}
        <Rect x="2" y="2" width="60" height="60" rx="18" fill={plate} />

        {/* Arch / shield outline */}
        <Path
          d="M32 9c9.8 0 17.5 6.4 17.5 15.6v13.9C49.5 47.9 41.9 55 32 55s-17.5-7.1-17.5-16.5V24.6C14.5 15.4 22.2 9 32 9Z"
          stroke={primary}
          strokeWidth={2.6}
          fill="none"
          strokeLinejoin="round"
        />

        {/* Ascending chevron — growth */}
        <Path
          d="M22 38.5 32 27l10 11.5"
          stroke={primary}
          strokeWidth={3.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Vertical stem, implying a cross with the chevron's crossbar */}
        <Path
          d="M32 27v17"
          stroke={accent}
          strokeWidth={3}
          strokeLinecap="round"
        />

        {/* Keystone dot */}
        <Circle cx="32" cy="20.5" r="2.6" fill={accent} />
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
