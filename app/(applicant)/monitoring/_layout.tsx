/**
 * Stack layout for this section.
 *
 * Required: without it, Expo Router treats each file in the directory as a
 * sibling route of the parent navigator, which would surface detail screens as
 * extra tabs.
 */
import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function SectionLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
