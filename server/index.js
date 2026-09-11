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

app.get('/api/report', async (request, response) => {
  const { metaAdAccountIds, metaAdAccountNames } = getConfig();
  const from = request.query.from || '1900-01-01';
  const to = request.query.to || '2999-12-31';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to)
    return response.status(400).json({ error: 'Perioada este invalidă.' });

  const accountResult = await pool.query(`SELECT a.id,a.portfolio_id,a.name,a.currency,p.name AS portfolio_name
    FROM ad_accounts a LEFT JOIN business_portfolios p ON p.id=a.portfolio_id
    WHERE COALESCE(array_length($1::text[],1),0)=0 OR a.id=ANY($1::text[])
    ORDER BY a.name`, [metaAdAccountIds]);
  const accounts = accountResult.rows.map((account) => ({
    id: account.id,
    portfolioId: account.portfolio_id || `portfolio:${account.id}`,
    name: metaAdAccountNames[account.id] || account.name,
    originalName: account.name,
    currency: account.currency,
  }));
  const portfolios = Object.values(Object.fromEntries(accountResult.rows.map((account) => [
    account.portfolio_id || `portfolio:${account.id}`,
    { id: account.portfolio_id || `portfolio:${account.id}`, name: account.portfolio_name || 'Meta Ads' },
  ])));

  const rows = await pool.query(`WITH base AS (
    SELECT account_id,ad_id,COALESCE(SUM(spend),0)::float AS spend,COALESCE(SUM(leads),0)::int AS leads
    FROM meta_ad_insights_daily WHERE insight_date BETWEEN $2 AND $3 GROUP BY account_id,ad_id
  ), ages AS (
    SELECT account_id,ad_id,
      COALESCE(SUM(CASE WHEN age_bucket='13-17' THEN leads ELSE 0 END),0)::int AS sub_16,
      COALESCE(SUM(CASE WHEN age_bucket='18-24' THEN leads ELSE 0 END),0)::int AS "18_24",
      COALESCE(SUM(CASE WHEN age_bucket='25-34' THEN leads ELSE 0 END),0)::int AS "25_34",
      COALESCE(SUM(CASE WHEN age_bucket='35-44' THEN leads ELSE 0 END),0)::int AS "35_44",
      COALESCE(SUM(CASE WHEN age_bucket IN ('45-54','55-64','65+') THEN leads ELSE 0 END),0)::int AS "45_plus"
    FROM meta_ad_age_daily WHERE insight_date BETWEEN $2 AND $3 GROUP BY account_id,ad_id
  )
    SELECT c.id AS campaign_id,c.name AS campaign_name,
    s.id AS adset_id,s.name AS adset_name,a.id AS ad_id,a.name AS ad_name,a.account_id,
    COALESCE(base.spend,0) AS spend,COALESCE(base.leads,0) AS leads,
    COALESCE(ages.sub_16,0) AS sub_16,COALESCE(ages."18_24",0) AS "18_24",
    COALESCE(ages."25_34",0) AS "25_34",COALESCE(ages."35_44",0) AS "35_44",
    COALESCE(ages."45_plus",0) AS "45_plus"
    FROM ads a
    JOIN adsets s ON s.id=a.adset_id
    JOIN campaigns c ON c.id=a.campaign_id
    LEFT JOIN base ON base.account_id=a.account_id AND base.ad_id=a.id
    LEFT JOIN ages ON ages.account_id=a.account_id AND ages.ad_id=a.id
    WHERE (COALESCE(array_length($1::text[],1),0)=0 OR a.account_id=ANY($1::text[]))
    AND (COALESCE(base.spend,0)>0 OR COALESCE(base.leads,0)>0)
    ORDER BY c.name,s.name,a.name`, [metaAdAccountIds, from, to]);

  const campaignMap = new Map();
  for (const row of rows.rows) {
    if (!campaignMap.has(row.campaign_id)) campaignMap.set(row.campaign_id, {
      id: row.campaign_id, accountId: row.account_id, name: row.campaign_name, children: [], adsets: new Map(),
    });
    const campaign = campaignMap.get(row.campaign_id);
    if (!campaign.adsets.has(row.adset_id)) campaign.adsets.set(row.adset_id, {
      id: row.adset_id, accountId: row.account_id, name: row.adset_name, children: [],
    });
    campaign.adsets.get(row.adset_id).children.push({
      id: row.ad_id, accountId: row.account_id, name: row.ad_name, spend: row.spend,
      leads: row.leads, l1in: 0, l1sent: 0, graduates: 0, orders: 0, paid: 0, revenue: 0,
      sub_16: row.sub_16, '16_17': 0, '18_24': row['18_24'], '25_34': row['25_34'],
      '35_44': row['35_44'], '45_plus': row['45_plus'],
    });
  }
  const campaigns = [...campaignMap.values()].map(({ adsets, ...campaign }) => ({
    ...campaign,
    children: [...adsets.values()],
  }));

  response.json({ source: 'meta', from, to, portfolios, accounts, campaigns });
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
const server = app.listen(getConfig().port, '127.0.0.1', () => console.log(`Dashboard local: http://localhost:${getConfig().port}`));
server.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
globalThis.dashboardServer = server;
