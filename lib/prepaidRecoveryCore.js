// Pure logic for the Prepaid Recovery module. No DOM / Supabase / Next.js
// imports here on purpose: this file runs identically in the browser (where
// the uploaded .xls files are parsed) and under plain Node for unit tests.

export const DEFAULT_SETTINGS = {
  defaulterBalanceThreshold: -500, // Balance <= this => defaulter candidate
  rechargeGraceMonths: 3, // skip if paid within this many months
  band1Months: 6, // 3-6 months band upper bound
  band2Months: 12, // 6-12 months band upper bound
  minPhoneDigits: 10,
  allowedCategories: ['dom a', 'dom b', 'com', 'agri', 'sm ind(r)', 'sm ind(u)'],
  excludeKeywords: [' TOWER', ' VODAFONE', ' BSNL', ' AIRTEL', ' JIO ', ' JJM', 'P.H.E', '.PHE', ' PHE '],
  ghdtPattern: 'GHDT',
  // ESD is derived from the first 3 characters of "Consumer No". Only 040
  // (Goalpara) and 041 (Lakhipur) are confirmed; the rest default to a
  // generic "ESD-xxx" label until someone edits the mapping.
  esdMap: {
    '038': 'Dhupdhara',
    '039': 'Dudhnoi',
    '040': 'Goalpara',
    '041': 'Lakhipur',
    '042': 'Mankachar',
  },
};

export const INPUT_COLUMNS = [
  'Sl. No', 'Consumer No', 'Consumer Name', 'Consumer Address', 'Phone No', 'Category Name',
  'Old Consumer No', 'Connected Load', 'LS HELD POSTPAID', 'Connection Date', 'Meter No',
  'Meter Status', 'Meter Make', 'DTR No', 'DTR Name', 'Feeder No', 'Feeder Name', 'Govt Flag',
  'Dept Govt Tower ESD', 'Dept Govt Tower HQ', 'Last Communication Date', 'Last Bill Date',
  'Unit Billed', 'Last Bill Amount', 'Last Payment Date', 'Last Payment Amount',
  'Last Payment Mode', 'Connection Status', 'Latitude', 'Longitude', 'Converted Date',
  'Freeze OS', 'OS Recovered', 'OS Paid', 'REM OS', 'Freeze CRADJ', 'CRADJ Adjusted',
  'REM CRADJ', 'DIA', 'Balance', 'Credit Limit', 'Current Month UNIB', 'Current Month DMD', 'Indexed',
];

/** Parse a date that may arrive as "dd/mm/yyyy" text, a native Date, or an
 * Excel serial number. Returns a UTC midnight Date, or null. */
export function parseDateFlexible(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  const s = String(value).trim();
  if (s === '') return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) {
      return dt;
    }
    return null;
  }
  // Excel serial date (days since 1899-12-30)
  const serial = Number(s);
  if (!isNaN(serial) && serial > 0) {
    const base = Date.UTC(1899, 11, 30);
    return new Date(base + serial * 86400000);
  }
  return null;
}

/** Parse a number that may have thousands separators or be blank. */
export function parseNumFlexible(value) {
  if (value == null) return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  const s = String(value).trim().replace(/,/g, '');
  if (s === '') return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function dateOnlyUTC(y, m, d) {
  return new Date(Date.UTC(y, m, d));
}

/** Excel-style EDATE(date, months), clamped to the resulting month's last day. */
export function edate(d, months) {
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth() + months; // 0-based
  y += Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDay);
  return dateOnlyUTC(y, m, day);
}

function sameDate(a, b) {
  return !!a && !!b && a.getTime() === b.getTime();
}

function addDaysUTC(d, days) {
  return new Date(d.getTime() + days * 86400000);
}

/** Row shape expected by classify()/eligible(): the subset of fields the
 * rules actually use, already parsed to primitives. */
export function toRuleRow(raw) {
  return {
    consumerNo: raw['Consumer No'] ?? raw.consumerNo ?? '',
    consumerName: raw['Consumer Name'] ?? raw.consumerName ?? '',
    consumerAddress: raw['Consumer Address'] ?? raw.consumerAddress ?? '',
    phoneNo: raw['Phone No'] ?? raw.phoneNo ?? '',
    categoryName: raw['Category Name'] ?? raw.categoryName ?? '',
    dtrNo: raw['DTR No'] ?? raw.dtrNo ?? '',
    dtrName: raw['DTR Name'] ?? raw.dtrName ?? '',
    govtFlag: raw['Govt Flag'] ?? raw.govtFlag ?? '',
    deptGovtTowerESD: raw['Dept Govt Tower ESD'] ?? raw.deptGovtTowerESD ?? '',
    deptGovtTowerHQ: raw['Dept Govt Tower HQ'] ?? raw.deptGovtTowerHQ ?? '',
    lastPaymentDate: parseDateFlexible(raw['Last Payment Date'] ?? raw.lastPaymentDate),
    lastPaymentAmount: parseNumFlexible(raw['Last Payment Amount'] ?? raw.lastPaymentAmount),
    connectionStatus: raw['Connection Status'] ?? raw.connectionStatus ?? '',
    balance: parseNumFlexible(raw['Balance'] ?? raw.balance),
    // Arrear ("outstanding") fields: Freeze OS = arrear frozen when the
    // consumer moved to prepaid; OS Recovered / OS Paid = recovered so far;
    // REM OS = arrear still outstanding (Freeze OS - OS Recovered - OS Paid).
    freezeOs: parseNumFlexible(raw['Freeze OS'] ?? raw.freezeOs),
    osRecovered: parseNumFlexible(raw['OS Recovered'] ?? raw.osRecovered),
    osPaid: parseNumFlexible(raw['OS Paid'] ?? raw.osPaid),
    remOs: parseNumFlexible(raw['REM OS'] ?? raw.remOs),
  };
}

