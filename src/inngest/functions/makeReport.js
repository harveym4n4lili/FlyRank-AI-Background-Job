import { inngest } from '../client.js';
import { reports } from '../../store/reports.js';

export const makeReport = inngest.createFunction(
  { id: 'make-report', triggers: [{ event: 'report/requested' }] },
  async ({ event, step }) => {
    const { id, topic } = event.data;

    await step.sleep('do-the-slow-work', '8s'); // Stand-in for real slow work (an AI call, a big export)

    return await step.run('build-report', () => {
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
