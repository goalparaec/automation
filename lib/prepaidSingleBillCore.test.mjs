// Plain Node test. Run with: node lib/prepaidSingleBillCore.test.mjs
import assert from 'node:assert/strict';
import { toDate, normalizeStatement, normalizeStatus, findSingleBillCandidates, billDateCounts } from './prepaidSingleBillCore.js';
let ok = 0;
function test(n, f) { try { f(); ok++; console.log('ok -', n); } catch (e) { console.error('FAIL -', n); console.error(e); process.exitCode = 1; } }

const stmt = normalizeStatement([
  { 'Consumer No': 'A', 'Consumer Name': 'a', 'Bill Date': '2026-09-27 00:00:00', UNIB: 100, 'Final Balance': -50 },   // single bill, paid after
  { 'Consumer No': 'B', 'Bill Date': 46292, UNIB: 80, 'Final Balance': 10 },                                         // serial for 2026-09-27? checked below
  { 'Consumer No': 'C', 'Bill Date': '2026-09-28 00:00:00', UNIB: 90, 'Final Balance': -300 },                       // billed several times (status unit differs)
  { 'Consumer No': 'D', 'Bill Date': '2026-09-29 00:00:00', UNIB: 70, 'Final Balance': -20 },                        // billed again in October
  { 'Consumer No': 'E', 'Bill Date': '2026-09-30 00:00:00', UNIB: 60, 'Final Balance': 5 },                          // not in status
  { 'Consumer No': 'F', 'Bill Date': '2026-09-20 00:00:00', UNIB: 60, 'Final Balance': 5 },                          // outside the chosen dates
  { 'Consumer No': 'G', 'Bill Date': '2026-09-30 00:00:00', UNIB: 40.3, 'Final Balance': -10 },                      // paid BEFORE the bill -> counts 0
]);
const status = normalizeStatus([
  { 'Consumer No': 'A', 'Last Bill Date': '27/09/2026', 'Unit Billed': 100, 'Last Payment Date': '12/10/2026', 'Last Payment Amount': 500, Balance: 450 },
  { 'Consumer No': 'B', 'Last Bill Date': '27/09/2026', 'Unit Billed': 80, 'Last Payment Date': '', 'Last Payment Amount': '', Balance: 10 },
  { 'Consumer No': 'C', 'Last Bill Date': '28/09/2026', 'Unit Billed': 30, 'Last Payment Date': '', 'Last Payment Amount': '', Balance: -300 },
  { 'Consumer No': 'D', 'Last Bill Date': '30/10/2026', 'Unit Billed': 70, 'Last Payment Date': '', 'Last Payment Amount': '', Balance: -20 },
  { 'Consumer No': 'F', 'Last Bill Date': '20/09/2026', 'Unit Billed': 60, 'Last Payment Date': '', 'Last Payment Amount': '', Balance: 5 },
  { 'Consumer No': 'G', 'Last Bill Date': '30/09/2026', 'Unit Billed': 40.3, 'Last Payment Date': '15/09/2026', 'Last Payment Amount': 200, Balance: -10 },
]);
const from = toDate('27/09/2026'); const to = toDate('30/09/2026');

test('dates read from text, ISO and Excel serial', () => {
  assert.equal(toDate('27/09/2026').getTime(), Date.UTC(2026, 8, 27));
  assert.equal(toDate('2026-09-27 00:00:00').getTime(), Date.UTC(2026, 8, 27));
  assert.equal(toDate(46292).getTime(), Date.UTC(2026, 8, 27));
});
test('only single-bill consumers inside the chosen dates are candidates', () => {
  const r = findSingleBillCandidates({ statement: stmt, status, from, to });
  assert.deepEqual(r.candidates.map((c) => c.consumerNo), ['A', 'B', 'G']);
  assert.deepEqual(r.stats, { inRange: 6, notInStatus: 1, billedAgain: 1, severalBills: 1, belowMinUnits: 0, candidates: 3 });
});
test('payment counts only on or after the last bill, in any month', () => {
  const r = findSingleBillCandidates({ statement: stmt, status, from, to });
  const by = Object.fromEntries(r.candidates.map((c) => [c.consumerNo, c]));
  assert.equal(by.A.paidAfterBill, 500);
  assert.equal(by.B.paidAfterBill, 0);
  assert.equal(by.G.paidAfterBill, 0);
  assert.equal(r.summary.paidAmount, 500);
  assert.equal(r.summary.paidCount, 1);
});
test('month balance comes from the statement and current balance from the status file', () => {
  const a = findSingleBillCandidates({ statement: stmt, status, from, to }).candidates[0];
  assert.equal(a.balanceMonth, -50);
  assert.equal(a.balanceNow, 450);
});
test('narrower date range picks fewer consumers; units must be exactly equal', () => {
  const r = findSingleBillCandidates({ statement: stmt, status, from: toDate('30/09/2026'), to });
  assert.deepEqual(r.candidates.map((c) => c.consumerNo), ['G']);
});
test('minimum applies to the single bill units and zero-unit bills are always left out', () => {
  const r = findSingleBillCandidates({ statement: stmt, status, from, to, minUnits: 80 });
  assert.deepEqual(r.candidates.map((c) => c.consumerNo), ['A', 'B']);
  assert.equal(r.stats.belowMinUnits, 1);
  const z = findSingleBillCandidates({
    statement: normalizeStatement([{ 'Consumer No': 'Z', 'Bill Date': '2026-09-30', UNIB: 0, 'Final Balance': 0 }]),
    status: normalizeStatus([{ 'Consumer No': 'Z', 'Last Bill Date': '30/09/2026', 'Unit Billed': 0, 'Last Payment Date': '', 'Last Payment Amount': '', Balance: 0 }]),
    from, to,
  });
  assert.equal(z.candidates.length, 0);
});
test('Bill Date counts help choose the range', () => {
  assert.equal(billDateCounts(stmt).find((d) => d.date.getTime() === Date.UTC(2026, 8, 30)).count, 2);
});
test('wrong file gives a clear message', () => {
  assert.throws(() => normalizeStatement([{ 'Consumer No': 'A' }]), /columns were not found/);
});
console.log(`${ok} passed`);
