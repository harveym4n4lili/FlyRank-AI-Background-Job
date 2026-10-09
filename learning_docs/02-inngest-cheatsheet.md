# Inngest cheat sheet

Everything you need to know to use Inngest. Short on purpose. For the "why background jobs at all" story, see `01-background-jobs-and-inngest.md`.

---

## What Inngest is

A tool that runs your background work for you: **queueing, scheduling, retries, and a dashboard**. You write normal functions in your own app; Inngest decides *when* they run and calls your app to run them.

Without it you'd build a queue (e.g. Redis), a worker process, retry logic and monitoring yourself. That's what BullMQ or Celery make you do.

## The 5 pieces

| Piece | One-liner | This project |
|---|---|---|
| **Client** | Your app's connection to Inngest | `new Inngest({ id: 'report-api' })` |
| **Event** | A message: "something happened" — `name` + `data` | `report/requested` with `{ id, topic }` |
| **Function** | Background code + what triggers it | `make-report`, `heartbeat` |
| **Step** | A named, saved chunk of a function | `step.sleep(...)`, `step.run(...)` |
| **Serve endpoint** | The URL Inngest calls to run your functions | `/api/inngest` |

## Setup in 3 moves

```js
// 1. Client
import { Inngest } from 'inngest';
export const inngest = new Inngest({ id: 'my-app' });

// 2. Function
export const myFn = inngest.createFunction(
  { id: 'my-fn', triggers: [{ event: 'thing/happened' }] },
  async ({ event, step }) => { /* ... */ }
);

// 3. Serve it (Express)
import { serve } from 'inngest/express';
app.use('/api/inngest', serve({ client: inngest, functions: [myFn] }));
```

Then start work from anywhere in your app:

```js
await inngest.send({ name: 'thing/happened', data: { userId: 42 } });
```

> **v4 syntax:** triggers go *inside* the options object. Older tutorials use 3 arguments, `createFunction({ id }, { event }, handler)`. Same idea, old shape.

## How it runs — the one rule that matters

**Inngest re-runs your function from the top for every step.** Finished steps are skipped and their saved results are handed back instead.

```js
async ({ event, step }) => {
  console.log('hi');                                  // runs EVERY time (outside a step)
  const user = await step.run('load-user', () => db.get(event.data.userId)); // runs ONCE
  await step.sleep('wait', '1d');                     // your server isn't waiting, Inngest is
  await step.run('send-email', () => email(user));    // runs ONCE, after a day
}
```

So:

- **Side effects go inside `step.run`**: DB writes, emails, API calls. Otherwise they repeat.
- **Step names must be unique and stable.** The name is how Inngest matches a step to its saved result.
- **Step return values must be JSON-serialisable**, because they're stored.
- This is why jobs are **durable**: a crash or restart loses nothing; the next call just skips the finished steps.

## Step toolbox

| Step | Use it to |
|---|---|
| `step.run('name', fn)` | Do a unit of work once; retried on its own if it throws |
| `step.sleep('name', '8s')` | Pause for a duration (`'30s'`, `'2h'`, `'7d'`) |
| `step.sleepUntil('name', date)` | Pause until a specific time |
| `step.waitForEvent('name', { event, timeout, match })` | Pause until *another* event arrives (e.g. "user clicked the email link"), or time out |
| `step.sendEvent('name', events)` | Send events from inside a function (fan-out) |
| `step.invoke('name', { function, data })` | Call another Inngest function and wait for its result |

## Triggers

```js
triggers: [{ event: 'report/requested' }]         // event: something happened
triggers: [{ cron: '0 8 * * *' }]                 // schedule: the clock (UTC by default)
triggers: [{ cron: 'TZ=Europe/London 0 8 * * *' }] // schedule in a specific timezone
```

Cron fields: **minute · hour · day-of-month · month · day-of-week**. Check expressions on [crontab.guru](https://crontab.guru).

## When things fail

| Tool | What it does |
|---|---|
| `retries: 2` | Attempts = 1 + retries. Default is 3 retries. Waits grow between attempts (**backoff**). |
| `throw new NonRetriableError('...')` | Fail straight away, no retries. For errors a retry can't fix. Import it from `'inngest'`. |
| `onFailure: async ({ event, error }) => {}` | Runs once all retries are used up: clean up, mark as failed, alert someone. The original event is at `event.data.event`. |

Rule of thumb: **bad input → reject it at the door (400). A bad moment (network blip, rate limit) → retry.**

## Flow control (function options)

| Option | What it does | Example use |
|---|---|---|
| `concurrency: { limit: 2 }` | At most N runs at once; the rest queue | Don't hammer a slow API |
| `throttle: { limit: 10, period: '1m' }` | At most N *starts* per period | Respect a third-party rate limit |
| `rateLimit: { limit: 1, period: '1h', key: 'event.data.userId' }` | Drop extra events beyond the limit | One digest email per user per hour |
| `debounce: { period: '30s' }` | Wait for things to go quiet, then run once with the latest event | Re-index after a burst of edits |
| `idempotency: 'event.data.id'` | Ignore duplicate events with the same key (24 h window) | Same report requested twice → built once |

## Dev vs production

| | Local (Dev Server) | Production (Inngest Cloud) |
|---|---|---|
| Start | `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest` | Deploy your app, sync its URL in the Inngest dashboard |
| Dashboard | http://localhost:8288 | app.inngest.com |
| Keys | None. Set `isDev: true` or `INNGEST_DEV=1` | `INNGEST_EVENT_KEY` (to send events) + `INNGEST_SIGNING_KEY` (so only Inngest can call `/api/inngest`) |

Without dev mode and without a signing key, `/api/inngest` returns 500. That's the v4 default.

## Where Inngest is useful

- **Slow work behind an API:** AI calls, report/PDF generation, video or image processing. Reply 202, poll for status.
- **Emails and notifications:** welcome emails, "your export is ready", and drip sequences (`step.sleep('3d')` between messages).
- **Scheduled jobs:** daily summaries, cleanup, syncing data from another service.
- **Multi-step workflows:** charge card → create order → email receipt, where each step retries on its own and nothing runs twice.
- **Waiting on people:** "remind them if they haven't confirmed within 24 h" (`step.waitForEvent` with a timeout).
- **Fan-out:** one event triggers several independent functions, e.g. `user/signed-up` → send email + create CRM record + provision workspace.
- **Webhooks:** accept fast, then process reliably with retries.

## When you don't need it

- The work takes milliseconds. Just do it in the request.
- You need the answer *in* the response (e.g. a login check).
- A one-off script you run by hand.

## Mental model in one line

**Your app defines the work; Inngest holds the clock, the queue and the memory, and calls your app step by step until the work is done.**
