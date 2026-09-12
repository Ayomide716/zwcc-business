#!/usr/bin/env node
/**
 * Points the Android release build at a real signing key.
 *
 * `expo prebuild` generates `android/` from a template whose release build is
 * signed with the debug keystore — fine for running locally, useless for
 * anything anyone installs, because every machine's debug key is different and
 * an APK signed with one cannot be replaced by an APK signed with another.
 *
 * The generated folder is not committed (it is rebuilt on every run), so this
 * patches it in place during the build rather than being a change anyone has to
 * keep in sync. The key itself comes from Gradle properties the workflow writes
 * from repository secrets, so nothing secret is ever in a tracked file.
 *
 * Anchored on the template's own comment, which sits immediately above the one
 * line that has to change. Both edits are checked, and the script fails loudly
 * rather than producing a debug-signed build that only reveals itself when
 * someone cannot install it over the last one.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const GRADLE = 'android/app/build.gradle';

const DEBUG_SIGNING_CONFIG = `        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }`;

const RELEASE_SIGNING_CONFIG = `${DEBUG_SIGNING_CONFIG}
        release {
            storeFile file(ZWCC_KEYSTORE_FILE)
            storePassword ZWCC_KEYSTORE_PASSWORD
            keyAlias ZWCC_KEY_ALIAS
            keyPassword ZWCC_KEY_PASSWORD
        }`;

const RELEASE_USES_DEBUG_KEY = `            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;

const RELEASE_USES_RELEASE_KEY = `            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.release`;

let gradle = readFileSync(GRADLE, 'utf8');

if (gradle.includes('signingConfigs.release')) {
  console.log('Android release signing already configured.');
  process.exit(0);
}

for (const [what, from, to] of [
  ['release signing config', DEBUG_SIGNING_CONFIG, RELEASE_SIGNING_CONFIG],
  ['release build type', RELEASE_USES_DEBUG_KEY, RELEASE_USES_RELEASE_KEY],
]) {
  const occurrences = gradle.split(from).length - 1;
  if (occurrences !== 1) {
    console.error(
      `Could not patch the ${what}: expected exactly one match in ${GRADLE}, found ${occurrences}.\n` +
        'The Expo Android template has changed. Compare the generated file with the anchors in this script.',
    );
    process.exit(1);
  }
  gradle = gradle.replace(from, to);
}

writeFileSync(GRADLE, gradle);
console.log('Android release build will be signed with the release keystore.');
