const SETTINGS = {
  APP_TOKEN: 'change-this-token',
  DEFAULT_CURRENCY: 'USD',
  PORTFOLIO_ID: 'google-sheets',
  PORTFOLIO_NAME: 'Google Sheets',
};

const SHEETS = {
  ad_accounts: ['id', 'portfolio_id', 'name', 'original_name', 'currency'],
  campaigns: ['id', 'account_id', 'name'],
  adsets: ['id', 'account_id', 'campaign_id', 'name'],
  ads: ['id', 'account_id', 'campaign_id', 'adset_id', 'name'],
  meta_daily: ['date', 'account_id', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name', 'spend', 'leads_fb'],
  gc_leads: ['email', 'gc_order_number', 'created_at', 'lead_date', 'product_name', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'status'],
  gc_orders: ['email', 'order_number', 'status', 'positions', 'cost_amount', 'paid_amount', 'currency', 'created_at'],
  gc_orders_paid: ['email', 'order_number', 'status', 'positions', 'cost_amount', 'paid_amount', 'currency', 'created_at'],
  gc_events: ['email', 'event_type', 'imported_at'],
  gc_l1in: ['email'],
  gc_l1sent: ['email'],
  gc_graduates: ['email'],
  gc_age_sub_18: ['email'],
  gc_age_18_21: ['email'],
  gc_age_22_24: ['email'],
  gc_age_25_34: ['email'],
  gc_age_35_44: ['email'],
  gc_age_45_plus: ['email'],
};

const AGE_KEYS = ['sub_18', '18_21', '22_24', '25_34', '35_44', '45_plus'];
const EVENT_TYPES = ['l1in', 'l1sent', 'graduates', ...AGE_KEYS];
const EVENT_SHEETS = {
  l1in: 'gc_l1in',
  l1sent: 'gc_l1sent',
  graduates: 'gc_graduates',
  sub_18: 'gc_age_sub_18',
  '18_21': 'gc_age_18_21',
  '22_24': 'gc_age_22_24',
  '25_34': 'gc_age_25_34',
  '35_44': 'gc_age_35_44',
  '45_plus': 'gc_age_45_plus',
};

function setup() {
  const ss = SpreadsheetApp.getActive();
  Object.entries(SHEETS).forEach(([name, headers]) => ensureSheet_(ss, name, headers));
}

function doGet(e) {
  try {
    guard_(e);
    const action = e.parameter.action || 'report';
    if (action === 'report') return json_(buildReport_(e.parameter.from, e.parameter.to));
    if (action === 'schema') return json_({ ok: true, sheets: SHEETS });
    return json_({ ok: false, error: 'Unknown action' }, 400);
  } catch (error) {
    return json_({ ok: false, error: error.message }, 400);
  }
}

function doPost(e) {
  try {
    guard_(e);
    const action = e.parameter.action || 'gcImport';
    const body = e.postData && e.postData.contents ? e.postData.contents : '';
    if (action === 'gcImport') {
      const kind = e.parameter.kind;
      return json_({ ok: true, kind, imported: importGetCourse_(kind, body) });
    }
    if (action === 'importSheet') {
      const sheet = e.parameter.sheet;
      const mode = e.parameter.mode || 'replace';
      return json_({ ok: true, sheet, imported: importSheet_(sheet, body, mode) });
    }
    return json_({ ok: false, error: 'Unknown action' }, 400);
  } catch (error) {
    return json_({ ok: false, error: error.message }, 400);
  }
}

function buildReport_(from, to) {
  const dateFrom = from || '1900-01-01';
  const dateTo = to || '2999-12-31';
  const accounts = rows_('ad_accounts').map((row) => ({
    id: row.id,
    portfolioId: row.portfolio_id || SETTINGS.PORTFOLIO_ID,
    name: row.name || row.id,
    originalName: row.original_name || row.name || row.id,
    currency: row.currency || SETTINGS.DEFAULT_CURRENCY,
  }));
  const accountIds = new Set(accounts.map((account) => account.id));
  const metaRows = rows_('meta_daily').filter((row) => row.date >= dateFrom && row.date <= dateTo && (!accountIds.size || accountIds.has(row.account_id)));
  const gc = getGcAggregates_(dateFrom, dateTo);
  const campaignMap = new Map();
  metaRows.forEach((row) => {
    const campaignId = row.campaign_id || row.utm_campaign || row.campaign_name;
    const adsetId = row.adset_id || row.utm_content || row.adset_name;
    const adId = row.ad_id || row.utm_term || row.ad_name;
    if (!campaignId || !adsetId || !adId) return;
    if (!campaignMap.has(campaignId)) campaignMap.set(campaignId, { id: campaignId, accountId: row.account_id, name: row.campaign_name || campaignId, children: [], adsets: new Map() });
    const campaign = campaignMap.get(campaignId);
    if (!campaign.adsets.has(adsetId)) campaign.adsets.set(adsetId, { id: adsetId, accountId: row.account_id, name: row.adset_name || adsetId, children: [], ads: new Map() });
    const adset = campaign.adsets.get(adsetId);
    if (!adset.ads.has(adId)) adset.ads.set(adId, { id: adId, accountId: row.account_id, name: row.ad_name || adId, spend: 0, leadsFb: 0 });
    const ad = adset.ads.get(adId);
    ad.spend += num_(row.spend);
    ad.leadsFb += num_(row.leads_fb);
  });
  campaignMap.forEach((campaign) => {
    campaign.adsets.forEach((adset) => {
      adset.children = Array.from(adset.ads.values()).map((ad) => {
        const key = pathKey_(campaign.name, adset.name, ad.name);
        const metrics = gc.byPath.get(key) || blankMetrics_();
        return { ...ad, ...metrics };
      });
      delete adset.ads;
    });
    campaign.children = Array.from(campaign.adsets.values());
    delete campaign.adsets;
  });
  return {
    source: 'google-sheets',
    from: dateFrom,
    to: dateTo,
    portfolios: [{ id: SETTINGS.PORTFOLIO_ID, name: SETTINGS.PORTFOLIO_NAME }],
    accounts,
    campaigns: Array.from(campaignMap.values()),
  };
}

function getGcAggregates_(from, to) {
  const ordersByEmail = new Map();
  const seenOrders = new Set();
  rows_('gc_orders').forEach((order) => addOrder_(ordersByEmail, seenOrders, order, false));
  rows_('gc_orders_paid').forEach((order) => addOrder_(ordersByEmail, seenOrders, order, true));
  const eventsByEmail = getEventsByEmail_();
  const byPath = new Map();
  rows_('gc_leads').forEach((lead) => {
    const leadDate = (lead.lead_date || String(lead.created_at || '').slice(0, 10));
    if (leadDate && (leadDate < from || leadDate > to)) return;
    if (/anulat|cancel/i.test(lead.status || '')) return;
    const key = pathKey_(lead.utm_campaign, lead.utm_content, lead.utm_term);
    if (!byPath.has(key)) byPath.set(key, blankMetrics_());
    const target = byPath.get(key);
    addLead_(target, lead, eventsByEmail, ordersByEmail);
  });
  return { byPath };
}



function addOrder_(ordersByEmail, seenOrders, order, forcePaid) {
  const email = cleanEmail_(order.email);
  if (!email) return;
  const orderNumber = String(order.order_number || '').trim();
  const orderKey = orderNumber || [email, order.positions || '', order.created_at || '', order.paid_amount || ''].join('||');
  if (seenOrders.has(orderKey)) return;
  seenOrders.add(orderKey);
  if (!ordersByEmail.has(email)) ordersByEmail.set(email, { orders: 0, paid: 0, revenue: 0 });
  const stats = ordersByEmail.get(email);
  stats.orders += 1;
  const paid = num_(order.paid_amount);
  if (forcePaid || paid > 0 || /finalizat/i.test(order.status || '')) stats.paid = 1;
  stats.revenue += paid;
}

function getEventsByEmail_() {
  const eventsByEmail = new Map();
  const add = (email, eventType) => {
    email = cleanEmail_(email);
    if (!email || !eventType) return;
    if (!eventsByEmail.has(email)) eventsByEmail.set(email, new Set());
    eventsByEmail.get(email).add(eventType);
  };
  rows_('gc_events').forEach((event) => add(event.email, event.event_type));
  Object.entries(EVENT_SHEETS).forEach(([eventType, sheetName]) => {
    rows_(sheetName).forEach((row) => add(row.email, eventType));
  });
  return eventsByEmail;
}

function addLead_(target, lead, eventsByEmail, ordersByEmail) {
  const email = cleanEmail_(lead.email);
  const events = eventsByEmail.get(email) || new Set();
  const orders = ordersByEmail.get(email) || { orders: 0, paid: 0, revenue: 0 };
  target.leadsGc += 1;
  target.l1in += events.has('l1in') ? 1 : 0;
  target.l1sent += events.has('l1sent') ? 1 : 0;
  target.graduates += events.has('graduates') ? 1 : 0;
  target.orders += orders.orders;
  target.paid += orders.paid;
  target.revenue += orders.revenue;
  AGE_KEYS.forEach((age) => {
    if (!events.has(age)) return;
    target[age] += 1;
    target.ageBreakdown[age].leadsGc += 1;
    target.ageBreakdown[age].l1in += events.has('l1in') ? 1 : 0;
    target.ageBreakdown[age].l1sent += events.has('l1sent') ? 1 : 0;
    target.ageBreakdown[age].graduates += events.has('graduates') ? 1 : 0;
    target.ageBreakdown[age].orders += orders.orders;
    target.ageBreakdown[age].paid += orders.paid;
    target.ageBreakdown[age].revenue += orders.revenue;
  });
}


function importSheet_(sheetName, body, mode) {
  if (!SHEETS[sheetName]) throw new Error('Unknown sheet: ' + sheetName);
  const parsed = parseCsv_(body);
  if (!parsed.length) return 0;
  const ss = SpreadsheetApp.getActive();
  const sheet = ensureSheet_(ss, sheetName, SHEETS[sheetName]);
  const headers = SHEETS[sheetName];
  const first = parsed[0].map(normalizeKey_);
  const hasHeader = headers.every((header) => first.includes(header));
  const records = records_(parsed, headers);
  if (mode === 'replace') {
    sheet.clearContents();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (!records.length) return 0;
    sheet.getRange(2, 1, records.length, headers.length).setValues(records.map((record) => headers.map((header) => record[header] || '')));
    return records.length;
  }
  records.forEach((record) => sheet.appendRow(headers.map((header) => record[header] || '')));
  return records.length;
}

function importGetCourse_(kind, body) {
  if (!kind) throw new Error('Missing kind');
  const parsed = parseCsv_(body);
  if (!parsed.length) return 0;
  if (kind === 'leads') return upsertRows_('gc_leads', records_(parsed, SHEETS.gc_leads), 'gc_order_number');
  if (kind === 'orders') return upsertRows_('gc_orders', records_(parsed, SHEETS.gc_orders), 'order_number');
  if (kind === 'orders_paid') return upsertRows_('gc_orders_paid', records_(parsed, SHEETS.gc_orders_paid), 'order_number');
  if (EVENT_TYPES.includes(kind)) return upsertRows_(EVENT_SHEETS[kind], records_(parsed, ['email']).map((row) => ({ email: cleanEmail_(row.email) })), 'email');
  throw new Error('Unknown GetCourse kind');
}

function blankMetrics_() {
  const ageBreakdown = {};
  AGE_KEYS.forEach((age) => ageBreakdown[age] = { leadsGc: 0, l1in: 0, l1sent: 0, graduates: 0, orders: 0, paid: 0, revenue: 0 });
  return { leadsGc: 0, leadsFb: 0, l1in: 0, l1sent: 0, graduates: 0, orders: 0, paid: 0, revenue: 0, sub_18: 0, '18_21': 0, '22_24': 0, '25_34': 0, '35_44': 0, '45_plus': 0, ageBreakdown };
}

function upsertRows_(sheetName, records, key) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ensureSheet_(ss, sheetName, SHEETS[sheetName]);
  const headers = getHeaders_(sheet);
  const keys = Array.isArray(key) ? key : [key];
  const existing = new Map();
  const values = sheet.getDataRange().getValues();
  values.slice(1).forEach((row, index) => existing.set(keys.map((k) => row[headers.indexOf(k)]).join('||'), index + 2));
  let imported = 0;
  records.forEach((record) => {
    const rowKey = keys.map((k) => record[k] || '').join('||');
    if (!rowKey.replace(/\|/g, '')) return;
    const row = headers.map((header) => record[header] || '');
    const existingRow = existing.get(rowKey);
    if (existingRow) sheet.getRange(existingRow, 1, 1, headers.length).setValues([row]);
    else sheet.appendRow(row);
    imported++;
  });
  return imported;
}

