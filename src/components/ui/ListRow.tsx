/**
 * Grouped list rows, the pattern used by system settings and banking apps.
 *
 * `ListGroup` draws one card with a section label above it; `ListRow` draws a
 * single line inside it. Rows share one icon column and one value column, so
 * labels and values line up down the whole group instead of each row setting
 * its own spacing. Dividers are drawn by the group between rows, not by rows
 * themselves, so there is never a stray line above the first or below the last.
 */
import { Ionicons } from '@expo/vector-icons';
import { Children, Fragment, isValidElement } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { MIN_TOUCH_TARGET, colors, radius, shadows, spacing } from '@/theme';

import { Text } from './Text';

/* -------------------------------------------------------------------------- */

export interface ListGroupProps {
  /** Small heading above the card. */
  title?: string;
  /** Optional control on the same line as the title, e.g. an Edit button. */
  action?: React.ReactNode;
  /** Explanatory line under the title. */
  caption?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ListGroup({ title, action, caption, children, style }: ListGroupProps) {
  const rows = Children.toArray(children).filter(isValidElement);

  return (
    <View style={[styles.group, style]}>
      {title ? (
        <View style={styles.groupHeader}>
          <Text variant="overline" muted>
            {title.toUpperCase()}
          </Text>
          {action}
        </View>
      ) : null}

      <View style={styles.card}>
        {rows.map((row, index) => (
          <Fragment key={row.key ?? index}>
            {index > 0 ? <View style={styles.divider} /> : null}
            {row}
          </Fragment>
        ))}
      </View>

      {caption ? (
        <Text variant="caption" muted style={styles.caption}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------------- */

export interface ListRowProps {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  /** Right-hand text, e.g. a phone number. */
  value?: string;
  /** Rendered instead of `value`, e.g. a status badge. */
  right?: React.ReactNode;
  /** Second line under the label. */
  description?: string;
  onPress?: () => void;
  /** Shows the chevron. Defaults to true when `onPress` is given. */
  chevron?: boolean;
  tone?: 'default' | 'danger';
  accessibilityHint?: string;
}

export function ListRow({
  icon,
  label,
  value,
  right,
  description,
  onPress,
  chevron,
  tone = 'default',
  accessibilityHint,
}: ListRowProps) {
  const showChevron = chevron ?? Boolean(onPress);
  const danger = tone === 'danger';
  const iconColor = danger ? colors.danger : colors.brand;

  const body = (
    <>
      {icon ? (
        <View style={[styles.iconWell, danger && styles.iconWellDanger]}>
          <Ionicons name={icon} size={17} color={iconColor} />
        </View>
      ) : null}

      <View style={styles.labelColumn}>
        <Text variant="body" color={danger ? 'dangerStrong' : undefined}>
          {label}
        </Text>
        {description ? (
          <Text variant="caption" muted>
            {description}
          </Text>
        ) : null}
      </View>

      {right ??
        (value ? (
          <Text variant="callout" muted numberOfLines={1} style={styles.value}>
            {value}
          </Text>
        ) : null)}

      {showChevron ? (
        <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{body}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {body}
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  group: {
    gap: spacing.xs,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 24,
    paddingHorizontal: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    // Starts past the icon column so the line sits under the text, not the icon.
    marginLeft: spacing.base + 32 + spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  iconWell: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.brandSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWellDanger: {
    backgroundColor: colors.dangerSurface,
  },
  labelColumn: {
    flex: 1,
    gap: spacing.xxs,
  },
  value: {
    flexShrink: 1,
    textAlign: 'right',
  },
  caption: {
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xxs,
  },
});
