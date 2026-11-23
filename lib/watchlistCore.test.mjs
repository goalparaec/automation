// Plain Node test (no test framework dependency) for watchlistCore.js.
// Run with: node lib/watchlistCore.test.mjs
import assert from 'node:assert/strict';
import {
  normalizeConsumerNo, parseListSheets, indexBillingRows, staleWarning, isNewPayment, evaluateCheck,
  rowStatus, totalsOf, groupStats, esdOverviewRows, categoryEsdMatrix, esdsMissingFromFiles,
  rowToDb, rowFromDb, checkHeaderTotals, trendRows, toIsoDate, withToday, progressReport,
} from './watchlistCore.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('ok -', name); } catch (err) { console.error('FAIL -', name); console.error(err); process.exitCode = 1; }
}

test('normalizeConsumerNo pads dropped leading zeros and tidies text', () => {
  assert.equal(normalizeConsumerNo(40000006366), '040000006366');
  assert.equal(normalizeConsumerNo('40000006366'), '040000006366');
  assert.equal(normalizeConsumerNo(' 042000000005 '), '042000000005');
  assert.equal(normalizeConsumerNo('041l00012345'), '041L00012345');
  assert.equal(normalizeConsumerNo(''), '');
  assert.equal(normalizeConsumerNo(null), '');
});

test('parseListSheets reads ESD sheets, skips summary sheets, merges duplicates', () => {
  const sheets = [
    { sheetName: 'Summary', rows: [{ 'Summary of X': 'Category', __EMPTY: 'Dhupdhara' }] },
    { sheetName: 'GESD', rows: [
      { 'Consumer No': '040000031410', 'Consumer Name': 'A', 'Category Name': 'DOM A', 'Phone No': '9', Balance: '-12000',
        'Last Payment Date': '10/11/2026', 'Last Payment Amount': '500', Remarks: '' },
      { 'Consumer No': '040000031411', 'Consumer Name': 'B', 'Category Name': 'COM', Balance: -20000 },
    ] },
    { sheetName: 'Sheet1', rows: [{ 'Consumer No': 40000031410, 'Consumer No_1': '040000031410', Remarks: 'Service wire faulty' }] },
  ];
  const r = parseListSheets(sheets);
  assert.deepEqual(r.readSheets, ['GESD', 'Sheet1']);
  assert.deepEqual(r.skippedSheets, ['Summary']);
  assert.equal(r.consumers.length, 2);
  assert.equal(r.duplicates, 1);
  const a = r.consumers.find((c) => c.consumerNo === '040000031410');
  assert.equal(a.esdCode, '040');
  assert.equal(a.remarks, 'Service wire faulty');
  assert.equal(a.lastPaymentDate, '2026-11-10');
  assert.equal(a.balance, -12000);
});

test('a list with only a Consumer No column is accepted', () => {
  const r = parseListSheets([{ sheetName: 'x', rows: [{ 'Consumer No': '39000000902' }] }]);
  assert.equal(r.consumers.length, 1);
  assert.equal(r.consumers[0].consumerNo, '039000000902');
  assert.equal(r.consumers[0].lastPaymentDate, null);
});

test('isNewPayment: later date, same date different amount, same date same amount', () => {
  const base = { payDate: '2026-11-10', payAmount: 500 };
  assert.equal(isNewPayment('2026-11-12', 300, base, '2026-11-01'), true);
  assert.equal(isNewPayment('2026-11-10', 700, base, '2026-11-01'), true);
  assert.equal(isNewPayment('2026-11-10', 500, base, '2026-11-01'), false);
  assert.equal(isNewPayment('2026-11-09', 500, base, '2026-11-01'), false);
  assert.equal(isNewPayment(null, null, base, '2026-11-01'), false);
});

test('isNewPayment without a baseline date uses the listing date', () => {
  assert.equal(isNewPayment('2026-11-05', 100, { payDate: null }, '2026-11-10'), false);
  assert.equal(isNewPayment('2026-11-10', 100, { payDate: null }, '2026-11-10'), true);
});

const bill = (no, over = {}) => ({
  'Consumer No': no, 'Consumer Name': 'NAME', 'Category Name': 'DOM A', 'Connection Status': 'TDC',
  Balance: '-9000', 'Last Payment Date': '10/11/2026', 'Last Payment Amount': '500', ...over,
});

