import { getConfig } from './config.js';
import { pool, withTransaction } from './db.js';

const WEBSITE_LEAD_ACTION = 'lead';
const ATTRIBUTION_WINDOW = '7d_click';
const TRANSIENT_META_CODES = new Set([1, 2, 4, 17, 32, 613]);
const RETRY_DELAYS_MS = [1000, 3000, 7000];
const INSIGHTS_CHUNK_DAYS = 14;

export function leadCount(actions = []) {
  const action = actions.find(({ action_type }) => action_type === WEBSITE_LEAD_ACTION);
  return Number(action?.[ATTRIBUTION_WINDOW] || 0);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function metaErrorMessage(response, body) {
  const meta = body?.error || {};
  const details = [
    meta.message,
    meta.error_user_msg,
    meta.code && `cod ${meta.code}`,
    meta.error_subcode && `subcod ${meta.error_subcode}`,
  ].filter(Boolean);
  return details.join(' · ') || `Meta API: HTTP ${response.status}.`;
}

function isTransientMetaError(response, body) {
  const code = Number(body?.error?.code || 0);
  return response.status >= 500 || TRANSIENT_META_CODES.has(code);
}

async function fetchMetaJson(url) {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await fetch(url);
      const body = await response.json();
      if (response.ok && !body.error) return body;
      lastError = new Error(metaErrorMessage(response, body));
      if (!isTransientMetaError(response, body) || attempt === RETRY_DELAYS_MS.length) throw lastError;
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_DELAYS_MS.length) throw lastError;
    }
    await wait(RETRY_DELAYS_MS[attempt]);
  }
  throw lastError;
}

