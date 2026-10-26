// Column layout of the HQ-style summary and category tables. The page and the
// Excel file both read these lists, so they always show the same columns.
// Order and headings follow HQ's CIRCLE-WISE / PERFORMANCE / CATEGORY sheets.
// fmt: mu (MU, 3 dp) | lakh (Rs lakhs, 3 dp) | rs (Rs) | int | pct | rate | days

export const SUMMARY_COLS = [
  { key: 'injected_mu', label: 'Energy injected (MU)', fmt: 'mu' },
  { key: 'esd_billed_mu', label: 'ESD (MU)', group: 'Energy billed', fmt: 'mu' },
  { key: 'irca_billed_mu', label: 'IRCA (MU)', group: 'Energy billed', fmt: 'mu' },
  { key: 'billed_mu', label: 'Total (MU)', group: 'Energy billed', fmt: 'mu' },
  { key: 'billing_eff', label: 'Billing efficiency', fmt: 'pct', strong: true },
  { key: 'collection_eff', label: 'Collection efficiency', fmt: 'pct', strong: true },
  { key: 'atc_loss', label: 'AT&C losses', fmt: 'pct' },
  { key: 'required_100', label: 'Rs lakhs', group: 'Required for 100% CE', fmt: 'lakh', strong: true },
  { key: 'required_100_rs', label: 'Rs', group: 'Required for 100% CE', fmt: 'rs' },
  { key: 'connected_load_kw', label: 'Connected load (kW)', fmt: 'int' },
  { key: 'pdc', label: 'P.D.C.', fmt: 'int' },
  { key: 'tdc', label: 'T.D.C.', group: 'Total nos of consumers', fmt: 'int' },
  { key: 'regular_cons', label: 'Regular', group: 'Total nos of consumers', fmt: 'int' },
  { key: 'total_cons', label: 'Total', group: 'Total nos of consumers', fmt: 'int' },
  { key: 'bills_served', label: 'Nos. of bills served', fmt: 'int' },
  { key: 'pc_billing', label: 'Billing Percentage', fmt: 'pct' },
  { key: 'def_meters', label: 'Defective meters', fmt: 'int' },
  { key: 'dmd_current', label: 'Current', group: 'Revenue demand (Rs lakhs)', fmt: 'lakh' },
  { key: 'dmd_arrear', label: 'Arrear', group: 'Revenue demand (Rs lakhs)', fmt: 'lakh' },
  { key: 'dmd_total', label: 'Total', group: 'Revenue demand (Rs lakhs)', fmt: 'lakh' },
  { key: 'coll_current', label: 'Current', group: 'Collection (Rs lakhs)', fmt: 'lakh' },
  { key: 'coll_govt_adj', label: 'Govt. adjustment against central payment', group: 'Collection (Rs lakhs)', fmt: 'lakh' },
  { key: 'coll_non_cash', label: 'Non cash adjustment (LS interest / own consumption bill)', group: 'Collection (Rs lakhs)', fmt: 'lakh' },
  { key: 'coll_subsidy', label: 'Govt. subsidy', group: 'Collection (Rs lakhs)', fmt: 'lakh' },
  { key: 'coll_tariff', label: 'Tariff adjustment', group: 'Collection (Rs lakhs)', fmt: 'lakh' },
  { key: 'coll_total_current', label: 'Total current collection', group: 'Collection (Rs lakhs)', fmt: 'lakh' },
  { key: 'coll_arrear', label: 'Arrear', group: 'Collection (Rs lakhs)', fmt: 'lakh' },
  { key: 'coll_grand', label: 'Grand total collection', group: 'Collection (Rs lakhs)', fmt: 'lakh', strong: true },
  { key: 'real_current', label: 'Current', group: '% Realisation', fmt: 'pct' },
  { key: 'real_arrear', label: 'Arrear', group: '% Realisation', fmt: 'pct' },
  { key: 'real_total', label: 'Total', group: '% Realisation', fmt: 'pct' },
  { key: 'arrear_freeze_pdc', label: 'Freeze & PDC', group: 'Arrear at the end of month (Rs lakhs)', fmt: 'lakh' },
  { key: 'arrear_regular', label: 'Regular', group: 'Arrear at the end of month (Rs lakhs)', fmt: 'lakh' },
  { key: 'arrear_total', label: 'Total', group: 'Arrear at the end of month (Rs lakhs)', fmt: 'lakh' },
  { key: 'cons_paid', label: 'No. of consumers paid', fmt: 'int' },
  { key: 'defaulters', label: 'No. of defaulter consumers at the end of the month', fmt: 'int' },
  { key: 'coll_ex_govt', label: 'Total collection (Ex Govt Sub & Adj) (Rs lakhs)', fmt: 'lakh' },
  { key: 'days_total', label: 'Total', group: 'No. of days receivable of arrears', fmt: 'days' },
  { key: 'days_excl', label: 'Excl. PDC & Freeze', group: 'No. of days receivable of arrears', fmt: 'days' },
  { key: 'abr', label: 'Average billing rate (Rs/kWh)', fmt: 'rate' },
  { key: 'arr', label: 'A.R.R. (Rs/kWh)', fmt: 'rate' },
];

