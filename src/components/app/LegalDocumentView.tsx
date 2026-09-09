/**
 * Renders a `LegalDocument`. Shared by the Terms and Privacy screens so the
 * placeholder notice cannot be shown on one and forgotten on the other.
 */
import { StyleSheet, View } from 'react-native';

import { Banner } from '@/components/ui/Feedback';
import { Text } from '@/components/ui/Text';
import type { LegalDocument } from '@/config/legal.config';
import { ORGANISATION } from '@/config/program.config';
import { colors, spacing } from '@/theme';

export function LegalDocumentView({ document }: { document: LegalDocument }) {
  return (
    <View style={styles.container}>
      <Banner
        tone="warning"
        title="Draft document"
        message={document.placeholderNotice}
        icon="construct-outline"
      />

      <View style={styles.meta}>
        <Text variant="caption" muted>
          {ORGANISATION.name} · {document.lastUpdated}
        </Text>
      </View>

      <Text variant="body">{document.intro}</Text>

      {document.sections.map((section) => (
        <View key={section.heading} style={styles.section}>
          <Text variant="title3" accessibilityRole="header">
            {section.heading}
          </Text>
          {section.body.map((paragraph, index) => (
            <Text
              key={index}
              variant="body"
              color={paragraph.startsWith('[Placeholder') ? 'warningStrong' : 'textSecondary'}
            >
              {paragraph}
            </Text>
          ))}
        </View>
      ))}

      <View style={styles.footer}>
        <Text variant="caption" muted>
          Questions? Contact {ORGANISATION.supportEmail} or {ORGANISATION.supportPhone}.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  meta: {
    paddingBottom: spacing.xs,
  },
  section: {
    gap: spacing.sm,
  },
  footer: {
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
});
