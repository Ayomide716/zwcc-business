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

## 2. Put your keys in two places

**`.env`** — for running locally with `npm start`:

```bash
cp .env.example .env
```

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

**`eas.json`** — for cloud builds. `.env` is gitignored and is *not* uploaded
to EAS, so the values must also be in the `env` block of each build profile.
Replace the `REPLACE_WITH_...` placeholders.

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
