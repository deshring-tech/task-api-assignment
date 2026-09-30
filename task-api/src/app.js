const express = require('express');
const taskRoutes = require('./routes/tasks');

const app = express();

app.use(express.json());

// Simple landing/health route so the deployed live link doesn't 404.
app.get('/', (req, res) => {
  res.json({
    name: 'Task API',
    status: 'ok',
    endpoints: [
      'GET /tasks',
      'GET /tasks?status=todo|in_progress|done',
      'GET /tasks?page=1&limit=10',
      'GET /tasks/stats',
      'POST /tasks',
      'PUT /tasks/:id',
      'DELETE /tasks/:id',
      'PATCH /tasks/:id/complete',
      'PATCH /tasks/:id/assign',
    ],
  });
});

app.use('/tasks', taskRoutes);

// Unknown routes return JSON instead of Express's default HTML page.
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// FIX (Bug 7): malformed JSON bodies used to fall through to the generic handler
// and return 500 "Internal server error". That's a client error, so return 400.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON in request body' });
  }
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Task API running on port ${PORT}`);
  });
}

module.exports = app;
