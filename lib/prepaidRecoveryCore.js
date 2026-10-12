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

/** Classify an eligible row for a given reference date. Returns
 * { status: 'PAID_TODAY'|'PAID_YESTERDAY'|'SKIP'|'NO_PHONE'|'DEFAULTER', band: string|null } */
export function classify(row, refDate, settings = DEFAULT_SETTINGS) {
  const p = row.lastPaymentDate;
  const bal = row.balance;

  if (sameDate(p, refDate)) return { status: 'PAID_TODAY', band: null };
  if (sameDate(p, addDaysUTC(refDate, -1))) return { status: 'PAID_YESTERDAY', band: null };

  if (bal == null || bal > settings.defaulterBalanceThreshold) return { status: 'SKIP', band: null };

  if (p != null && p.getTime() >= edate(refDate, -settings.rechargeGraceMonths).getTime()) {
    return { status: 'SKIP', band: null };
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
    return { status: 'NO_PHONE', band };
  }
  return { status: 'DEFAULTER', band };
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

function emptyEsdBucket() {
  const b = {
    rows: 0,
    paidYesterdayCount: 0,
    paidYesterdayAmount: 0,
    paidTodayCount: 0,
    paidTodayAmount: 0,
    noPhoneCount: 0,
    bandCounts: {},
    bandNegativeBalance: {},
    excludedByReason: {},
    latestLastPaymentDate: null,
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
 * column names) into: eligible call-list rows, a payments list, and a
 * per-ESD summary bucket. Rows are tagged with the ESD derived from the
 * Consumer No, not from which file/slot they came from. */
export function processSheet(rawRows, refDate, settings = DEFAULT_SETTINGS) {
  const callListRows = [];
  const paymentsRows = [];
  const excludedRows = [];
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

    const reason = eligibilityReason(row, settings);
    if (reason != null) {
      bucket.excludedByReason[reason.category] = (bucket.excludedByReason[reason.category] || 0) + 1;
      excludedRows.push({
        esdCode: code, esdLabel: label, consumerNo: row.consumerNo, consumerName: row.consumerName,
        categoryName: row.categoryName, connectionStatus: row.connectionStatus, phoneNo: row.phoneNo,
        balance: row.balance, reasonCategory: reason.category, reasonDetail: reason.detail,
      });
      continue;
    }

    const { status, band } = classify(row, refDate, settings);

    if (status === 'PAID_TODAY') {
      bucket.paidTodayCount += 1;
      bucket.paidTodayAmount += row.lastPaymentAmount || 0;
      paymentsRows.push({
        esdCode: code, esdLabel: label, consumerNo: row.consumerNo, consumerName: row.consumerName,
        categoryName: row.categoryName, paidAmount: row.lastPaymentAmount || 0, balanceNow: row.balance,
        when: 'today',
      });
    } else if (status === 'PAID_YESTERDAY') {
      bucket.paidYesterdayCount += 1;
      bucket.paidYesterdayAmount += row.lastPaymentAmount || 0;
      paymentsRows.push({
        esdCode: code, esdLabel: label, consumerNo: row.consumerNo, consumerName: row.consumerName,
        categoryName: row.categoryName, paidAmount: row.lastPaymentAmount || 0, balanceNow: row.balance,
        when: 'yesterday',
      });
    } else if (status === 'NO_PHONE') {
      bucket.noPhoneCount += 1;
      bucket.excludedByReason['No phone (left out of call list)'] += 1;
      excludedRows.push({
        esdCode: code, esdLabel: label, consumerNo: row.consumerNo, consumerName: row.consumerName,
        categoryName: row.categoryName, connectionStatus: row.connectionStatus, phoneNo: row.phoneNo,
        balance: row.balance, reasonCategory: 'No phone (left out of call list)',
        reasonDetail: `Phone No "${row.phoneNo || ''}" has fewer than ${settings.minPhoneDigits} digits (band: ${band})`,
      });
    } else if (status === 'DEFAULTER') {
      bucket.bandCounts[band] += 1;
      bucket.bandNegativeBalance[band] += row.balance || 0;
      callListRows.push({
        esdCode: code,
        esdLabel: label,
        consumerNo: row.consumerNo,
        consumerName: row.consumerName,
        consumerAddress: row.consumerAddress,
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

  return { callListRows, paymentsRows, excludedRows, esdBuckets, esdLabels };
}

/** Merge several processSheet() outputs (one per uploaded file) into one
 * combined result, keyed by ESD code regardless of which file a row came
 * from. */
export function mergeProcessed(results) {
  const callListRows = [];
  const paymentsRows = [];
  const excludedRows = [];
  const esdBuckets = {};
  const esdLabels = {};

  for (const r of results) {
    callListRows.push(...r.callListRows);
    paymentsRows.push(...r.paymentsRows);
    excludedRows.push(...(r.excludedRows || []));
    Object.assign(esdLabels, r.esdLabels);
    for (const [code, bucket] of Object.entries(r.esdBuckets)) {
      if (!esdBuckets[code]) {
        esdBuckets[code] = bucket;
      } else {
        const existing = esdBuckets[code];
        existing.rows += bucket.rows;
        existing.paidYesterdayCount += bucket.paidYesterdayCount;
        existing.paidYesterdayAmount += bucket.paidYesterdayAmount;
        existing.paidTodayCount += bucket.paidTodayCount;
        existing.paidTodayAmount += bucket.paidTodayAmount;
        existing.noPhoneCount += bucket.noPhoneCount;
        for (const band of BANDS) {
          existing.bandCounts[band] += bucket.bandCounts[band];
          existing.bandNegativeBalance[band] += bucket.bandNegativeBalance[band];
        }
        for (const reason of EXCLUDE_REASON_CATEGORIES) {
          existing.excludedByReason[reason] = (existing.excludedByReason[reason] || 0) + (bucket.excludedByReason[reason] || 0);
        }
        if (bucket.latestLastPaymentDate && (!existing.latestLastPaymentDate || bucket.latestLastPaymentDate > existing.latestLastPaymentDate)) {
          existing.latestLastPaymentDate = bucket.latestLastPaymentDate;
        }
      }
    }
  }

  callListRows.sort((a, b) => (a.balance ?? 0) - (b.balance ?? 0));
  paymentsRows.sort((a, b) => (b.paidAmount ?? 0) - (a.paidAmount ?? 0));

  return { callListRows, paymentsRows, excludedRows, esdBuckets, esdLabels };
}

/** Build the flat summary rows (one per ESD + a TOTAL row) for display/export. */
export function summarize(merged, refDate) {
  const codes = Object.keys(merged.esdBuckets).sort();
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
      paidYesterdayCount: b.paidYesterdayCount,
      paidYesterdayAmount: b.paidYesterdayAmount,
      paidTodayCount: b.paidTodayCount,
      paidTodayAmount: b.paidTodayAmount,
      rows: b.rows,
      latestLastPaymentDate: b.latestLastPaymentDate ? b.latestLastPaymentDate.toISOString().slice(0, 10) : null,
      staleWarning,
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
      acc.paidYesterdayCount += r.paidYesterdayCount;
      acc.paidYesterdayAmount += r.paidYesterdayAmount;
      acc.paidTodayCount += r.paidTodayCount;
      acc.paidTodayAmount += r.paidTodayAmount;
      acc.rows += r.rows;
      return acc;
    },
    {
      esdCode: 'TOTAL', esdLabel: 'Goalpara Circle Total', band36: 0, band612: 0, bandAbove1y: 0,
      bandNoPayment: 0, callListTotal: 0, negBand36: 0, negBand612: 0, negBandAbove1y: 0,
      negBandNoPayment: 0, negTotal: 0, noPhoneExcluded: 0, paidYesterdayCount: 0,
      paidYesterdayAmount: 0, paidTodayCount: 0, paidTodayAmount: 0, rows: 0,
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
    else if (currentPaidSet.has(key(r))) status = 'Paid since last upload';
    else status = 'No longer in report';
    return { ...r, status };
  });
}
