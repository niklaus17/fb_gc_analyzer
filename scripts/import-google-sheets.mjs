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

async function fetchSheet(config, sheet) {
  const url = new URL(config.apiUrl);
  url.searchParams.set('action', 'exportSheet');
  url.searchParams.set('sheet', sheet);
  url.searchParams.set('token', config.token);
  const response = await fetch(url);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); }
  catch { throw new Error(`${sheet}: Apps Script nu a întors JSON. Verifică redeploy-ul Web App /exec.`); }
  if (!response.ok || body.ok === false) throw new Error(`${sheet}: ${body.error || response.statusText}`);
  return body.rows || [];
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
  return text ? text : null;
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
  for (const row of rows) {
    const email = value(row, 'email').toLowerCase();
    const number = value(row, 'gc_order_number') || [email, value(row, 'created_at'), value(row, 'utm_campaign'), value(row, 'utm_content'), value(row, 'utm_term')].join('|');
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
  for (const row of rows) {
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
  for (const row of rows) {
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
  try {
    await client.query('BEGIN');
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
      console.log(`${sheet}: ${imported} rânduri importate`);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
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
