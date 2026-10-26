// HQ MRR module - pure logic (no database, no files). The category-wise
// "commercial" MRR of each ESD is the HQ-format file: 30 rows (one per tariff
// category) with the same columns as HQ's "ESD MRR" sheet. Everything HQ
// reports for an ESD or for the circle is a sum of those rows plus ratios,
// worked out here exactly the way HQ's CIRCLE-WISE / PERFORMANCE /
// CATEGORY sheets do it (formulas checked against HQ's September 2026 sheets).
//
// Units in the file: kWh and Rupees. HQ reports MU and Rs in Lakhs.

export const ESDS = ['Dhupdhara', 'Dudhnoi', 'Goalpara', 'Lakhipur', 'Mankachar'];

/** HQ office name of each ESD in HQ's ESD MRR sheet. */
export const HQ_OFFICE = {
  Dhupdhara: 'cbs_dhupdhara',
  Dudhnoi: 'cbs_damra',
  Goalpara: 'cbs_goalpara',
  Lakhipur: 'cbs_lakhipur_bec',
  Mankachar: 'cbs_mankachar',
};

/** ESD code used in HQ's IRCA ESD-wise MRR. */
export const ESD_CODE = { Dhupdhara: '038', Dudhnoi: '039', Goalpara: '040', Lakhipur: '041', Mankachar: '042' };

// key -> [HQ column name in the ESD MRR sheet, accepted header spellings]
export const FIELDS = [
  ['unit_billed', 'UNIT_BILLED', ['unitbilled']],
  ['connected_load', 'CONNECTED_LOAD', ['connectedload']],
  ['pdc', 'PDC', ['pdc']],
  ['tdc', 'TDC', ['tdc']],
  ['regular_cons', 'REGULR_CONS', ['regularcons', 'regulrcons']],
  ['total_cons', 'TOTAL_CONS', ['totalcons']],
  ['cons_billed', 'TOT_CONS_BILLED', ['totalconsbilled', 'totconsbilled']],
  ['cons_not_billed', 'TOT_CONS_NOT_BILLED', ['totalconsumernotbilled', 'totconsnotbilled']],
  ['def_meter', 'TOT_DEF_METER', ['totaldefectivemeter', 'totdefmeter']],
  ['current_dmd', 'CURRENT_DMD', ['currentdemand', 'currentdmd']],
  ['arrear_dmd', 'ARREAR_DMD', ['arreardemand', 'arreardmd']],
  ['total_dmd', 'TOTAL_DMD', ['totaldemand', 'totaldmd']],
  ['curdmd_coll', 'CURDMD_COLLECTION', ['currentdemandcollection', 'curdmdcollection']],
  ['arrear_coll', 'ARREAR_COLLECTION', ['arrearcollection']],
  ['govt_adj', 'GOVT_ADJUSTMENT', ['govtadjustment']],
  ['total_coll', 'TOTAL_COLLECTION', ['totalcollection']],
  ['non_cash', 'NON_CASH_ADJ', ['noncashadjustment', 'noncashadj']],
  ['govt_subsidy', 'GOVT_SUBSDIY', ['govtsubsidy', 'govtsubsdiy']],
  ['tariff_adj', 'TARIFF_ADJUSTMENT', ['tariffadjustment']],
  ['grand_coll', 'GRAND_TOT_COLL', ['grandtotalcollection', 'grandtotcoll']],
  ['cons_paid', 'NO_OF_CONS_PAID', ['noofconspaid']],
  ['defaulter', 'NO_OF_DEFAULTER', ['noofdefaulter']],
  ['arr_reg_tdc', 'ARR_REG_TDC', ['arrearregtdc', 'arrregtdc']],
  ['arr_pdc', 'ARR_PDC', ['arreapdc', 'arrearpdc', 'arrpdc']],
  ['freeze_arr', 'FREEZE_ARR', ['freezearrear', 'freezearr']],
];
export const FIELD_KEYS = FIELDS.map((f) => f[0]);

