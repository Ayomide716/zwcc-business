/**
 * The design system.
 *
 * A token-based theme on top of React Native's StyleSheet rather than a
 * Tailwind-for-RN library. The brief allowed either; this was chosen because
 * the styling layer then carries no native code and cannot drift out of step
 * with the Expo SDK. Components consume tokens only — no component contains a
 * raw hex value or a magic number.
 *
 * Brand direction: navy blue and white, premium and trustworthy, faith-adjacent
 * rather than overtly religious. Navy is used with restraint: it anchors
 * headers, primary actions and the brand mark, while surfaces stay light so
 * long forms remain comfortable to read.
 */
import { Platform, type TextStyle } from 'react-native';

/* -------------------------------------------------------------------------- */
/* Palette                                                                     */
/* -------------------------------------------------------------------------- */

const palette = {
  /** Core brand navy, taken from the ZWCC identity. */
  navy900: '#061630',
  navy800: '#0B2545',
  navy700: '#13355F',
  navy600: '#1D4879',
  navy500: '#2A5D93',
  navy400: '#5B84AF',
  navy300: '#9BB4CE',
  navy200: '#CBD9E7',
  navy100: '#E7EEF6',
  navy050: '#F4F8FC',

  /** Warm gold, used sparingly for emphasis and the brand mark's accent. */
  gold600: '#9A7318',
  gold500: '#C29A2E',
  gold400: '#D9B85C',
  gold100: '#F7EFD9',

  white: '#FFFFFF',
  black: '#000000',

  grey900: '#14181F',
  grey800: '#232A35',
  grey700: '#3A4351',
  grey600: '#5A6472',
  grey500: '#7C8695',
  grey400: '#A6AEBA',
  grey300: '#CBD1DA',
  grey200: '#E2E6EC',
  grey100: '#F1F3F6',
  grey050: '#F8F9FB',

  green700: '#1B6B45',
  green500: '#2E9E68',
  green100: '#E3F5EC',

  amber700: '#8A5A08',
  amber500: '#C98A12',
  amber100: '#FCF1DC',

  red700: '#9B2226',
  red500: '#CE3B3F',
  red100: '#FBE7E7',

  blue700: '#1B4F8A',
  blue500: '#2E7BC4',
  blue100: '#E4EFFA',
} as const;

export const colors = {
  /* Brand */
  brand: palette.navy800,
  brandDark: palette.navy900,
  brandStrong: palette.navy700,
  brandMuted: palette.navy400,
  brandSurface: palette.navy050,
  brandSurfaceStrong: palette.navy100,
  brandBorder: palette.navy200,
  onBrand: palette.white,

  accent: palette.gold500,
  accentStrong: palette.gold600,
  accentSurface: palette.gold100,

  /* Surfaces */
  background: palette.grey050,
  surface: palette.white,
  surfaceMuted: palette.grey100,
  surfaceSunken: palette.grey050,
  overlay: 'rgba(6, 22, 48, 0.55)',

  /* Text */
  text: palette.grey900,
  textSecondary: palette.grey600,
  textMuted: palette.grey500,
  textInverse: palette.white,
  textOnBrandMuted: palette.navy200,

  /* Lines */
  border: palette.grey200,
  borderStrong: palette.grey300,
  divider: palette.grey200,

  /* Feedback */
  success: palette.green500,
  successStrong: palette.green700,
  successSurface: palette.green100,

  warning: palette.amber500,
  warningStrong: palette.amber700,
  warningSurface: palette.amber100,

  danger: palette.red500,
  dangerStrong: palette.red700,
  dangerSurface: palette.red100,

  info: palette.blue500,
  infoStrong: palette.blue700,
  infoSurface: palette.blue100,

  /* Controls */
  focusRing: palette.navy500,
  disabled: palette.grey300,
  disabledText: palette.grey500,
  placeholder: palette.grey400,
  skeleton: palette.grey200,
} as const;

export type ColorToken = keyof typeof colors;

