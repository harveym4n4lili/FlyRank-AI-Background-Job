import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Welcome to the AI Background Job API!');
}); // Root route to test the server

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
}); // Health check endpoint

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
}); // Start the server and listen on the specified port
