# Edge Functions

These run on Supabase (Deno), not in the app. They are excluded from the app's
`tsconfig.json` on purpose: they import from URLs and use the `Deno` global,
neither of which the React Native typecheck knows about. Editing that exclude
will break `npx tsc --noEmit` and therefore the APK workflow.

| Function | Purpose |
| --- | --- |
| `send-push` | Delivers an in-app notification to the recipient's phones via Expo |

Deploy:

```bash
supabase functions deploy send-push --no-verify-jwt
```

`--no-verify-jwt` is correct here: the caller is a database trigger presenting
the service role key in the Authorization header, not a signed-in user.

See `supabase/README.md` for the two database settings the trigger needs.
