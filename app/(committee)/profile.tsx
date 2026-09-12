/**
 * Staff account screen. Deliberately spare — a reviewer's job is the queue, not
 * this page.
 *
 * Shares the applicant profile's grouped-row layout so both roles get the same
 * shape and alignment.
 */
import { useRouter } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { Logo } from '@/components/brand/Logo';
import { BrandHeader } from '@/components/ui/Header';
import { ListGroup, ListRow } from '@/components/ui/ListRow';
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
    <Screen
      padded={false}
      edgeToEdgeBottom
      stickyHeader={
        <BrandHeader
          pinned
          title="Account"
          right={<Logo size={32} showWordmark={false} scheme="onDark" />}
        />
      }
    >
      <View style={styles.body}>
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
                {ROLE_LABELS[role]} · {capabilityCount} permissions
              </Text>
            </View>
          ) : null}
        </View>

        {role === 'admin' ? (
          <ListGroup title="Administration">
            <ListRow
              icon="settings-outline"
              label="Admin dashboard"
              description="Users, configuration and the audit trail"
              onPress={() => router.push('/(admin)/dashboard')}
            />
          </ListGroup>
        ) : null}

        <ListGroup title="Programme">
          {/*
            One-line labels. These three sit beside the longest values in the
            app — the programme and organisation names — and "Organisation" was
            being squeezed until it broke across two lines mid-word.
          */}
          <ListRow
            icon="ribbon-outline"
            label="Grant"
            value={GRANT_PROGRAM.name}
            labelNumberOfLines={1}
          />
          <ListRow
            icon="business-outline"
            label="Organisation"
            value={ORGANISATION.name}
            labelNumberOfLines={1}
          />
          <ListRow
            icon="location-outline"
            label="Location"
            value={ORGANISATION.location}
            labelNumberOfLines={1}
          />
        </ListGroup>

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

        <ListGroup>
          <ListRow
            icon="log-out-outline"
            label="Sign out"
            tone="danger"
            onPress={handleSignOut}
            chevron={false}
          />
        </ListGroup>
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
});
