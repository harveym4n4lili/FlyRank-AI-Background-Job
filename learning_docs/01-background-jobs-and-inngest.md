# Background jobs and Inngest — what Stages 0 and 1 actually do

This doc explains every idea you need to understand what happens when you press **Invoke** on `say-hello` in the dashboard. It builds up in order: first the problem, then the vocabulary, then the exact flow through your code.

---

## 1. The problem: some work is too slow for a request

Everything you have built so far is **request/response**:

```
client ──── GET /health ────▶ server
client ◀─── 200 {status:ok} ── server     (client waited the whole time)
```

The client sends a request and **waits** until the server has finished the work. That is fine when the work takes milliseconds. It breaks when the work takes seconds or minutes (an AI call, a PDF export, sending 1,000 emails):

- The user stares at a spinner.
- Proxies and browsers give up after a timeout (often 30–60 s) — the request fails even though the server is still working.
- The user hits "retry", and now the work runs **twice**.
- If the server crashes halfway, the work is lost and nobody knows.

## 2. The fix: accept fast, work in the background, report status

A **background job** is work your server *starts* but does not *finish* inside the request.

```
client ── POST /reports ──▶ server ── "please do this later" ──▶ job system
client ◀── 202 {id, pending} ── server                           (works for 8 s)
client ── GET /reports/:id ──▶ server  →  "pending" … later "done"
```

Three moves:

1. **Accept fast** — reply immediately with `202 Accepted` and an id ("I have your order, here's your ticket number").
2. **Work in the background** — something else does the slow part.
3. **Report status** — a status endpoint lets the client check progress (**polling**).

That's Stages 2–3. Stage 1 is about step 2: setting up the "something else".

## 3. Three ways work can start

| How work starts | Example | Name |
|---|---|---|
| A client asks and waits | `GET /health` | Request/response (Stage 0) |
| A client asks, the work happens later | `POST /reports` → 202 | Background job, started by an **event** (Stages 1–3) |
| Nobody asks — the clock starts it | every minute, log a summary | Cron job, started by a **schedule** (Stage 4) |

## 4. Who does the background work? The worker

Something has to actually run the job. That something is called a **worker**. Building one yourself means building:

- a **queue** to hold jobs that are waiting,
- a **worker process** that pulls jobs off the queue and runs them,
- **retries** when a job fails, with **backoff** (waiting longer each time),
- a way to **see** what's running and what failed.

Tools like BullMQ (Node + Redis) or Celery (Python) give you those pieces, but you wire them yourself. **Inngest** does all of it for you. Your code just says *"here is a function, run it when this event happens"*, and Inngest handles queueing, scheduling, retries and the dashboard.

## 5. The Inngest vocabulary

| Word | What it is | In your code |
|---|---|---|
| **Client** | Your app's connection to Inngest. Every function and every sent event goes through it. Its `id` names your app. | `src/inngest/client.js` → `new Inngest({ id: 'report-api' })` |
| **Event** | A small message saying "something happened". It has a **name** and optional **data**. | `test/hello` (Stage 1), `report/requested` (Stage 2) |
| **Function** | A piece of background work you define. | `src/inngest/functions/sayHello.js` |
| **Trigger** | What starts a function — an event name or a cron schedule. | `triggers: [{ event: 'test/hello' }]` |
| **Step** | One named, saved piece of a function. Inngest records each step's result. | `step.sleep('wait-a-moment', '5s')` |
| **Run** | One execution of a function, from trigger to finish. Shown in the dashboard. | each time you press Invoke |
| **Serve endpoint** | The URL in *your* API where Inngest calls in to run your functions. | `app.use('/api/inngest', serve(...))` |
| **Dev Server** | Inngest's engine + dashboard running on your machine (port 8288). | `npx inngest-cli@latest dev -u …` |

Note: events and functions are **decoupled**. The code that *sends* `report/requested` doesn't know or care which functions listen to it. You could add a second function on the same event later without touching the endpoint.

## 6. The surprising part: Inngest calls *you*

You might expect Inngest to take your function code away and run it somewhere else. It doesn't. **Your function code always runs inside your own Express server.** Inngest is the conductor: it decides *when* each step runs and then makes an HTTP request to your `/api/inngest` endpoint to say "run this function now".

That's why there are **two programs** running:

```
┌──────────────────────────┐                ┌──────────────────────────────┐
│ Terminal 1               │                │ Terminal 2                   │
│ Your Express API :3000   │                │ Inngest Dev Server :8288     │
│                          │  ◀── HTTP ──── │  - stores events and runs    │
│  /health                 │  "run say-hello│  - decides when steps run    │
│  /api/inngest  ◀─────────│──  step now"   │  - retries, schedules, cron  │
│   (serve handler + your  │                │  - dashboard (the web page)  │
│    function code)        │  ──── HTTP ──▶ │                              │
│                          │  "here's the   │                              │
│                          │   result"      │                              │
└──────────────────────────┘                └──────────────────────────────┘
```

Consequence you'll rely on in Stage 2: because your functions run inside your API process, they can read and write the same in-memory `Map` your routes use.

### What `serve()` does

```js
app.use('/api/inngest', serve({ client: inngest, functions: [sayHello] }));
```

`serve` builds an Express handler that answers three kinds of requests at `/api/inngest`:

