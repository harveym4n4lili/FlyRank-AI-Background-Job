# Report API — your first background job

A small Express API whose slow work runs in a background job. `POST /reports` answers instantly with `202 Accepted`, an [Inngest](https://www.inngest.com/) function does the ~8-second work in the background, and `GET /reports/:id` reports progress (`pending` → `done` or `failed`). A cron function logs a summary every minute with no request at all.

FlyRank Internship · Backend Track · Week 4 · Assignment A7 (JavaScript lane).

## Run it

Requires Node.js 20+ (built with Node 24). No accounts or keys needed — Inngest runs locally.

```bash
git clone https://github.com/harveym4n4lili/FlyRank-AI-Background-Job.git
cd FlyRank-AI-Background-Job
npm install
```

Then run these in two terminals and keep both open:

| Terminal | Command | What it starts |
|---|---|---|
| 1 | `npm run dev` | The API on http://localhost:3000 |
| 2 | `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest` | The Inngest Dev Server + dashboard on http://localhost:8288 |

Order a report and poll it (Git Bash / macOS / Linux):

```bash
curl -i -X POST http://localhost:3000/reports -H "Content-Type: application/json" -d '{"topic":"cats"}'
curl -i http://localhost:3000/reports/<id>    # pending, then done ~10 s later
```

Windows PowerShell: use `curl.exe` and escape the JSON quotes — `-d '{\"topic\":\"cats\"}'`.

## Endpoints

| Method | Path | Response |
|---|---|---|
| `GET` | `/health` | `200` `{ "status": "ok" }` |
| `POST` | `/reports` | Body `{ "topic": "cats" }` → `202` `{ "id", "status": "pending" }` and sends a `report/requested` event. Missing/empty topic → `400`, no event sent. |
| `GET` | `/reports/:id` | `200` with the report: `pending`, then `done` + `result`, or `failed` + `error`. Unknown id → `404`. |
| — | `/api/inngest` | Inngest serve endpoint. The Dev Server calls it to sync and run functions. |

## Functions

| Function | Trigger | What it does |
|---|---|---|
| `say-hello` | Event `test/hello` | Sleeps 5 s (`step.sleep`), returns `"Hello from the background!"`. |
| `make-report` | Event `report/requested` | `step.sleep("do-the-slow-work", "8s")`, then `step.run("build-report")` saves the report as `done`. Topic `"fail"` throws `"The report oven is broken!"`; `retries: 2` gives 3 attempts, then an `onFailure` handler marks the report `failed`. |
| `heartbeat` | Cron `* * * * *` (every minute) | Logs and returns one summary line: how many reports are `pending`, `done`, `failed`. |

Reports are stored in memory, so restarting the API clears them.

## Proof: 202, then two polls

<!-- TODO: paste your own terminal output (POST response with timing, first poll, second poll) -->

```
$ curl -i -X POST http://localhost:3000/reports -H "Content-Type: application/json" -d '{"topic":"cats"}'
PASTE HERE

$ curl -i http://localhost:3000/reports/<id>     # straight away
PASTE HERE

$ curl -i http://localhost:3000/reports/<id>     # ~10 s later
PASTE HERE
```

## Retries vs. bad input (Stage 3)

<!-- TODO: one sentence in your own words on why a missing topic gets a 400 but "fail" gets retried -->

## Cron schedules (Stage 4)

<!-- TODO: your two sentences -->
- Every day at 08:00: `0 8 * * *`
- Every Sunday at 22:00: `0 22 * * 0`

## Dashboard

<!-- TODO: save your screenshot as docs/dashboard.png -->
![Inngest dashboard showing a completed make-report, a failed make-report with retries, and heartbeat runs](docs/dashboard.png)
