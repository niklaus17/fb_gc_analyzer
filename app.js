"use strict";
const columns = [
  ["spend", "Spend", "money", "Rezultate"],
  ["leadsGc", "Leads GC", "number", "Rezultate"],
  ["cpl", "Cost per Lead", "money", "Indicatori calculați"],
  ["leadsFb", "Leads FB", "number", "Facebook Ads"],
  ["l1in", "L1 intrat", "number", "Rezultate"],
  ["l1sent", "L1 trimis", "number", "Rezultate"],
  ["graduates", "Absolvit", "number", "Rezultate"],
  ["sub_18", "sub_18", "number", "Vârstă · număr de leaduri"],
  ["18_21", "18_21", "number", "Vârstă · număr de leaduri"],
  ["22_24", "22_24", "number", "Vârstă · număr de leaduri"],
  ["25_34", "25_34", "number", "Vârstă · număr de leaduri"],
  ["35_44", "35_44", "number", "Vârstă · număr de leaduri"],
  ["45_plus", "45_plus", "number", "Vârstă · număr de leaduri"],
  ["orders", "Com creată", "number", "Rezultate"],
  ["paid", "Com plătită", "number", "Rezultate"],
  ["revenue", "Venit", "money", "Rezultate"],
  ["cpl1", "Cost per L1 trimis", "money", "Indicatori calculați"],
  ["cpgrad", "Cost per Absolvit", "money", "Indicatori calculați"],
  ["gradRate", "Rata de absolvire", "percent", "Indicatori calculați"],
  ["cppaid", "Cost per Com plătită", "money", "Indicatori calculați"],
  ["roas", "ROAS", "ratio", "Indicatori calculați"],
  ["paidRate", "Lead → Plătit %", "percent", "Indicatori calculați"],
];
const PREF_KEY = "campaignsheet.preferences.v2";
const LEGACY_PREF_KEY = "campaignsheet.preferences";
const ageKeys = ["sub_18", "18_21", "22_24", "25_34", "35_44", "45_plus"];
const defaultVisibleColumns = [
  "spend",
  "leadsGc",
  "cpl",
  "l1in",
  "l1sent",
  "graduates",
  ...ageKeys,
  "orders",
  "paid",
  "cpl1",
  "cpgrad",
  "gradRate",
  "cppaid",
  "roas",
  "paidRate",
];
const baseKeys = [
  "spend",
  "leadsGc",
  "leadsFb",
  "l1in",
  "l1sent",
  "graduates",
  "orders",
  "paid",
  "revenue",
  ...ageKeys,
];
let portfolios = [];
let accounts = [];
const selectedAccounts = new Set();
const accountById = (id) => accounts.find((a) => a.id === id);
let campaigns = [];
const scopedCampaigns = () =>
  campaigns.filter((c) => selectedAccounts.has(c.accountId));
let allNodes = campaigns.flatMap((c) => [
  c,
  ...c.children.flatMap((a) => [a, ...a.children]),
]);
const leaves = (node) =>
  node.children ? node.children.flatMap(leaves) : [node];
const selected = new Set(campaigns.flatMap(leaves).map((x) => x.id));
const expanded = new Set();
const entityExpanded = new Set();
const visible = new Set(defaultVisibleColumns);
let tagFilter = "all";
const appSettings = {
  dataSource: "local",
  defaultCurrency: "USD",
  allTimeFrom: "2026-01-01",
};
let currency = appSettings.defaultCurrency;
let dateFrom = "",
  dateTo = "";
let pendingFrom = dateFrom,
  pendingTo = dateTo,
  calendarMonth = dateFrom,
  datePreset = "Last 7 days",
  pickingRange = false;
let entitySearch = "",
  entityAccountFilter = "all";
