import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function ApplicationLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[step]" />
      <Stack.Screen name="review" />
      <Stack.Screen
        name="submitted"
        // No back gesture: going "back" from a submission confirmation into the
        // form the user just submitted is confusing and cannot be acted on.
        options={{ gestureEnabled: false, animation: 'fade' }}
      />
    </Stack>
  );
}
