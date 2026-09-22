# One-off scripts

Scripts that are run by hand, once, at a moment someone chooses.

They are **not** migrations. Migrations run against every fresh database, and
a database built next March should not send an invitation to a conference that
happened last November. Anything dated, announced or otherwise tied to a
moment in time belongs here instead.

Run them in the Supabase dashboard: **SQL Editor → New query → paste → Run.**

Every script reports what it did in a single row, so the result can be copied
in one tap and pasted back into a conversation.

All of them are safe to run twice. Each guards on an `event_id`, so a second
run reaches only the people who signed up in between — which is also how you
catch late joiners. Just run it again.

## What is here

| Script | When to run it |
|---|---|
| `announce-signs-and-wonders.sql` | Done — sent 22 September 2026 to 26 people |
| `remind-moada-2026.sql` | **22 or 23 November 2026**, four days before the event |

## Nothing runs these for you

There is no scheduler behind them. `remind-moada-2026.sql` will not send
itself: someone has to open the SQL editor on the day and paste it in. Put it
in a calendar, because the app will not remind you.

## One insert, three channels

Each script writes one row to `notifications`, and that row reaches people
three ways:

- **in-app** — the notifications screen reads it directly
- **push** — a trigger on insert calls the `send-push` function
- **email** — the delivery row is picked up by the queue drain within a minute

The `important` flag decides whether the push interrupts. `true` routes it to
the high-importance Android channel and it arrives as a banner over whatever
is on screen; `false` puts it quietly in the notification shade.

Spend `true` carefully. A grant decision earns an interruption. A notice that
the app updated itself does not, and people who are interrupted too often turn
notifications off — after which the grant decision does not reach them either.