/** Category names as HQ prints them in its category sheet. */
export const CATEGORY_NAMES = {
  '01': 'Jeevan Dhara', '02': 'Domestic A', '03': 'Domestic B', '04': 'Commercial',
  '05': 'General Purpose (Non Commercial & Non Domestic Users)',
  '06': 'General Purpose (Govt. Primary & Secondary/ Higher Secondary Schools)',
  '07': 'Public Lighting', '08': 'Agriculture', '09': 'Small Industries (Rural)',
  '10': 'Small Industries (Urban)', '11': 'Temporary Supply (Domestic)',
  '12': 'Temporary Supply (Non-domestic)', '13': 'Temporary Supply (Agriculture)',
  '14': 'Electric Vehicle Charging Station (LT)',
  '15': 'HT Domestic', '16': 'HT Commercial', '17': 'HT Public Water Works',
  '18': 'HT Bulk Supply (Govt. Education)', '19': 'HT Bulk Supply (Others)',
  '20': 'HT Small Industries', '21': 'HT-I Industries (above 50 kVA to 150 kVA)',
  '22': 'HT-II Industries above 150 kVA (Option I : TOD)',
  '23': 'HT-II Industries above 150 kVA (Option II : Non TOD)',
  '24': 'Tea, Coffee & Rubber', '25': 'Oil & Coal', '26': 'HT Irrigation (above 25kW) (30 kVA)',
  '27': 'HT Temporary Supply', '28': 'HT Electric Crematorium', '29': 'HT Railway Traction',
  '30': 'HT Electric Vehicle Charging Station',
};
// Explicit list: Object.keys() would put '10'..'30' before '01'..'09'.
export const CATEGORY_CODES = Array.from({ length: 30 }, (_, i) => String(i + 1).padStart(2, '0'));

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
export const MONTH_LABEL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const div = (a, b) => (b ? a / b : null);
const round = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? v : Math.round(v * 10 ** d) / 10 ** d);

/** "2026-09-01" -> "September 2026" */
export function monthName(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})/);
  return m ? `${MONTH_LABEL[Number(m[2]) - 1]} ${m[1]}` : String(iso);
}

// ---------------------------------------------------------------- reading

/**
 * Reads the rows of one ESD's category-wise commercial MRR.
 * `grid` is the sheet as an array of rows (arrays). Returns
 * { month: 'YYYY-MM-01' | null, rows: [{category_code, category_name, ...fields}], warnings: [] }
 * and throws a readable error if the sheet is not this report.
 */
export function parseCommercialGrid(grid) {
  let h = -1;
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const keys = (grid[i] || []).map(norm);
    if (keys.includes('categorycode') && (keys.includes('unitbilled') || keys.includes('currentdemand') || keys.includes('currentdmd'))) {
      h = i;
      break;
    }
  }
  if (h < 0) {
    throw new Error('This does not look like the category-wise commercial MRR (no "Category Code" / "Unit Billed" header found).');
  }
  const header = grid[h].map(norm);
  const col = {};
  for (const [key, , aliases] of FIELDS) {
    const idx = header.findIndex((x) => aliases.includes(x));
    if (idx >= 0) col[key] = idx;
  }
  const must = ['unit_billed', 'current_dmd', 'arrear_dmd', 'curdmd_coll', 'arrear_coll', 'grand_coll', 'govt_subsidy', 'tariff_adj'];
  const missing = must.filter((k) => col[k] === undefined);
  if (missing.length) {
    throw new Error(`Columns missing in the file: ${missing.join(', ')}. This is not the category-wise commercial MRR.`);
  }
  const iCode = header.indexOf('categorycode');
  const iName = header.findIndex((x) => x === 'categoryname');
  const iMonth = header.findIndex((x) => x === 'month' || x === 'mmonthname');
  const iYear = header.findIndex((x) => x === 'year' || x === 'yyear');

  const rows = [];
  const seen = new Set();
  let monthIdx = null;
  let year = null;
  for (let i = h + 1; i < grid.length; i++) {
    const r = grid[i] || [];
    const raw = r[iCode];
    if (raw === null || raw === undefined || String(raw).trim() === '') continue;
    const code = String(Number.isFinite(Number(raw)) ? Number(raw) : raw).trim().padStart(2, '0');
    if (!CATEGORY_NAMES[code]) continue; // totals / footers
    if (seen.has(code)) throw new Error(`Category ${code} appears twice in the file.`);
    seen.add(code);
    const row = { category_code: code, category_name: iName >= 0 ? String(r[iName] ?? '').trim() : '' };
    for (const key of FIELD_KEYS) row[key] = col[key] === undefined ? 0 : num(r[col[key]]);
    // Older exports may not carry the three derived totals - fill them in.
    if (col.total_dmd === undefined) row.total_dmd = row.current_dmd + row.arrear_dmd;
    if (col.total_coll === undefined) row.total_coll = row.curdmd_coll + row.arrear_coll + row.govt_adj;
    rows.push(row);
    if (monthIdx === null && iMonth >= 0 && r[iMonth] != null) {
      const mi = MONTHS.indexOf(String(r[iMonth]).trim().toLowerCase());
      if (mi >= 0) monthIdx = mi;
    }
    if (year === null && iYear >= 0 && r[iYear] != null) {
      const y = Number(r[iYear]);
      if (Number.isFinite(y) && y > 2000) year = y;
    }
  }
  if (rows.length === 0) throw new Error('No category rows (codes 01-30) found in the file.');

  const warnings = [];
  if (rows.length < 30) warnings.push(`Only ${rows.length} of the 30 category rows are present.`);
  const month = monthIdx !== null && year !== null ? `${year}-${String(monthIdx + 1).padStart(2, '0')}-01` : null;
  warnings.push(...consistencyWarnings(rows));
  return { month, rows, warnings };
}