export const CATEGORY_COLS = [
  { key: 'energy_mu', label: 'Energy billed (MU)', fmt: 'mu' },
  { key: 'connected_load_kw', label: 'Connected load (kW)', fmt: 'int' },
  { key: 'pdc', label: 'P.D.C.', fmt: 'int' },
  { key: 'tdc', label: 'T.D.C.', group: 'Total nos of consumers', fmt: 'int' },
  { key: 'regular_cons', label: 'Regular', group: 'Total nos of consumers', fmt: 'int' },
  { key: 'total_cons', label: 'Total', group: 'Total nos of consumers', fmt: 'int' },
  { key: 'bills_served', label: 'Nos. of bills served', fmt: 'int' },
  { key: 'def_meters', label: 'Defective meters', fmt: 'int' },
  { key: 'dmd_current', label: 'Current', group: 'Revenue demand (Rs lakhs)', fmt: 'lakh' },
  { key: 'dmd_arrear', label: 'Arrear', group: 'Revenue demand (Rs lakhs)', fmt: 'lakh' },
  { key: 'dmd_total', label: 'Total', group: 'Revenue demand (Rs lakhs)', fmt: 'lakh' },
  { key: 'coll_current', label: 'Current', group: 'Collection (Rs lakhs)', fmt: 'lakh' },
  { key: 'coll_govt_adj', label: 'Govt. adjustment against central payment', group: 'Collection (Rs lakhs)', fmt: 'lakh' },
  { key: 'coll_non_cash', label: 'Non cash adjustment', group: 'Collection (Rs lakhs)', fmt: 'lakh' },
  { key: 'coll_subsidy', label: 'Govt. subsidy', group: 'Collection (Rs lakhs)', fmt: 'lakh' },
  { key: 'coll_tariff', label: 'Tariff adjustment', group: 'Collection (Rs lakhs)', fmt: 'lakh' },
  { key: 'coll_total_current', label: 'Total current collection', group: 'Collection (Rs lakhs)', fmt: 'lakh' },
  { key: 'coll_arrear', label: 'Arrear', group: 'Collection (Rs lakhs)', fmt: 'lakh' },
  { key: 'coll_grand', label: 'Grand total collection', group: 'Collection (Rs lakhs)', fmt: 'lakh', strong: true },
  { key: 'cons_paid', label: 'No. of consumers paid', fmt: 'int' },
  { key: 'defaulters', label: 'No. of defaulter consumers at the end of the month', fmt: 'int' },
  { key: 'collection_eff', label: 'Collection efficiency', fmt: 'pct', strong: true },
  { key: 'arrear_freeze_pdc', label: 'Freeze & PDC', group: 'Arrear at the end of month (Rs lakhs)', fmt: 'lakh' },
  { key: 'arrear_regular', label: 'Regular', group: 'Arrear at the end of month (Rs lakhs)', fmt: 'lakh' },
  { key: 'days_total', label: 'Total', group: 'No. of days receivable of arrears', fmt: 'days' },
  { key: 'days_excl', label: 'Excl. PDC & Freeze', group: 'No. of days receivable of arrears', fmt: 'days' },
  { key: 'abr', label: 'Average billing rate (Rs/kWh)', fmt: 'rate' },
];