/** If this row is out of scope, return a short reason category plus a more
 * specific detail string. Returns null when the row IS eligible. Scope
 * filters (govt/PDC/tower/category/GHDT/name-keyword) are tracked here so
 * excluded consumers can be reviewed separately from the normal report,
 * without appearing in it. */
export function eligibilityReason(row, settings = DEFAULT_SETTINGS) {
  if (String(row.govtFlag ?? '').trim() !== '0') {
    return { category: 'Government consumer', detail: `Govt Flag = "${row.govtFlag}"` };
  }
  if (String(row.connectionStatus ?? '').trim().toUpperCase() === 'PDC') {
    return { category: 'PDC connection', detail: 'Connection Status is PDC' };
  }
  if (String(row.deptGovtTowerESD ?? '').trim() !== '' || String(row.deptGovtTowerHQ ?? '').trim() !== '') {
    return { category: 'Dept/Govt Tower consumer', detail: 'Dept Govt Tower ESD/HQ is set' };
  }
  const cat = String(row.categoryName ?? '').trim().toLowerCase();
  if (!settings.allowedCategories.includes(cat)) {
    return { category: 'Category not in scope', detail: `Category Name = "${row.categoryName || ''}"` };
  }
  const dtrCombo = `${row.dtrNo ?? ''} ${row.dtrName ?? ''}`.toUpperCase();
  if (dtrCombo.includes(settings.ghdtPattern.toUpperCase())) {
    return { category: 'GHDT DTR', detail: `DTR No "${row.dtrNo}" / DTR Name "${row.dtrName}"` };
  }
  const namePadded = ` ${row.consumerName ?? ''} `.toUpperCase();
  for (const kw of settings.excludeKeywords) {
    if (namePadded.includes(kw)) {
      return { category: 'Excluded name keyword', detail: `Consumer Name matches "${kw.trim()}"` };
    }
  }
  return null;
}

/** Is this consumer in scope at all (government/tower/category/GHDT/name-keyword filters)? */
export function isEligible(row, settings = DEFAULT_SETTINGS) {
  return eligibilityReason(row, settings) == null;
}

/** First day of the "paid since last report" window. Payments dated from
 * this day up to the report date count as paid since the last report. With
 * no earlier report on file the window is yesterday + today (the old
 * daily behaviour). */
export function paidWindowStart(refDate, prevDate = null) {
  return prevDate || addDaysUTC(refDate, -1);
}

/** Did a Last Payment Date fall in [last report date, this report date]? */
export function isPaidInWindow(paymentDate, refDate, prevDate = null) {
  if (!paymentDate) return false;
  const t = paymentDate.getTime();
  return t >= paidWindowStart(refDate, prevDate).getTime() && t <= refDate.getTime();
}

/** Classify an eligible row for a given reference date. Returns
 * { status: 'PAID'|'SKIP'|'NO_PHONE'|'DEFAULTER', band, skipReason }.
 * PAID = recharged since the last report (see paidWindowStart). */
export function classify(row, refDate, settings = DEFAULT_SETTINGS, prevDate = null) {
  const p = row.lastPaymentDate;
  const bal = row.balance;

  if (isPaidInWindow(p, refDate, prevDate)) return { status: 'PAID', band: null, skipReason: null };

  if (bal == null || bal > settings.defaulterBalanceThreshold) {
    return { status: 'SKIP', band: null, skipReason: 'Balance above threshold (not currently a defaulter)' };
  }

  if (p != null && p.getTime() >= edate(refDate, -settings.rechargeGraceMonths).getTime()) {
    return { status: 'SKIP', band: null, skipReason: `Recharged within the last ${settings.rechargeGraceMonths} months` };
  }

  let band;
  if (p == null) {
    band = 'No payment record';
  } else if (p.getTime() >= edate(refDate, -settings.band1Months).getTime()) {
    band = '3-6 months';
  } else if (p.getTime() >= edate(refDate, -settings.band2Months).getTime()) {
    band = '6-12 months';
  } else {
    band = 'Above 1 year';
  }

  const phone = String(row.phoneNo ?? '').trim();
  if (phone.length < settings.minPhoneDigits) {
    return { status: 'NO_PHONE', band, skipReason: null };
  }
  return { status: 'DEFAULTER', band, skipReason: null };
}