test('evaluateCheck: paid / not paid / not in file, with cumulative carry-over', () => {
  const items = [
    { consumerNo: '040000000001', esdCode: '040', consumerName: 'A', categoryName: 'DOM A', listedOn: '2026-11-01', listedBalance: -15000,
      base: { payDate: '2026-11-10', payAmount: 500, cumAmount: 0, cumCount: 0 } },
    { consumerNo: '040000000002', esdCode: '040', consumerName: 'B', categoryName: 'COM', listedOn: '2026-11-01', listedBalance: -20000,
      base: { payDate: '2026-11-10', payAmount: 500, cumAmount: 1000, cumCount: 1, firstPaidDate: '2026-11-05' } },
    { consumerNo: '040000000003', esdCode: '040', consumerName: 'C', categoryName: 'DOM A', listedOn: '2026-11-01', listedBalance: -11000,
      base: { payDate: '2026-11-10', payAmount: 500, cumAmount: 250, cumCount: 1, firstPaidDate: '2026-11-03' } },
    { consumerNo: '041000000009', esdCode: '041', consumerName: 'D', categoryName: 'DOM A', listedOn: '2026-11-01', listedBalance: -12000,
      base: { payDate: '2026-11-08', payAmount: 100, cumAmount: 100, cumCount: 1, firstPaidDate: '2026-11-08' } },
  ];
  const byNo = new Map([
    ['040000000001', bill('040000000001', { 'Last Payment Date': '15/11/2026', 'Last Payment Amount': '2000' })],
    ['040000000002', bill('040000000002')], // same date + amount as baseline -> not new
    ['040000000003', bill('040000000003', { 'Last Payment Date': '10/11/2026', 'Last Payment Amount': '800' })], // same date, new amount
  ]);
  const rows = evaluateCheck({ listItems: items, billingByNo: byNo });
  assert.equal(rows.length, 4);
  assert.equal(rowStatus(rows[0]), 'PAID');
  assert.equal(rows[0].paidAmount, 2000);
  assert.equal(rows[0].cumPaidAmount, 2000);
  assert.equal(rows[0].cumPaidCount, 1);
  assert.equal(rows[0].firstPaidDate, '2026-11-15');
  assert.equal(rowStatus(rows[1]), 'NOT_PAID');
  assert.equal(rows[1].paidAmount, 0);
  assert.equal(rows[1].cumPaidAmount, 1000); // earlier payments still counted
  assert.equal(rows[1].firstPaidDate, '2026-11-05');
  assert.equal(rowStatus(rows[2]), 'PAID');
  assert.equal(rows[2].cumPaidAmount, 1050);
  assert.equal(rows[2].cumPaidCount, 2);
  assert.equal(rowStatus(rows[3]), 'NOT_IN_FILE');
  assert.equal(rows[3].lastPaymentDate, '2026-11-08'); // snapshot carried forward
  assert.equal(rows[3].cumPaidAmount, 100);

  const t = totalsOf(rows);
  assert.equal(t.listed, 4);
  assert.equal(t.inFile, 3);
  assert.equal(t.notInFile, 1);
  assert.equal(t.paidN, 2);
  assert.equal(t.paidAmt, 2800);
  assert.equal(t.cumN, 4);
  assert.equal(t.cumAmt, 4150);
  assert.equal(t.listedNeg, -58000);
  assert.deepEqual(esdsMissingFromFiles(rows), ['041']);

  const ov = esdOverviewRows(rows);
  assert.equal(ov.length, 3);
  assert.equal(ov[2].label, 'Total');
  assert.equal(ov[0].label, 'Goalpara');
  assert.equal(ov[0].paidN, 2);

  const m = categoryEsdMatrix(rows, 'listed');
  assert.deepEqual(m.esdCodes, ['040', '041']);
  assert.equal(m.body.length, 1); // the billing file's category wins over the list's, so all four are DOM A
  assert.equal(m.totals.total, 4);
  const pa = categoryEsdMatrix(rows, 'paidAmt');
  assert.equal(pa.totals.total, 2800);
  const neg = categoryEsdMatrix(rows, 'listedNegLakh');
  assert.equal(neg.totals.total, -0.58);

  // db round-trip keeps the numbers
  const back = rows.map((r) => rowFromDb(rowToDb(r, 7, '2026-11-20')));
  assert.equal(totalsOf(back).paidAmt, 2800);
  assert.equal(checkHeaderTotals(rows).paid_count, 2);
});

