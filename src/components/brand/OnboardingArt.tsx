/**
 * Illustrations for the onboarding carousel.
 *
 * Drawn as SVG rather than shipped as bitmaps: five full-bleed PNGs would add
 * megabytes to the download for users on expensive data, and vector art stays
 * sharp on every screen density.
 */
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors, palette } from '@/theme';

export type ArtName =
  | 'welcome'
  | 'eligibility'
  | 'process'
  | 'documents'
  | 'monitoring'
  | 'updates'
  | 'reports';

export interface OnboardingArtProps {
  name: ArtName;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function OnboardingArt({ name, size = 200, style }: OnboardingArtProps) {
  return (
    <View style={style} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 200 200" fill="none">
        <Circle cx="100" cy="100" r="92" fill={colors.brandSurface} />
        {ART[name]}
      </Svg>
    </View>
  );
}

const navy = colors.brand;
const gold = colors.accent;
const light = palette.navy300;

const ART: Record<ArtName, React.ReactNode> = {
  /* An upward growth arc over a horizon — enterprise and possibility. */
  welcome: (
    <>
      <Path d="M46 132h108" stroke={light} strokeWidth={4} strokeLinecap="round" />
      <Path
        d="M56 118c14-30 30-46 48-52 16-6 28 2 40 12"
        stroke={navy}
        strokeWidth={5}
        strokeLinecap="round"
        fill="none"
      />
      <Path d="M132 62h16v16" stroke={gold} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Rect x="60" y="96" width="18" height="36" rx="4" fill={navy} opacity={0.85} />
      <Rect x="86" y="80" width="18" height="52" rx="4" fill={navy} />
      <Rect x="112" y="66" width="18" height="66" rx="4" fill={gold} />
    </>
  ),

  /* An open door with a checkmark — open to everyone. */
  eligibility: (
    <>
      <Rect x="62" y="52" width="76" height="100" rx="8" stroke={navy} strokeWidth={5} fill="none" />
      <Path d="M62 152h76" stroke={light} strokeWidth={4} strokeLinecap="round" />
      <Circle cx="122" cy="104" r="4" fill={navy} />
      <Path
        d="M78 100l14 14 26-30"
        stroke={gold}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </>
  ),

  /* Three connected stages — the process. */
  process: (
    <>
      <Path d="M54 100h92" stroke={light} strokeWidth={4} strokeLinecap="round" />
      <Circle cx="54" cy="100" r="14" fill={navy} />
      <Circle cx="100" cy="100" r="14" fill={navy} opacity={0.6} />
      <Circle cx="146" cy="100" r="14" fill={gold} />
      <Path d="M48 100l4 5 8-10" stroke={colors.onBrand} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Rect x="40" y="128" width="28" height="6" rx="3" fill={light} />
      <Rect x="86" y="128" width="28" height="6" rx="3" fill={light} />
      <Rect x="132" y="128" width="28" height="6" rx="3" fill={light} />
    </>
  ),

  /* Stacked documents with a verified seal. */
  documents: (
    <>
      <Rect x="58" y="46" width="70" height="92" rx="8" fill={colors.surface} stroke={navy} strokeWidth={4} />
      <Path d="M72 72h42M72 88h42M72 104h28" stroke={light} strokeWidth={5} strokeLinecap="round" />
      <Circle cx="132" cy="126" r="24" fill={gold} />
      <Path
        d="M122 126l7 7 14-15"
        stroke={colors.brandDark}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </>
  ),

  /* A twelve-month calendar grid with progress. */
  monitoring: (
    <>
      <Rect x="50" y="56" width="100" height="90" rx="10" stroke={navy} strokeWidth={4.5} fill={colors.surface} />
      <Path d="M50 80h100" stroke={navy} strokeWidth={4.5} />
      <Path d="M74 46v18M126 46v18" stroke={navy} strokeWidth={5} strokeLinecap="round" />
      <Rect x="64" y="92" width="16" height="14" rx="3" fill={gold} />
      <Rect x="90" y="92" width="16" height="14" rx="3" fill={gold} />
      <Rect x="116" y="92" width="16" height="14" rx="3" fill={light} />
      <Rect x="64" y="116" width="16" height="14" rx="3" fill={light} />
      <Rect x="90" y="116" width="16" height="14" rx="3" fill={light} />
      <Rect x="116" y="116" width="16" height="14" rx="3" fill={light} />
    </>
  ),

  /* A bell with a quiet chime — nothing has arrived yet. */
  updates: (
    <>
      <Path
        d="M100 50c-18 0-30 13-30 31 0 24-8 30-8 36h76c0-6-8-12-8-36 0-18-12-31-30-31Z"
        stroke={navy}
        strokeWidth={4.5}
        strokeLinejoin="round"
        fill={colors.surface}
      />
      <Path d="M100 40v10" stroke={navy} strokeWidth={5} strokeLinecap="round" />
      <Path
        d="M88 128a12 12 0 0 0 24 0"
        stroke={navy}
        strokeWidth={4.5}
        strokeLinecap="round"
      />
      <Circle cx="132" cy="66" r="7" fill={gold} />
      <Path d="M56 96h-9M60 76l-8-5M60 116l-8 5" stroke={light} strokeWidth={4} strokeLinecap="round" />
    </>
  ),

  /* A rising bar chart on a card — the monthly reporting yet to begin. */
  reports: (
    <>
      <Rect
        x="48"
        y="54"
        width="104"
        height="94"
        rx="10"
        stroke={navy}
        strokeWidth={4.5}
        fill={colors.surface}
      />
      <Path d="M66 128V106" stroke={light} strokeWidth={9} strokeLinecap="round" />
      <Path d="M88 128V92" stroke={light} strokeWidth={9} strokeLinecap="round" />
      <Path d="M110 128V80" stroke={gold} strokeWidth={9} strokeLinecap="round" />
      <Path d="M132 128V68" stroke={navy} strokeWidth={9} strokeLinecap="round" />
    </>
  ),
};
