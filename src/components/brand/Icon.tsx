/**
 * The app's own icons for the concepts it repeats.
 *
 * Ionicons covers everything and looks like every other app doing so. These are
 * only the handful of ideas this product returns to again and again — the
 * application itself, money, the committee, the agreement, monthly reporting —
 * so they are worth drawing rather than borrowing.
 *
 * Drawn on a 24 grid at a 1.6 stroke, which sits between Ionicons' outline
 * (too light next to Inter 600) and its filled set (too heavy). Everything is
 * stroked rather than filled so one colour prop controls the whole mark, and
 * `currentColor` is never used because React Native SVG has no inheritance.
 *
 * Anything outside this list should still use Ionicons. A half-finished custom
 * set is worse than none.
 */
import {
  View,
  type ColorValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme';

export type BrandIconName =
  | 'home'
  | 'application'
  | 'documents'
  | 'reports'
  | 'updates'
  | 'person'
  | 'grant'
  | 'committee'
  | 'agreement'
  | 'clock';

export interface BrandIconProps {
  name: BrandIconName;
  size?: number;
  /**
   * `ColorValue` rather than `string`, because React Navigation hands tab icons
   * a platform colour object rather than a hex string.
   */
  color?: ColorValue;
  /** Thicker for a selected tab, lighter for a resting one. */
  weight?: 'regular' | 'bold';
  style?: StyleProp<ViewStyle>;
}

export function BrandIcon({
  name,
  size = 24,
  color = colors.text as ColorValue,
  weight = 'regular',
  style,
}: BrandIconProps) {
  const stroke = weight === 'bold' ? 2.1 : 1.6;

  return (
    <View style={style} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {render(name, color, stroke)}
      </Svg>
    </View>
  );
}

function render(name: BrandIconName, c: ColorValue, w: number) {
  const round = { strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

  switch (name) {
    /* A roof over an open door: where you come back to. */
    case 'home':
      return (
        <>
          <Path d="M3.5 10.2 12 3.8l8.5 6.4" stroke={c} strokeWidth={w} {...round} />
          <Path d="M5.5 9.2V19a1.3 1.3 0 0 0 1.3 1.3h10.4A1.3 1.3 0 0 0 18.5 19V9.2" stroke={c} strokeWidth={w} {...round} />
          <Path d="M10 20.3v-5.1h4v5.1" stroke={c} strokeWidth={w} {...round} />
        </>
      );

    /* A sheet with a filled progress line — the form, part done. */
    case 'application':
      return (
        <>
          <Rect x="4.5" y="2.8" width="15" height="18.4" rx="2.4" stroke={c} strokeWidth={w} />
          <Path d="M8.3 8.4h7.4M8.3 12h7.4" stroke={c} strokeWidth={w} {...round} />
          <Path d="M8.3 15.6h3.6" stroke={c} strokeWidth={w + 0.9} {...round} />
        </>
      );

    /* Two sheets, one behind the other. */
    case 'documents':
      return (
        <>
          <Path d="M8.2 5.4V4.2a1.6 1.6 0 0 1 1.6-1.6h6.4l3.4 3.4v11a1.6 1.6 0 0 1-1.6 1.6h-1.2" stroke={c} strokeWidth={w} {...round} />
          <Rect x="4.2" y="6.6" width="11.4" height="14.8" rx="1.8" stroke={c} strokeWidth={w} />
          <Path d="M7.6 12.4h4.6M7.6 16h3" stroke={c} strokeWidth={w} {...round} />
        </>
      );

    /* Bars that climb: the monthly story of a business. */
    case 'reports':
      return (
        <>
          <Path d="M3.8 20.4h16.4" stroke={c} strokeWidth={w} {...round} />
          <Path d="M7.2 20.4v-5.2" stroke={c} strokeWidth={w + 1} {...round} />
          <Path d="M12 20.4V9.8" stroke={c} strokeWidth={w + 1} {...round} />
          <Path d="M16.8 20.4V13" stroke={c} strokeWidth={w + 1} {...round} />
          <Path d="M5.4 6.6 10.2 4l4 2.6 4.4-3" stroke={c} strokeWidth={w} {...round} />
        </>
      );

    /* A bell with the clapper implied rather than drawn. */
    case 'updates':
      return (
        <>
          <Path d="M12 3.2c-3.4 0-5.6 2.4-5.6 5.8 0 4.6-1.5 5.6-1.5 6.9h14.2c0-1.3-1.5-2.3-1.5-6.9 0-3.4-2.2-5.8-5.6-5.8Z" stroke={c} strokeWidth={w} {...round} />
          <Path d="M10.1 18.6a2 2 0 0 0 3.8 0" stroke={c} strokeWidth={w} {...round} />
        </>
      );

    /* A single person. */
    case 'person':
      return (
        <>
          <Circle cx="12" cy="8.2" r="3.7" stroke={c} strokeWidth={w} />
          <Path d="M4.9 20.6c0-3.6 3.2-5.8 7.1-5.8s7.1 2.2 7.1 5.8" stroke={c} strokeWidth={w} {...round} />
        </>
      );

    /* A coin with a rising stroke through it: money that grows. */
    case 'grant':
      return (
        <>
          <Circle cx="12" cy="12" r="8.6" stroke={c} strokeWidth={w} />
          <Path d="M9 14.6 12 9l3 5.6" stroke={c} strokeWidth={w} {...round} />
          <Path d="M9.9 12.8h4.2" stroke={c} strokeWidth={w} {...round} />
        </>
      );

    /* Three heads together — a decision made by a group, not a person. */
    case 'committee':
      return (
        <>
          <Circle cx="8.2" cy="9" r="2.7" stroke={c} strokeWidth={w} />
          <Circle cx="16" cy="9.8" r="2.2" stroke={c} strokeWidth={w} />
          <Path d="M3.4 19.4c0-2.8 2.2-4.5 4.8-4.5s4.8 1.7 4.8 4.5" stroke={c} strokeWidth={w} {...round} />
          <Path d="M15.2 15.1c2.6-.3 5.4 1.2 5.4 4.3" stroke={c} strokeWidth={w} {...round} />
        </>
      );

    /* A sheet with a signature stroke across it. */
    case 'agreement':
      return (
        <>
          <Rect x="4.4" y="3" width="15.2" height="18" rx="2.3" stroke={c} strokeWidth={w} />
          <Path d="M8 8h8" stroke={c} strokeWidth={w} {...round} />
          <Path d="M7.8 15.6c1.7-2.3 3-2.3 4.1 0 .9 1.9 2.3 1.3 4.3-1.6" stroke={c} strokeWidth={w} {...round} />
        </>
      );

    /* Waiting. */
    case 'clock':
    default:
      return (
        <>
          <Circle cx="12" cy="12" r="8.6" stroke={c} strokeWidth={w} />
          <Path d="M12 6.9V12l3.4 2.1" stroke={c} strokeWidth={w} {...round} />
        </>
      );
  }
}
