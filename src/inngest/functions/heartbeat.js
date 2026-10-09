import { inngest } from '../client.js';
import { reports } from '../../store/reports.js';

export const heartbeat = inngest.createFunction(
  { id: 'heartbeat', triggers: [{ cron: '* * * * *' }] }, // Every minute (testing only; a real one would run daily)
  async () => {
    const counts = { pending: 0, done: 0, failed: 0 };
    for (const report of reports.values()) {
      counts[report.status] += 1;
    }

    const summary = `Reports: ${counts.pending} pending, ${counts.done} done, ${counts.failed} failed`;
    console.log(`[heartbeat] ${summary}`);
    return summary; // Shown as the run's output in the dashboard
  }
); // Cron job: no endpoint, no event — the clock is the only trigger
