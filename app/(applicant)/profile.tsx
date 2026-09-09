/**
 * Applicant profile: identity, contact details, application history, legal
 * links and sign-out.
 *
 * Laid out as grouped rows rather than a stack of loose cards. Every row shares
 * one icon column and one value column, so labels line up down the page instead
 * of each card setting its own alignment.
 *
 * Application history matters here — a rejected application is preserved and a
 * reapplication links back to it (brief §15), so the applicant can see the
 * whole chain rather than only their latest attempt.
 */
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { StatusBadge } from '@/components/app';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { BrandHeader } from '@/components/ui/Header';
import { ListGroup, ListRow } from '@/components/ui/ListRow';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { ORGANISATION } from '@/config/program.config';
import { useMyApplicationHistory } from '@/hooks/queries';
import { formatDateShort, initials } from '@/lib/format';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { profileService } from '@/services/profile.service';
import { colors, radius, spacing } from '@/theme';
import { ROLE_LABELS } from '@/types/roles';

export default function ProfileScreen() {
  const router = useRouter();
  const toast = useToast();
  const { profile, user, role, refreshProfile, signOut } = useAuth();
  const { data: history = [] } = useMyApplicationHistory();

  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // Re-seed the form whenever the profile loads or changes.
  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setPhone(profile?.phone ?? '');
  }, [profile?.full_name, profile?.phone]);

  async function handleSave() {
    if (!user) return;

    setSaving(true);
    try {
      await profileService.updateProfile(user.id, { full_name: fullName, phone });
      await refreshProfile();
      setEditing(false);
      toast.success('Profile updated');
    } catch (error) {
      toast.error(error, 'Could not update your profile');
    } finally {
      setSaving(false);
    }
  }

  function cancelEditing() {
    setEditing(false);
    setFullName(profile?.full_name ?? '');
    setPhone(profile?.phone ?? '');
  }

  function handleSignOut() {
    Alert.alert('Sign out?', 'You will need to sign in again to see your application.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/sign-in');
        },
      },
    ]);
  }

  return (
    <Screen
      padded={false}
      edgeToEdgeBottom
      stickyHeader={
        <BrandHeader
          pinned
          title="Profile"
          right={<Logo size={32} showWordmark={false} scheme="onDark" />}
        />
      }
    >
      <View style={styles.body}>
        {/* Identity. The one place a face-and-name block belongs. */}
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text variant="title2" color="brand">
              {initials(profile?.full_name)}
            </Text>
          </View>

          <Text variant="title3" align="center">
            {profile?.full_name ?? 'Your name'}
          </Text>
          <Text variant="callout" muted align="center">
            {profile?.email}
          </Text>
          {role ? (
            <View style={styles.rolePill}>
              <Text variant="caption" color="brand">
                {ROLE_LABELS[role]}
              </Text>
            </View>
          ) : null}
        </View>

        {editing ? (
          <View style={styles.editCard}>
            <TextField
              label="Full name"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              required
            />
            <TextField
              label="Phone number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              inputMode="tel"
              helpText="Used for SMS and WhatsApp updates."
              required
            />

            <View style={styles.editActions}>
              <Button label="Cancel" variant="ghost" onPress={cancelEditing} />
              <Button
                label="Save"
                onPress={handleSave}
                loading={saving}
                style={styles.saveButton}
              />
            </View>
          </View>
        ) : (
          <ListGroup
            title="Contact details"
            action={
              <Button
                label="Edit"
                variant="ghost"
                size="sm"
                onPress={() => setEditing(true)}
                icon="create-outline"
              />
            }
          >
            <ListRow icon="call-outline" label="Phone" value={profile?.phone ?? 'Not set'} />
            <ListRow icon="mail-outline" label="Email" value={profile?.email ?? '—'} />
          </ListGroup>
        )}

        {history.length > 0 ? (
          <ListGroup
            title="Application history"
            caption="Every application you have made is kept, including any that were not approved."
          >
            {history.map((application) => (
              <ListRow
                key={application.id}
                icon="document-text-outline"
                label={
                  application.registration_code ?? `Draft · attempt ${application.attempt_number}`
                }
                description={`Started ${formatDateShort(application.created_at)}`}
                right={<StatusBadge status={application.status} size="sm" />}
              />
            ))}
          </ListGroup>
        ) : null}

        <ListGroup title="Legal">
          <ListRow
            icon="document-text-outline"
            label="Terms & Conditions"
            onPress={() => router.push('/legal/terms')}
            accessibilityHint="Opens in this app"
          />
          <ListRow
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            onPress={() => router.push('/legal/privacy')}
            accessibilityHint="Opens in this app"
          />
        </ListGroup>

        <ListGroup title="Help">
          <ListRow icon="mail-outline" label="Email" value={ORGANISATION.supportEmail} />
          <ListRow icon="call-outline" label="Phone" value={ORGANISATION.supportPhone} />
        </ListGroup>

        <ListGroup>
          <ListRow
            icon="log-out-outline"
            label="Sign out"
            tone="danger"
            onPress={handleSignOut}
            chevron={false}
          />
        </ListGroup>

        <Text variant="caption" muted align="center" style={styles.footprint}>
          {ORGANISATION.name} · {ORGANISATION.location}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: spacing.base,
    gap: spacing.lg,
  },
  identity: {
    alignItems: 'center',
    gap: spacing.xxs,
    paddingVertical: spacing.sm,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSurfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  rolePill: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSurface,
  },
  editCard: {
    gap: spacing.base,
    padding: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  editActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  saveButton: {
    minWidth: 110,
  },
  footprint: {
    marginTop: spacing.sm,
  },
});
