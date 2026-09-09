/**
 * Administration home (brief §23).
 *
 * Two kinds of thing live here: management screens (users, audit) and a
 * read-only view of the configuration that drives the app. The configuration
 * view exists so an administrator can see exactly which workflow, documents and
 * rules are live without reading code — and so the developer changing them has
 * an obvious place to check their work.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { StatTile } from '@/components/app';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useCommitteeStats } from '@/hooks/queries';
import { colors, radius, spacing } from '@/theme';

interface AdminLink {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  route: string;
}

const LINKS: AdminLink[] = [
  {
    icon: 'people-outline',
    title: 'Users & roles',
    description: 'Find applicants, promote committee members and administrators.',
    route: '/(admin)/users',
  },
  {
    icon: 'git-branch-outline',
    title: 'Workflow & configuration',
    description: 'The statuses, documents, rules and notifications currently in force.',
    route: '/(admin)/configuration',
  },
  {
    icon: 'receipt-outline',
    title: 'Audit log',
    description: 'Every significant action, who took it and when.',
    route: '/(admin)/audit',
  },
];

export default function AdminDashboard() {
  const router = useRouter();
  const stats = useCommitteeStats();

  return (
    <Screen onRefresh={() => void stats.refetch()} refreshing={stats.isRefetching}>
      <ScreenHeader
        title="Administration"
        subtitle="Manage users, review the configuration, and audit activity."
        showBack
      />

      <View style={styles.grid}>
        <StatTile
          label="Total applications"
          value={stats.data?.total}
          icon="documents-outline"
          tone="progress"
          loading={stats.isLoading}
          onPress={() => router.push('/(committee)/applications')}
        />
        <StatTile
          label="Active beneficiaries"
          value={stats.data?.activeBeneficiaries}
          icon="people-outline"
          tone="success"
          loading={stats.isLoading}
          onPress={() => router.push('/(committee)/beneficiaries')}
        />
      </View>

      <View style={styles.links}>
        {LINKS.map((link) => (
          <Card
            key={link.route}
            variant="outlined"
            onPress={() => router.push(link.route as never)}
            accessibilityLabel={link.title}
            accessibilityHint={link.description}
            style={styles.link}
          >
            <View style={styles.linkIcon}>
              <Ionicons name={link.icon} size={20} color={colors.brand} />
            </View>

            <View style={styles.linkText}>
              <Text variant="bodyMedium">{link.title}</Text>
              <Text variant="caption" muted>
                {link.description}
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Card>
        ))}
      </View>

      <Banner
        tone="info"
        title="Changing the workflow"
        message="Statuses, documents, form questions and rules live in the app's configuration files. Editing them and re-running the configuration seed changes the behaviour everywhere, without a rebuild of the review screens."
        icon="construct-outline"
      />

      <Button
        label="Back to committee view"
        variant="outline"
        icon="arrow-back"
        onPress={() => router.replace('/(committee)/dashboard')}
        fullWidth
        style={styles.back}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.base,
  },
  links: {
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brandSurfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: {
    flex: 1,
    gap: 1,
  },
  back: {
    marginTop: spacing.base,
  },
});
