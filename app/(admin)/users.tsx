/**
 * User and role management (brief §23).
 *
 * Role changes are guarded twice: this screen is admin-only, and the database
 * trigger `prevent_self_role_change` rejects a role change from anyone who is
 * not an administrator. Neither alone would be enough.
 */
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Banner, EmptyState, SkeletonList } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { useUsers } from '@/hooks/queries';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDateShort, initials } from '@/lib/format';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { profileService } from '@/services/profile.service';
import { colors, radius, spacing, type Tone } from '@/theme';
import type { ProfileRow } from '@/types/database';
import { ROLES, ROLE_LABELS, type Role } from '@/types/roles';
import { useQueryClient } from '@tanstack/react-query';

const ROLE_TONES: Record<Role, Tone> = {
  applicant: 'neutral',
  committee: 'info',
  admin: 'success',
};

export default function UsersScreen() {
  const toast = useToast();
  const client = useQueryClient();
  const { user: currentUser } = useAuth();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | undefined>(undefined);
  const [selected, setSelected] = useState<ProfileRow | null>(null);
  const [saving, setSaving] = useState(false);

  const debouncedSearch = useDebounce(search, 350);
  const query = useUsers({ role: roleFilter, search: debouncedSearch });

  async function handleSetRole(role: Role) {
    if (!selected) return;

    setSaving(true);
    try {
      await profileService.setRole(selected.id, role);
      void client.invalidateQueries({ queryKey: ['admin', 'users'] });
      setSelected(null);
      toast.success('Role updated', `${selected.full_name ?? 'User'} is now ${ROLE_LABELS[role]}.`);
    } catch (error) {
      toast.error(error, 'Could not change the role');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <ScreenHeader
        title="Users & roles"
        subtitle="Promote reviewers and administrators."
        showBack
      />

      <TextField
        value={search}
        onChangeText={setSearch}
        placeholder="Search name, email or phone"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Search users"
        containerStyle={styles.search}
      />

      <View style={styles.filters}>
        <FilterChip
          label="Everyone"
          active={roleFilter === undefined}
          onPress={() => setRoleFilter(undefined)}
        />
        {ROLES.map((role) => (
          <FilterChip
            key={role}
            label={ROLE_LABELS[role]}
            active={roleFilter === role}
            onPress={() => setRoleFilter(role)}
          />
        ))}
      </View>

      {query.isLoading ? (
        <SkeletonList count={5} />
      ) : (query.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon="person-outline"
          title="No users found"
          message={debouncedSearch ? 'Try a different search.' : 'No users match this filter.'}
        />
      ) : (
        <View style={styles.list}>
          {query.data?.map((profile) => (
            <Card
              key={profile.id}
              variant="outlined"
              onPress={() => setSelected(profile)}
              accessibilityLabel={`${profile.full_name ?? profile.email}, ${ROLE_LABELS[profile.role]}`}
              accessibilityHint="Opens role options"
              style={styles.row}
            >
              <View style={styles.avatar}>
                <Text variant="label" color="brand">
                  {initials(profile.full_name)}
                </Text>
              </View>

              <View style={styles.rowText}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {profile.full_name ?? 'No name set'}
                  {profile.id === currentUser?.id ? ' (you)' : ''}
                </Text>
                <Text variant="caption" muted numberOfLines={1}>
                  {profile.email}
                </Text>
                <Text variant="caption" muted>
                  Joined {formatDateShort(profile.created_at)}
                </Text>
              </View>

              <Badge
                label={ROLE_LABELS[profile.role]}
                tone={ROLE_TONES[profile.role]}
                size="sm"
              />
            </Card>
          ))}
        </View>
      )}

      <Sheet
        visible={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.full_name ?? 'User'}
        subtitle={selected?.email}
      >
        {selected?.id === currentUser?.id ? (
          <Banner
            tone="warning"
            title="This is your own account"
            message="You cannot change your own role. Ask another administrator to do it."
          />
        ) : (
          <>
            <Text variant="label">Set role</Text>

            {ROLES.map((role) => (
              <Button
                key={role}
                label={ROLE_LABELS[role]}
                variant={selected?.role === role ? 'secondary' : 'outline'}
                fullWidth
                disabled={saving || selected?.role === role}
                onPress={() => void handleSetRole(role)}
              />
            ))}

            <Text variant="caption" muted>
              Committee members can review applications and verify documents. Administrators can
              additionally manage users and see the audit log.
            </Text>
          </>
        )}
      </Sheet>
    </Screen>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text variant="label" color={active ? 'onBrand' : 'textSecondary'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: {
    marginBottom: spacing.md,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  chip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSurfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
