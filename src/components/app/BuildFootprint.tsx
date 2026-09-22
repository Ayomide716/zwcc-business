/**
 * What this phone is actually running.
 *
 * Added after an afternoon spent guessing why a published update was not
 * appearing. The bundle was correct and the publish was correct, and there was
 * no way to tell from the outside whether the phone had received either — so
 * the only honest answer to "is it on the latest version" was a shrug.
 *
 * This is the instrument that ends that. It also answers the first question
 * anyone supporting this app will ever ask: which version are you on.
 *
 * Deliberately plain text rather than a debug panel. A church administrator
 * reading it aloud over the phone is the use case.
 */
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';

import { Text } from '../ui/Text';

function shortId(id: string | null): string {
  // Update ids are UUIDs and nobody reads one aloud. The first segment is
  // plenty to tell two updates apart.
  return id?.split('-')[0] ?? '—';
}

export function BuildFootprint() {
  const version = Constants.expoConfig?.version ?? '—';

  // `isEmbeddedLaunch` is the one that matters: true means the phone is running
  // the code that shipped inside the APK and has taken no update at all.
  const source = Updates.isEmbeddedLaunch ? 'as installed' : `update ${shortId(Updates.updateId)}`;

  const published = Updates.createdAt
    ? Updates.createdAt.toISOString().slice(0, 10)
    : null;

  return (
    <Text variant="caption" muted align="center">
      Version {version} · {source}
      {published ? ` · ${published}` : ''}
    </Text>
  );
}
