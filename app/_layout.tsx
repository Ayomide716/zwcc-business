/**
 * Root layout: providers, global chrome, and the splash-screen handoff.
 *
 * Provider order matters. Query sits outermost because Auth's profile fetch
 * does not use it but toasts and screens do; Toast wraps Auth so an auth error
 * can be surfaced.
 */
import { NavigationBar } from 'expo-navigation-bar';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { QueryProvider } from '@/providers/QueryProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import { colors } from '@/theme';

// Keep the navy splash up until we know whether the user is signed in, so the
// app never flashes the sign-in screen at someone who has a valid session.
void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { initialising } = useAuth();

  useEffect(() => {
    if (!initialising) void SplashScreen.hideAsync();
  }, [initialising]);

  if (initialising) return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(applicant)" />
      <Stack.Screen name="(committee)" />
      <Stack.Screen name="(admin)" />
      <Stack.Screen
        name="legal"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryProvider>
          <AuthProvider>
            <ToastProvider>
              {/*
                Hide the Android navigation buttons so the app runs full screen.
                Android keeps them available: swiping up from the bottom edge
                brings them back transiently, then they hide again.

                Android only — `expo-navigation-bar` is a no-op elsewhere, and
                iOS has no equivalent bar to hide.
              */}
              {Platform.OS === 'android' ? <NavigationBar hidden /> : null}
              <StatusBar style="auto" />
              <RootNavigator />
            </ToastProvider>
          </AuthProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