/** Map a Consumer No to an ESD code + label using the first 3 characters. */
export function esdForConsumerNo(consumerNo, settings = DEFAULT_SETTINGS) {
  const code = String(consumerNo ?? '').trim().slice(0, 3);
  const label = settings.esdMap[code] || `ESD-${code || '???'}`;
  return { code: code || 'UNK', label };
}

const BANDS = ['3-6 months', '6-12 months', 'Above 1 year', 'No payment record'];

const EXCLUDE_REASON_CATEGORIES = [
  'Government consumer', 'PDC connection', 'Dept/Govt Tower consumer',
  'Category not in scope', 'GHDT DTR', 'Excluded name keyword',
  'No phone (left out of call list)',
];

export const ARREAR_BANDS = ['No arrear', '1 - 10,000', '10,001 - 50,000', '50,001 - 1,00,000', 'Above 1,00,000'];
export const BALANCE_BANDS = [
  'Advance (balance above 0)', '0 to -499', '-500 to -4,999', '-5,000 to -19,999', '-20,000 and below',
];
export const CONNECTION_STATUSES = ['RUNNING', 'TDC', 'LDC', 'PDC'];
export const CONSUMER_TYPES = ['Normal', 'Government', 'Dept/Govt Tower', 'PDC'];

function arrearBand(rem) {
  const r = rem || 0;
  if (r <= 0) return ARREAR_BANDS[0];
  if (r <= 10000) return ARREAR_BANDS[1];
  if (r <= 50000) return ARREAR_BANDS[2];
  if (r <= 100000) return ARREAR_BANDS[3];
  return ARREAR_BANDS[4];
}

function balanceBand(bal) {
  const b = bal || 0;
  if (b > 0) return BALANCE_BANDS[0];
  if (b > -500) return BALANCE_BANDS[1];
  if (b > -5000) return BALANCE_BANDS[2];
  if (b > -20000) return BALANCE_BANDS[3];
  return BALANCE_BANDS[4];
}

/** Normal / Government / Dept-Govt Tower / PDC, using the same precedence as
 * the scope rules so the groups add up to every consumer exactly once. */
export function consumerType(row) {
  if (String(row.govtFlag ?? '').trim() !== '0') return 'Government';
  if (String(row.connectionStatus ?? '').trim().toUpperCase() === 'PDC') return 'PDC';
  if (String(row.deptGovtTowerESD ?? '').trim() !== '' || String(row.deptGovtTowerHQ ?? '').trim() !== '') return 'Dept/Govt Tower';
  return 'Normal';
}

function emptyMetrics() {
  return {
    n: 0, negN: 0, negAmt: 0, posAmt: 0, arrN: 0, remOs: 0, freezeOs: 0, osRecov: 0,
    paidN: 0, paidAmt: 0, callN: 0, exclN: 0,
  };
}

function addMetrics(m, row, flags) {
  m.n += 1;
  const b = row.balance || 0;
  if (b < 0) { m.negN += 1; m.negAmt += b; } else { m.posAmt += b; }
  const rem = row.remOs || 0;
  if (rem > 0) { m.arrN += 1; m.remOs += rem; }
  m.freezeOs += row.freezeOs || 0;
  m.osRecov += (row.osRecovered || 0) + (row.osPaid || 0);
  if (flags.paid) { m.paidN += 1; m.paidAmt += row.lastPaymentAmount || 0; }
  if (flags.call) m.callN += 1;
  if (flags.excl) m.exclN += 1;
}

function sumMetrics(into, from) {
  for (const k of Object.keys(into)) into[k] += from[k] || 0;
}

const ANALYSIS_DIMENSIONS = ['category', 'connection', 'type', 'cross', 'arrearBand', 'balanceBand'];

/** Aggregates over EVERY consumer in the file (eligible or not), kept as
 * plain JSON so it can be stored per (report date, ESD) in one small row. */
function emptyAnalysis() {
  const a = { overall: emptyMetrics() };
  for (const d of ANALYSIS_DIMENSIONS) a[d] = {};
  return a;
}

function bump(group, key, row, flags) {
  if (!group[key]) group[key] = emptyMetrics();
  addMetrics(group[key], row, flags);
}

function addToAnalysis(a, row, flags) {
  const cat = String(row.categoryName ?? '').trim() || '(blank)';
  const conn = String(row.connectionStatus ?? '').trim().toUpperCase() || '(blank)';
  addMetrics(a.overall, row, flags);
  bump(a.category, cat, row, flags);
  bump(a.connection, conn, row, flags);
  bump(a.type, consumerType(row), row, flags);
  bump(a.cross, `${cat}||${conn}`, row, flags);
  bump(a.arrearBand, arrearBand(row.remOs), row, flags);
  bump(a.balanceBand, balanceBand(row.balance), row, flags);
}