/* -------------------------------------------------------------------------- */
/* Status tones                                                                */
/* -------------------------------------------------------------------------- */

/** Maps a workflow `StatusTone` onto concrete colours. */
export const toneColors = {
  neutral: { fg: palette.grey700, bg: palette.grey100, border: palette.grey200 },
  info: { fg: colors.infoStrong, bg: colors.infoSurface, border: '#C5DDF3' },
  progress: { fg: palette.navy700, bg: palette.navy100, border: palette.navy200 },
  success: { fg: colors.successStrong, bg: colors.successSurface, border: '#C2E7D5' },
  warning: { fg: colors.warningStrong, bg: colors.warningSurface, border: '#F2DFB6' },
  danger: { fg: colors.dangerStrong, bg: colors.dangerSurface, border: '#F2CACB' },
} as const;

export type Tone = keyof typeof toneColors;

/* -------------------------------------------------------------------------- */
/* Spacing — a 4pt grid                                                        */
/* -------------------------------------------------------------------------- */

export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 56,
} as const;

export const radius = {
  none: 0,
  sm: 6,
  md: 10,
  base: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

/**
 * Minimum interactive size. WCAG asks for 44×44; every pressable in the app
 * either meets this or carries an explicit `hitSlop`.
 */
export const MIN_TOUCH_TARGET = 48;

/* -------------------------------------------------------------------------- */
/* Typography                                                                  */
/* -------------------------------------------------------------------------- */

const fontFamily = Platform.select({
  ios: { regular: 'System', medium: 'System', semibold: 'System', bold: 'System' },
  default: {
    regular: 'sans-serif',
    medium: 'sans-serif-medium',
    semibold: 'sans-serif-medium',
    bold: 'sans-serif',
  },
}) as Record<'regular' | 'medium' | 'semibold' | 'bold', string>;

type TypeStyle = Pick<
  TextStyle,
  'fontSize' | 'lineHeight' | 'fontWeight' | 'letterSpacing' | 'fontFamily'
>;

export const typography = {
  display: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: -0.6,
    fontFamily: fontFamily.bold,
  },
  title1: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -0.4,
    fontFamily: fontFamily.bold,
  },
  title2: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    letterSpacing: -0.2,
    fontFamily: fontFamily.semibold,
  },
  title3: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '600',
    letterSpacing: -0.1,
    fontFamily: fontFamily.semibold,
  },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400', fontFamily: fontFamily.regular },
  bodyMedium: { fontSize: 15, lineHeight: 22, fontWeight: '600', fontFamily: fontFamily.semibold },
  callout: { fontSize: 14, lineHeight: 20, fontWeight: '400', fontFamily: fontFamily.regular },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    letterSpacing: 0.1,
    fontFamily: fontFamily.semibold,
  },
  caption: { fontSize: 12, lineHeight: 17, fontWeight: '400', fontFamily: fontFamily.regular },
  overline: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    letterSpacing: 0.9,
    fontFamily: fontFamily.semibold,
  },
} satisfies Record<string, TypeStyle>;

export type TypographyToken = keyof typeof typography;

/* -------------------------------------------------------------------------- */
/* Elevation                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Shadows are tinted navy rather than pure black so cards sit in the brand
 * world instead of looking like grey Material surfaces.
 */
export const shadows = {
  none: {},
  sm: Platform.select({
    ios: {
      shadowColor: palette.navy900,
      shadowOpacity: 0.06,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    default: { elevation: 1 },
  }),
  md: Platform.select({
    ios: {
      shadowColor: palette.navy900,
      shadowOpacity: 0.09,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 5 },
    },
    default: { elevation: 3 },
  }),
  lg: Platform.select({
    ios: {
      shadowColor: palette.navy900,
      shadowOpacity: 0.14,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 12 },
    },
    default: { elevation: 8 },
  }),
} as const;

export const theme = {
  colors,
  spacing,
  radius,
  typography,
  shadows,
  toneColors,
  palette,
} as const;

export type Theme = typeof theme;
export { palette };
