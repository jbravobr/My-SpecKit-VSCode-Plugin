import express from 'express';
import cors from 'cors';
import statusRoute from './routes/statusRoute';
import newRoute from './routes/newRoute';
import validateRoute from './routes/validateRoute';
import commitRoute from './routes/commitRoute';
import diffRoute from './routes/diffRoute';
import helpRoute from './routes/helpRoute';

const PORT = parseInt(process.env.SPECKIT_PORT ?? '4815', 10);

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.3.25', service: 'speckit-core-server' });
});

// Routes
app.use(statusRoute);
app.use(newRoute);
app.use(validateRoute);
app.use(commitRoute);
app.use(diffRoute);
app.use(helpRoute);

// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found. See GET /help for available routes.' });
});

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`SpecKit Core Server running at http://127.0.0.1:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  server.close(() => {
    console.log('SpecKit Core Server stopped');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  server.close(() => {
    console.log('SpecKit Core Server stopped');
    process.exit(0);
  });
});

export { app };