export function mergeAnalysis(into, from) {
  if (!from) return into;
  sumMetrics(into.overall, from.overall);
  for (const d of ANALYSIS_DIMENSIONS) {
    for (const [k, m] of Object.entries(from[d] || {})) {
      if (!into[d][k]) into[d][k] = emptyMetrics();
      sumMetrics(into[d][k], m);
    }
  }
  return into;
}

export function emptyAnalysisForMerge() {
  return emptyAnalysis();
}

function emptyEsdBucket() {
  const b = {
    rows: 0,
    paidCount: 0,
    paidAmount: 0,
    noPhoneCount: 0,
    goodStandingCount: 0,
    bandCounts: {},
    bandNegativeBalance: {},
    excludedByReason: {},
    latestLastPaymentDate: null,
    analysis: emptyAnalysis(),
  };
  for (const band of BANDS) {
    b.bandCounts[band] = 0;
    b.bandNegativeBalance[band] = 0;
  }
  for (const reason of EXCLUDE_REASON_CATEGORIES) {
    b.excludedByReason[reason] = 0;
  }
  return b;
}

/** Process one parsed sheet (array of raw row objects keyed by the input
 * column names) into: eligible call-list rows, a payments list ("paid since
 * the last report"), excluded and good-standing lists, a per-ESD summary
 * bucket and per-ESD analysis aggregates. Rows are tagged with the ESD
 * derived from the Consumer No, not from which file/slot they came from.
 * prevDate is the previous report's date (null if none on file). */
export function processSheet(rawRows, refDate, settings = DEFAULT_SETTINGS, prevDate = null) {
  const callListRows = [];
  const paymentsRows = [];
  const excludedRows = [];
  const goodStandingRows = [];
  const esdBuckets = {}; // code -> bucket
  const esdLabels = {};

  for (const raw of rawRows) {
    const row = toRuleRow(raw);
    const { code, label } = esdForConsumerNo(row.consumerNo, settings);
    esdLabels[code] = label;
    if (!esdBuckets[code]) esdBuckets[code] = emptyEsdBucket();
    const bucket = esdBuckets[code];
    bucket.rows += 1;

    if (!bucket.latestLastPaymentDate || (row.lastPaymentDate && row.lastPaymentDate > bucket.latestLastPaymentDate)) {
      if (row.lastPaymentDate) bucket.latestLastPaymentDate = row.lastPaymentDate;
    }

    const paidSince = isPaidInWindow(row.lastPaymentDate, refDate, prevDate);
    const reason = eligibilityReason(row, settings);
    if (reason != null) {
      bucket.excludedByReason[reason.category] = (bucket.excludedByReason[reason.category] || 0) + 1;
      addToAnalysis(bucket.analysis, row, { paid: paidSince, call: false, excl: true });
      excludedRows.push({
        esdCode: code, esdLabel: label, consumerNo: row.consumerNo, consumerName: row.consumerName,
        categoryName: row.categoryName, connectionStatus: row.connectionStatus, phoneNo: row.phoneNo,
        balance: row.balance, reasonCategory: reason.category, reasonDetail: reason.detail,
        lastPaymentDate: row.lastPaymentDate, lastPaymentAmount: row.lastPaymentAmount, paidSinceLast: paidSince,
      });
      continue;
    }

    const { status, band, skipReason } = classify(row, refDate, settings, prevDate);
    addToAnalysis(bucket.analysis, row, {
      paid: paidSince, call: status === 'DEFAULTER', excl: status === 'NO_PHONE',
    });

    if (status === 'SKIP') {
      bucket.goodStandingCount += 1;
      goodStandingRows.push({
        esdCode: code, esdLabel: label, consumerNo: row.consumerNo, consumerName: row.consumerName,
        categoryName: row.categoryName, balance: row.balance, lastPaymentDate: row.lastPaymentDate,
        lastPaymentAmount: row.lastPaymentAmount, skipReason,
      });
    } else if (status === 'PAID') {
      bucket.paidCount += 1;
      bucket.paidAmount += row.lastPaymentAmount || 0;
      paymentsRows.push({
        esdCode: code, esdLabel: label, consumerNo: row.consumerNo, consumerName: row.consumerName,
        categoryName: row.categoryName, paidAmount: row.lastPaymentAmount || 0, paidDate: row.lastPaymentDate,
        balanceNow: row.balance,
      });
    } else if (status === 'NO_PHONE') {
      bucket.noPhoneCount += 1;
      bucket.excludedByReason['No phone (left out of call list)'] += 1;
      excludedRows.push({
        esdCode: code, esdLabel: label, consumerNo: row.consumerNo, consumerName: row.consumerName,
        categoryName: row.categoryName, connectionStatus: row.connectionStatus, phoneNo: row.phoneNo,
        balance: row.balance, reasonCategory: 'No phone (left out of call list)',
        reasonDetail: `Phone No "${row.phoneNo || ''}" has fewer than ${settings.minPhoneDigits} digits (band: ${band})`,
        lastPaymentDate: row.lastPaymentDate, lastPaymentAmount: row.lastPaymentAmount, paidSinceLast: false,
      });
    } else if (status === 'DEFAULTER') {
      bucket.bandCounts[band] += 1;
      bucket.bandNegativeBalance[band] += row.balance || 0;
      callListRows.push({
        esdCode: code,
        esdLabel: label,
        consumerNo: row.consumerNo,
        consumerName: row.consumerName,
        categoryName: row.categoryName,
        connectionStatus: row.connectionStatus,
        phoneNo: row.phoneNo,
        lastPaymentDate: row.lastPaymentDate,
        balance: row.balance,
        band,
      });
    }
  }

  callListRows.sort((a, b) => (a.balance ?? 0) - (b.balance ?? 0)); // most negative first
  paymentsRows.sort((a, b) => (b.paidAmount ?? 0) - (a.paidAmount ?? 0));

  return { callListRows, paymentsRows, excludedRows, goodStandingRows, esdBuckets, esdLabels };
}

