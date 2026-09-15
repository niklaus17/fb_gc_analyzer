import { readFile } from 'node:fs/promises';

function parseLocalConfig(text) {
  const apiUrl = text.match(/googleApiUrl:\s*["']([^"']+)["']/)?.[1] || '';
  const token = text.match(/googleApiToken:\s*["']([^"']+)["']/)?.[1] || '';
  if (!apiUrl || !token) throw new Error('Lipsește googleApiUrl sau googleApiToken din config.local.js.');
  return { apiUrl, token };
}

async function call(config, action, extra = {}) {
  const url = new URL(config.apiUrl);
  url.searchParams.set('action', action);
  url.searchParams.set('token', config.token);
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  const response = await fetch(url);
  const text = await response.text();
  try { return { action, status: response.status, contentType: response.headers.get('content-type'), json: JSON.parse(text) }; }
  catch { return { action, status: response.status, contentType: response.headers.get('content-type'), text: text.slice(0, 220).replace(/\s+/g, ' ') }; }
}

const config = parseLocalConfig(await readFile('config.local.js', 'utf8'));
console.log('Apps Script URL:', config.apiUrl.replace(/\/s\/[^/]+\/exec/, '/s/***/exec'));
for (const result of [
  await call(config, 'version'),
  await call(config, 'schema'),
  await call(config, 'exportSheet', { sheet: 'ad_accounts' }),
  await call(config, 'report', { from: '2026-06-01', to: '2026-06-30' }),
]) {
  console.log('\n' + result.action + ': HTTP ' + result.status + ' · ' + result.contentType);
  if (result.json) {
    console.log(JSON.stringify({
      ok: result.json.ok,
      version: result.json.version,
      error: result.json.error,
      sheet: result.json.sheet,
      rows: result.json.rows?.length,
      accounts: result.json.accounts?.length,
      campaigns: result.json.campaigns?.length,
      hasSheets: Boolean(result.json.sheets),
    }));
  } else {
    console.log(result.text);
  }
}
