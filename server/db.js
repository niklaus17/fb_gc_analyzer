import pg from 'pg';
import { getConfig } from './config.js';

const { Pool } = pg;
export const pool = new Pool({ connectionString: getConfig().databaseUrl });

export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
