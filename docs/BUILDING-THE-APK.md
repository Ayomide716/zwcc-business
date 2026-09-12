# Building the Android APK

## Before you start

You need two things from Supabase (**Project Settings → API**):

- **Project URL** — `https://xxxxxxxx.supabase.co`
- **anon / public key** — the long `eyJ...` string

The anon key is safe to put in the build. Row Level Security is what protects
the data, and that is verified — see `supabase/README.md`. **Never** put the
`service_role` key in this app; anything in an APK is readable by anyone who
installs it.

## 1. Run the database setup

Paste **`supabase/SETUP.sql`** into the Supabase SQL Editor and run it once.
It creates every table, policy, trigger and storage bucket.

Then register in the app and promote yourself:

```sql
update public.profiles set role = 'admin' where email = 'your-email@example.com';
```

## 2. Keys are already configured

`.env` and all three `eas.json` build profiles are set to the ZWCC project
(`ygqtedzcagowklyielhz`). Nothing to do unless the project changes — in which
case, update both places.

Both places matter, for different reasons:

- **`.env`** is used by `npm start` on a development machine. It is gitignored.
- **`eas.json`** is used by cloud builds. Because `.env` is gitignored it never
  reaches EAS, so the same values live in each profile's `env` block.

The anon key is designed to be shipped in client apps; RLS is what protects the
data. If you would rather not have it in git, move it to EAS environment
variables (`eas env:create`) and delete the `env` blocks.

## 3. Build

```bash
npm install -g eas-cli
eas login
eas init          # links the project and writes a real projectId into app.json
npm run build:apk # or: eas build --platform android --profile preview
```

The `preview` profile is configured with `"buildType": "apk"`, so it produces
an installable **.apk** rather than a Play Store `.aab`. EAS gives you a
download link when it finishes (typically 10–20 minutes on the free tier).

For the Play Store later, `npm run build:aab` uses the `production` profile.

### Building locally instead

If you have Android Studio and a JDK and would rather not queue:

```bash
npm run build:apk:local
```

## 4. Install it

Download the APK to the phone and open it. Android will ask you to allow
installing from unknown sources — expected for a build distributed outside the
Play Store.

## Two ways to build, and one way to skip building

**Build APK on GitHub** is the one to use. It runs entirely on a GitHub runner:
`expo prebuild` generates the native project, Gradle assembles a signed release
APK, and the result is attached to a GitHub release you can open on a phone.
Public repositories get unlimited Actions minutes, so there is no monthly cap.

**Build Android APK** is the original, which hands the work to EAS. It is
capped on the Expo free plan — around fifteen Android builds a month, and the
build simply refuses once they are used. Kept as a fallback, not the default.

**Publish update (no new APK)** ships a JavaScript change to phones that already
have the app, with nobody installing anything. Use it whenever the change is
only under `app/` or `src/`.

A change needs a real build, not an update, when it touches:

- a dependency with native code
- `android`, `ios` or `plugins` in app.json
- a permission
- the Expo SDK version
- `expo.version` in app.json

That last one matters because the runtime version follows the app version, and
an update only reaches builds with a matching runtime. Bumping the version is
how an old APK is stopped from receiving updates it cannot run — so bump it
deliberately when the native side changes, and leave it alone otherwise.

## Signing

The APK is signed with the keystore EAS generated, held as four repository
secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`.

It has to stay the same keystore. Android refuses to replace an installed app
with one signed by a different key, so a new keystore would mean everyone
uninstalling first — and if the app ever reaches the Play Store, the key becomes
permanent. Keep the backup somewhere that is not this repository.

`android/` is generated on every build and never committed, which keeps app.json
and the config plugins the single description of the app. The release build in
that generated project is signed with the debug key by default;
`scripts/configure-android-signing.mjs` repoints it and fails loudly if the Expo
template ever changes shape, rather than quietly producing a debug-signed APK
that only fails on a phone that already has the app.

## Verifying the build is wired up correctly

Open the app. If you see **"Setup required"** instead of the sign-in screen,
the Supabase keys did not make it into the build — check the `env` block of the
profile you built with, not just `.env`.

## Notes

- **App identity** is `org.zionworldcc.businessgrant`. Change it in `app.json`
  under `android.package` / `ios.bundleIdentifier` before publishing if ZWCC
  wants a different one.
- **The app icon is the official ZWCC artwork**, derived from
  `assets/brand/zwcc-logo.png`. The supplied file is 394x528, so the 1024px
  launcher icon is an upscale; if a larger original or a vector version turns
  up, replace that one file and regenerate the icons from it.
- **Version bumps**: `eas.json` uses `"appVersionSource": "remote"`, so EAS
  manages the Android `versionCode` for you. Bump the user-facing
  `expo.version` in `app.json` for each release.


## Watch out: stale Metro cache hides key changes

If you change `.env` or `eas.json` and rebuild **locally**, Metro may reuse a
cached transform and silently bake in the *old* values. The app then shows
"Setup required" even though the config looks correct.

This was confirmed in practice: after writing the real keys, a local
`expo export` still produced a bundle containing the `placeholder.supabase.co`
fallback. Rebuilding with `--clear` fixed it.

```bash
npx expo export --platform android --clear
npx expo start --clear
```

**EAS cloud builds are not affected** — each build starts on a clean machine
with no cache.

### Confirming the keys really made it in

```bash
# The real project ref should appear; 'placeholder.supabase.co' should not.
grep -oa "https://[a-z0-9]*\.supabase\.co" <bundle>.hbc | sort -u
```


## Building from a phone (no terminal)

`.github/workflows/build-apk.yml` runs the EAS build for you, so the whole flow
works from the GitHub website or mobile app.

**One-time setup**

1. expo.dev -> sign up -> **Settings -> Access tokens** -> **Create token**, copy it.
2. GitHub repo -> **Settings -> Secrets and variables -> Actions** ->
   **New repository secret**. Name it exactly `EXPO_TOKEN`, paste the value.

**Every build**

GitHub -> **Actions** -> **Build Android APK** -> **Run workflow** -> pick
`preview` -> Run.

The workflow checks the token, typechecks, links the EAS project, and waits for
the cloud build. When it goes green, the APK download link is on your Expo
dashboard under Builds.

### Why the Run workflow button is visible

GitHub only shows `workflow_dispatch` workflows that exist on the repository's
**default branch**. This repo's default branch is
`claude/zwcc-grant-mobile-app-cmeh1t`, which is where the workflow lives, so it
appears. If the default branch is ever changed to `main`, this workflow must be
merged there or the button disappears.

### Rotate the Expo token if it has been shared

An Expo access token grants full control of the account: builds, submissions,
and over-the-air updates to installed apps. If the token has been pasted into a
chat, an email, or anywhere else, revoke it at expo.dev -> Settings -> Access
tokens once the build works, create a fresh one, and update the GitHub secret.