const inactiveTags = new Set();
let savedPreferences = {};
let preferencesReady = false;
try {
  savedPreferences = JSON.parse(localStorage.getItem(PREF_KEY) || localStorage.getItem(LEGACY_PREF_KEY) || "{}");
} catch { savedPreferences = {}; }
function validColumnIds(ids) {
  return Array.isArray(ids) ? ids.filter((id) => columns.some((column) => column[0] === id)) : [];
}
function restorePreferencesForCurrentData({ initial = false, restoreDate = false } = {}) {
  if (restoreDate && savedPreferences.dateFrom && savedPreferences.dateTo) {
    dateFrom = savedPreferences.dateFrom;
    dateTo = savedPreferences.dateTo;
    pendingFrom = dateFrom;
    pendingTo = dateTo;
    datePreset = savedPreferences.datePreset || "Custom";
  }
  if (Array.isArray(savedPreferences.selectedAccounts)) {
    const valid = savedPreferences.selectedAccounts.filter((id) => accountById(id));
    if (valid.length && new Set(valid.map((id) => accountById(id).currency)).size <= 1) {
      selectedAccounts.clear();
      valid.forEach((id) => selectedAccounts.add(id));
    } else if (!selectedAccounts.size || [...selectedAccounts].some((id) => !accountById(id))) {
      selectedAccounts.clear();
    }
  }
  if (!selectedAccounts.size && accounts.length) {
    const defaultCurrency = accounts[0].currency;
    accounts
      .filter((account) => account.currency === defaultCurrency)
      .forEach((account) => selectedAccounts.add(account.id));
  }
  const columnIds = validColumnIds(savedPreferences.visibleColumns);
  if (columnIds.length) {
    visible.clear();
    columnIds.forEach((id) => visible.add(id));
  }
  if (["all", "exclude", "only"].includes(savedPreferences.tagFilter)) tagFilter = savedPreferences.tagFilter;
  if (Array.isArray(savedPreferences.inactiveTags)) {
    inactiveTags.clear();
    savedPreferences.inactiveTags.map((id) => allNodes.find((n) => n.id === id || n.sourceId === id)?.id).filter(Boolean).forEach((id) => inactiveTags.add(id));
  }
  const leafIds = new Set(campaigns.flatMap(leaves).map((node) => node.id));
  const savedSelected = Array.isArray(savedPreferences.selectedEntities) ? savedPreferences.selectedEntities.filter((id) => leafIds.has(id)) : [];
  if (savedSelected.length) {
    selected.clear();
    savedSelected.forEach((id) => selected.add(id));
  } else if (!initial && Array.isArray(savedPreferences.selectedEntities)) {
    selected.clear();
    campaigns.flatMap(leaves).forEach((node) => selected.add(node.id));
  } else if (!Array.isArray(savedPreferences.selectedEntities) && !selected.size) {
    campaigns.flatMap(leaves).forEach((node) => selected.add(node.id));
  }
  const nodeIds = new Set(allNodes.map((node) => node.id));
  if (Array.isArray(savedPreferences.expandedRows)) {
    expanded.clear();
    savedPreferences.expandedRows.filter((id) => nodeIds.has(id)).forEach((id) => expanded.add(id));
  }
  if (Array.isArray(savedPreferences.entityExpanded)) {
    entityExpanded.clear();
    savedPreferences.entityExpanded.filter((id) => nodeIds.has(id)).forEach((id) => entityExpanded.add(id));
  }
  if (savedPreferences.activePage === "data") showPage("data", false);
  else showPage("dashboard", false);
  $("tag-filter").value = tagFilter;
  renderDateButton();
}
function currentPreferences() {
  return {
    dateFrom, dateTo, datePreset,
    selectedAccounts: [...selectedAccounts],
    visibleColumns: [...visible],
    selectedEntities: [...selected],
    expandedRows: [...expanded],
    entityExpanded: [...entityExpanded],
    inactiveTags: [...inactiveTags],
    tagFilter,
    activePage: $("data-page")?.classList?.contains?.("hidden") ? "dashboard" : "data",
  };
}
function savePreferences() {
  if (!preferencesReady) return;
  try {
    savedPreferences = currentPreferences();
    localStorage.setItem(PREF_KEY, JSON.stringify(savedPreferences));
    if ($("storage-note")) $("storage-note").textContent = "";
  } catch {
    if ($("storage-note")) $("storage-note").textContent = "Stocarea locală nu este disponibilă. Filtrele se păstrează doar până la reîncărcare.";
  }
}
function isLocalHost() {
  return ["localhost", "127.0.0.1", ""].includes(location.hostname);
}
function clearSavedPreferences() {
  savedPreferences = {};
  localStorage.removeItem(PREF_KEY);
  localStorage.removeItem(LEGACY_PREF_KEY);
}
function periodData(ad) {
  if (!ad.daily)
    return {
      id: ad.id,
      ageBreakdown: ad.ageBreakdown || {},
      ...Object.fromEntries(baseKeys.map((k) => [k, Number(ad[k] || 0)])),
    };
  const days = ad.daily.filter((d) => d.date >= dateFrom && d.date <= dateTo);
  return days.length ? { id: ad.id, ...aggregate(days) } : null;
}