function rows_(sheetName) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).filter((row) => row.some(Boolean)).map((row) => Object.fromEntries(headers.map((header, i) => [header, row[i]])));
}

function ensureSheet_(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (!sheet.getLastRow()) sheet.appendRow(headers);
  return sheet;
}
function getHeaders_(sheet) { return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]; }
function records_(rows, fallbackHeaders) { const first = rows[0].map(normalizeKey_); const known = new Set(Object.values(SHEETS).flat()); const hasHeader = first.some((key) => known.has(key)); const headers = hasHeader ? first : fallbackHeaders; return (hasHeader ? rows.slice(1) : rows).map((row) => Object.fromEntries(headers.map((header, i) => [header, row[i] || '']))); }
function parseCsv_(text) { return Utilities.parseCsv(text || ''); }
function normalizeKey_(value) { return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\uFEFF/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function cleanEmail_(value) { return String(value || '').trim().toLowerCase(); }
function num_(value) { if (typeof value === 'number') return value; const text = String(value || '').replace(/[^0-9,.-]/g, '').replace(',', '.'); const n = Number(text); return Number.isFinite(n) ? n : 0; }
function pathKey_(campaign, adset, ad) { return [campaign || '', adset || '', ad || ''].join('||'); }
function guard_(e) { if (SETTINGS.APP_TOKEN && e.parameter.token !== SETTINGS.APP_TOKEN) throw new Error('Unauthorized'); }
function json_(payload, status) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }
