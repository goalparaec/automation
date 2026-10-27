// Pure logic for the Meter Cost Record module. No database, no file reading -
// everything here is plain functions so it can be tested with plain Node.
//
// How the counts are taken (reverse-engineered from the Apr-Aug 2026 summary
// and verified: it reproduces all 25 month x ESD cells exactly):
//   * Source = the "Head-wise Collection Report", one row per bill head paid.
//   * New connection = rows with the head NEW SERVICE CONNECTION METER COST.
//   * Replacement    = rows with the head METER COST BILL or
//                      CHANGED PROCESS METER COST.
//   * 1-Phase = meter cost 6,490.  3-Phase = meter cost 9,047.
//   * Month = month of the payment date. ESD = first three digits of the
//     consumer number (038..042). Application numbers repeat between ESDs, so
//     the ESD is always part of the identity.
//   * Amounts of 0 and 2,400 are not smart-meter deposits: ignored silently.
//   * Any other amount is NOT counted until you approve it.

export const ESD_BY_CODE = {
  '038': 'Dhupdhara',
  '039': 'Dudhnoi',
  '040': 'Goalpara',
  '041': 'Lakhipur',
  '042': 'Mankachar',
};
export const ESD_CODES = Object.keys(ESD_BY_CODE);

export const METER_COST = { '1': 6490, '3': 9047 };
export const IGNORE_AMOUNTS = [0, 2400];
export const NEW_HEAD = 'NEW SERVICE CONNECTION METER COST';
export const REPLACEMENT_HEADS = ['METER COST BILL', 'CHANGED PROCESS METER COST'];
export const KIND_BY_HEAD = {
  [NEW_HEAD]: 'new',
  'METER COST BILL': 'replacement',
  'CHANGED PROCESS METER COST': 'replacement',
};
export const KIND_LABEL = { new: 'New connection', replacement: 'Replacement' };

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------------------------------------------------------------- helpers

export function normHead(value) {
  return String(value ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
}

/** Header text -> a comparable key: "Bill Head" -> "billhead". */
export function headerKey(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Consumer numbers lose their leading zero when Excel stores them as numbers. */
export function normConsumerNo(value) {
  let s = String(value ?? '').trim();
  if (/^\d+$/.test(s) && s.length < 12) s = s.padStart(12, '0');
  return s;
}

export function esdFromConsumerNo(consumerNo) {
  const code = String(consumerNo ?? '').slice(0, 3);
  return ESD_BY_CODE[code] ? code : null;
}

/** Date / Excel serial / "2026-07-02" / "02/07/2026" -> "2026-07-02" (or null). */
export function toIsoDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // +12h guards against the few-seconds-before-midnight drift SheetJS can add.
    return new Date(value.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    const ms = Math.round((value - 25569) * 86400 * 1000);
    return new Date(ms + 12 * 3600 * 1000).toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

export function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  return String(value ?? '').trim() === '' || !Number.isFinite(n) ? null : n;
}

/** Financial year start (e.g. 2026 for Apr-2026..Mar-2027) of an ISO date. */
export function fyStartOf(isoDate) {
  const y = Number(isoDate.slice(0, 4));
  const m = Number(isoDate.slice(5, 7));
  return m >= 4 ? y : y - 1;
}

export function fyLabel(fyStart) {
  return `${fyStart}-${String(fyStart + 1).slice(2)}`;
}

/** The 12 month keys of a financial year: ['2026-04', ..., '2027-03']. */
export function fyMonths(fyStart) {
  const out = [];
  for (let i = 0; i < 12; i++) {
    const month = ((3 + i) % 12) + 1;
    const year = month >= 4 ? fyStart : fyStart + 1;
    out.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return out;
}

export function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-');
  return `${MONTH_NAMES[Number(m) - 1]}-${y}`;
}

export function quarterOf(monthKey) {
  const m = Number(monthKey.slice(5, 7));
  if (m >= 4 && m <= 6) return 1;
  if (m >= 7 && m <= 9) return 2;
  if (m >= 10 && m <= 12) return 3;
  return 4;
}

// ------------------------------------------------------- reading the rows

/**
 * Turns the raw rows of a Head-wise Collection report (objects keyed by the
 * file's header text) into deposit records. Rows for other bill heads (seal
 * cost, processing fee, ...) are ignored. Rows whose consumer number does not
 * start with one of the five ESD codes are counted in `notOurEsd`.
 */
export function rowsToRecords(rawRows, sourceFile = '') {
  const records = [];
  let notOurEsd = 0;
  let meterCostRows = 0;

  for (const raw of rawRows) {
    const row = {};
    for (const [k, v] of Object.entries(raw)) row[headerKey(k)] = v;

    const head = normHead(row.billhead);
    const kind = KIND_BY_HEAD[head];
    if (!kind) continue;
    meterCostRows += 1;

    const consumerNo = normConsumerNo(row.consumernumber);
    const esd = esdFromConsumerNo(consumerNo);
    if (!esd) {
      notOurEsd += 1;
      continue;
    }
    const paymentDate = toIsoDate(row.paymentdate);
    const amount = toNumber(row.amount);
    if (!paymentDate || amount === null) continue;

    records.push({
      esd_code: esd,
      application_no: String(row.applicationnumber ?? '').trim(),
      consumer_no: consumerNo,
      consumer_name: String(row.consumername ?? '').trim(),
      kind,
      head,
      amount,
      load_kw: toNumber(row.load),
      receipt_no: String(row.receiptnumber ?? '').trim(),
      bill_no: String(row.billnumber ?? '').trim(),
      payment_date: paymentDate,
      source_file: sourceFile,
    });
  }
  return { records, meterCostRows, notOurEsd };
}

// ---------------------------------------------------------- classification

/**
 * Decides what to do with one record, before anything is saved.
 *  decision 'count'   -> exact 6,490 / 9,047: counted automatically.
 *  decision 'ignore'  -> 0 or 2,400: not a smart-meter deposit, left out.
 *  decision 'pending' -> anything else, or a phase that disagrees with the
 *                        load: shown to the user, counted only if approved.
 */
export function classifyRecord(record) {
  const a = record.amount;
  const near = (x, tol) => Math.abs(a - x) <= tol;

  let exactPhase = null;
  for (const ph of ['1', '3']) if (near(METER_COST[ph], 1)) exactPhase = ph;

  // Phase hinted by the connected load (>= 5 kW is a 3-phase supply).
  const loadPhase = record.load_kw && record.load_kw > 0 ? (record.load_kw >= 5 ? '3' : '1') : null;

  if (exactPhase) {
    if (loadPhase && loadPhase !== exactPhase) {
      return {
        decision: 'pending',
        phase: exactPhase,
        flag: 'phase_mismatch',
        message: `Meter cost ${a} is ${exactPhase}-phase but the load is ${record.load_kw} kW (${loadPhase}-phase).`,
      };
    }
    return { decision: 'count', phase: exactPhase, flag: null, message: '' };
  }

  if (IGNORE_AMOUNTS.some((x) => near(x, 0.5))) {
    return { decision: 'ignore', phase: null, flag: 'ignored_amount', message: `Amount ${a} is not a smart-meter deposit.` };
  }

  // A different price: suggest a phase from the load, else the nearer cost.
  let suggested = loadPhase;
  if (!suggested) suggested = Math.abs(a - METER_COST['1']) <= Math.abs(a - METER_COST['3']) ? '1' : '3';
  const ref = METER_COST[suggested];
  const diffPct = Math.round(((a - ref) / ref) * 1000) / 10;
  return {
    decision: 'pending',
    phase: suggested,
    flag: 'different_price',
    message: `Different price: ${a} (${diffPct >= 0 ? '+' : ''}${diffPct}% from the ${suggested}-phase cost ${ref}).`,
  };
}

/** The identity used to recognise a row that was already imported. */
export function recordKey(r) {
  return `${r.esd_code}|${r.receipt_no}|${r.head}`;
}

/** The identity of "the same application, same head" (can have a new receipt). */
export function applicationKey(r) {
  return `${r.esd_code}|${r.application_no}|${r.head}`;
}

/**
 * Builds the preview for an upload.
 *  records          freshly read rows
 *  existingByKey    Map recordKey -> saved record (already imported)
 *  existingByApp    Map applicationKey -> [saved records]
 * Returns the records still to be decided/saved, plus counters.
 */
export function buildPreview(records, existingByKey = new Map(), existingByApp = new Map()) {
  const out = [];
  const seenKeys = new Set();
  const seenApps = new Map(); // applicationKey -> first record in this upload
  const stats = { read: records.length, alreadyImported: 0, repeatedInFile: 0, count: 0, ignore: 0, pending: 0 };

  for (const rec of records) {
    const key = recordKey(rec);
    if (existingByKey.has(key)) {
      stats.alreadyImported += 1;
      continue;
    }
    if (seenKeys.has(key)) {
      stats.repeatedInFile += 1;
      continue;
    }
    seenKeys.add(key);

    let result = classifyRecord(rec);

    // Same application + head paid again under another receipt: ask.
    const appKey = applicationKey(rec);
    const saved = (existingByApp.get(appKey) || []).filter((s) => s.receipt_no !== rec.receipt_no);
    const earlier = seenApps.get(appKey);
    if (saved.length > 0 || earlier) {
      const other = saved[0] || earlier;
      result = {
        decision: 'pending',
        phase: result.phase || classifyRecord({ ...rec, amount: other.amount }).phase || '1',
        flag: 'duplicate',
        message:
          `This application already has a ${rec.head.toLowerCase()} entry` +
          ` (receipt ${other.receipt_no}, ${other.payment_date}, amount ${other.amount}` +
          `${other.status ? `, ${other.status}` : ''}). Add it as well, or delete it?`,
        existing: {
          receipt_no: other.receipt_no,
          payment_date: other.payment_date,
          amount: other.amount,
          status: other.status || 'in this upload',
        },
      };
    } else {
      seenApps.set(appKey, rec);
    }

    stats[result.decision] += 1;
    out.push({ ...rec, ...result });
  }
  return { records: out, stats };
}

/** Final validation of what the browser sends back, before saving. */
export function sanitiseDecisions(items) {
  const clean = [];
  const problems = [];
  for (const it of items) {
    if (!ESD_BY_CODE[it.esd_code] || !KIND_BY_HEAD[it.head]) {
      problems.push(`Unknown ESD or head for application ${it.application_no}.`);
      continue;
    }
    const decision = it.decision;
    if (!['count', 'ignore'].includes(decision)) {
      problems.push(`Application ${it.application_no} (${ESD_BY_CODE[it.esd_code]}) still needs a decision.`);
      continue;
    }
    const phase = decision === 'count' ? String(it.phase) : null;
    if (decision === 'count' && !['1', '3'].includes(phase)) {
      problems.push(`Application ${it.application_no}: choose 1-phase or 3-phase.`);
      continue;
    }
    clean.push({
      esd_code: it.esd_code,
      application_no: String(it.application_no ?? ''),
      consumer_no: String(it.consumer_no ?? ''),
      consumer_name: String(it.consumer_name ?? ''),
      kind: KIND_BY_HEAD[it.head],
      head: it.head,
      amount: Number(it.amount),
      load_kw: it.load_kw === null || it.load_kw === undefined ? null : Number(it.load_kw),
      phase,
      status: decision === 'count' ? 'counted' : 'ignored',
      reason: String(it.reason ?? it.message ?? '').slice(0, 300),
      receipt_no: String(it.receipt_no ?? ''),
      bill_no: String(it.bill_no ?? ''),
      payment_date: it.payment_date,
      source_file: String(it.source_file ?? '').slice(0, 200),
    });
  }
  return { clean, problems };
}

// ---------------------------------------------------------------- summaries

const zeroCell = () => ({ new1: 0, new3: 0, rep1: 0, rep3: 0 });

/**
 * Month x ESD counts for one financial year from saved deposit records.
 * Only status 'counted' rows contribute.
 */
export function buildDepositSummary(deposits, fyStart) {
  const months = fyMonths(fyStart);
  const cells = {};
  for (const m of months) {
    cells[m] = {};
    for (const code of ESD_CODES) cells[m][code] = zeroCell();
  }
  for (const d of deposits) {
    if (d.status !== 'counted') continue;
    const m = d.payment_date.slice(0, 7);
    if (!cells[m] || !cells[m][d.esd_code]) continue;
    const field = (d.kind === 'new' ? 'new' : 'rep') + d.phase;
    cells[m][d.esd_code][field] += 1;
  }

  const finish = (c) => ({
    ...c,
    newTotal: c.new1 + c.new3,
    repTotal: c.rep1 + c.rep3,
    total1: c.new1 + c.rep1,
    total3: c.new3 + c.rep3,
  });
  const add = (a, b) => ({ new1: a.new1 + b.new1, new3: a.new3 + b.new3, rep1: a.rep1 + b.rep1, rep3: a.rep3 + b.rep3 });

  const monthly = months.map((m) => {
    const rows = ESD_CODES.map((code) => ({ esd_code: code, esd: ESD_BY_CODE[code], ...finish(cells[m][code]) }));
    const total = finish(rows.reduce((acc, r) => add(acc, r), zeroCell()));
    return { month: m, label: monthLabel(m), rows, total };
  });

  const quarterly = [1, 2, 3, 4].map((q) => {
    const rows = ESD_CODES.map((code) => {
      const sum = months.filter((m) => quarterOf(m) === q).reduce((acc, m) => add(acc, cells[m][code]), zeroCell());
      return { esd_code: code, esd: ESD_BY_CODE[code], ...finish(sum) };
    });
    const total = finish(rows.reduce((acc, r) => add(acc, r), zeroCell()));
    return { quarter: q, label: `Q${q}`, rows, total };
  });

  const perEsd = ESD_CODES.map((code) => {
    const sum = months.reduce((acc, m) => add(acc, cells[m][code]), zeroCell());
    return { esd_code: code, esd: ESD_BY_CODE[code], ...finish(sum) };
  });
  const grand = finish(perEsd.reduce((acc, r) => add(acc, r), zeroCell()));
  return { fyStart, label: fyLabel(fyStart), monthly, quarterly, perEsd, grand };
}

/**
 * Deposits vs PR (purchase requisition) per ESD for a financial year.
 *  Deposited = meter-cost deposits counted.  Raised = PR quantity.
 *  Pending   = deposited but no PR yet.      Advance = PR raised ahead of deposits.
 */
export function buildPrStatus(deposits, prs, fyStart) {
  const months = new Set(fyMonths(fyStart));
  const rows = ESD_CODES.map((code) => {
    const row = { esd_code: code, esd: ESD_BY_CODE[code], new1: 0, new3: 0, rep1: 0, rep3: 0 };
    for (const d of deposits) {
      if (d.status !== 'counted' || d.esd_code !== code) continue;
      if (!months.has(d.payment_date.slice(0, 7))) continue;
      row[`${d.kind === 'new' ? 'new' : 'rep'}${d.phase}`] += 1;
    }
    let pr1 = 0, pr3 = 0, prCount = 0;
    for (const p of prs) {
      if (p.esd_code !== code) continue;
      if (!months.has(String(p.pr_date).slice(0, 7))) continue;
      pr1 += Number(p.ph1) || 0;
      pr3 += Number(p.ph3) || 0;
      prCount += 1;
    }
    // Deposits are tagged New / Replacement; PRs (= meters issued) are a plain total.
    const dep1 = row.new1 + row.rep1;
    const dep3 = row.new3 + row.rep3;
    return {
      ...row, dep1, dep3, pr1, pr3, prCount,
      pending1: Math.max(dep1 - pr1, 0), pending3: Math.max(dep3 - pr3, 0),
      advance1: Math.max(pr1 - dep1, 0), advance3: Math.max(pr3 - dep3, 0),
    };
  });
  const total = { esd: 'Circle total' };
  for (const f of ['new1', 'new3', 'rep1', 'rep3', 'dep1', 'dep3', 'pr1', 'pr3', 'prCount', 'pending1', 'pending3', 'advance1', 'advance3']) {
    total[f] = rows.reduce((a, r) => a + r[f], 0);
  }
  return { rows, total };
}