/** Merge several processSheet() outputs (one per uploaded file) into one
 * combined result, keyed by ESD code regardless of which file a row came
 * from. */
export function mergeProcessed(results) {
  const callListRows = [];
  const paymentsRows = [];
  const excludedRows = [];
  const goodStandingRows = [];
  const esdBuckets = {};
  const esdLabels = {};

  for (const r of results) {
    callListRows.push(...r.callListRows);
    paymentsRows.push(...r.paymentsRows);
    excludedRows.push(...(r.excludedRows || []));
    goodStandingRows.push(...(r.goodStandingRows || []));
    Object.assign(esdLabels, r.esdLabels);
    for (const [code, bucket] of Object.entries(r.esdBuckets)) {
      if (!esdBuckets[code]) {
        esdBuckets[code] = bucket;
      } else {
        const existing = esdBuckets[code];
        existing.rows += bucket.rows;
        existing.paidCount += bucket.paidCount;
        existing.paidAmount += bucket.paidAmount;
        existing.noPhoneCount += bucket.noPhoneCount;
        existing.goodStandingCount += bucket.goodStandingCount;
        for (const band of BANDS) {
          existing.bandCounts[band] += bucket.bandCounts[band];
          existing.bandNegativeBalance[band] += bucket.bandNegativeBalance[band];
        }
        for (const reason of EXCLUDE_REASON_CATEGORIES) {
          existing.excludedByReason[reason] = (existing.excludedByReason[reason] || 0) + (bucket.excludedByReason[reason] || 0);
        }
        mergeAnalysis(existing.analysis, bucket.analysis);
        if (bucket.latestLastPaymentDate && (!existing.latestLastPaymentDate || bucket.latestLastPaymentDate > existing.latestLastPaymentDate)) {
          existing.latestLastPaymentDate = bucket.latestLastPaymentDate;
        }
      }
    }
  }

  callListRows.sort((a, b) => (a.balance ?? 0) - (b.balance ?? 0));
  paymentsRows.sort((a, b) => (b.paidAmount ?? 0) - (a.paidAmount ?? 0));

  return { callListRows, paymentsRows, excludedRows, goodStandingRows, esdBuckets, esdLabels };
}

/** Assign 1..n serial numbers per ESD (1 = largest negative balance, ties by
 * consumer no) to call-list rows that don't have one yet. Rows of the
 * given shape use consumer_no/balance/esd_code/serial_no (database rows). */
export function ensureSerials(rows) {
  const byEsd = {};
  for (const r of rows) (byEsd[r.esd_code] || (byEsd[r.esd_code] = [])).push(r);
  for (const list of Object.values(byEsd)) {
    if (list.every((r) => r.serial_no != null)) continue;
    const sorted = [...list].sort(
      (a, b) => (a.balance ?? 0) - (b.balance ?? 0) || String(a.consumer_no).localeCompare(String(b.consumer_no)),
    );
    sorted.forEach((r, i) => { r.serial_no = i + 1; });
  }
  return rows;
}