/** The file's own totals must agree with its parts (within a rupee or two). */
export function consistencyWarnings(rows) {
  const t = sumRows(rows);
  const w = [];
  const tol = 2;
  if (Math.abs(t.total_dmd - (t.current_dmd + t.arrear_dmd)) > tol) w.push('Total Demand is not Current + Arrear demand.');
  if (Math.abs(t.total_coll - (t.curdmd_coll + t.arrear_coll + t.govt_adj)) > tol) {
    w.push('Total Collection is not Current + Arrear collection + Govt. adjustment.');
  }
  if (Math.abs(t.grand_coll - (t.total_coll + t.non_cash + t.govt_subsidy + t.tariff_adj)) > tol) {
    w.push('Grand Total Collection is not Total Collection + Non cash + Subsidy + Tariff adjustment.');
  }
  return w;
}

/**
 * Reads the IRCA ESD-wise MRR (one row per ESD of the whole circle, values
 * often stored as text). Returns { byEsd: { esd: { units_kwh, row } }, warnings }.
 * Only the 5 ESDs of this circle are kept (codes 038-042).
 */
export function parseIrcaGrid(grid) {
  let h = -1;
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const keys = (grid[i] || []).map(norm);
    if (keys.includes('esdcode') && keys.includes('unitbilled')) { h = i; break; }
  }
  if (h < 0) throw new Error('This does not look like the IRCA ESD-wise MRR (no "ESD Code" / "Unit Billed" header found).');
  const header = grid[h].map(norm);
  const iCode = header.indexOf('esdcode');
  const iUnits = header.indexOf('unitbilled');
  const byEsd = {};
  for (let i = h + 1; i < grid.length; i++) {
    const r = grid[i] || [];
    const code = String(r[iCode] ?? '').trim().padStart(3, '0');
    const esd = Object.keys(ESD_CODE).find((k) => ESD_CODE[k] === code);
    if (!esd) continue;
    if (byEsd[esd]) throw new Error(`ESD code ${code} (${esd}) appears twice in the IRCA file.`);
    const row = {};
    header.forEach((k, idx) => { if (idx > 2 && k) row[k] = num(r[idx]); });
    byEsd[esd] = { units_kwh: num(r[iUnits]), row };
  }
  const missing = Object.keys(ESD_CODE).filter((e) => !byEsd[e]);
  if (missing.length) {
    throw new Error(`The IRCA file has no row for ${missing.join(', ')} (ESD codes ${missing.map((e) => ESD_CODE[e]).join(', ')}).`);
  }
  return { byEsd, warnings: [] };
}

// ---------------------------------------------------------------- sums

export function sumRows(rows) {
  const t = Object.fromEntries(FIELD_KEYS.map((k) => [k, 0]));
  for (const r of rows) for (const k of FIELD_KEYS) t[k] += num(r[k]);
  return t;
}

/** Category-wise sum over several ESDs' rows (for the circle). */
export function sumByCategory(rowSets) {
  const map = new Map();
  for (const rows of rowSets) {
    for (const r of rows) {
      if (!map.has(r.category_code)) map.set(r.category_code, { category_code: r.category_code, category_name: r.category_name });
      const t = map.get(r.category_code);
      for (const k of FIELD_KEYS) t[k] = (t[k] || 0) + num(r[k]);
    }
  }
  return CATEGORY_CODES.filter((c) => map.has(c)).map((c) => map.get(c));
}

// ---------------------------------------------------------------- HQ formulas

