/**
 * Applicant profile: contact details, application history, legal links and
 * sign-out.
 *
 * Application history matters here — a rejected application is preserved and a
 * reapplication links back to it (brief §15), so the applicant can see the
 * whole chain rather than only their latest attempt.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { StatusBadge } from '@/components/app';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ScreenHeader } from '@/components/ui/Header';
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
    <Screen>
      <ScreenHeader title="Profile" />

      <Card style={styles.identity}>
        <View style={styles.avatar}>
          <Text variant="title2" color="brand">
            {initials(profile?.full_name)}
          </Text>
        </View>

        <View style={styles.identityText}>
          <Text variant="title3">{profile?.full_name ?? 'Your name'}</Text>
          <Text variant="callout" muted>
            {profile?.email}
          </Text>
          {role ? (
            <Text variant="caption" color="brand">
              {ROLE_LABELS[role]}
            </Text>
          ) : null}
        </View>
      </Card>

      <Card style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text variant="title3">Contact details</Text>
          {!editing ? (
            <Button
              label="Edit"
              variant="ghost"
              size="sm"
              onPress={() => setEditing(true)}
              icon="create-outline"
            />
          ) : null}
        </View>

        {editing ? (
          <View style={styles.form}>
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

            <View style={styles.formActions}>
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => {
                  setEditing(false);
                  setFullName(profile?.full_name ?? '');
                  setPhone(profile?.phone ?? '');
                }}
              />
              <Button
                label="Save"
                onPress={handleSave}
                loading={saving}
                style={styles.saveButton}
              />
            </View>
          </View>
        ) : (
          <View style={styles.details}>
            <DetailRow icon="call-outline" label="Phone" value={profile?.phone ?? 'Not set'} />
            <DetailRow icon="mail-outline" label="Email" value={profile?.email ?? '—'} />
          </View>
        )}
      </Card>

      {history.length > 0 ? (
        <Card style={styles.section}>
          <Text variant="title3">Application history</Text>
          <Text variant="caption" muted>
            Every application you have made is kept, including any that were not approved.
          </Text>

          {history.map((application) => (
            <View key={application.id} style={styles.historyRow}>
              <View style={styles.historyText}>
                <Text variant="callout">
                  {application.registration_code ?? `Draft · attempt ${application.attempt_number}`}
                </Text>
                <Text variant="caption" muted>
                  Started {formatDateShort(application.created_at)}
                </Text>
              </View>
              <StatusBadge status={application.status} size="sm" />
            </View>
          ))}
        </Card>
      ) : null}

      <Card style={styles.section}>
        <Text variant="title3">Legal</Text>
        <LinkRow
          icon="document-text-outline"
          label="Terms & Conditions"
          onPress={() => router.push('/legal/terms')}
        />
        <LinkRow
          icon="shield-checkmark-outline"
          label="Privacy Policy"
          onPress={() => router.push('/legal/privacy')}
        />
      </Card>

      <Card style={styles.section}>
        <Text variant="title3">Help</Text>
        <DetailRow icon="mail-outline" label="Email" value={ORGANISATION.supportEmail} />
        <DetailRow icon="call-outline" label="Phone" value={ORGANISATION.supportPhone} />
      </Card>

      <Button
        label="Sign out"
        variant="outline"
        onPress={handleSignOut}
        icon="log-out-outline"
        fullWidth
        style={styles.signOut}
      />

      <Text variant="caption" muted align="center" style={styles.version}>
        {ORGANISATION.name} · {ORGANISATION.location}
      </Text>
    </Screen>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <Text variant="caption" muted style={styles.detailLabel}>
        {label}
      </Text>
      <Text variant="callout" style={styles.detailValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function LinkRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Button
      label={label}
      variant="ghost"
      icon={icon}
      onPress={onPress}
      style={styles.linkRow}
      accessibilityHint="Opens in this app"
    />
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    marginBottom: spacing.base,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSurfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: {
    flex: 1,
    gap: 1,
  },
  section: {
    gap: spacing.md,
    marginBottom: spacing.base,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  form: {
    gap: spacing.base,
  },
  formActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  saveButton: {
    minWidth: 110,
  },
  details: {
    gap: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  detailLabel: {
    width: 56,
  },
  detailValue: {
    flex: 1,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  historyText: {
    flex: 1,
  },
  linkRow: {
    justifyContent: 'flex-start',
    paddingHorizontal: 0,
  },
  signOut: {
    marginTop: spacing.sm,
  },
  version: {
    marginTop: spacing.lg,
  },
});