/** Build the flat summary rows (one per ESD + a TOTAL row) for display/export. */
export function summarize(merged, refDate, prevDate = null) {
  const codes = Object.keys(merged.esdBuckets).sort();
  const paidFrom = paidWindowStart(refDate, prevDate).toISOString().slice(0, 10);
  const rows = codes.map((code) => {
    const b = merged.esdBuckets[code];
    const callListCount = BANDS.reduce((s, band) => s + b.bandCounts[band], 0);
    const negTotal = BANDS.reduce((s, band) => s + b.bandNegativeBalance[band], 0);
    const staleWarning =
      b.latestLastPaymentDate != null &&
      b.latestLastPaymentDate.getTime() < edate(refDate, 0).getTime() - 86400000
        ? `Latest Last Payment Date in this file is ${b.latestLastPaymentDate.toISOString().slice(0, 10)}, older than yesterday — check the report date or re-upload.`
        : null;
    return {
      esdCode: code,
      esdLabel: merged.esdLabels[code] || code,
      band36: b.bandCounts['3-6 months'],
      band612: b.bandCounts['6-12 months'],
      bandAbove1y: b.bandCounts['Above 1 year'],
      bandNoPayment: b.bandCounts['No payment record'],
      callListTotal: callListCount,
      negBand36: b.bandNegativeBalance['3-6 months'],
      negBand612: b.bandNegativeBalance['6-12 months'],
      negBandAbove1y: b.bandNegativeBalance['Above 1 year'],
      negBandNoPayment: b.bandNegativeBalance['No payment record'],
      negTotal,
      noPhoneExcluded: b.noPhoneCount,
      goodStandingCount: b.goodStandingCount,
      paidSinceCount: b.paidCount,
      paidSinceAmount: b.paidAmount,
      paidFromDate: paidFrom,
      rows: b.rows,
      latestLastPaymentDate: b.latestLastPaymentDate ? b.latestLastPaymentDate.toISOString().slice(0, 10) : null,
      staleWarning,
      analysis: b.analysis,
    };
  });

  const total = rows.reduce(
    (acc, r) => {
      acc.band36 += r.band36;
      acc.band612 += r.band612;
      acc.bandAbove1y += r.bandAbove1y;
      acc.bandNoPayment += r.bandNoPayment;
      acc.callListTotal += r.callListTotal;
      acc.negBand36 += r.negBand36;
      acc.negBand612 += r.negBand612;
      acc.negBandAbove1y += r.negBandAbove1y;
      acc.negBandNoPayment += r.negBandNoPayment;
      acc.negTotal += r.negTotal;
      acc.noPhoneExcluded += r.noPhoneExcluded;
      acc.goodStandingCount += r.goodStandingCount;
      acc.paidSinceCount += r.paidSinceCount;
      acc.paidSinceAmount += r.paidSinceAmount;
      acc.rows += r.rows;
      return acc;
    },
    {
      esdCode: 'TOTAL', esdLabel: 'Goalpara Circle Total', band36: 0, band612: 0, bandAbove1y: 0,
      bandNoPayment: 0, callListTotal: 0, negBand36: 0, negBand612: 0, negBandAbove1y: 0,
      negBandNoPayment: 0, negTotal: 0, noPhoneExcluded: 0, goodStandingCount: 0, paidSinceCount: 0,
      paidSinceAmount: 0, paidFromDate: paidFrom, rows: 0,
      latestLastPaymentDate: null, staleWarning: null,
    }
  );

  return { rows, total };
}

/** A separate summary of consumers dropped by the scope filters (govt, PDC,
 * tower, category, GHDT, name-keyword) — kept apart from the normal
 * summary/call-list/payments so day-to-day reporting never includes them,
 * while still being reviewable on request. */
export function summarizeExcluded(merged) {
  const codes = Object.keys(merged.esdBuckets).sort();
  const rows = codes.map((code) => {
    const b = merged.esdBuckets[code];
    const total = EXCLUDE_REASON_CATEGORIES.reduce((s, r) => s + (b.excludedByReason[r] || 0), 0);
    return {
      esdCode: code,
      esdLabel: merged.esdLabels[code] || code,
      byReason: { ...b.excludedByReason },
      total,
    };
  });
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  return { rows, grandTotal, reasonCategories: EXCLUDE_REASON_CATEGORIES };
}

/** Compare today's call list against the most recent prior report's call
 * list to see who is still unpaid vs. who has paid since. previousCallList
 * and currentCallList/currentPayments only need { consumerNo, esdCode }
 * (plus whatever display fields the caller wants carried through from
 * previousCallList). */
export function buildStillUnpaidTracker(previousCallList, currentCallList, currentPayments) {
  const key = (r) => `${r.consumerNo}|${r.esdCode}`;
  const currentCallSet = new Set(currentCallList.map(key));
  const currentPaidSet = new Set(currentPayments.map(key));

  return previousCallList.map((r) => {
    let status;
    if (currentCallSet.has(key(r))) status = 'Still unpaid';
    else if (currentPaidSet.has(key(r))) status = 'Paid since last report';
    else status = 'No longer in report';
    return { ...r, status };
  });
}

/** Roll an evaluated allotment (see evaluateAllotments in the Db layer) up
 * into counts. "Recovered" = Paid + Cleared. */
export function allotmentStats(evaluated) {
  const items = evaluated.items || [];
  const s = { allotted: evaluated.allotment.consumer_count, paid: 0, cleared: 0, stillUnpaid: 0, notInReport: 0, paidAmount: 0 };
  for (const it of items) {
    if (it.status === 'Paid') { s.paid += 1; s.paidAmount += Number(it.paid_amount || 0); }
    else if (it.status === 'Balance cleared') s.cleared += 1;
    else if (it.status === 'Still unpaid') s.stillUnpaid += 1;
    else s.notInReport += 1;
  }
  s.recovered = s.paid + s.cleared;
  s.recoveredPct = s.allotted > 0 ? (s.recovered / s.allotted) * 100 : 0;
  return s;
}

// ---------------------------------------------------------------------------
// Report tables shared by the screen and the Excel exports. They work on the
// rows as stored in the database (snake_case) so both sides show identical
// numbers.
// ---------------------------------------------------------------------------

