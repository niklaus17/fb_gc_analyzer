import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getConfig } from './config.js';
import { pool } from './db.js';
import { runManualSync } from './meta.js';

const app = express();
const root = dirname(dirname(fileURLToPath(import.meta.url)));
app.use(express.json());
app.use(express.static(root));

app.get('/api/health', async (_request, response) => {
  try { await pool.query('SELECT 1'); response.json({ ok: true, database: 'connected' }); }
  catch (error) { response.status(503).json({ ok: false, error: error.message }); }
});

app.get('/api/meta/sync/latest', async (_request, response) => {
  const result = await pool.query(`SELECT id,status,requested_from,requested_to,accounts_total,
    accounts_completed,rows_imported,error_message,started_at,finished_at
    FROM sync_runs WHERE source='meta' ORDER BY started_at DESC LIMIT 1`);
  response.json(result.rows[0] || null);
});

app.post('/api/meta/sync', async (request, response) => {
  const { from, to } = request.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '') || from > to)
    return response.status(400).json({ error: 'Perioada este invalidă.' });
  try { response.json({ ok: true, ...await runManualSync({ from, to }) }); }
  catch (error) {
    const conflict = error.constraint === 'one_running_meta_sync';
    response.status(conflict ? 409 : 500).json({ error: conflict ? 'Există deja un import în desfășurare.' : error.message });
  }
});

app.use((_request, response) => response.sendFile(join(root, 'index.html')));
app.listen(getConfig().port, '127.0.0.1', () => console.log(`Dashboard local: http://localhost:${getConfig().port}`));
