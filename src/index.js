import express from 'express';
import { serve } from 'inngest/express';
import { inngest } from './inngest/client.js';
import { sayHello } from './inngest/functions/sayHello.js';
import { makeReport } from './inngest/functions/makeReport.js';
import { reportsRouter } from './routes/reports.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Welcome to the AI Background Job API!');
}); // Root route to test the server

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
}); // Health check endpoint

app.use('/reports', reportsRouter); // Report endpoints: POST /reports, GET /reports/:id

app.use('/api/inngest', serve({ client: inngest, functions: [sayHello, makeReport] })); // Endpoint the Inngest Dev Server calls to run functions

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
}); // Start the server and listen on the specified port
