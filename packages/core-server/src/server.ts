import express from 'express';
import cors from 'cors';
import statusRoute from './routes/statusRoute';
import newRoute from './routes/newRoute';
import validateRoute from './routes/validateRoute';
import commitRoute from './routes/commitRoute';
import diffRoute from './routes/diffRoute';
import helpRoute from './routes/helpRoute';
import fixRoute from './routes/fixRoute';
import draftRoute from './routes/draftRoute';
import gateRoute from './routes/gateRoute';
import auditRoute from './routes/auditRoute';
import traceRoute from './routes/traceRoute';
import historyRoute from './routes/historyRoute';
import doctorRoute from './routes/doctorRoute';
import batchRoute from './routes/batchRoute';
import initRoute from './routes/initRoute';
import reviewAutoRoute from './routes/reviewAutoRoute';
import contextRoute from './routes/contextRoute';
import statusFixRoute from './routes/statusFixRoute';
import agentRoute from './routes/agentRoute';

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
app.use(fixRoute);
app.use(draftRoute);
app.use(gateRoute);
app.use(auditRoute);
app.use(traceRoute);
app.use(historyRoute);
app.use(doctorRoute);
app.use(batchRoute);
app.use(initRoute);
app.use(reviewAutoRoute);
app.use(contextRoute);
app.use(statusFixRoute);
app.use(agentRoute);

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
