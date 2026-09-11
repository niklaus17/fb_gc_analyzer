import { readFile } from 'node:fs/promises';
import { pool } from './db.js';

const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
try {
  await pool.query(schema);
  console.log('Schema PostgreSQL este actualizată.');
} finally {
  await pool.end();
}
