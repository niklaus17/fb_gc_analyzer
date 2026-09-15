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

async function postSheet({ apiUrl, token }, sheet, csv) {
  const url = new URL(apiUrl);
  url.searchParams.set('action', 'importSheet');
  url.searchParams.set('sheet', sheet);
  url.searchParams.set('mode', 'replace');
  url.searchParams.set('token', token);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: csv,
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { throw new Error(`${sheet}: răspuns invalid din Apps Script: ${text.slice(0, 200)}`); }
  if (!response.ok || body.ok === false) throw new Error(`${sheet}: ${body.error || response.statusText}`);
  return body.imported || 0;
}

async function rows(query, params = []) {
  const result = await pool.query(query, params);
  return result.rows;
}

async function main() {
  const from = process.argv[2] || '1900-01-01';
  const to = process.argv[3] || '2999-12-31';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw new Error('Folosește perioada în format: npm run google:export -- 2026-01-01 2026-09-15');
  }
  const localConfig = parseLocalConfig(await readFile('config.local.js', 'utf8'));
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

  for (const item of exports) {
    const imported = await postSheet(localConfig, item.sheet, toCsv(item.headers, item.rows));
    console.log(`${item.sheet}: ${imported} rânduri exportate`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
