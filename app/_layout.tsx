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

import { OfflineBanner } from '@/components/app';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { NetworkProvider } from '@/providers/NetworkProvider';
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
      {/*
        Sliding suits going deeper into a section, which is why it is the
        default. Moving between the top-level areas is not that: signing in is
        arriving somewhere new, not stepping forward through a stack, and a
        sideways slide made it look like a page rather than a destination.
        Those cross-fade instead.
      */}
      <Stack.Screen name="index" options={{ animation: 'fade' }} />
      <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
      <Stack.Screen name="(onboarding)" options={{ animation: 'fade' }} />
      <Stack.Screen name="(applicant)" options={{ animation: 'fade' }} />
      <Stack.Screen name="(committee)" options={{ animation: 'fade' }} />
      <Stack.Screen name="(admin)" options={{ animation: 'fade' }} />
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
        <NetworkProvider>
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
                {/*
                  Hidden entirely, like the navigation bar. The app runs full
                  screen; swiping down from the top edge brings the clock and
                  battery back transiently, as Android does for any immersive
                  app.
                */}
                <StatusBar hidden />
                <RootNavigator />
                <OfflineBanner />
              </ToastProvider>
            </AuthProvider>
          </QueryProvider>
        </NetworkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
