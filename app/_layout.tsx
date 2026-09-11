/**
 * Root layout: providers, global chrome, and the splash-screen handoff.
 *
 * Provider order matters. Query sits outermost because Auth's profile fetch
 * does not use it but toasts and screens do; Toast wraps Auth so an auth error
 * can be surfaced.
 */
/*
  Imported from the per-weight subpaths, not the family barrel.

  `from '@expo-google-fonts/inter'` re-exports all eighteen weights, and each is
  a `require()` of a TTF that Metro cannot tree-shake — it bundled 6 MB of fonts
  for the three actually used. Naming the subpaths brings that down to about
  1 MB, which on Nigerian mobile data is the difference worth caring about.
*/
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { useFonts } from 'expo-font';
import { NavigationBar } from 'expo-navigation-bar';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OfflineBanner } from '@/components/app';
import { AppSplash } from '@/components/brand/AppSplash';
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

  /*
    Fonts are bundled in the app, so this resolves in milliseconds and never
    touches the network. It is still awaited before the splash lifts, because
    rendering in the system font and then swapping to Inter makes the first
    screen visibly reflow.

    `error` is handled the same as success on purpose: a font that fails to
    load must fall back to the system face, not leave the splash up forever.
  */
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const ready = !initialising && (fontsLoaded || Boolean(fontError));

  // Our own splash replaces the native one, so it can animate and can know
  // when the app is actually ready. Two separate flags: `ready` says the work
  // is done, `splashGone` says the animation has finished playing out.
  const [splashGone, setSplashGone] = useState(false);
  const handleSplashFinished = useCallback(() => setSplashGone(true), []);

  /*
    The native splash is dismissed as soon as there is something of ours to
    show, not when the app is ready. Waiting would mean the static image stays
    up for the whole load and our splash never appears; dismissing earlier
    would flash the bare background between the two.
  */
  const [handedOver, setHandedOver] = useState(false);
  useEffect(() => {
    if (handedOver) return;
    setHandedOver(true);
    void SplashScreen.hideAsync();
  }, [handedOver]);

  return (
    <>
      {/*
        Rendered over the navigator rather than instead of it, so the app
        behind has already mounted and laid out by the time the splash fades.
        Returning null until ready meant the first screen appeared mid-render.
      */}
      {!splashGone ? <AppSplash ready={ready} onFinished={handleSplashFinished} /> : null}

      {ready ? <RootStack /> : null}
    </>
  );
}

function RootStack() {
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
