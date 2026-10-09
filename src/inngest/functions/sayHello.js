import { inngest } from '../client.js';

export const sayHello = inngest.createFunction(
  { id: 'say-hello', triggers: [{ event: 'test/hello' }] },
  async ({ step }) => {
    await step.sleep('wait-a-moment', '5s');
    return 'Hello from the background!';
  }
); // Test function: sleeps 5 seconds, then says hello
