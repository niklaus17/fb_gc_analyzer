import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { getConfig } from '../server/config.js';

const { Pool } = pg;
const pool = new Pool({ connectionString: getConfig().databaseUrl });

function parseLocalConfig(text) {
  const apiUrl = text.match(/googleApiUrl:\s*["']([^"']+)["']/)?.[1] || '';
  const token = text.match(/googleApiToken:\s*["']([^"']+)["']/)?.[1] || '';
  if (!apiUrl || !token) throw new Error('Lipsește googleApiUrl sau googleApiToken din config.local.js.');
  return { apiUrl, token };
}

function csvValue(value) {
  if (value == null) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

function toCsv(headers, rows) {
  return [headers.join(','), ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(','))].join('\n');
}

const RETRY_DELAYS_MS = [1500, 4000, 8000];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJsonResponse(response, context) {
  const text = await response.text();
  try { return JSON.parse(text); }
  catch {
    const error = new Error(`${context}: Apps Script a răspuns cu HTML, nu JSON. Verifică URL-ul /exec și fă redeploy la Web App ca "Anyone with the link". Răspuns: ${text.slice(0, 160)}`);
    error.transient = response.status >= 400 || text.includes('ppConfig');
    throw error;
  }
}

async function fetchJsonWithRetry(url, options, context) {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await fetch(url, options);
      const body = await readJsonResponse(response, context);
      if (response.ok && body.ok !== false) return body;
      const error = new Error(`${context}: ${body.error || response.statusText}`);
      error.transient = response.status >= 500 || body.error === 'Service invoked too many times for one day';
      throw error;
    } catch (error) {
      lastError = error;
      if (!error.transient || attempt === RETRY_DELAYS_MS.length) throw error;
      await wait(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
}

async function preflight(config) {
  const url = new URL(config.apiUrl);
  url.searchParams.set('action', 'schema');
  url.searchParams.set('token', config.token);
  const body = await fetchJsonWithRetry(url, {}, 'Preflight');
  if (!body.sheets?.meta_daily) {
    throw new Error('Preflight: Apps Script nu are schema actualizată. Copiază ultima versiune apps-script/Code.gs, rulează setup() și redeploy New version.');
  }
}

async function postSheet({ apiUrl, token }, sheet, csv) {
  const url = new URL(apiUrl);
  url.searchParams.set('action', 'importSheet');
  url.searchParams.set('sheet', sheet);
  url.searchParams.set('mode', 'replace');
  url.searchParams.set('token', token);
  const body = await fetchJsonWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: csv,
  }, sheet);
  return body.imported || 0;
}

async function rows(query, params = []) {
  const result = await pool.query(query, params);
  return result.rows;
}

async function main() {
  const from = process.argv[2] || '1900-01-01';
  const to = process.argv[3] || '2999-12-31';
  const onlySheetArg = process.argv.find((arg) => arg.startsWith('--sheet='));
  const onlySheet = onlySheetArg ? onlySheetArg.slice('--sheet='.length) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw new Error('Folosește perioada în format: npm run google:export -- 2026-01-01 2026-09-15');
  }
  const localConfig = parseLocalConfig(await readFile('config.local.js', 'utf8'));
  await preflight(localConfig);
  const exports = [
    {
      sheet: 'ad_accounts',
      headers: ['id', 'portfolio_id', 'name', 'original_name', 'currency'],
      rows: await rows(`SELECT id,portfolio_id,name AS name,name AS original_name,currency FROM ad_accounts ORDER BY name`),
    },
    {
      sheet: 'campaigns',
      headers: ['id', 'account_id', 'name'],
      rows: await rows(`SELECT id,account_id,name FROM campaigns ORDER BY name`),
    },
    {
      sheet: 'adsets',
      headers: ['id', 'account_id', 'campaign_id', 'name'],
      rows: await rows(`SELECT id,account_id,campaign_id,name FROM adsets ORDER BY name`),
    },
    {
      sheet: 'ads',
      headers: ['id', 'account_id', 'campaign_id', 'adset_id', 'name'],
      rows: await rows(`SELECT id,account_id,campaign_id,adset_id,name FROM ads ORDER BY name`),
    },
    {
      sheet: 'meta_daily',
      headers: ['date', 'account_id', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name', 'spend', 'leads_fb'],
      rows: await rows(`SELECT i.insight_date::text AS date,i.account_id,c.id AS campaign_id,c.name AS campaign_name,
          s.id AS adset_id,s.name AS adset_name,a.id AS ad_id,a.name AS ad_name,
          i.spend::float AS spend,i.leads::int AS leads_fb
        FROM meta_ad_insights_daily i
        JOIN ads a ON a.id=i.ad_id AND a.account_id=i.account_id
        JOIN adsets s ON s.id=a.adset_id
        JOIN campaigns c ON c.id=a.campaign_id
        WHERE i.insight_date BETWEEN $1 AND $2
        ORDER BY i.insight_date,c.name,s.name,a.name`, [from, to]),
    },
  ];

  const selectedExports = onlySheet ? exports.filter((item) => item.sheet === onlySheet) : exports;
  if (!selectedExports.length) throw new Error('Fila necunoscută pentru --sheet. Folosește: ad_accounts, campaigns, adsets, ads sau meta_daily.');

  for (const item of selectedExports) {
    const imported = await postSheet(localConfig, item.sheet, toCsv(item.headers, item.rows));
    console.log(`${item.sheet}: ${imported} rânduri exportate`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