/**
 * One ESD (or the whole circle) as HQ's CIRCLE-WISE + PERFORMANCE sheets show it.
 * `t` = summed raw fields (kWh / Rs); `injectionKwh` may be null if not entered;
 * `ircaKwh` = IRCA units billed against this ESD's injection (HQ adds them to
 * the units billed; collection and demand are ESD only).
 */
export function buildSummary(t, injectionKwh, ircaKwh = 0) {
  const MU = 1e6;
  const L = 1e5;
  const inj = injectionKwh === null || injectionKwh === undefined || injectionKwh === '' ? null : Number(injectionKwh);
  const esdUnits = t.unit_billed;
  const totalUnits = esdUnits + (ircaKwh || 0);
  const be = inj ? totalUnits / inj : null;

  const curDmd = t.current_dmd / L;
  const arrDmd = t.arrear_dmd / L;
  const totDmd = t.total_dmd / L;
  const curColl = t.curdmd_coll / L;
  const govtAdj = t.govt_adj / L;
  const nonCash = t.non_cash / L;
  const subsidy = t.govt_subsidy / L;
  const tariff = t.tariff_adj / L;
  const totalCurrentColl = curColl + govtAdj + nonCash + subsidy + tariff;
  const arrColl = t.arrear_coll / L;
  const grand = totalCurrentColl + arrColl;
  const arrFreezePdc = (t.arr_pdc + t.freeze_arr) / L;
  const arrRegular = t.arr_reg_tdc / L;
  const arrTotal = arrFreezePdc + arrRegular;
  const ce = div(grand, curDmd);
  const abr = div(curDmd, (esdUnits / MU) * 10); // Rs per kWh
  const atc = be !== null && ce !== null ? 1 - be * ce : null;

  return {
    injected_mu: inj === null ? null : inj / MU,
    esd_billed_mu: esdUnits / MU,
    irca_billed_mu: (ircaKwh || 0) / MU,
    billed_mu: totalUnits / MU,
    billing_eff: be,
    connected_load_kw: t.connected_load,
    pdc: t.pdc,
    tdc: t.tdc,
    regular_cons: t.regular_cons,
    total_cons: t.total_cons,
    bills_served: t.cons_billed,
    pc_billing: div(t.cons_billed, t.total_cons),
    def_meters: t.def_meter,
    dmd_current: curDmd,
    dmd_arrear: arrDmd,
    dmd_total: totDmd,
    coll_current: curColl,
    coll_govt_adj: govtAdj,
    coll_non_cash: nonCash,
    coll_subsidy: subsidy,
    coll_tariff: tariff,
    coll_total_current: totalCurrentColl,
    coll_arrear: arrColl,
    coll_grand: grand,
    real_current: div(totalCurrentColl, curDmd),
    real_arrear: div(arrColl, arrDmd),
    real_total: div(grand, totDmd),
    collection_eff: ce,
    arrear_freeze_pdc: arrFreezePdc,
    arrear_regular: arrRegular,
    arrear_total: arrTotal,
    defaulters: t.defaulter,
    cons_paid: t.cons_paid,
    coll_ex_govt: grand - subsidy - govtAdj,
    days_total: div(arrTotal, curDmd) === null ? null : (arrTotal / curDmd) * 30,
    days_excl: div(arrRegular, curDmd) === null ? null : (arrRegular / curDmd) * 30,
    atc_loss: atc,
    arr: atc === null || abr === null ? null : be * ce * abr,
    abr,
    // what each ESD needs to reach 100% CE (negative = already above 100%)
    required_100: curDmd - grand,
    required_100_rs: (curDmd - grand) * L,
  };
}