/** Paid-since-last-report roll-up: by ESD and by category, with totals. */
export function summarizePaymentsRows(rows) {
  const byEsd = {};
  const byCategory = {};
  const total = { n: 0, amt: 0 };
  for (const r of rows) {
    const amt = Number(r.paid_amount || 0);
    const e = byEsd[r.esd_code] || (byEsd[r.esd_code] = { n: 0, amt: 0 });
    const c = byCategory[r.category_name || '(blank)'] || (byCategory[r.category_name || '(blank)'] = { n: 0, amt: 0 });
    e.n += 1; e.amt += amt; c.n += 1; c.amt += amt; total.n += 1; total.amt += amt;
  }
  return { byEsd, byCategory, total };
}

/** Excluded-consumer roll-up: per reason (count, negative balance, how many
 * paid since the last report and how much) plus a reason x ESD count matrix. */
export function summarizeExcludedRows(rows) {
  const byReason = {};
  const matrix = {};
  const total = { n: 0, negAmt: 0, paidN: 0, paidAmt: 0 };
  const blank = () => ({ n: 0, negAmt: 0, paidN: 0, paidAmt: 0 });
  for (const reason of EXCLUDE_REASON_CATEGORIES) { byReason[reason] = blank(); matrix[reason] = {}; }
  for (const r of rows) {
    const reason = r.reason_category;
    const g = byReason[reason] || (byReason[reason] = blank());
    const mx = matrix[reason] || (matrix[reason] = {});
    const bal = Number(r.balance || 0);
    g.n += 1; total.n += 1;
    if (bal < 0) { g.negAmt += bal; total.negAmt += bal; }
    if (r.paid_since_last) {
      g.paidN += 1; g.paidAmt += Number(r.last_payment_amount || 0);
      total.paidN += 1; total.paidAmt += Number(r.last_payment_amount || 0);
    }
    mx[r.esd_code] = (mx[r.esd_code] || 0) + 1;
  }
  return { byReason, matrix, total, reasons: Object.keys(byReason) };
}

export const ALL_EXCLUDE_REASONS = EXCLUDE_REASON_CATEGORIES;

/** Add up the stored analysis of the chosen ESD(s). esdCodes null = whole circle. */
export function mergedAnalysis(analysisByEsd, esdCodes = null) {
  const out = emptyAnalysis();
  for (const [code, a] of Object.entries(analysisByEsd || {})) {
    if (esdCodes && !esdCodes.includes(code)) continue;
    mergeAnalysis(out, a);
  }
  return out;
}

const L = (v) => (v || 0) / 100000;

/** Columns of every analysis table: header, how to read it from a metrics
 * object, and the display format (int / lakh / pct). */
export const ANALYSIS_COLUMNS = [
  { key: 'n', header: 'Consumers', fmt: 'int', get: (m) => m.n },
  { key: 'negN', header: 'With negative balance', fmt: 'int', get: (m) => m.negN },
  { key: 'negAmt', header: 'Negative balance (Lakhs)', fmt: 'lakh', get: (m) => L(m.negAmt) },
  { key: 'posAmt', header: 'Advance balance (Lakhs)', fmt: 'lakh', get: (m) => L(m.posAmt) },
  { key: 'arrN', header: 'Arrear consumers', fmt: 'int', get: (m) => m.arrN },
  { key: 'remOs', header: 'Arrear outstanding (Lakhs)', fmt: 'lakh', get: (m) => L(m.remOs) },
  { key: 'arrPct', header: 'Arrear recovered %', fmt: 'pct', get: (m) => (m.freezeOs > 0 ? (m.osRecov / m.freezeOs) * 100 : null) },
  { key: 'paidN', header: 'Paid since last report (consumers)', fmt: 'int', get: (m) => m.paidN },
  { key: 'paidAmt', header: 'Paid since last report (Rs)', fmt: 'money', get: (m) => m.paidAmt },
  { key: 'callN', header: 'On call list', fmt: 'int', get: (m) => m.callN },
  { key: 'exclN', header: 'Excluded', fmt: 'int', get: (m) => m.exclN },
];

export const ANALYSIS_TABLES = [
  { dim: 'category', title: 'Category-wise', keyHeader: 'Category' },
  { dim: 'connection', title: 'Connection status-wise (Running / TDC / LDC / PDC)', keyHeader: 'Connection status' },
  { dim: 'type', title: 'Normal / Government / Tower / PDC-wise', keyHeader: 'Consumer type' },
  { dim: 'balanceBand', title: 'Balance band-wise', keyHeader: 'Balance band' },
  { dim: 'arrearBand', title: 'Arrear (outstanding) band-wise', keyHeader: 'Arrear outstanding band' },
];

/** Rows for one analysis dimension, in a sensible fixed order (bands and
 * statuses always listed, even when empty), plus a total row. */
