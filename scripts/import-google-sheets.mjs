import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { getConfig } from '../server/config.js';

const { Pool } = pg;
const pool = new Pool({ connectionString: getConfig().databaseUrl });
const EVENT_SHEETS = {
  gc_l1in: 'l1in',
  gc_l1sent: 'l1sent',
  gc_graduates: 'graduates',
  gc_age_sub_18: 'sub_18',
  gc_age_18_21: '18_21',
  gc_age_22_24: '22_24',
  gc_age_25_34: '25_34',
  gc_age_35_44: '35_44',
  gc_age_45_plus: '45_plus',
};

function parseLocalConfig(text) {
  const apiUrl = text.match(/googleApiUrl:\s*["']([^"']+)["']/)?.[1] || '';
  const token = text.match(/googleApiToken:\s*["']([^"']+)["']/)?.[1] || '';
  if (!apiUrl || !token) throw new Error('Lipsește googleApiUrl sau googleApiToken din config.local.js.');
  return { apiUrl, token };
}

const RETRY_DELAYS_MS = [1500, 4000, 8000];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url, sheet) {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await fetch(url);
      const text = await response.text();
      let body;
      try { body = JSON.parse(text); }
      catch {
        const error = new Error(`${sheet}: Apps Script nu a întors JSON. Răspuns HTML/invalid de la Google.`);
        error.transient = response.status >= 400 || text.includes('ppConfig');
        throw error;
      }
      if (response.ok && body.ok !== false) return body;
      const error = new Error(`${sheet}: ${body.error || response.statusText}`);
      error.transient = response.status >= 500;
      throw error;
    } catch (error) {
      lastError = error;
      if (!error.transient || attempt === RETRY_DELAYS_MS.length) throw error;
      await wait(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
}

async function fetchSheet(config, sheet) {
  const url = new URL(config.apiUrl);
  url.searchParams.set('action', 'exportSheet');
  url.searchParams.set('sheet', sheet);
  url.searchParams.set('token', config.token);
  const body = await fetchJsonWithRetry(url, sheet);
  return body.rows || [];
}

function normalizeKey(key) {
  return String(key || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\uFEFF/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
function normalizedRow(row) {
  const aliases = {
    user_email: 'email',
    number: 'order_number',
    data_crearii: 'created_at',
    comanda_detalii: 'product_name',
    cost_money: 'cost_amount',
    payed_money: 'paid_amount',
  };
  const result = {};
  for (const [key, value] of Object.entries(row || {})) {
    const normalized = normalizeKey(key);
    result[aliases[normalized] || normalized] = value;
  }
  return result;
}
function value(row, key) {
  const result = row[key];
  return result == null ? '' : String(result).trim();
}
function num(row, key) {
  const n = Number(String(row[key] ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
function nullableDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const eu = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (eu) {
    const [, d, m, y, hh = '00', mm = '00', ss = '00'] = eu;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')} ${hh.padStart(2, '0')}:${mm}:${ss}`;
  }
  return text;
}

async function importAccounts(client, rows) {
  let count = 0;
  for (const row of rows) {
    const id = value(row, 'id');
    if (!id) continue;
    const portfolioId = value(row, 'portfolio_id') || 'google-sheets';
    await client.query(`INSERT INTO business_portfolios(id,name,updated_at) VALUES($1,$2,now())
      ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,updated_at=now()`, [portfolioId, portfolioId]);
    await client.query(`INSERT INTO ad_accounts(id,portfolio_id,name,currency,timezone_name,account_status,updated_at)
      VALUES($1,$2,$3,$4,'',NULL,now()) ON CONFLICT(id) DO UPDATE SET portfolio_id=EXCLUDED.portfolio_id,
      name=EXCLUDED.name,currency=EXCLUDED.currency,updated_at=now()`, [id, portfolioId, value(row, 'name') || id, value(row, 'currency') || 'USD']);
    count++;
  }
  return count;
}
async function importCampaigns(client, rows) {
  let count = 0;
  for (const row of rows) {
    const id = value(row, 'id'), accountId = value(row, 'account_id');
    if (!id || !accountId) continue;
    await client.query(`INSERT INTO campaigns(id,account_id,name,updated_at) VALUES($1,$2,$3,now())
      ON CONFLICT(id) DO UPDATE SET account_id=EXCLUDED.account_id,name=EXCLUDED.name,updated_at=now()`, [id, accountId, value(row, 'name') || id]);
    count++;
  }
  return count;
}
async function importAdsets(client, rows) {
  let count = 0;
  for (const row of rows) {
    const id = value(row, 'id'), accountId = value(row, 'account_id'), campaignId = value(row, 'campaign_id');
    if (!id || !accountId || !campaignId) continue;
    await client.query(`INSERT INTO adsets(id,account_id,campaign_id,name,updated_at) VALUES($1,$2,$3,$4,now())
      ON CONFLICT(id) DO UPDATE SET account_id=EXCLUDED.account_id,campaign_id=EXCLUDED.campaign_id,name=EXCLUDED.name,updated_at=now()`, [id, accountId, campaignId, value(row, 'name') || id]);
    count++;
  }
  return count;
}
async function importAds(client, rows) {
  let count = 0;
  for (const row of rows) {
    const id = value(row, 'id'), accountId = value(row, 'account_id'), campaignId = value(row, 'campaign_id'), adsetId = value(row, 'adset_id');
    if (!id || !accountId || !campaignId || !adsetId) continue;
    await client.query(`INSERT INTO ads(id,account_id,campaign_id,adset_id,name,updated_at) VALUES($1,$2,$3,$4,$5,now())
      ON CONFLICT(id) DO UPDATE SET account_id=EXCLUDED.account_id,campaign_id=EXCLUDED.campaign_id,adset_id=EXCLUDED.adset_id,name=EXCLUDED.name,updated_at=now()`, [id, accountId, campaignId, adsetId, value(row, 'name') || id]);
    count++;
  }
  return count;
}
async function importMetaDaily(client, rows) {
  let count = 0;
  for (const row of rows) {
    const accountId = value(row, 'account_id'), adId = value(row, 'ad_id'), date = value(row, 'date');
    if (!accountId || !adId || !date) continue;
    await client.query(`INSERT INTO meta_ad_insights_daily(account_id,ad_id,insight_date,spend,impressions,clicks,leads,raw_actions,imported_at)
      VALUES($1,$2,$3,$4,0,0,$5,'[]'::jsonb,now()) ON CONFLICT(account_id,ad_id,insight_date)
      DO UPDATE SET spend=EXCLUDED.spend,leads=EXCLUDED.leads,imported_at=now()`, [accountId, adId, date, num(row, 'spend'), Math.round(num(row, 'leads_fb'))]);
    count++;
  }
  return count;
}
async function importGcLeads(client, rows) {
  let count = 0;
  for (const raw of rows) {
    const row = normalizedRow(raw);
    const email = value(row, 'email').toLowerCase();
    const number = value(row, 'gc_order_number') || value(row, 'order_number') || [email, value(row, 'created_at'), value(row, 'utm_campaign'), value(row, 'utm_content'), value(row, 'utm_term')].join('|');
    if (!email || !number) continue;
    await client.query(`INSERT INTO gc_leads(email,gc_order_number,created_at,lead_date,product_name,utm_source,utm_medium,utm_campaign,utm_content,utm_term,imported_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()) ON CONFLICT(gc_order_number) DO UPDATE SET email=EXCLUDED.email,created_at=EXCLUDED.created_at,
      lead_date=EXCLUDED.lead_date,product_name=EXCLUDED.product_name,utm_source=EXCLUDED.utm_source,utm_medium=EXCLUDED.utm_medium,
      utm_campaign=EXCLUDED.utm_campaign,utm_content=EXCLUDED.utm_content,utm_term=EXCLUDED.utm_term,imported_at=now()`,
      [email, number, nullableDate(row.created_at), nullableDate(row.lead_date), value(row, 'product_name'), value(row, 'utm_source'), value(row, 'utm_medium'), value(row, 'utm_campaign'), value(row, 'utm_content'), value(row, 'utm_term')]);
    count++;
  }
  return count;
}
async function importGcOrders(client, rows) {
  let count = 0;
  for (const raw of rows) {
    const row = normalizedRow(raw);
    const email = value(row, 'email').toLowerCase(), number = value(row, 'order_number');
    if (!email || !number) continue;
    await client.query(`INSERT INTO gc_orders(order_number,email,status,positions,cost_amount,paid_amount,currency,created_at,imported_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT(order_number) DO UPDATE SET email=EXCLUDED.email,status=EXCLUDED.status,positions=EXCLUDED.positions,
      cost_amount=EXCLUDED.cost_amount,paid_amount=EXCLUDED.paid_amount,currency=EXCLUDED.currency,created_at=EXCLUDED.created_at,imported_at=now()`,
      [number, email, value(row, 'status'), value(row, 'positions'), num(row, 'cost_amount'), num(row, 'paid_amount'), value(row, 'currency') || 'EUR', nullableDate(row.created_at)]);
    count++;
  }
  return count;
}
async function importEvents(client, eventType, rows) {
  let count = 0;
  for (const raw of rows) {
    const row = normalizedRow(raw);
    const email = value(row, 'email').toLowerCase();
    if (!email) continue;
    await client.query(`INSERT INTO gc_events(email,event_type,imported_at) VALUES($1,$2,now())
      ON CONFLICT(email,event_type) DO UPDATE SET imported_at=now()`, [email, eventType]);
    count++;
  }
  return count;
}

async function main() {
  const config = parseLocalConfig(await readFile('config.local.js', 'utf8'));
  const client = await pool.connect();
  let runId = null;
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TABLE IF NOT EXISTS google_import_runs (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      status text NOT NULL CHECK (status IN ('running','succeeded','failed')),
      error_message text,
      started_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS google_import_sheet_runs (
      run_id bigint NOT NULL REFERENCES google_import_runs(id) ON DELETE CASCADE,
      sheet_name text NOT NULL,
      rows_read integer NOT NULL DEFAULT 0,
      rows_imported integer NOT NULL DEFAULT 0,
      imported_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (run_id, sheet_name)
    )`);
    const runResult = await client.query("INSERT INTO google_import_runs(status) VALUES('running') RETURNING id");
    runId = runResult.rows[0].id;
    const order = ['ad_accounts', 'campaigns', 'adsets', 'ads', 'meta_daily', 'gc_leads', 'gc_orders', 'gc_orders_paid', ...Object.keys(EVENT_SHEETS)];
    for (const sheet of order) {
      const rows = await fetchSheet(config, sheet);
      let imported = 0;
      if (sheet === 'ad_accounts') imported = await importAccounts(client, rows);
      else if (sheet === 'campaigns') imported = await importCampaigns(client, rows);
      else if (sheet === 'adsets') imported = await importAdsets(client, rows);
      else if (sheet === 'ads') imported = await importAds(client, rows);
      else if (sheet === 'meta_daily') imported = await importMetaDaily(client, rows);
      else if (sheet === 'gc_leads') imported = await importGcLeads(client, rows);
      else if (sheet === 'gc_orders' || sheet === 'gc_orders_paid') imported = await importGcOrders(client, rows);
      else if (EVENT_SHEETS[sheet]) imported = await importEvents(client, EVENT_SHEETS[sheet], rows);
      await client.query(`INSERT INTO google_import_sheet_runs(run_id,sheet_name,rows_read,rows_imported) VALUES($1,$2,$3,$4)
        ON CONFLICT(run_id,sheet_name) DO UPDATE SET rows_read=EXCLUDED.rows_read,rows_imported=EXCLUDED.rows_imported,imported_at=now()`, [runId, sheet, rows.length, imported]);
      console.log(`${sheet}: ${imported} din ${rows.length} rânduri importate`);
    }
    await client.query("UPDATE google_import_runs SET status='succeeded',finished_at=now() WHERE id=$1", [runId]);
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query("UPDATE google_import_runs SET status='failed',error_message=$1,finished_at=now() WHERE id=$2", [error.message, runId]);
      await client.query('COMMIT');
    } catch { await client.query('ROLLBACK'); }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
