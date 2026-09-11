/**
 * Authentication and session state.
 *
 * Holds the Supabase session, the user's profile (which carries their role) and
 * the derived loading flags routing depends on. Nothing else subscribes to
 * `onAuthStateChange`, so there is one source of truth for "who is signed in".
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { can, type Capability } from '@/config/permissions.config';
import { logger } from '@/lib/logger';
import { toUserError, type UserError } from '@/lib/errors';
import { isSupabaseConfigured, startAuthAutoRefresh, supabase } from '@/lib/supabase';
import { profileService } from '@/services/profile.service';
import { pushService } from '@/services/push.service';
import type { ProfileRow } from '@/types/database';
import type { Role } from '@/types/roles';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: ProfileRow | null;
  role: Role | null;
  /** True until the stored session has been read from SecureStore. */
  initialising: boolean;
  /** True while the profile is being fetched for a known session. */
  loadingProfile: boolean;
  /**
   * Set when the profile could not be loaded for a signed-in user — almost
   * always a dropped connection. Without this the app has a session but no
   * role, and every role-gated layout renders nothing: a blank screen with no
   * error and no way out. Screens use it to offer Retry / Sign out.
   */
  profileError: UserError | null;
  isAuthenticated: boolean;
  isSupabaseConfigured: boolean;
  can: (capability: Capability) => boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [initialising, setInitialising] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState<UserError | null>(null);

  // Guards against a late profile fetch overwriting state after sign-out.
  const activeUserId = useRef<string | null>(null);

  // Lets the auth listener read the current profile without depending on it.
  const profileRef = useRef<ProfileRow | null>(null);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  /**
   * `background` is what keeps a refresh from throwing the user off the screen
   * they are on.
   *
   * Every role layout renders nothing while `loadingProfile` is true, so that a
   * staff member never flashes the applicant shell before their role arrives.
   * Rendering nothing unmounts the tab navigator, and a navigator that remounts
   * comes back on its first tab with no history. So a re-read after the user
   * changed their name or their picture would bounce them to the home screen,
   * and the success message would land there instead of under their thumb.
   *
   * The flag exists for the first load, when there is genuinely nothing to
   * show. A refresh already has a profile on screen and should replace it
   * without anyone noticing.
   */
  const loadProfile = useCallback(async (user: User, background = false) => {
    activeUserId.current = user.id;
    if (!background) setLoadingProfile(true);
    setProfileError(null);

    try {
      const row = await profileService.ensureProfile(user.id, user.email ?? '');
      // Ignore a response that arrived after the user changed.
      if (activeUserId.current === user.id) {
        setProfile(row);
        setProfileError(null);
      }
    } catch (error) {
      logger.error('Failed to load profile', error, { userId: user.id });
      // A refresh that fails keeps whatever is already on screen. Clearing it
      // would turn a dropped request — ordinary on a Nigerian mobile network —
      // into the "profile unavailable" screen on top of work in progress.
      if (activeUserId.current === user.id && !background) {
        setProfile(null);
        setProfileError(toUserError(error));
      }
    } finally {
      if (!background && activeUserId.current === user.id) setLoadingProfile(false);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setInitialising(false);
      return;
    }

    let cancelled = false;

    // Restore whatever session is in SecureStore before rendering routes.
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.session);
        if (data.session?.user) {
          void loadProfile(data.session.user);
        }
      })
      .catch((error) => logger.error('Failed to restore session', error))
      .finally(() => {
        if (!cancelled) setInitialising(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (cancelled) return;

      setSession(nextSession);

      if (nextSession?.user) {
        // TOKEN_REFRESHED fires often and does not change who is signed in.
        if (event !== 'TOKEN_REFRESHED' || !profileRef.current) {
          void loadProfile(nextSession.user);
        }
      } else {
        activeUserId.current = null;
        setProfile(null);
      }
    });

    const stopAutoRefresh = startAuthAutoRefresh();

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
      stopAutoRefresh();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    const user = session?.user;
    if (!user) return;
    // Silent: the caller is updating something the user is looking at.
    await loadProfile(user, true);
  }, [session, loadProfile]);

  const signOut = useCallback(async () => {
    try {
      /*
        Stop pushing to this device before the session goes.

        Phones are shared here. Without this, the next person to sign in would
        keep receiving the previous user's notifications — the title of a
        decision on someone else's grant application, on their lock screen.
      */
      const token = await pushService.getExistingToken();
      if (token) await pushService.deactivate(token);

      await profileService.signOut();
    } catch (error) {
      // Even if the network call fails, clear local state so the user is not
      // stuck in a signed-in shell they cannot use.
      logger.error('Sign out failed', error);
    } finally {
      activeUserId.current = null;
      setSession(null);
      setProfile(null);
      setProfileError(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const role = profile?.role ?? null;

    return {
      session,
      user: session?.user ?? null,
      profile,
      role,
      initialising,
      loadingProfile,
      profileError,
      isAuthenticated: Boolean(session?.user),
      isSupabaseConfigured,
      can: (capability: Capability) => can(role, capability),
      refreshProfile,
      signOut,
    };
  }, [session, profile, initialising, loadingProfile, profileError, refreshProfile, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider.');
  }
  return context;
}

/**
 * The authenticated actor, for services that require one. Throws rather than
 * returning null so callers do not have to null-check inside event handlers on
 * screens that are already behind a route guard.
 */
export function useActor(): { id: string; role: Role } {
  const { user, role } = useAuth();
  if (!user || !role) {
    throw new Error('useActor called without an authenticated user.');
  }
  return { id: user.id, role };
}
