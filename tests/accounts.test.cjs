const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const elements = new Map();
let stored = {};
const element = (id) => {
  if (!elements.has(id)) {
    elements.set(id, {
      innerHTML: '',
      textContent: '',
      value: '',
      listeners: {},
      classList: { add() {}, remove() {}, toggle() {}, contains() { return true; } },
      addEventListener(event, handler) { this.listeners[event] = handler; },
      querySelectorAll() { return []; },
      querySelector() { return { focus() {} }; },
    });
  }
  return elements.get(id);
};
const sandbox = {
  Intl,
  Set,
  Date,
  localStorage: {
    getItem: () => JSON.stringify(stored),
    setItem: (_key, value) => { stored = JSON.parse(value); },
    removeItem: () => { stored = {}; },
  },
  document: {
    getElementById: element,
    addEventListener() {},
    querySelectorAll() { return []; },
  },
  location: { protocol: 'file:', hostname: '' },
  fetch: async () => ({ ok: false }),
};
const context = vm.createContext(sandbox);
vm.runInContext(readFileSync('app.js', 'utf8'), context);
const run = (code) => vm.runInContext(code, context);

assert.equal(run('accounts.length'), 0);
assert.equal(run('campaigns.length'), 0);
assert.equal(run('campaigns.flatMap(c=>filteredLeaves(c)).length'), 0);

run(`
portfolios = [{ id: 'p1', name: 'Portfolio test' }];
accounts = [
  { id: 'acct-md', portfolioId: 'p1', name: 'Cont MD', currency: 'USD' },
  { id: 'acct-ro', portfolioId: 'p1', name: 'Cont RO', currency: 'USD' },
  { id: 'acct-eu', portfolioId: 'p1', name: 'Cont EU', currency: 'EUR' },
];
campaigns = [
  { id: 'camp-md', accountId: 'acct-md', name: 'Camp MD', children: [
    { id: 'adset-md', accountId: 'acct-md', name: 'Adset MD', children: [
      { id: 'ad-md-1', accountId: 'acct-md', name: 'Ad MD 1', spend: 100, leadsGc: 20, leadsFb: 18, l1in: 10, l1sent: 8, graduates: 4, orders: 3, paid: 2, revenue: 300, sub_16: 0, '16_17': 0, '18_24': 7, '25_34': 8, '35_44': 3, '45_plus': 2 },
      { id: 'ad-md-2', accountId: 'acct-md', name: 'Ad MD 2', spend: 50, leadsGc: 10, leadsFb: 9, l1in: 5, l1sent: 4, graduates: 2, orders: 1, paid: 1, revenue: 120, sub_16: 0, '16_17': 0, '18_24': 3, '25_34': 4, '35_44': 2, '45_plus': 1 },
    ] },
  ] },
  { id: 'camp-ro', accountId: 'acct-ro', name: 'Camp RO', children: [
    { id: 'adset-ro', accountId: 'acct-ro', name: 'Adset RO', children: [
      { id: 'ad-ro-1', accountId: 'acct-ro', name: 'Ad RO 1', spend: 80, leadsGc: 16, leadsFb: 15, l1in: 8, l1sent: 6, graduates: 3, orders: 2, paid: 1, revenue: 150, sub_16: 0, '16_17': 0, '18_24': 5, '25_34': 6, '35_44': 3, '45_plus': 2 },
    ] },
  ] },
  { id: 'camp-eu', accountId: 'acct-eu', name: 'Camp EU', children: [
    { id: 'adset-eu', accountId: 'acct-eu', name: 'Adset EU', children: [
      { id: 'ad-eu-1', accountId: 'acct-eu', name: 'Ad EU 1', spend: 70, leadsGc: 7, leadsFb: 6, l1in: 4, l1sent: 3, graduates: 2, orders: 1, paid: 1, revenue: 90, sub_16: 0, '16_17': 0, '18_24': 2, '25_34': 3, '35_44': 1, '45_plus': 1 },
    ] },
  ] },
];
allNodes = campaigns.flatMap((c) => [c, ...c.children.flatMap((a) => [a, ...a.children])]);
selected.clear();
campaigns.flatMap(leaves).forEach((node) => selected.add(node.id));
selectedAccounts.clear();
selectedAccounts.add('acct-md');
selectedAccounts.add('acct-ro');
render();
`);

assert.equal(run('currency'), 'USD');
assert.equal(run('campaigns.flatMap(c=>filteredLeaves(c)).length'), 3);
assert.equal(run('aggregate(campaigns.flatMap(c=>filteredLeaves(c))).spend'), 230);
assert.equal(run('aggregate(campaigns.flatMap(c=>filteredLeaves(c))).leadsGc'), 46);
assert.equal(run('aggregate(campaigns.flatMap(c=>filteredLeaves(c))).cpl'), 5);

run("setAccountSelection(['acct-md'])");
assert.equal(run('campaigns.flatMap(c=>filteredLeaves(c)).length'), 2);
assert.equal(run('aggregate(campaigns.flatMap(c=>filteredLeaves(c))).spend'), 150);

assert.throws(() => run("setAccountSelection(['acct-md','acct-eu'])"), /aceeași monedă/);
assert.equal(run('[...selectedAccounts].join()'), 'acct-md');

run("selected.delete('ad-md-1');setAccountSelection(['acct-ro']);setAccountSelection(['acct-md']);");
assert.equal(run('campaigns.flatMap(c=>filteredLeaves(c)).length'), 1);

run("inactiveTags.add('camp-md');tagFilter='exclude'");
assert.equal(run('campaigns.flatMap(c=>filteredLeaves(c)).length'), 0);

run('setAccountSelection([])');
assert.equal(run('campaigns.flatMap(c=>filteredLeaves(c)).length'), 0);
assert.equal(element('currency').textContent, '—');
assert.deepEqual(stored.selectedAccounts, []);

run(`
savedPreferences = { dateFrom: '2026-01-01', dateTo: '2026-01-31' };
dateFrom = '2026-09-01';
dateTo = '2026-09-10';
pendingFrom = dateFrom;
pendingTo = dateTo;
restorePreferencesForCurrentData();
`);
assert.equal(run('dateFrom'), '2026-09-01');
assert.equal(run('dateTo'), '2026-09-10');

assert.equal(run('new Set(allNodes.map(n=>n.id)).size'), run('allNodes.length'));
console.log('PASS: empty startup, account isolation, additive totals, currency guard, retained creative choices, stable date filters, tag filters, empty selection and persistence.');
