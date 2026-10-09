import { inngest } from '../client.js';
import { reports } from '../../store/reports.js';

export const makeReport = inngest.createFunction(
  {
    id: 'make-report',
    triggers: [{ event: 'report/requested' }],
    retries: 2, // 1 attempt + 2 retries = 3 attempts before the run is marked Failed
    onFailure: async ({ event, error }) => {
      const { id, topic } = event.data.event.data; // The original report/requested event
      reports.set(id, { id, topic, status: 'failed', error: error.message });
    }, // Runs once all retries are used up: mark the report failed
  },
  async ({ event, step }) => {
    const { id, topic } = event.data;

    await step.sleep('do-the-slow-work', '8s'); // Stand-in for real slow work (an AI call, a big export)

    return await step.run('build-report', () => {
      if (topic === 'fail') {
        throw new Error('The report oven is broken!');
      } // Simulated failure to watch Inngest retry

      const report = {
        id,
        topic,
        status: 'done',
        result: `Your report on "${topic}" is ready.`,
      };
      reports.set(id, report);
      return report;
    }); // Build the result and save it, so it happens exactly once
  }
); // Background job: does the slow work for a requested report
