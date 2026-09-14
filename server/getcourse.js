import { withTransaction } from './db.js';

const EVENT_TYPES = new Set(['l1in', 'l1sent', 'graduates', 'sub_16', '16_17', '18_24', '25_34', '35_44', '45_plus']);

function normalizeKey(value = '') { return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\uFEFF/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function parseCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = firstLine.includes(',') ? ',' : firstLine.includes(';') ? ';' : '\t';
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i + 1];
    if (quoted && char === '"' && next === '"') { cell += '"'; i++; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (!quoted && char === delimiter) { row.push(cell.trim()); cell = ''; continue; }
    if (!quoted && (char === '\n' || char === '\r')) { if (char === '\r' && next === '\n') i++; row.push(cell.trim()); cell = ''; if (row.some(Boolean)) rows.push(row); row = []; continue; }
    cell += char;
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); return rows;
}
function asRecords(rows, fallbackHeaders) {
  if (!rows.length) return []; const first = rows[0].map(normalizeKey);
  const hasHeader = first.some((key) => ['email','user_email','number','status','created_at','data_crearii','utm_campaign'].includes(key));
  const headers = hasHeader ? first : fallbackHeaders;
  return (hasHeader ? rows.slice(1) : rows).map((row) => Object.fromEntries(headers.map((key, index) => [key, row[index] || ''])));
}
function pick(record, keys) { for (const key of keys) if (record[key]) return record[key]; return ''; }
function parseDate(value) {
  if (!value) return null; const text = String(value).trim();
  const md = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (md) return md[3] + '-' + md[2].padStart(2, '0') + '-' + md[1].padStart(2, '0') + ' ' + (md[4] || '00') + ':' + (md[5] || '00') + ':' + (md[6] || '00');
  const ym = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (ym) return ym[1] + '-' + ym[2].padStart(2, '0') + '-' + ym[3].padStart(2, '0') + ' ' + (ym[4] || '00') + ':' + (ym[5] || '00') + ':' + (ym[6] || '00');
  return null;
}
function parseDateOnly(value) { const date = parseDate(value); return date ? date.slice(0, 10) : null; }
function parseMoney(value) {
  if (!value) return { amount: 0, currency: 'EUR' }; const text = String(value).replace(/\s/g, '').replace(',', '.');
  const amount = Number((text.match(/-?\d+(?:\.\d+)?/) || ['0'])[0]); const currency = text.includes('$') ? 'USD' : text.includes('€') ? 'EUR' : 'EUR';
  return { amount: Number.isFinite(amount) ? amount : 0, currency };
}
function cleanEmail(value) { return String(value || '').trim().toLowerCase(); }
export async function importGcCsv(kind, text) {
  const rows = parseCsv(text); if (!rows.length) return { imported: 0 };
  if (kind === 'leads') return importLeads(asRecords(rows, ['email','gc_order_number','created_at','product_name','utm_source','utm_medium','utm_campaign','utm_content','utm_term','lead_date']));
  if (kind === 'orders') return importOrders(asRecords(rows, ['email','cost_money','number','status','positions','payed_money','created_at']));
  if (EVENT_TYPES.has(kind)) return importEvents(kind, asRecords(rows, ['email']));
  throw new Error('Tip import GetCourse necunoscut.');
}
async function importLeads(records) {
  let imported = 0; await withTransaction(async (client) => {
    for (const record of records) {
      const email = cleanEmail(pick(record, ['email','user_email','user_email_'])); const number = pick(record, ['gc_order_number','number','order_number','id']) || (email + ':' + pick(record, ['created_at','lead_date']));
      if (!email || !number) continue;
      await client.query('INSERT INTO gc_leads(email,gc_order_number,created_at,lead_date,product_name,utm_source,utm_medium,utm_campaign,utm_content,utm_term,imported_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()) ON CONFLICT(gc_order_number) DO UPDATE SET email=EXCLUDED.email,created_at=EXCLUDED.created_at,lead_date=EXCLUDED.lead_date,product_name=EXCLUDED.product_name,utm_source=EXCLUDED.utm_source,utm_medium=EXCLUDED.utm_medium,utm_campaign=EXCLUDED.utm_campaign,utm_content=EXCLUDED.utm_content,utm_term=EXCLUDED.utm_term,imported_at=now()', [email, number, parseDate(pick(record, ['created_at','created','data_crearii'])), parseDateOnly(pick(record, ['lead_date','date','data_formatata'])), pick(record, ['product_name','product','positions','comanda_detalii']), pick(record, ['utm_source','source']), pick(record, ['utm_medium','medium']), pick(record, ['utm_campaign','campaign']), pick(record, ['utm_content','content']), pick(record, ['utm_term','term'])]);
      imported++;
    }
  }); return { imported };
}
async function importOrders(records) {
  let imported = 0; await withTransaction(async (client) => {
    for (const record of records) {
      const email = cleanEmail(pick(record, ['email','user_email','user_email_'])); const number = pick(record, ['number','order_number','gc_order_number']); if (!email || !number) continue;
      const cost = parseMoney(pick(record, ['cost_money','cost','price'])); const paid = parseMoney(pick(record, ['payed_money','paid_money','paid','payed']));
      await client.query('INSERT INTO gc_orders(order_number,email,status,positions,cost_amount,paid_amount,currency,created_at,imported_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT(order_number) DO UPDATE SET email=EXCLUDED.email,status=EXCLUDED.status,positions=EXCLUDED.positions,cost_amount=EXCLUDED.cost_amount,paid_amount=EXCLUDED.paid_amount,currency=EXCLUDED.currency,created_at=EXCLUDED.created_at,imported_at=now()', [number, email, pick(record, ['status']), pick(record, ['positions','product_name','product']), cost.amount, paid.amount, paid.currency || cost.currency, parseDate(pick(record, ['created_at','created','data_crearii']))]);
      imported++;
    }
  }); return { imported };
}
async function importEvents(eventType, records) {
  let imported = 0; await withTransaction(async (client) => {
    for (const record of records) {
      const email = cleanEmail(pick(record, ['email','user_email','user_email_'])); if (!email) continue;
      await client.query('INSERT INTO gc_events(email,event_type,imported_at) VALUES($1,$2,now()) ON CONFLICT(email,event_type) DO UPDATE SET imported_at=now()', [email, eventType]); imported++;
    }
  }); return { imported };
}