/** [{label, span}] for the top header row; ungrouped columns get span 1 with label '' (merged down in Excel). */
export function groupSpans(cols) {
  const out = [];
  for (const c of cols) {
    const last = out[out.length - 1];
    if (c.group && last && last.label === c.group) last.span += 1;
    else out.push({ label: c.group || '', span: 1 });
  }
  return out;
}

export const EXCEL_FMT = {
  mu: '#,##0.000',
  lakh: '#,##0.000',
  rs: '#,##0',
  int: '#,##0',
  pct: '0.00%',
  rate: '0.000',
  days: '0.00',
};

/** Text for the web page. Null/NaN show as a dash. */
export function fmtValue(v, fmt) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '-';
  switch (fmt) {
    case 'pct': return `${(v * 100).toFixed(2)}%`;
    case 'mu': case 'lakh': case 'rate':
      return v.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    case 'days': return v.toFixed(2);
    case 'rs': return Math.round(v).toLocaleString('en-IN');
    default: return Math.round(v).toLocaleString('en-IN');
  }
}

// ---------------------------------------------------------------------------
// Sections: the order in which columns are laid out when a wide table is cut
// into several narrower tables stacked one below the other (print and image).
// ---------------------------------------------------------------------------
export const SUMMARY_SECTIONS = [
  {
    title: 'Energy and efficiency',
    keys: ['injected_mu', 'esd_billed_mu', 'irca_billed_mu', 'billed_mu', 'billing_eff', 'collection_eff', 'atc_loss', 'abr', 'arr', 'required_100', 'required_100_rs'],
  },
  {
    title: 'Consumers',
    keys: ['connected_load_kw', 'pdc', 'tdc', 'regular_cons', 'total_cons', 'bills_served', 'pc_billing', 'def_meters'],
  },
  {
    title: 'Demand and collection',
    keys: ['dmd_current', 'dmd_arrear', 'dmd_total', 'coll_current', 'coll_govt_adj', 'coll_non_cash', 'coll_subsidy', 'coll_tariff', 'coll_total_current', 'coll_arrear', 'coll_grand'],
  },
  {
    title: 'Realisation and arrears',
    keys: ['real_current', 'real_arrear', 'real_total', 'arrear_freeze_pdc', 'arrear_regular', 'arrear_total', 'cons_paid', 'defaulters', 'coll_ex_govt', 'days_total', 'days_excl'],
  },
];

export const CATEGORY_SECTIONS = [
  {
    title: 'Consumers and energy',
    keys: ['energy_mu', 'connected_load_kw', 'pdc', 'tdc', 'regular_cons', 'total_cons', 'bills_served', 'def_meters', 'abr'],
  },
  {
    title: 'Demand and collection',
    keys: ['dmd_current', 'dmd_arrear', 'dmd_total', 'coll_current', 'coll_govt_adj', 'coll_non_cash', 'coll_subsidy', 'coll_tariff'],
  },
  {
    title: 'Collection, efficiency and arrears',
    keys: ['coll_total_current', 'coll_arrear', 'coll_grand', 'collection_eff', 'cons_paid', 'defaulters', 'arrear_freeze_pdc', 'arrear_regular', 'days_total', 'days_excl'],
  },
];

/** [{ title, cols }] - only the columns present in `cols`, empty sections dropped. */
export function sectionCols(cols, sections) {
  const byKey = new Map(cols.map((c) => [c.key, c]));
  const used = new Set();
  const out = [];
  for (const s of sections) {
    const list = s.keys.filter((k) => byKey.has(k)).map((k) => { used.add(k); return byKey.get(k); });
    if (list.length) out.push({ title: s.title, cols: list });
  }
  const rest = cols.filter((c) => !used.has(c.key));
  if (rest.length) out.push({ title: 'Other', cols: rest });
  return out;
}

/** Cuts the columns into blocks of at most `max` columns, keeping sections together where they fit. */
export function packBlocks(cols, sections, max) {
  const blocks = [];
  let cur = [];
  for (const s of sectionCols(cols, sections)) {
    let list = s.cols;
    while (list.length > max) {
      if (cur.length) { blocks.push(cur); cur = []; }
      blocks.push(list.slice(0, max));
      list = list.slice(max);
    }
    if (cur.length + list.length > max && cur.length) { blocks.push(cur); cur = []; }
    cur = cur.concat(list);
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}
