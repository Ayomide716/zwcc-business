/**
 * Profiles and authentication.
 *
 * A note on roles: `signUp` never accepts a role. The database trigger
 * `handle_new_user` always creates the profile as 'applicant', and
 * `prevent_self_role_change` blocks anyone but an administrator from changing
 * it. Self-promotion is therefore impossible even with a modified client.
 */
import { supabase } from '@/lib/supabase';
import { AppError } from '@/lib/errors';
import { normalisePhone } from '@/lib/format';
import { auditService } from './audit.service';
import type { ProfileRow } from '@/types/database';
import type { Role } from '@/types/roles';

export interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  /** Deep link a confirmation email should return to, if confirmation is on. */
  redirectTo?: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export const profileService = {
  /* ---------------------------------------------------------------------- */
  /* Authentication                                                          */
  /* ---------------------------------------------------------------------- */

  async signUp({ email, password, fullName, phone, redirectTo }: SignUpInput) {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        // Read by the handle_new_user trigger to populate the profile.
        data: { full_name: fullName.trim(), phone: normalisePhone(phone) },
        /*
          Where a confirmation email should send someone back to.

          Without this, Supabase falls back to the project's Site URL, which on
          a new project is http://localhost:3000 — a link that goes nowhere on a
          phone. It only takes effect once the same value is on the redirect
          allow-list; see supabase/README.md.
        */
        emailRedirectTo: redirectTo,
      },
    });

    if (error) throw error;

    if (data.user) {
      await auditService.record({
        action: 'auth.registered',
        entityType: 'profile',
        entityId: data.user.id,
        actorId: data.user.id,
      });
    }

    return data;
  },

  async signIn({ email, password }: SignInInput) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw error;

    if (data.user) {
      await auditService.record({
        action: 'auth.signed_in',
        entityType: 'session',
        entityId: data.user.id,
        actorId: data.user.id,
      });
    }

    return data;
  },

  async signOut() {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await auditService.record({
        action: 'auth.signed_out',
        entityType: 'session',
        entityId: data.user.id,
        actorId: data.user.id,
      });
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async requestPasswordReset(email: string, redirectTo?: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo,
    });
    if (error) throw error;
  },

  async updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },

  /* ---------------------------------------------------------------------- */
  /* Profile                                                                 */
  /* ---------------------------------------------------------------------- */

  async getProfile(userId: string): Promise<ProfileRow | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  /**
   * Reads the caller's profile, creating it if the auth trigger has not fired
   * yet. Sign-up and profile creation are two statements in Postgres, and on a
   * poor connection the client can arrive first.
   */
  async ensureProfile(userId: string, email: string): Promise<ProfileRow> {
    const existing = await this.getProfile(userId);
    if (existing) return existing;

    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        email,
        role: 'applicant',
        full_name: null,
        phone: null,
        avatar_url: null,
        onboarding_completed_at: null,
        deleted_at: null,
      })
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new AppError('server', 'Setup incomplete', 'We could not finish setting up your account.');
    return data;
  },

  async updateProfile(
    userId: string,
    updates: Partial<Pick<ProfileRow, 'full_name' | 'phone' | 'avatar_url'>>,
  ): Promise<ProfileRow> {
    const payload = { ...updates };
    if (payload.phone) payload.phone = normalisePhone(payload.phone);

    const { data, error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    await auditService.record({
      action: 'user.profile_updated',
      entityType: 'profile',
      entityId: userId,
      metadata: { fields: Object.keys(updates) },
    });

    return data;
  },

  async markOnboardingComplete(userId: string): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) throw error;
  },

  /* ---------------------------------------------------------------------- */
  /* Administration                                                          */
  /* ---------------------------------------------------------------------- */

  async listUsers(options: { role?: Role; search?: string; limit?: number } = {}) {
    const { role, search, limit = 50 } = options;

    let query = supabase
      .from('profiles')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (role) query = query.eq('role', role);
    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`full_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  /** Admin-only; the database rejects this for anyone else. */
  async setRole(userId: string, role: Role): Promise<void> {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
    if (error) throw error;

    await auditService.record({
      action: 'user.role_changed',
      entityType: 'profile',
      entityId: userId,
      metadata: { role },
    });
  },

  /** Committee and admin user ids, for notifying reviewers of new work. */
  async getStaffIds(): Promise<string[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['committee', 'admin'])
      .is('deleted_at', null);

    if (error) throw error;
    return (data ?? []).map((row) => row.id);
  },
};