/** HQ's category sheet: one row per category with the derived columns. */
export function buildCategoryTable(rows) {
  const L = 1e5;
  const rowOf = (code, name, t) => {
    const cur = t.current_dmd / L;
    const curColl = t.curdmd_coll / L;
    const govt = t.govt_adj / L;
    const noncash = t.non_cash / L;
    const sub = t.govt_subsidy / L;
    const tar = t.tariff_adj / L;
    const totCur = curColl + govt + noncash + sub + tar;
    const arrC = t.arrear_coll / L;
    const grand = totCur + arrC;
    const fp = (t.arr_pdc + t.freeze_arr) / L;
    const reg = t.arr_reg_tdc / L;
    return {
      code,
      name,
      energy_mu: t.unit_billed / 1e6,
      connected_load_kw: t.connected_load,
      pdc: t.pdc,
      tdc: t.tdc,
      regular_cons: t.regular_cons,
      total_cons: t.total_cons,
      bills_served: t.cons_billed,
      def_meters: t.def_meter,
      dmd_current: cur,
      dmd_arrear: t.arrear_dmd / L,
      dmd_total: t.total_dmd / L,
      coll_current: curColl,
      coll_govt_adj: govt,
      coll_non_cash: noncash,
      coll_subsidy: sub,
      coll_tariff: tar,
      coll_total_current: totCur,
      coll_arrear: arrC,
      coll_grand: grand,
      cons_paid: t.cons_paid,
      defaulters: t.defaulter,
      collection_eff: div(grand, cur),
      arrear_freeze_pdc: fp,
      arrear_regular: reg,
      days_total: cur ? ((fp + reg) / cur) * 30 : null,
      days_excl: cur ? (reg / cur) * 30 : null,
      abr: t.unit_billed ? cur / ((t.unit_billed / 1e6) * 10) : null,
    };
  };
  const byCode = new Map(rows.map((r) => [r.category_code, r]));
  const out = CATEGORY_CODES.map((code) => rowOf(code, CATEGORY_NAMES[code], byCode.get(code) || sumRows([])));
  const total = rowOf('', 'TOTAL', sumRows(rows));
  return { rows: out, total };
}

// ---------------------------------------------------------------- report

/**
 * Everything the page and the Excel file show.
 * rowsByEsd: { esd: [category rows] }   injectionByEsd: { esd: kWh }
 * ircaByEsd: { esd: kWh }
 */
export function buildHqMrrReport({ month, rowsByEsd, injectionByEsd = {}, ircaByEsd = {}, ircaLoaded = false }) {
  const esds = [];
  const missingFiles = [];
  const missingInjection = [];
  for (const name of ESDS) {
    const rows = rowsByEsd[name];
    if (!rows || rows.length === 0) {
      missingFiles.push(name);
      esds.push({ name, present: false });
      continue;
    }
    const inj = injectionByEsd[name] ?? null;
    if (!inj) missingInjection.push(name);
    const irca = Number(ircaByEsd[name]) || 0;
    const t = sumRows(rows);
    esds.push({
      name,
      present: true,
      injection_kwh: inj,
      irca_kwh: irca,
      totals: t,
      summary: buildSummary(t, inj, irca),
      categories: buildCategoryTable(rows),
      rows,
    });
  }
  const present = esds.filter((e) => e.present);
  let circle = null;
  if (present.length) {
    const t = sumRows(present.flatMap((e) => e.rows));
    const injAll = present.every((e) => e.injection_kwh) ? present.reduce((s, e) => s + Number(e.injection_kwh), 0) : null;
    const ircaAll = present.reduce((s, e) => s + e.irca_kwh, 0);
    circle = {
      name: 'Goalpara Circle',
      totals: t,
      injection_kwh: injAll,
      irca_kwh: ircaAll,
      summary: buildSummary(t, injAll, ircaAll),
      categories: buildCategoryTable(sumByCategory(present.map((e) => e.rows))),
    };
  }
  return { month, monthLabel: monthName(month), esds, circle, missingFiles, missingInjection, ircaLoaded };
}

/** HQ ESD MRR sheet row (MU / Rs lakhs) for one category row - the layout of "ESD MRR Sept'26.xlsx". */
export function hqLayoutRow(esd, row, month) {
  const m = String(month).match(/^(\d{4})-(\d{2})/);
  const out = [HQ_OFFICE[esd] || esd, row.category_code, row.category_name || CATEGORY_NAMES[row.category_code]];
  const mu = new Set(['unit_billed']);
  const lakh = new Set(['current_dmd', 'arrear_dmd', 'total_dmd', 'curdmd_coll', 'arrear_coll', 'govt_adj', 'total_coll', 'non_cash', 'govt_subsidy', 'tariff_adj', 'grand_coll', 'arr_reg_tdc', 'arr_pdc', 'freeze_arr']);
  for (const k of FIELD_KEYS) {
    const v = num(row[k]);
    out.push(mu.has(k) ? v / 1e6 : lakh.has(k) ? v / 1e5 : v);
  }
  out.push(m ? MONTH_LABEL[Number(m[2]) - 1] : '', m ? m[1] : '');
  return out;
}

export { round, num, div };