test('a consumer on the list twice in the billing files uses the first row only', () => {
  const idx = indexBillingRows([[bill('040000000001'), bill('040000000001', { Balance: '-1' })]], ['040000000001']);
  assert.equal(idx.byNo.size, 1);
  assert.equal(idx.byNo.get('040000000001').Balance, '-9000');
});

test('indexBillingRows keeps only listed consumers and finds the newest dates', () => {
  const idx = indexBillingRows([
    [bill('040000000001', { 'Last Bill Date': '19/11/2026' }), bill('040000000077')],
    [bill('041000000009', { 'Last Payment Date': '18/11/2026', 'Last Bill Date': '18/11/2026' })],
  ], new Set(['040000000001', '041000000009']));
  assert.equal(idx.byNo.size, 2);
  assert.equal(idx.totalRows, 3);
  assert.equal(idx.latestPaymentDate, '2026-11-18');
  assert.equal(idx.latestBillDate, '2026-11-19');
});

test('indexBillingRows matches numbers whose leading zero was lost', () => {
  const idx = indexBillingRows([[bill(40000000001)]], ['040000000001']);
  assert.equal(idx.byNo.size, 1);
});

test('staleWarning', () => {
  assert.equal(staleWarning('2026-11-20', '2026-11-19'), null);
  assert.match(staleWarning('2026-11-20', '2026-11-10'), /may be old/);
  assert.match(staleWarning('2026-11-20', '2026-11-25'), /AFTER/);
  assert.match(staleWarning('2026-11-20', null), /could not be checked/);
});

test('groupStats and trendRows', () => {
  const rows = [
    { esdCode: '040', categoryName: 'DOM A', inFile: true, newPayment: true, paidAmount: 100, cumPaidAmount: 100, cumPaidCount: 1, listedBalance: -10, balanceNow: -5 },
    { esdCode: '040', categoryName: 'COM', inFile: true, newPayment: false, paidAmount: 0, cumPaidAmount: 0, cumPaidCount: 0, listedBalance: -20, balanceNow: -20 },
  ];
  const g = groupStats(rows, (r) => r.categoryName);
  assert.equal(g['DOM A'].paidAmt, 100);
  assert.equal(g.COM.paidN, 0);
  const t = trendRows([{ report_date: '2026-11-20', listed: 2, in_file: 2, paid_count: 1, paid_amount: '100', cum_count: 1, cum_amount: 100 },
    { report_date: '2026-11-19', listed: 2, in_file: 2, paid_count: 0, paid_amount: 0, cum_count: 0, cum_amount: 0 }]);
  assert.equal(t[0].reportDate, '2026-11-19');
  assert.equal(t[1].paidAmt, 100);
  assert.equal(toIsoDate('20/11/2026'), '2026-11-20');
});

test('withToday counts only payments dated the day BEFORE the report date', () => {
  const rows = [
    { inFile: true, lastPaymentDate: '2026-11-20', lastPaymentAmount: 500 },
    { inFile: true, lastPaymentDate: '2026-11-19', lastPaymentAmount: 900 },
    { inFile: false, lastPaymentDate: '2026-11-20', lastPaymentAmount: 700 }, // carried-forward, not in file
    { inFile: true, lastPaymentDate: null, lastPaymentAmount: null },
  ];
  const r = withToday(rows, '2026-11-21');
  assert.deepEqual(r.map((x) => x.paidToday), [true, false, false, false]);
  assert.equal(r[0].todayAmount, 500);
  assert.equal(totalsOf(r).todayN, 1);
  assert.equal(totalsOf(r).todayAmt, 500);
});

