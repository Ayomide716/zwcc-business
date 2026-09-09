/**
 * Typography primitive. Every piece of text in the app goes through this, so
 * font sizes and colours come from tokens rather than being typed inline.
 */
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { colors, typography, type TypographyToken } from '@/theme';

export interface TextProps extends RNTextProps {
  variant?: TypographyToken;
  /** Any colour token, or an explicit colour for one-off cases. */
  color?: keyof typeof colors | (string & {});
  align?: TextStyle['textAlign'];
  /** Convenience for muted secondary copy. */
  muted?: boolean;
  weight?: TextStyle['fontWeight'];
}

export function Text({
  variant = 'body',
  color,
  align,
  muted,
  weight,
  style,
  ...rest
}: TextProps) {
  const resolvedColor =
    color && color in colors ? colors[color as keyof typeof colors] : (color as string | undefined);

  return (
    <RNText
      {...rest}
      style={[
        typography[variant],
        { color: resolvedColor ?? (muted ? colors.textSecondary : colors.text) },
        align ? { textAlign: align } : null,
        weight ? { fontWeight: weight } : null,
        style,
      ]}
      // Respect the user's font-size setting, but stop very large settings
      // from breaking multi-column layouts entirely.
      maxFontSizeMultiplier={rest.maxFontSizeMultiplier ?? 1.6}
    />
  );
}