export function analysisTableRows(analysis, dim) {
  const group = analysis[dim] || {};
  let keys;
  if (dim === 'connection') {
    keys = [...CONNECTION_STATUSES, ...Object.keys(group).filter((k) => !CONNECTION_STATUSES.includes(k)).sort()];
  } else if (dim === 'type') {
    keys = CONSUMER_TYPES;
  } else if (dim === 'balanceBand') {
    keys = BALANCE_BANDS;
  } else if (dim === 'arrearBand') {
    keys = ARREAR_BANDS;
  } else {
    keys = Object.keys(group).sort((a, b) => (group[b].n - group[a].n) || a.localeCompare(b));
  }
  const rows = keys.map((k) => ({ key: k, m: group[k] || emptyMetrics() }));
  const total = emptyMetrics();
  for (const r of rows) sumMetrics(total, r.m);
  return { rows, total };
}

/** Category x connection-status grid for one numeric field (n, negAmt, remOs ...). */
export function analysisCrossRows(analysis, field = 'n') {
  const cross = analysis.cross || {};
  const cats = new Set();
  const extraConns = new Set();
  for (const k of Object.keys(cross)) {
    const [cat, conn] = k.split('||');
    cats.add(cat);
    if (!CONNECTION_STATUSES.includes(conn)) extraConns.add(conn);
  }
  const conns = [...CONNECTION_STATUSES, ...[...extraConns].sort()];
  const scale = field === 'n' ? 1 : 100000;
  const catList = [...cats].sort((a, b) => ((analysis.category[b] || {}).n || 0) - ((analysis.category[a] || {}).n || 0));
  const rows = catList.map((cat) => {
    const vals = conns.map((c) => ((cross[`${cat}||${c}`] || {})[field] || 0) / scale);
    return { key: cat, vals, total: vals.reduce((s, v) => s + v, 0) };
  });
  const totals = conns.map((_, i) => rows.reduce((s, r) => s + r.vals[i], 0));
  return { conns, rows, totals, grand: totals.reduce((s, v) => s + v, 0) };
}

/** Previous report vs this report, per ESD plus circle total. */
export function trendRows(summaryRows, prevSummaryRows, analysis, prevAnalysis) {
  const prevBy = {};
  for (const r of prevSummaryRows || []) prevBy[r.esd_code] = r;
  const metrics = [
    { key: 'callN', header: 'Call list (consumers)', fmt: 'int', now: (s) => s.call_list_total, prev: (s) => s.call_list_total },
    { key: 'callNeg', header: 'Call list negative balance (Lakhs)', fmt: 'lakh', now: (s) => L(s.neg_total), prev: (s) => L(s.neg_total) },
    { key: 'allNeg', header: 'All consumers negative balance (Lakhs)', fmt: 'lakh', an: (m) => L(m.negAmt) },
    { key: 'arrear', header: 'Arrear outstanding (Lakhs)', fmt: 'lakh', an: (m) => L(m.remOs) },
    { key: 'cons', header: 'Total consumers', fmt: 'int', an: (m) => m.n },
  ];
  const codes = summaryRows.map((r) => r.esd_code);
  const build = (code) => {
    const s = code === 'TOTAL' ? null : summaryRows.find((r) => r.esd_code === code);
    const ps = code === 'TOTAL' ? null : prevBy[code];
    const a = code === 'TOTAL' ? mergedAnalysis(analysis) : mergedAnalysis(analysis, [code]);
    const pa = code === 'TOTAL' ? mergedAnalysis(prevAnalysis) : mergedAnalysis(prevAnalysis, [code]);
    const sumNow = code === 'TOTAL' ? summaryRows : [s];
    const sumPrev = code === 'TOTAL' ? (prevSummaryRows || []) : (ps ? [ps] : []);
    const out = {};
    for (const m of metrics) {
      if (m.an) { out[m.key] = { now: m.an(a.overall), prev: prevAnalysis && Object.keys(prevAnalysis).length ? m.an(pa.overall) : null }; }
      else {
        out[m.key] = {
          now: sumNow.reduce((t, x) => t + (m.now(x) || 0), 0),
          prev: sumPrev.length ? sumPrev.reduce((t, x) => t + (m.prev(x) || 0), 0) : null,
        };
      }
    }
    return out;
  };
  return {
    metrics,
    rows: [...codes.map((c) => ({ code: c, values: build(c) })), { code: 'TOTAL', values: build('TOTAL') }],
  };
}

// ---------------------------------------------------------------------------
// Display helpers shared by the screen and the Excel exports
// ---------------------------------------------------------------------------
const BAND_LABELS = {
  '3-6 months': 'Not recharged 3-6 months',
  '6-12 months': 'Not recharged 6-12 months',
  'Above 1 year': 'Not recharged above 1 year',
  'No payment record': 'Never recharged',
};
/** Stored band values stay as they are in the database; only the wording shown changes. */
export function bandLabel(band) {
  return BAND_LABELS[band] || band;
}

const REASON_LABELS = { 'No phone (left out of call list)': 'No Phone numbers', 'GHDT DTR': 'GHDT' };
export function reasonLabel(reason) {
  return REASON_LABELS[reason] || reason;
}

/** "2026-10-12" (or a Date) -> "12.10.2026". */
export function fmtDate(value) {
  if (!value) return '';
  const s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
}