test('progressReport: Rs Lakh columns, unique cumulative, after-realization, missing ESD shown as -', () => {
  const mk = (no, esd, cat, listed, now, lastDate, lastAmt, cumAmt, cumN, inFile = true) => ({
    consumerNo: no, esdCode: esd, categoryName: cat, inFile, balanceNow: inFile ? now : null,
    lastPaymentDate: lastDate, lastPaymentAmount: lastAmt, newPayment: false, paidAmount: 0,
    cumPaidAmount: cumAmt, cumPaidCount: cumN, listedBalance: listed,
  });
  const rows = [
    mk('041000000001', '041', 'DOM A', -100000, -50000, '2026-11-20', 20000, 70000, 3), // paid 3 times, counted once
    mk('041000000002', '041', 'DOM A', -200000, -200000, '2026-11-10', 100, 0, 0),
    mk('040000000003', '040', 'DOM A', -300000, null, null, null, 0, 0, false), // Goalpara file missing
  ];
  const rep = progressReport({ rows, reportDate: '2026-11-21', asOnDate: '2026-11-19', criteria: 'with Negative Balance less than -10K' });
  assert.equal(rep.title, 'Progress Report of Consumer list Dated 19.11.2026 with Negative Balance less than -10K as on 21.11.2026');
  assert.equal(progressReport({ rows, reportDate: '2026-11-21', asOnDate: '2026-11-19' }).title, 'Progress Report of Consumer list Dated 19.11.2026 with Negative Balance less than -10k as on 21.11.2026');
  assert.equal(rep.columns.length, 11);
  assert.equal(rep.columns[3].header, 'Negative Balance on 19.11.2026 (Rs. Lakh)');
  assert.equal(rep.columns[4].header, 'No. of Consumers Paid Yesterday (20.11.2026)');
  const gp = rep.rows[0]; const lk = rep.rows[1]; const tot = rep.rows[2];
  // Goalpara has no billing file today: paid-today is 0 (not '-') and actual balance is the last known (= listed) balance
  assert.equal(gp.esd, 'Goalpara'); assert.equal(gp.todayN, 0); assert.equal(gp.actual, -3);
  assert.equal(gp.display[4], '0'); assert.equal(gp.display[5], '0.00'); assert.equal(gp.neg0, -3);
  assert.equal(lk.esd, 'Lakhipur'); assert.equal(lk.listed, 2); assert.equal(lk.neg0, -3);
  assert.equal(lk.todayN, 1); assert.equal(lk.todayAmt, 0.2);
  assert.equal(lk.cumN, 1); assert.equal(lk.cumAmt, 0.7);          // unique consumers, not payments
  assert.equal(lk.after, -2.3);                                     // -3.00 + 0.70
  assert.equal(lk.actual, -2.5);
  assert.equal(tot.esd, 'Total'); assert.equal(tot._total, true);
  assert.equal(tot.listed, 3); assert.equal(tot.neg0, -6); assert.equal(tot.after, -5.3);
  assert.equal(tot.actual, -5.5);                                   // all 3 consumers: -0.5 + -2.0 + -3.0
  assert.ok(rep.notes.some((n) => n.includes('Goalpara')));
  assert.equal(lk.below, 2); assert.equal(tot.below, 3);          // still below -10K on actual balance
  // a consumer whose code lost its leading zero (410) stays in its own ESD row
  const rep2 = progressReport({ rows: [...rows, mk('410000000009', '410', 'DOM A', -50000, -50000, null, null, 0, 0)], reportDate: '2026-11-21', asOnDate: '2026-11-19' });
  assert.equal(rep2.rows.length, 3); assert.equal(rep2.rows[1].listed, 3);
  assert.equal(rep.rows[1].display[3], '-3.00');
});

test('reference date: only payments dated AFTER it count (a payment on the reference date itself does not)', () => {
  const base = { payDate: '2026-11-16', payAmount: null };
  assert.equal(isNewPayment('2026-11-16', 500, base, '2026-11-16'), false);
  assert.equal(isNewPayment('2026-11-15', 500, base, '2026-11-16'), false);
  assert.equal(isNewPayment('2026-11-17', 500, base, '2026-11-16'), true);
  const items = [{ consumerNo: '041000000001', esdCode: '041', consumerName: 'A', categoryName: 'DOM A', listedOn: '2026-11-16',
    listedBalance: -20000, base: { ...base, cumAmount: 0, cumCount: 0 } }];
  const byNo = new Map([['041000000001', bill('041000000001', { 'Last Payment Date': '18/11/2026', 'Last Payment Amount': '3000' })]]);
  const [row] = evaluateCheck({ listItems: items, billingByNo: byNo });
  assert.equal(row.newPayment, true);
  assert.equal(row.cumPaidAmount, 3000);
  assert.equal(row.cumPaidCount, 1);
  assert.equal(row.firstPaidDate, '2026-11-18');
});

console.log(`\n${passed} tests passed`);
