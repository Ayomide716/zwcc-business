# Edge Functions

These run on Supabase (Deno), not in the app. They are excluded from the app's
`tsconfig.json` on purpose: they import from URLs and use the `Deno` global,
neither of which the React Native typecheck knows about. Editing that exclude
will break `npx tsc --noEmit` and therefore the APK workflow.

| Function | Purpose |
| --- | --- |
| `send-push` | Delivers an in-app notification to the recipient's phones via Expo |
| `send-email` | Drains the email queue through Resend |
| `render-document` | Turns an uploaded PDF into page images the app can show |
| `delete-account` | Deletes the caller's own account and every file they uploaded |

`delete-account` is deployed **with** JWT verification (the default):

```bash
supabase functions deploy delete-account
```

Unlike `send-push`, its caller is a signed-in person, and nobody else should
reach it. It also verifies the token itself against the auth server and takes
the user from that, never from the request, so it cannot be pointed at anyone
else's account. Who may delete is decided by `account_deletion_blocker()` in
migration 0024.

Deploy:

```bash
supabase functions deploy send-push --no-verify-jwt
```

`--no-verify-jwt` is correct here: the caller is a database trigger presenting
the service role key in the Authorization header, not a signed-in user.

See `supabase/README.md` for the two database settings the trigger needs.
