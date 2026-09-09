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

## Verifying the build is wired up correctly

Open the app. If you see **"Setup required"** instead of the sign-in screen,
the Supabase keys did not make it into the build — check the `env` block of the
profile you built with, not just `.env`.

## Notes

- **App identity** is `org.zionworldcc.businessgrant`. Change it in `app.json`
  under `android.package` / `ios.bundleIdentifier` before publishing if ZWCC
  wants a different one.
- **The app icon is a generated placeholder.** Drop the official ZWCC artwork
  into `assets/` (sizes are listed at the top of
  `scripts/generate-brand-assets.js`) before a public release.
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
