import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'report-api',
  isDev: process.env.NODE_ENV !== 'production', // Talk to the local Dev Server instead of Inngest Cloud
}); // Inngest client shared by all functions