- **"What functions do you have?"** — the Dev Server asks this when it starts (that's what `-u http://localhost:3000/api/inngest` points it at). Your app replies with each function's id and trigger. This is called **syncing**. It's how `say-hello` shows up in the dashboard without you registering it anywhere.
- **"Run this function"** — the Dev Server sends the event and the results of steps already done; the SDK runs your code and replies with what happened.
- **A plain GET** — returns a small info object (try `curl localhost:3000/api/inngest`: you'll see `"mode":"dev"` and `"function_count":1`).

If you add a function but forget to put it in the `functions: [...]` array, the Dev Server never hears about it.

### Dev mode vs cloud mode

The same SDK can talk to the local Dev Server or to Inngest Cloud (production). Cloud mode requires a **signing key** so strangers can't call your `/api/inngest` and run your functions. Locally you have no key, so the client sets:

```js
isDev: process.env.NODE_ENV !== 'production'
```

Without that, `/api/inngest` returns 500 with *"In cloud mode but no signing key found"*.

## 7. Steps, and why your function runs more than once

This is the most important idea in Inngest, and it's invisible until someone explains it.

Your function:

```js
async ({ step }) => {
  await step.sleep('wait-a-moment', '5s');
  return 'Hello from the background!';
}
```

You'd guess: Node waits 5 seconds, then returns. **That's not what happens.** Your server never sits there sleeping. Instead:

| # | Who | What happens |
|---|---|---|
| 1 | Dev Server → your API | "Run `say-hello`. No steps done yet." |
| 2 | Your API | Runs your function from the top. Hits `step.sleep('wait-a-moment', '5s')`. The SDK **stops the function there** and replies: "I need a 5-second sleep called `wait-a-moment`." The HTTP request **ends**. |
| 3 | Dev Server | Records that, waits 5 seconds. Your API is idle — it isn't holding anything open. |
| 4 | Dev Server → your API | "Run `say-hello` again. `wait-a-moment` is done." |
| 5 | Your API | Runs your function **from the top again**. Hits `step.sleep` — the SDK sees it's already done and skips straight past it. Reaches `return`. Replies: "Finished, result = `'Hello from the background!'`". |
| 6 | Dev Server | Marks the run **Completed**. |

So your function body ran **twice**, and the sleep happened *between* two HTTP requests, inside the Dev Server — not inside your code.

The pattern behind this:

- Each **step** has a **name** (`'wait-a-moment'`). That's how Inngest recognises "this step already happened" on the next run-through.
- Finished steps are **saved** (memoised). On every re-run, already-finished steps are **replayed** from the saved result instead of being executed again.
- Code **outside** a step runs again on every re-run. That's why in Stage 2 anything with an effect (saving to the `Map`) goes **inside** `step.run(...)`, so it happens exactly once.

### Why build it like this?

Because it makes jobs **durable**:

- If your API crashes or restarts during the 5-second sleep, nothing is lost. The Dev Server still knows the run exists and which steps are done; it simply calls your API again once it's back.
- A long job never holds an HTTP request open, so it never hits a timeout.
- If step 3 of 4 fails, a retry starts again at step 3. Steps 1–2 are replayed, not redone. (Retries are Stage 3.)

You'll see this directly in the optional "restart experiment" extra.

## 8. Walkthrough: pressing Invoke in Stage 1

Put it all together:

1. **`npm run dev`** starts Express on port 3000. `serve()` is mounted at `/api/inngest`, holding the `say-hello` definition.
2. **`npx inngest-cli@latest dev -u http://localhost:3000/api/inngest`** starts the Dev Server on port 8288. It calls your `/api/inngest` and syncs: *"app `report-api` has one function, `say-hello`, triggered by `test/hello`"*.
3. You open **http://localhost:8288** and see `say-hello` under Functions.
4. You press **Invoke**. The Dev Server creates a **run** (Invoke triggers the function directly — the same thing a `test/hello` event would do).
5. The run follows the table in section 7: call → sleep requested → 5 s wait in the Dev Server → call again → sleep skipped → return.
6. The dashboard shows the run with its `wait-a-moment` step and status **Completed**, output `"Hello from the background!"`.

That's the whole Stage 1 checkpoint. Nothing about it is useful yet. It proves the pipe works: Inngest can find your functions, call into your API, pause, resume, and record the result.

## 9. Where Stages 2–4 plug in

- **Stage 2** — `POST /reports` sends a `report/requested` event with `inngest.send(...)` and returns `202` right away. A new function `make-report` is triggered by that event: `step.sleep` 8 s, then `step.run('build-report', …)` writes the result into the shared `Map`. `GET /reports/:id` reads the `Map` → `pending`, later `done`.
- **Stage 3** — throw an error inside `build-report` for topic `"fail"` and watch Inngest retry it with backoff. Reject missing input with `400` *before* sending an event: bad input is never worth retrying.
- **Stage 4** — a function with a **cron** trigger instead of an event. Same machinery, but the Dev Server's clock starts it.

## 10. Quick self-check

If you can answer these, you understand Stage 1:

1. Why is it a problem to do 8 seconds of work inside `POST /reports`?
2. Which program decides *when* `say-hello` runs, and which program actually *executes* its code?
3. What is `/api/inngest` for, and who calls it?
4. How does the dashboard know `say-hello` exists?
5. How many times does the body of `say-hello` run during one Invoke, and why?
6. Why must steps have names?
7. What would go wrong if you deleted `isDev` from the client?

<details>
<summary>Answers</summary>

1. The client waits the whole time, may time out, may retry and cause duplicate work, and a crash loses the work.
2. The Dev Server decides when; your Express API executes the code.
3. It's the door through which the Dev Server syncs your functions and asks your app to run them. The Dev Server calls it.
4. On startup, the Dev Server calls `/api/inngest` and the SDK replies with the functions listed in `serve({ functions: [...] })` (syncing).
5. Twice: once until it hits the sleep, once after the sleep to finish. Finished steps are replayed, not re-run.
6. The name is how Inngest matches a step to its saved result on later re-runs.
7. The SDK would run in cloud mode, find no signing key, and `/api/inngest` would return 500, so the Dev Server couldn't sync or run anything.

</details>
