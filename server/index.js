import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getConfig } from './config.js';
import { pool } from './db.js';
import { runManualSync } from './meta.js';
import { importGcCsv } from './getcourse.js';

const app = express();
const root = dirname(dirname(fileURLToPath(import.meta.url)));
app.use(express.json());
app.use(express.text({ type: ['text/*', 'application/csv', 'text/csv'], limit: '20mb' }));
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
  const { metaAdAccountIds, metaAdAccountNames, metaBusinessPortfolioId, metaBusinessPortfolioName } = getConfig();
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
    portfolioId: account.portfolio_id || metaBusinessPortfolioId,
    name: metaAdAccountNames[account.id] || account.name,
    originalName: account.name,
    currency: account.currency,
  }));
  const portfolios = Object.values(Object.fromEntries(accountResult.rows.map((account) => [
    account.portfolio_id || metaBusinessPortfolioId,
    { id: account.portfolio_id || metaBusinessPortfolioId, name: account.portfolio_name || metaBusinessPortfolioName },
  ])));

  const gcRows = await pool.query(`WITH lead_base AS (
    SELECT lower(email) AS email, COALESCE(lead_date, created_at::date) AS lead_date, utm_campaign, utm_content, utm_term
    FROM gc_leads WHERE COALESCE(lead_date, created_at::date) BETWEEN $1 AND $2
  ), order_stats AS (
    SELECT lower(o.email) AS email, COUNT(*)::int AS orders,
      MAX(CASE WHEN o.paid_amount>0 OR lower(o.status) LIKE '%finalizat%' THEN 1 ELSE 0 END)::int AS paid,
      COALESCE(SUM(o.paid_amount),0)::float AS revenue
    FROM gc_orders o GROUP BY lower(o.email)
  ), event_stats AS (
    SELECT lower(email) AS email,
      MAX(CASE WHEN event_type='l1in' THEN 1 ELSE 0 END)::int AS l1in,
      MAX(CASE WHEN event_type='l1sent' THEN 1 ELSE 0 END)::int AS l1sent,
      MAX(CASE WHEN event_type='graduates' THEN 1 ELSE 0 END)::int AS graduates,
      MAX(CASE WHEN event_type='sub_16' THEN 1 ELSE 0 END)::int AS sub_16,
      MAX(CASE WHEN event_type='16_17' THEN 1 ELSE 0 END)::int AS age_16_17,
      MAX(CASE WHEN event_type='18_24' THEN 1 ELSE 0 END)::int AS age_18_24,
      MAX(CASE WHEN event_type='25_34' THEN 1 ELSE 0 END)::int AS age_25_34,
      MAX(CASE WHEN event_type='35_44' THEN 1 ELSE 0 END)::int AS age_35_44,
      MAX(CASE WHEN event_type='45_plus' THEN 1 ELSE 0 END)::int AS age_45_plus
    FROM gc_events GROUP BY lower(email)
  )
  SELECT COALESCE(utm_campaign,'') AS campaign_name,COALESCE(utm_content,'') AS adset_name,COALESCE(utm_term,'') AS ad_name,
    COUNT(DISTINCT lead_base.email)::int AS leads_gc,
    COALESCE(SUM(COALESCE(event_stats.l1in,0)),0)::int AS l1in,
    COALESCE(SUM(COALESCE(event_stats.l1sent,0)),0)::int AS l1sent,
    COALESCE(SUM(COALESCE(event_stats.graduates,0)),0)::int AS graduates,
    COALESCE(SUM(COALESCE(order_stats.orders,0)),0)::int AS orders,
    COUNT(DISTINCT CASE WHEN COALESCE(order_stats.paid,0)>0 THEN lead_base.email END)::int AS paid,
    COALESCE(SUM(COALESCE(order_stats.revenue,0)),0)::float AS revenue,
    COALESCE(SUM(COALESCE(event_stats.sub_16,0)),0)::int AS sub_16,
    COALESCE(SUM(COALESCE(event_stats.age_16_17,0)),0)::int AS age_16_17,
    COALESCE(SUM(COALESCE(event_stats.age_18_24,0)),0)::int AS age_18_24,
    COALESCE(SUM(COALESCE(event_stats.age_25_34,0)),0)::int AS age_25_34,
    COALESCE(SUM(COALESCE(event_stats.age_35_44,0)),0)::int AS age_35_44,
    COALESCE(SUM(COALESCE(event_stats.age_45_plus,0)),0)::int AS age_45_plus
  FROM lead_base
  LEFT JOIN order_stats ON order_stats.email=lead_base.email
  LEFT JOIN event_stats ON event_stats.email=lead_base.email
  GROUP BY COALESCE(utm_campaign,''),COALESCE(utm_content,''),COALESCE(utm_term,'')`, [from, to]);
  const gcByPath = new Map(gcRows.rows.map((row) => [[row.campaign_name,row.adset_name,row.ad_name].join('||'), row]));

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
      leadsFb: row.leads, leadsGc: Number(gcByPath.get([row.campaign_name,row.adset_name,row.ad_name].join('||'))?.leads_gc || 0),
      l1in: Number(gcByPath.get([row.campaign_name,row.adset_name,row.ad_name].join('||'))?.l1in || 0),
      l1sent: Number(gcByPath.get([row.campaign_name,row.adset_name,row.ad_name].join('||'))?.l1sent || 0),
      graduates: Number(gcByPath.get([row.campaign_name,row.adset_name,row.ad_name].join('||'))?.graduates || 0),
      orders: Number(gcByPath.get([row.campaign_name,row.adset_name,row.ad_name].join('||'))?.orders || 0),
      paid: Number(gcByPath.get([row.campaign_name,row.adset_name,row.ad_name].join('||'))?.paid || 0),
      revenue: Number(gcByPath.get([row.campaign_name,row.adset_name,row.ad_name].join('||'))?.revenue || 0),
      sub_16: Number(gcByPath.get([row.campaign_name,row.adset_name,row.ad_name].join('||'))?.sub_16 || 0),
      '16_17': Number(gcByPath.get([row.campaign_name,row.adset_name,row.ad_name].join('||'))?.age_16_17 || 0),
      '18_24': Number(gcByPath.get([row.campaign_name,row.adset_name,row.ad_name].join('||'))?.age_18_24 || 0),
      '25_34': Number(gcByPath.get([row.campaign_name,row.adset_name,row.ad_name].join('||'))?.age_25_34 || 0),
      '35_44': Number(gcByPath.get([row.campaign_name,row.adset_name,row.ad_name].join('||'))?.age_35_44 || 0),
      '45_plus': Number(gcByPath.get([row.campaign_name,row.adset_name,row.ad_name].join('||'))?.age_45_plus || 0),
    });
  }
  const campaigns = [...campaignMap.values()].map(({ adsets, ...campaign }) => ({
    ...campaign,
    children: [...adsets.values()],
  }));

  response.json({ source: 'meta', from, to, portfolios, accounts, campaigns });
});

app.post('/api/gc/import/:kind', async (request, response) => {
  try {
    const text = typeof request.body === 'string' ? request.body : '';
    if (!text.trim()) return response.status(400).json({ error: 'CSV-ul este gol.' });
    response.json({ ok: true, kind: request.params.kind, ...await importGcCsv(request.params.kind, text) });
  } catch (error) { response.status(400).json({ error: error.message }); }
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