async function graph(path, params = {}) {
  const { metaApiVersion, metaAccessToken } = getConfig();
  if (!metaAccessToken) throw new Error('META_ACCESS_TOKEN lipsește din fișierul .env.');
  const url = new URL(`https://graph.facebook.com/${metaApiVersion}/${path}`);
  for (const [key, value] of Object.entries({ ...params, access_token: metaAccessToken })) {
    url.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  return fetchMetaJson(url);
}

async function allPages(path, params) {
  const rows = [];
  let body = await graph(path, params);
  while (true) {
    rows.push(...(body.data || []));
    if (!body.paging?.next) return rows;
    body = await fetchMetaJson(body.paging.next);
  }
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

async function insights(accountId, from, to, breakdowns) {
  const params = {
    level: 'ad', time_increment: 1, time_range: { since: from, until: to }, limit: 500,
    action_attribution_windows: ['7d_click'],
    fields: 'account_id,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,actions,date_start',
  };
  if (breakdowns) params.breakdowns = breakdowns;
  return allPages(`${accountId}/insights`, params);
}

async function insightsInChunks(accountId, from, to, breakdowns) {
  const rows = [];
  let cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    const chunkEnd = new Date(Math.min(addDays(cursor, INSIGHTS_CHUNK_DAYS - 1).getTime(), end.getTime()));
    rows.push(...await insights(accountId, isoDate(cursor), isoDate(chunkEnd), breakdowns));
    cursor = addDays(chunkEnd, 1);
  }
  return rows;
}

async function storeAccount(client, account, rows) {
  const { metaBusinessPortfolioId, metaBusinessPortfolioName } = getConfig();
  const portfolio = account.business || { id: metaBusinessPortfolioId, name: metaBusinessPortfolioName };
  await client.query(`INSERT INTO business_portfolios(id,name,updated_at) VALUES($1,$2,now())
    ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,updated_at=now()`, [portfolio.id, portfolio.name]);
  await client.query(`INSERT INTO ad_accounts(id,portfolio_id,name,currency,timezone_name,account_status,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(id) DO UPDATE SET portfolio_id=EXCLUDED.portfolio_id,
    name=EXCLUDED.name,currency=EXCLUDED.currency,timezone_name=EXCLUDED.timezone_name,
    account_status=EXCLUDED.account_status,updated_at=now()`,
    [account.id, portfolio.id, account.name, account.currency, account.timezone_name, account.account_status]);
  for (const row of rows) {
    await client.query(`INSERT INTO campaigns(id,account_id,name,updated_at) VALUES($1,$2,$3,now())
      ON CONFLICT(id) DO UPDATE SET account_id=EXCLUDED.account_id,name=EXCLUDED.name,updated_at=now()`,
      [row.campaign_id, account.id, row.campaign_name]);
    await client.query(`INSERT INTO adsets(id,account_id,campaign_id,name,updated_at) VALUES($1,$2,$3,$4,now())
      ON CONFLICT(id) DO UPDATE SET account_id=EXCLUDED.account_id,campaign_id=EXCLUDED.campaign_id,name=EXCLUDED.name,updated_at=now()`,
      [row.adset_id, account.id, row.campaign_id, row.adset_name]);
    await client.query(`INSERT INTO ads(id,account_id,campaign_id,adset_id,name,updated_at) VALUES($1,$2,$3,$4,$5,now())
      ON CONFLICT(id) DO UPDATE SET account_id=EXCLUDED.account_id,campaign_id=EXCLUDED.campaign_id,
      adset_id=EXCLUDED.adset_id,name=EXCLUDED.name,updated_at=now()`,
      [row.ad_id, account.id, row.campaign_id, row.adset_id, row.ad_name]);
  }
}

async function storeBase(client, accountId, rows) {
  for (const row of rows) await client.query(`INSERT INTO meta_ad_insights_daily
    (account_id,ad_id,insight_date,spend,impressions,clicks,leads,raw_actions,imported_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,now()) ON CONFLICT(account_id,ad_id,insight_date)
    DO UPDATE SET spend=EXCLUDED.spend,impressions=EXCLUDED.impressions,clicks=EXCLUDED.clicks,
    leads=EXCLUDED.leads,raw_actions=EXCLUDED.raw_actions,imported_at=now()`,
    [accountId, row.ad_id, row.date_start, Number(row.spend || 0), Number(row.impressions || 0),
      Number(row.clicks || 0), leadCount(row.actions), JSON.stringify(row.actions || [])]);
}

async function storeAges(client, accountId, rows) {
  for (const row of rows) await client.query(`INSERT INTO meta_ad_age_daily
    (account_id,ad_id,insight_date,age_bucket,spend,impressions,clicks,leads,raw_actions,imported_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now()) ON CONFLICT(account_id,ad_id,insight_date,age_bucket)
    DO UPDATE SET spend=EXCLUDED.spend,impressions=EXCLUDED.impressions,clicks=EXCLUDED.clicks,
    leads=EXCLUDED.leads,raw_actions=EXCLUDED.raw_actions,imported_at=now()`,
    [accountId, row.ad_id, row.date_start, row.age, Number(row.spend || 0), Number(row.impressions || 0),
      Number(row.clicks || 0), leadCount(row.actions), JSON.stringify(row.actions || [])]);
}

export async function runManualSync({ from, to }) {
  const { metaAdAccountIds } = getConfig();
  if (!metaAdAccountIds.length) throw new Error('META_AD_ACCOUNT_IDS lipsește din fișierul .env.');
  const started = await pool.query(`INSERT INTO sync_runs(trigger_type,requested_from,requested_to,status,accounts_total)
    VALUES('manual',$1,$2,'running',$3) RETURNING id`, [from, to, metaAdAccountIds.length]);
  const syncId = started.rows[0].id;
  let imported = 0;
  try {
    for (const accountId of metaAdAccountIds) {
      // Portfolio discovery requires business_management. The performance import
      // intentionally works with ads_read alone.
      let account, baseRows, ageRows;
      try { account = await graph(accountId, { fields: 'id,name,currency,timezone_name,account_status' }); }
      catch (error) { throw new Error(`${accountId}: citirea contului a eșuat · ${error.message}`); }
      try { baseRows = await insightsInChunks(accountId, from, to); }
      catch (error) { throw new Error(`${accountId}: raportul zilnic a eșuat · ${error.message}`); }
      try { ageRows = await insightsInChunks(accountId, from, to, 'age'); }
      catch (error) { throw new Error(`${accountId}: raportul pe vârste a eșuat · ${error.message}`); }
      await withTransaction(async (client) => {
        await storeAccount(client, account, baseRows);
        await storeBase(client, account.id, baseRows);
        await storeAges(client, account.id, ageRows);
      });
      imported += baseRows.length + ageRows.length;
      await pool.query('UPDATE sync_runs SET accounts_completed=accounts_completed+1,rows_imported=$2 WHERE id=$1', [syncId, imported]);
    }
    await pool.query("UPDATE sync_runs SET status='succeeded',finished_at=now() WHERE id=$1", [syncId]);
    return { syncId, rowsImported: imported };
  } catch (error) {
    await pool.query("UPDATE sync_runs SET status='failed',error_message=$2,finished_at=now() WHERE id=$1", [syncId, error.message]);
    throw error;
  }
}
