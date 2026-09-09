/**
 * Staff account screen. Deliberately spare — a reviewer's job is the queue, not
 * this page.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { ROLE_CAPABILITIES } from '@/config/permissions.config';
import { GRANT_PROGRAM, ORGANISATION } from '@/config/program.config';
import { initials } from '@/lib/format';
import { useAuth } from '@/providers/AuthProvider';
import { colors, radius, spacing } from '@/theme';
import { ROLE_LABELS } from '@/types/roles';

export default function StaffProfileScreen() {
  const router = useRouter();
  const { profile, role, signOut } = useAuth();

  function handleSignOut() {
    Alert.alert('Sign out?', 'You will need to sign in again to review applications.', [
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

  const capabilityCount = role ? ROLE_CAPABILITIES[role].length : 0;

  return (
    <Screen>
      <ScreenHeader title="Account" />

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
              {ROLE_LABELS[role]} · {capabilityCount} permissions
            </Text>
          ) : null}
        </View>
      </Card>

      {role === 'admin' ? (
        <Card style={styles.section}>
          <Text variant="title3">Administration</Text>
          <Button
            label="Open admin dashboard"
            variant="outline"
            icon="settings-outline"
            onPress={() => router.push('/(admin)/dashboard')}
            fullWidth
          />
        </Card>
      ) : null}

      <Card style={styles.section}>
        <Text variant="title3">Programme</Text>
        <Row icon="ribbon-outline" label="Grant" value={GRANT_PROGRAM.name} />
        <Row icon="business-outline" label="Organisation" value={ORGANISATION.name} />
        <Row icon="location-outline" label="Location" value={ORGANISATION.location} />
      </Card>

      <Card style={styles.section}>
        <Text variant="title3">Legal</Text>
        <Button
          label="Terms & Conditions"
          variant="ghost"
          icon="document-text-outline"
          onPress={() => router.push('/legal/terms')}
          style={styles.linkRow}
        />
        <Button
          label="Privacy Policy"
          variant="ghost"
          icon="shield-checkmark-outline"
          onPress={() => router.push('/legal/privacy')}
          style={styles.linkRow}
        />
      </Card>

      <Button
        label="Sign out"
        variant="outline"
        icon="log-out-outline"
        onPress={handleSignOut}
        fullWidth
      />
    </Screen>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <Text variant="caption" muted style={styles.rowLabel}>
        {label}
      </Text>
      <Text variant="callout" style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowLabel: {
    width: 84,
  },
  rowValue: {
    flex: 1,
  },
  linkRow: {
    justifyContent: 'flex-start',
    paddingHorizontal: 0,
  },
});
