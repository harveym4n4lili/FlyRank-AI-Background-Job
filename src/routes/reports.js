import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { inngest } from '../inngest/client.js';
import { reports } from '../store/reports.js';

export const reportsRouter = Router();

reportsRouter.post('/', async (req, res) => {
  const { topic } = req.body ?? {}; // Body is undefined when no JSON is sent
  const report = { id: randomUUID(), topic, status: 'pending' };
  reports.set(report.id, report);

  await inngest.send({ name: 'report/requested', data: { id: report.id, topic } });

  res.status(202).json({ id: report.id, status: report.status });
}); // Accept the order fast: save it, hand the slow work to Inngest, reply 202

reportsRouter.get('/:id', (req, res) => {
  const report = reports.get(req.params.id);
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }
  res.json(report);
}); // Status endpoint: pending first, done + result later