const $ = (id) => document.getElementById(id);
const number = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("ro-RO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const monthFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});
function dateObj(value) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function shiftDays(value, days) {
  const d = dateObj(value);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}
function monthStart(value) {
  const d = dateObj(value);
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}
function monthEnd(value) {
  const d = dateObj(value);
  return isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
function shiftMonths(value, months) {
  const d = dateObj(value);
  return isoDate(new Date(d.getFullYear(), d.getMonth() + months, 1));
}
function rangeLabel(from, to) {
  const a = dateObj(from),
    b = dateObj(to);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth())
    return (
      new Intl.DateTimeFormat("en-US", { month: "short" }).format(a) +
      " " +
      a.getDate() +
      " – " +
      b.getDate() +
      ", " +
      b.getFullYear()
    );
  return dateFmt.format(a) + " – " + dateFmt.format(b);
}
function todayIso() {
  return isoDate(new Date());
}
function datePresets() {
  const today = todayIso(),
    yesterday = shiftDays(today, -1),
    weekStart = shiftDays(today, -dateObj(today).getDay()),
    lastWeekEnd = shiftDays(weekStart, -1),
    lastWeekStart = shiftDays(lastWeekEnd, -6),
    thisMonthStart = monthStart(today),
    lastMonthDate = shiftMonths(thisMonthStart, -1);
  return [
    ["Custom", dateFrom, dateTo],
    ["Today", today, today],
    ["Yesterday", yesterday, yesterday],
    ["This week", weekStart, today],
    ["Last 7 days", shiftDays(today, -7), yesterday],
    ["Last week", lastWeekStart, lastWeekEnd],
    ["Last 14 days", shiftDays(today, -14), yesterday],
    ["This month", thisMonthStart, today],
    ["Last 30 days", shiftDays(today, -30), yesterday],
    ["Last month", lastMonthDate, monthEnd(lastMonthDate)],
    ["All time", appSettings.allTimeFrom, today],
  ];
}
function applyPresetRange(label) {
  const preset = datePresets().find(([presetLabel]) => presetLabel === label);
  if (!preset) return;
  datePreset = preset[0];
  dateFrom = preset[1];
  dateTo = preset[2];
  pendingFrom = dateFrom;
  pendingTo = dateTo;
  calendarMonth = monthStart(dateFrom);
}
applyPresetRange(datePreset);
function divide(a, b, m = 1) {
  return b ? (a / b) * m : null;
}
function aggregate(rows) {
  const s = Object.fromEntries(
    baseKeys.map((k) => [
      k,
      rows.reduce((sum, r) => sum + Number(r[k] || 0), 0),
    ]),
  );
  return {
    ...s,
    cpl: divide(s.spend, s.leadsGc),
    cpl1: divide(s.spend, s.l1sent),
    cpgrad: divide(s.spend, s.graduates),
    gradRate: divide(s.graduates, s.l1sent, 100),
    cppaid: divide(s.spend, s.paid),
    roas: divide(s.revenue, s.spend),
    paidRate: divide(s.paid, s.leadsGc, 100),
  };
}
function format(v, type) {
  if (v === null) return "—";
  return type === "money"
    ? decimal.format(v) + " " + currency
    : type === "percent"
      ? decimal.format(v) + "%"
      : type === "ratio"
        ? decimal.format(v) + "×"
        : number.format(v);
}
function filteredLeaves(node, parentInactive = false) {
  if (!selectedAccounts.has(node.accountId)) return [];
  const inactive = parentInactive || inactiveTags.has(node.id);
  if (tagFilter === "exclude" && inactive) return [];
  return node.children
    ? node.children.flatMap((n) => filteredLeaves(n, inactive))
    : selected.has(node.id) && (tagFilter !== "only" || inactive)
      ? [periodData(node)].filter(Boolean)
      : [];
}
function cellValues(s) {
  return columns
    .filter((c) => visible.has(c[0]))
    .map(
      ([key, label, type, group]) =>
        `<td class="${group === "Indicatori calculați" ? "derived " : ""}${key === "roas" && s[key] >= 1 ? "roas-good" : ""}">${format(s[key], type)}</td>`,
    )
    .join("");
}
function accountLabel(accountId) {
  return accountById(accountId)?.name || accountId || "Cont necunoscut";
}
function aggregateAgeBreakdown(rows) {
  const result = Object.fromEntries(ageKeys.map((key) => [key, { leadsGc: 0, l1in: 0, l1sent: 0, graduates: 0, orders: 0, paid: 0, revenue: 0 }]));
  for (const row of rows) {
    for (const key of ageKeys) {
      const source = row.ageBreakdown?.[key];
      if (!source) continue;
      for (const metric of ["leadsGc", "l1in", "l1sent", "graduates", "orders", "paid", "revenue"])
        result[key][metric] += Number(source[metric] || 0);
    }
  }
  return result;
}
function renderAgeAnalysis(rows) {
  const byAge = aggregateAgeBreakdown(rows);
  const entries = ageKeys.map((key) => ({ key, ...byAge[key], paidRate: divide(byAge[key].paid, byAge[key].leadsGc, 100), graduationRate: divide(byAge[key].graduates, byAge[key].leadsGc, 100) }));
  const bestPaid = entries.filter((row) => row.paid).sort((a, b) => b.paid - a.paid)[0];
  const bestRate = entries.filter((row) => row.paidRate !== null).sort((a, b) => b.paidRate - a.paidRate)[0];
  const biggestAudience = entries.filter((row) => row.leadsGc).sort((a, b) => b.leadsGc - a.leadsGc)[0];
  const insightCards = [
    ["Cele mai multe leaduri", biggestAudience ? biggestAudience.key : "—", biggestAudience ? format(biggestAudience.leadsGc, "number") + " leaduri" : "Nu sunt date"],
    ["Cele mai multe plăți", bestPaid ? bestPaid.key : "—", bestPaid ? format(bestPaid.paid, "number") + " plăți" : "Nu sunt plăți"],
    ["Cea mai bună rată Lead → Plătit", bestRate ? bestRate.key : "—", bestRate ? format(bestRate.paidRate, "percent") : "Nu sunt date"],
  ];
  $("age-insights").innerHTML = insightCards.map(([label, value, detail]) => `<article><small>${label}</small><strong>${value}</strong><span>${detail}</span></article>`).join("");
  $("age-head").innerHTML = `<tr><th>Vârstă</th><th>Leads GC</th><th>L1 trimis</th><th>Absolvit</th><th>Lead → Absolvit %</th><th>Com creată</th><th>Com plătită</th><th>Venit</th><th>Lead → Plătit %</th></tr>`;
  $("age-body").innerHTML = entries.some((row) => row.leadsGc || row.l1sent || row.paid)
    ? entries.map((row) => `<tr><td><strong>${row.key}</strong></td><td>${format(row.leadsGc, "number")}</td><td>${format(row.l1sent, "number")}</td><td>${format(row.graduates, "number")}</td><td>${format(row.graduationRate, "percent")}</td><td>${format(row.orders, "number")}</td><td>${format(row.paid, "number")}</td><td>${format(row.revenue, "money")}</td><td>${format(row.paidRate, "percent")}</td></tr>`).join("")
    : `<tr><td class="empty" colspan="9">Nu există încă date de vârstă pentru selecția curentă. Încarcă listele de emailuri pe vârstă în pagina Date.</td></tr>`;
}
function render() {
  renderAccountSummary();
  const rows = campaigns.flatMap((c) => filteredLeaves(c));
  const total = aggregate(rows);
  renderAgeAnalysis(rows);
  const cards = [
    ["Spend", format(total.spend, "money"), "Buget cheltuit", "↗"],
    [
      "Leads GC",
      format(total.leadsGc, "number"),
      "Leaduri GetCourse în selecția curentă",
      "♧",
    ],
    [
      "Absolvit",
      format(total.graduates, "number"),
      format(total.gradRate, "percent") + " din L1 trimis",
      "✓",
    ],
    [
      "Com plătită",
      format(total.paid, "number"),
      format(total.revenue, "money") + " venit",
      "▣",
    ],
    ["ROAS", format(total.roas, "ratio"), "Venit / buget cheltuit", "↗"],
  ];
  $("metrics").innerHTML = cards
    .map(
      ([label, value, detail, icon]) =>
        `<article class="metric"><div class="metric-label">${label}<span>${icon}</span></div><div class="metric-value">${value}</div><div class="metric-detail">${detail}</div></article>`,
    )
    .join("");
  $("table-head").innerHTML =
    `<tr><th scope="col"><div class="hierarchy-head">Campanie / Adset / Creative <small>DENUMIRE</small></div></th>${columns
      .filter((c) => visible.has(c[0]))
      .map((c) => `<th scope="col" title="${c[3]}">${c[1]}</th>`)
      .join("")}</tr>`;
  let html = "",
    campaignCount = 0,
    adsetCount = 0;
  function row(node, level, parentInactive = false) {
    const inactive = parentInactive || inactiveTags.has(node.id);
    const included = filteredLeaves(node, parentInactive);
    if (!included.length) return;
    if (level === 0) campaignCount++;
    if (level === 1) adsetCount++;
    const kind = ["campaign", "adset", "creative"][level];
    html += `<tr class="${kind} ${inactive ? "inactive-row" : ""}"><td><div class="row-label">${node.children ? `<button class="toggle" data-toggle="${node.id}" aria-expanded="${expanded.has(node.id)}" aria-label="${expanded.has(node.id) ? "Restrânge" : "Extinde"} ${node.name}">${expanded.has(node.id) ? "−" : "+"}</button>` : '<span class="type-icon">▧</span>'}<span class="name" title="${node.name}">${node.name}</span>${level === 0 ? `<small class="account-origin" title="${accountLabel(node.accountId)}">${accountLabel(node.accountId)}</small>` : ""}${inactive ? `<span class="manual-tag" title="${inactiveTags.has(node.id) ? "Tag manual" : "Tag moștenit de la părinte"}">Inactiv${inactiveTags.has(node.id) ? "" : " ↳"}</span>` : ""}</div></td>${cellValues(aggregate(included))}</tr>`;
    if (node.children && expanded.has(node.id))
      node.children.forEach((child) => row(child, level + 1, inactive));
  }
  campaigns.forEach((c) => row(c, 0));
  $("table-body").innerHTML =
    html ||
    `<tr><td class="empty" colspan="${visible.size + 1}">Nu există date pentru perioada și filtrele selectate. Importă date din Facebook/GetCourse sau alege o perioadă cu date.</td></tr>`;
  $("table-foot").innerHTML =
    `<tr><td>Total selecție <span style="font-weight:400;color:#6e8476;margin-left:8px;font-size:11px">${rows.length} creative</span></td>${cellValues(total)}</tr>`;
  $("campaign-count").textContent = campaignCount + " campanii";
  $("selection-count").textContent = rows.length;
  $("column-count").textContent = visible.size;
  $("row-count").textContent =
    `${campaignCount} campanii · ${campaigns.flatMap((c) => c.children.filter((a) => filteredLeaves(a, inactiveTags.has(c.id)).length)).length} adseturi · ${rows.length} creative în selecție`;
  $("collapse-all").textContent = expanded.size
    ? "⊟ Restrânge tot"
    : "⊞ Extinde tot";
}
function renderEntities() {
  let html = "";
  const q = entitySearch.trim().toLowerCase();
  const activeAccounts = accounts.filter((a) => selectedAccounts.has(a.id));
  if (!activeAccounts.some((a) => a.id === entityAccountFilter))
    entityAccountFilter = "all";
  $("entity-account-filter").innerHTML =
    '<option value="all">Toate conturile</option>' +
    activeAccounts
      .map(
        (a) =>
          `<option value="${a.id}" ${a.id === entityAccountFilter ? "selected" : ""}>${a.name}</option>`,
      )
      .join("");
  function matches(node) {
    if (!q) return true;
    return (
      node.name.toLowerCase().includes(q) ||
      (node.children && node.children.some(matches))
    );
  }
  function option(node, level, parentInactive = false) {
    if (!matches(node)) return;
    const inherited = parentInactive;
    const tagged = inactiveTags.has(node.id);
    const desc = leaves(node);
    const count = desc.filter((r) => selected.has(r.id)).length;
    const open = q || entityExpanded.has(node.id);
    const hasChildren = !!node.children;
    html += `<div class="entity-option ${["c-level", "a-level", "r-level"][level]}"><button class="entity-toggle" data-entity-toggle="${node.id}" aria-expanded="${open}" ${hasChildren ? "" : "disabled"}>${hasChildren ? (open ? "−" : "+") : " "}</button><label class="option"><input type="checkbox" data-entity="${node.id}" ${count === desc.length ? "checked" : ""}><span>${node.name}</span></label><button class="tag-button ${tagged ? "tagged" : ""}" data-tag="${node.id}" aria-pressed="${tagged}" aria-label="Tag Inactiv pentru ${node.name}">${tagged ? "Inactiv ×" : "+ Inactiv"}</button>${inherited ? "<small>Inactiv prin părinte</small>" : ""}</div>`;
    if (hasChildren && open)
      node.children.forEach((n) => option(n, level + 1, inherited || tagged));
  }
  for (const account of activeAccounts) {
    if (entityAccountFilter !== "all" && account.id !== entityAccountFilter)
      continue;
    const list = scopedCampaigns().filter(
      (c) => c.accountId === account.id && matches(c),
    );
    if (!list.length) continue;
    html += `<section class="entity-account-section"><h3>${account.name}<small>${list.length} campanii</small></h3>`;
    list.forEach((c) => option(c, 0));
    html += "</section>";
  }
  $("entity-options").innerHTML =
    html ||
    '<p class="empty entity-empty">Nu am găsit campanii sau adseturi după acest search.</p>';
  $("expand-entities").textContent = entityExpanded.size
    ? "⊟ Restrânge"
    : "⊞ Desfășoară";
  $("entity-options")
    .querySelectorAll("input")
    .forEach((el) => {
      const desc = leaves(allNodes.find((n) => n.id === el.dataset.entity));
      const count = desc.filter((r) => selected.has(r.id)).length;
      el.indeterminate = count > 0 && count < desc.length;
    });
}
function renderDateButton() {
  if ($("date-range-label")) {
    $("date-range-label").textContent = rangeLabel(dateFrom, dateTo);
    $("date-preset-label").textContent = datePreset;
  }
}
function renderDatePicker() {
  renderDateButton();
  $("picker-from").value = pendingFrom;
  $("picker-to").value = pendingTo;
  $("date-presets").innerHTML = datePresets()
    .map(
      ([label, from, to]) =>
        `<button type="button" data-preset="${label}" class="${label === datePreset ? "active" : ""}">${label}</button>`,
    )
    .join("");
  $("calendar-title").textContent = monthFmt
    .format(dateObj(calendarMonth))
    .toUpperCase();
  const start = dateObj(monthStart(calendarMonth));
  const end = dateObj(monthEnd(calendarMonth));
  const first = start.getDay();
  let cells = "";
  for (let i = 0; i < first; i++) cells += "<span></span>";
  for (let day = 1; day <= end.getDate(); day++) {
    const date = isoDate(new Date(start.getFullYear(), start.getMonth(), day));
    const selected = date === pendingFrom || date === pendingTo;
    const inRange = date > pendingFrom && date < pendingTo;
    cells += `<button type="button" data-date="${date}" class="${selected ? "selected " : ""}${inRange ? "in-range" : ""}">${day}</button>`;
  }
  $("calendar-grid").innerHTML = cells;
  $("date-selection-note").textContent = rangeLabel(pendingFrom, pendingTo);
}
async function applyDateRange() {
  if (!pendingFrom || !pendingTo || pendingFrom > pendingTo) {
    $("period-error").textContent =
      "Data de început trebuie să fie înaintea datei de sfârșit.";
    return;
  }
  $("period-error").textContent = "";
  dateFrom = pendingFrom;
  dateTo = pendingTo;
  renderDateButton();
  $("date-dialog").close();
  await loadReport();
  render();
  savePreferences();
}
function renderColumns() {
  let group = "";
  $("column-options").innerHTML = columns
    .map(([id, label, type, g]) => {
      let title = g !== group ? `<h3 class="column-group">${g}</h3>` : "";
      group = g;
      return (
        title +
        `<label class="option"><input type="checkbox" data-column="${id}" ${visible.has(id) ? "checked" : ""}>${label}${g === "Indicatori calculați" ? "<small>Calculat</small>" : ""}</label>`
      );
    })
    .join("");
}
document.addEventListener("click", (e) => {
  const toggle = e.target.closest("[data-toggle]");
  if (toggle) {
    const id = toggle.dataset.toggle;
    expanded.has(id) ? expanded.delete(id) : expanded.add(id);
    render();
    savePreferences();
  }
  const entityToggle = e.target.closest("[data-entity-toggle]");
  if (entityToggle && !entityToggle.disabled) {
    const id = entityToggle.dataset.entityToggle;
    entityExpanded.has(id) ? entityExpanded.delete(id) : entityExpanded.add(id);
    renderEntities();
    savePreferences();
    return;
  }
  const panel = e.target.closest("[data-panel]");
  if (panel) {
    panel.dataset.panel === "entities" ? renderEntities() : renderColumns();
    $(panel.dataset.panel + "-dialog").showModal();
  }
  if (e.target.closest(".close")) e.target.closest("dialog").close();
});
$("entity-options").addEventListener("change", (e) => {
  if (!e.target.matches("[data-entity]")) return;
  const node = allNodes.find((n) => n.id === e.target.dataset.entity);
  leaves(node).forEach((r) =>
    e.target.checked ? selected.add(r.id) : selected.delete(r.id),
  );
  const id = e.target.dataset.entity;
  renderEntities();
  $("entity-options").querySelector(`[data-entity="${id}"]`).focus();
  render();
  savePreferences();
});
$("column-options").addEventListener("change", (e) => {
  const id = e.target.dataset.column;
  if (!id) return;
  e.target.checked ? visible.add(id) : visible.delete(id);
  render();
  savePreferences();
});
$("tag-filter").addEventListener("change", (e) => {
  tagFilter = e.target.value;
  render();
  savePreferences();
});
function renderAccountSummary() {
  const chosen = accounts.filter((a) => selectedAccounts.has(a.id));
  currency = chosen[0]?.currency || appSettings.defaultCurrency;
  $("currency").textContent = chosen.length ? currency : "—";
  $("accounts-summary").textContent =
    chosen.length === 1 ? chosen[0].name : chosen.length + " conturi selectate";
  const portfolioNames = [
    ...new Set(
      chosen.map(
        (a) =>
          (
            portfolios.find((p) => p.id === a.portfolioId)?.name || "Meta Ads"
          ).split(" · ")[0],
      ),
    ),
  ];
  $("accounts-context").textContent = chosen.length
    ? portfolioNames.join(" + ") + " · " + currency
    : "Selectează conturile pentru raport";
  $("account-selection-note").textContent =
    chosen.length + " conturi · selecția se aplică imediat";
}
function showPage(page, persist = true) {
  document.querySelectorAll(".app-page").forEach((p) => p.classList?.add?.("hidden"));
  const target = $(page === "data" ? "data-page" : "dashboard-page");
  target?.classList?.remove?.("hidden");
  $("nav-dashboard")?.classList?.toggle?.("active", page !== "data");
  $("nav-data")?.classList?.toggle?.("active", page === "data");
  if (persist) savePreferences();
}
function renderAccounts() {
  const chosen = accounts.filter((a) => selectedAccounts.has(a.id));
  const selectedCurrency = chosen[0]?.currency;
  $("account-options").innerHTML = portfolios
    .map(
      (p) =>
        `<section class="portfolio-group"><h3>${p.name}</h3><small>Business Portfolio · ${accounts.filter((a) => a.portfolioId === p.id).length} conturi</small>${accounts
          .filter((a) => a.portfolioId === p.id)
          .map((a) => {
            const incompatible =
              selectedCurrency && a.currency !== selectedCurrency;
            return `<label class="account-option ${selectedAccounts.has(a.id) ? "chosen" : ""} ${incompatible ? "unavailable" : ""}"><input type="checkbox" data-account="${a.id}" ${selectedAccounts.has(a.id) ? "checked" : ""} ${incompatible ? "disabled" : ""}><span><strong>${a.name}</strong><small>${a.originalName && a.originalName !== a.name ? a.originalName + " · " : ""}${a.id}</small>${incompatible ? "<small>Deselectează conturile " + selectedCurrency + " pentru a selecta " + a.currency + ".</small>" : ""}</span><span class="account-currency">${a.currency}</span></label>`;
          })
          .join("")}</section>`,
    )
    .join("");
}
function setAccountSelection(ids) {
  if (!Array.isArray(ids) || ids.some((id) => !accountById(id)))
    throw Error("Cont necunoscut.");
  if (new Set(ids.map((id) => accountById(id).currency)).size > 1)
    throw Error("Selectează conturi cu aceeași monedă.");
  selectedAccounts.clear();
  ids.forEach((id) => selectedAccounts.add(id));
  savePreferences();
  render();
  renderAccounts();
  renderEntities();
}
$("accounts-button").onclick = () => {
  renderAccounts();
  $("accounts-dialog").showModal();
};
$("clear-accounts").onclick = () => {
  setAccountSelection([]);
  $("account-error").textContent = "";
};
$("account-options").addEventListener("change", (e) => {
  const id = e.target.dataset.account;
  if (!id) return;
  const ids = new Set(selectedAccounts);
  e.target.checked ? ids.add(id) : ids.delete(id);
  try {
    setAccountSelection([...ids]);
    $("account-error").textContent = "";
  } catch (error) {
    $("account-error").textContent = error.message;
    renderAccounts();
  }
  $("account-options").querySelector(`[data-account="${id}"]`)?.focus();
});
$("date-range-button").onclick = () => {
  pendingFrom = dateFrom;
  pendingTo = dateTo;
  calendarMonth = monthStart(dateFrom);
  pickingRange = false;
  renderDatePicker();
  $("date-dialog").showModal();
};
$("date-cancel").onclick = () => $("date-dialog").close();
$("date-apply").onclick = () => applyDateRange();
$("calendar-prev").onclick = () => {
  calendarMonth = shiftMonths(calendarMonth, -1);
  renderDatePicker();
};
$("calendar-next").onclick = () => {
  calendarMonth = shiftMonths(calendarMonth, 1);
  renderDatePicker();
};
$("date-presets").addEventListener("click", (e) => {
  const button = e.target.closest("[data-preset]");
  if (!button) return;
  const preset = datePresets().find(
    ([label]) => label === button.dataset.preset,
  );
  if (!preset) return;
  datePreset = preset[0];
  pendingFrom = preset[1];
  pendingTo = preset[2];
  calendarMonth = monthStart(pendingFrom);
  pickingRange = false;
  renderDatePicker();
});
$("calendar-grid").addEventListener("click", (e) => {
  const button = e.target.closest("[data-date]");
  if (!button) return;
  const date = button.dataset.date;
  if (!pickingRange) {
    pendingFrom = date;
    pendingTo = date;
    pickingRange = true;
  } else {
    if (date < pendingFrom) {
      pendingTo = pendingFrom;
      pendingFrom = date;
    } else pendingTo = date;
    pickingRange = false;
  }
  datePreset = "Custom";
  renderDatePicker();
  savePreferences();
});
$("picker-from").addEventListener("change", (e) => {
  pendingFrom = e.target.value;
  datePreset = "Custom";
  pickingRange = false;
  calendarMonth = monthStart(pendingFrom || calendarMonth);
  renderDatePicker();
  savePreferences();
});
$("picker-to").addEventListener("change", (e) => {
  pendingTo = e.target.value;
  datePreset = "Custom";
  pickingRange = false;
  renderDatePicker();
  savePreferences();
});

$("nav-dashboard").onclick = () => showPage("dashboard");
$("nav-data").onclick = () => showPage("data");
let pendingGcImport = null;
let gcDataPage = 0;
const gcDataPageSize = 100;
async function previewGetCourseFile(input, kind) {
  const file = input.files?.[0];
  if (!file || !kind) return;
  const status = $("gc-import-status");
  const preview = $("gc-import-preview");
  status.textContent = "Analizez " + file.name + "...";
  preview.classList.add("hidden");
  try {
    const text = await file.text();
    pendingGcImport = { kind, text, fileName: file.name };
    const response = await fetch("/api/gc/preview/" + kind, {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: text,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Preview-ul a eșuat.");
    const p = result.preview;
    preview.innerHTML = `<strong>Preview import: ${file.name}</strong><div class="preview-grid"><span>Total: <b>${p.total}</b></span><span>Valide: <b>${p.valid}</b></span><span>Noi: <b>${p.new}</b></span><span>Actualizări: <b>${p.existing}</b></span><span>Duplicate în fișier: <b>${p.duplicatesInFile}</b></span><span>Ignorate: <b>${p.invalid + p.cancelled}</b></span>${kind === "orders" ? `<span>Comenzi plătite: <b>${p.paidOrders}</b></span><span>Clienți plătiți: <b>${p.paidCustomers}</b></span><span>Venit: <b>${decimal.format(p.revenue)}</b></span>` : ""}</div><div class="preview-actions"><button id="gc-confirm-import" class="primary" type="button">Confirmă importul</button><button id="gc-cancel-import" type="button">Anulează</button></div>`;
    preview.classList.remove("hidden");
    status.textContent = "Verifică preview-ul și confirmă importul.";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    input.value = "";
  }
}
async function confirmGetCourseImport() {
  if (!pendingGcImport) return;
  const status = $("gc-import-status");
  status.textContent = "Import " + pendingGcImport.fileName + "...";
  const endpoint = "/api/gc/import/" + pendingGcImport.kind;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/csv" },
    body: pendingGcImport.text,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Importul a eșuat.");
  status.textContent = "Importat " + result.imported + " rânduri din " + pendingGcImport.fileName + ".";
  pendingGcImport = null;
  $("gc-import-preview").classList.add("hidden");
  await loadReport();
  render();
  await loadGcData();
}
$("gc-record-file").addEventListener("change", (event) =>
  previewGetCourseFile(event.target, $("gc-record-kind").value),
);
$("gc-list-file").addEventListener("change", (event) =>
  previewGetCourseFile(event.target, $("gc-list-kind").value),
);
$("gc-import-preview").addEventListener("click", async (event) => {
  if (event.target.id === "gc-cancel-import") {
    pendingGcImport = null;
    $("gc-import-preview").classList.add("hidden");
    $("gc-import-status").textContent = "Import anulat.";
  }
  if (event.target.id === "gc-confirm-import") {
    try { await confirmGetCourseImport(); }
    catch (error) { $("gc-import-status").textContent = error.message; }
  }
});
async function loadGcData(page = gcDataPage) {
  gcDataPage = Math.max(page, 0);
  const type = $("gc-data-type").value;
  const search = $("gc-data-search").value.trim();
  const status = $("gc-data-status");
  status.textContent = "Se încarcă datele...";
  try {
    const params = new URLSearchParams({ type, search, limit: String(gcDataPageSize), offset: String(gcDataPage * gcDataPageSize) });
    const response = await fetch("/api/gc/data?" + params.toString());
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Nu pot încărca datele.");
    const rows = result.rows || [];
    const total = Number(result.total || 0);
    const keys = rows.length ? Object.keys(rows[0]) : ["email", "date"];
    $("gc-data-head").innerHTML = `<tr>${keys.map((key) => `<th>${key}</th>`).join("")}</tr>`;
    $("gc-data-body").innerHTML = rows.length
      ? rows.map((row) => `<tr>${keys.map((key) => `<td>${row[key] ?? ""}</td>`).join("")}</tr>`).join("")
      : `<tr><td class="empty" colspan="${keys.length}">Nu există date pentru filtrul ales.</td></tr>`;
    const start = total && rows.length ? gcDataPage * gcDataPageSize + 1 : 0;
    const end = gcDataPage * gcDataPageSize + rows.length;
    const pages = Math.max(Math.ceil(total / gcDataPageSize), 1);
    $("gc-data-page").textContent = `Pagina ${gcDataPage + 1} din ${pages}`;
    $("gc-data-prev").disabled = gcDataPage === 0;
    $("gc-data-next").disabled = end >= total;
    status.textContent = total ? `${start}–${end} din ${total} rânduri afișate.` : "0 rânduri afișate.";
  } catch (error) {
    status.textContent = error.message;
  }
}
async function loadGoogleImportStatus() {
  if (!$("google-import-status")) return;
  try {
    const response = await fetch("/api/google/imports/latest");
    const result = await response.json();
    if (!result) { $("google-import-status").textContent = "Ultimul import Google Sheets: nu există încă."; return; }
    const details = (result.sheets || []).map((s) => `${s.sheet_name}: ${s.rows_imported}/${s.rows_read}`).join(" · ");
    $("google-import-status").textContent = `Ultimul import Google Sheets: ${result.status} · ${result.finished_at || result.started_at}${details ? " · " + details : ""}`;
  } catch {
    $("google-import-status").textContent = "Ultimul import Google Sheets: nu poate fi citit.";
  }
}
$("gc-data-refresh").onclick = () => loadGcData(0);
$("gc-data-prev").onclick = () => loadGcData(gcDataPage - 1);
$("gc-data-next").onclick = () => loadGcData(gcDataPage + 1);
$("gc-data-type").addEventListener("change", () => loadGcData(0));
$("gc-data-search").addEventListener("keydown", (event) => { if (event.key === "Enter") loadGcData(0); });
loadGoogleImportStatus();
$("sync-meta").addEventListener("click", async () => {
  const button = $("sync-meta"),
    status = $("sync-status");
  button.disabled = true;
  status.textContent = "Import în desfășurare…";
  try {
    const response = await fetch("/api/meta/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: dateFrom, to: dateTo }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Importul a eșuat.");
    await loadReport();
    status.textContent = `Actualizat · ${result.rowsImported} rânduri importate`;
    status.className = "sync-success";
  } catch (error) {
    status.textContent = location.hostname.endsWith("github.io")
      ? "Importul este disponibil din aplicația locală."
      : error.message;
    status.className = "sync-error";
  } finally {
    button.disabled = false;
  }
});
$("expand-entities").onclick = () => {
  if (entityExpanded.size) {
    entityExpanded.clear();
  } else
    allNodes.filter((n) => n.children).forEach((n) => entityExpanded.add(n.id));
  renderEntities();
};
$("entity-search").addEventListener("input", (e) => {
  entitySearch = e.target.value;
  renderEntities();
  savePreferences();
});
$("entity-account-filter").addEventListener("change", (e) => {
  entityAccountFilter = e.target.value;
  renderEntities();
  savePreferences();
});
$("entity-options").addEventListener("click", (e) => {
  const button = e.target.closest("[data-tag]");
  if (!button) return;
  const id = button.dataset.tag;
  inactiveTags.has(id) ? inactiveTags.delete(id) : inactiveTags.add(id);
  savePreferences();
  renderEntities();
  $("entity-options").querySelector(`[data-tag="${id}"]`).focus();
  render();
});
$("collapse-all").onclick = () => {
  if (expanded.size) expanded.clear();
  else allNodes.filter((n) => n.children).forEach((n) => expanded.add(n.id));
  render();
  savePreferences();
};
$("select-all").onclick = () => {
  scopedCampaigns()
    .flatMap(leaves)
    .forEach((n) => selected.add(n.id));
  renderEntities();
  render();
  savePreferences();
};
$("select-none").onclick = () => {
  scopedCampaigns()
    .flatMap(leaves)
    .forEach((n) => selected.delete(n.id));
  renderEntities();
  render();
  savePreferences();
};
$("reset").onclick = () => {
  clearSavedPreferences();
  campaigns.flatMap(leaves).forEach((n) => selected.add(n.id));
  visible.clear();
  defaultVisibleColumns.forEach((id) => visible.add(id));
  expanded.clear();
  entityExpanded.clear();
  inactiveTags.clear();
  entitySearch = "";
  entityAccountFilter = "all";
  tagFilter = "all";
  $("tag-filter").value = "all";
  applyPresetRange("Last 7 days");
  $("period-error").textContent = "";
  renderDateButton();
  renderColumns();
  renderEntities();
  render();
  savePreferences();
};
$("formulas-button").onclick = () => $("formulas-dialog").showModal();
document.querySelectorAll("dialog").forEach((d) =>
  d.addEventListener("click", (e) => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        d.close();
    }
  }),
);
restorePreferencesForCurrentData({ initial: true, restoreDate: true });
preferencesReady = true;
renderDateButton();
render();

function reportEndpoint() {
  return "/api/report?" + new URLSearchParams({ from: dateFrom, to: dateTo }).toString();
}

function normalizeReportData(report) {
  portfolios = report.portfolios || [];
  accounts = report.accounts || [];
  campaigns = report.campaigns || [];
  for (const account of accounts) {
    const portfolioId = account.portfolioId || "unknown";
    account.portfolioId = portfolioId;
    if (!portfolios.some((portfolio) => portfolio.id === portfolioId)) {
      portfolios.push({ id: portfolioId, name: portfolioId === "getcourse" ? "GetCourse" : "Fără Business Portfolio" });
    }
  }
  const accountIds = new Set(accounts.map((account) => account.id));
  const inferredIds = [...new Set(campaigns.map((campaign) => campaign.accountId).filter(Boolean))]
    .filter((id) => !accountIds.has(id));
  for (const id of inferredIds) {
    const isGetCourse = id === "getcourse" || id.startsWith?.("gc:");
    const portfolioId = isGetCourse ? "getcourse" : "unknown";
    if (!portfolios.some((portfolio) => portfolio.id === portfolioId)) {
      portfolios.push({ id: portfolioId, name: isGetCourse ? "GetCourse" : "Fără portfolio" });
    }
    accounts.push({
      id,
      portfolioId,
      name: isGetCourse ? "GetCourse" : id,
      originalName: isGetCourse ? "GetCourse" : id,
      currency: appSettings.defaultCurrency,
    });
  }
}

async function loadReport() {
  const response = await fetch(reportEndpoint());
  if (!response.ok) return;
  const report = await response.json();
  normalizeReportData(report);
  allNodes = campaigns.flatMap((c) => [
    c,
    ...c.children.flatMap((a) => [a, ...a.children]),
  ]);
  restorePreferencesForCurrentData();
  render();
  savePreferences();
}

loadReport().catch((error) => { console.error(error); });
if (document.modelContext?.registerTool) {
  try {
    Promise.resolve(
      document.modelContext.registerTool({
        name: "configure_campaign_view",
        description:
          "Configure visible columns and the manual inactive tag filter.",
        inputSchema: {
          type: "object",
          properties: {
            columns: {
              type: "array",
              items: { type: "string", enum: columns.map((c) => c[0]) },
            },
            tagFilter: { type: "string", enum: ["all", "exclude", "only"] },
          },
          required: ["columns"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute(input) {
          if (
            !input ||
            !Array.isArray(input.columns) ||
            input.columns.some((id) => !columns.some((c) => c[0] === id)) ||
            (input.tagFilter !== undefined &&
              !["all", "exclude", "only"].includes(input.tagFilter))
          )
            throw new Error("Invalid view configuration");
          visible.clear();
          input.columns.forEach((id) => visible.add(id));
          if (input.tagFilter !== undefined) tagFilter = input.tagFilter;
          $("tag-filter").value = tagFilter;
          renderColumns();
          render();
          savePreferences();
          return { columns: [...visible], tagFilter };
        },
      }),
    ).catch(() => {});
  } catch {}
}
