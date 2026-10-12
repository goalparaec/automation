// Plain Node test (no test framework dependency) for prepaidRecoveryCore.js.
// Run with: node lib/prepaidRecoveryCore.test.mjs
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS, parseDateFlexible, parseNumFlexible, edate, isEligible, eligibilityReason,
  classify, esdForConsumerNo, processSheet, mergeProcessed, summarize, summarizeExcluded,
  buildStillUnpaidTracker, toRuleRow,
} from './prepaidRecoveryCore.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('ok -', name);
  } catch (err) {
    console.error('FAIL -', name);
    console.error(err);
    process.exitCode = 1;
  }
}

const REF = new Date(Date.UTC(2026, 9, 12)); // 12/10/2026

function row(overrides) {
  return toRuleRow({
    'Consumer No': '040000000001',
    'Consumer Name': 'TEST NAME',
    'Phone No': '9000000000',
    'Category Name': 'DOM A',
    'DTR No': '1234',
    'DTR Name': 'SOME DTR',
    'Govt Flag': '0',
    'Dept Govt Tower ESD': '',
    'Dept Govt Tower HQ': '',
    'Connection Status': 'RUNNING',
    'Last Payment Date': '10/10/2026',
    'Last Payment Amount': '100',
    Balance: '-1000',
    ...overrides,
  });
}

// --- eligibility rules ---
test('Govt Flag other than 0 is excluded', () => {
  assert.equal(isEligible(row({ 'Govt Flag': 'G' })), false);
});
test('PDC connection status is excluded', () => {
  assert.equal(isEligible(row({ 'Connection Status': 'PDC' })), false);
});
test('Dept Govt Tower ESD present excludes', () => {
  assert.equal(isEligible(row({ 'Dept Govt Tower ESD': 'X' })), false);
});
test('Dept Govt Tower HQ present excludes', () => {
  assert.equal(isEligible(row({ 'Dept Govt Tower HQ': 'X' })), false);
});
test('Category Name not in allow-list excludes (General Purpose)', () => {
  assert.equal(isEligible(row({ 'Category Name': 'General Purpose' })), false);
});
test('Category Name match is case-insensitive', () => {
  assert.equal(isEligible(row({ 'Category Name': 'dom a' })), true);
  assert.equal(isEligible(row({ 'Category Name': 'Sm Ind(R)' })), true);
});
test('GHDT in DTR No excludes', () => {
  assert.equal(isEligible(row({ 'DTR No': 'GHDT123' })), false);
});
test('GHDT in DTR Name excludes', () => {
  assert.equal(isEligible(row({ 'DTR Name': 'ghdt feeder' })), false);
});
test('Exclusion keyword TOWER excludes (space-padded match)', () => {
  assert.equal(isEligible(row({ 'Consumer Name': 'ABC TOWER CO' })), false);
});
test('"ATOWER HUSSAIN" is NOT wrongly excluded by TOWER keyword', () => {
  assert.equal(isEligible(row({ 'Consumer Name': 'ATOWER HUSSAIN' })), true);
});
test('VODAFONE/BSNL/AIRTEL/JIO/JJM/PHE keywords exclude', () => {
  assert.equal(isEligible(row({ 'Consumer Name': 'VODAFONE IDEA LTD' })), false);
  assert.equal(isEligible(row({ 'Consumer Name': 'BSNL EXCHANGE' })), false);
  assert.equal(isEligible(row({ 'Consumer Name': 'AIRTEL TOWER CO' })), false);
  assert.equal(isEligible(row({ 'Consumer Name': 'RELIANCE JIO INFOCOMM' })), false);
  assert.equal(isEligible(row({ 'Consumer Name': 'XYZ JJM SCHEME' })), false);
  assert.equal(isEligible(row({ 'Consumer Name': 'P.H.E DIVISION' })), false);
});
test('eligible baseline row passes', () => {
  assert.equal(isEligible(row({})), true);
});

// --- date / number parsing ---
test('dd/mm/yyyy text date parses correctly', () => {
  const d = parseDateFlexible('01/08/2026');
  assert.equal(d.getUTCFullYear(), 2026);
  assert.equal(d.getUTCMonth(), 7); // August = index 7
  assert.equal(d.getUTCDate(), 1);
});
test('native Date value parses correctly', () => {
  const d = parseDateFlexible(new Date(2026, 7, 1));
  assert.equal(d.getUTCFullYear(), 2026);
  assert.equal(d.getUTCMonth(), 7);
  assert.equal(d.getUTCDate(), 1);
});
test('Excel serial date parses correctly (44044 = 2020-08-01)', () => {
  const d = parseDateFlexible('44044');
  assert.equal(d.getUTCFullYear(), 2020);
  assert.equal(d.getUTCMonth(), 7);
  assert.equal(d.getUTCDate(), 1);
});
test('empty date is null', () => {
  assert.equal(parseDateFlexible(''), null);
  assert.equal(parseDateFlexible(null), null);
});
test('comma thousands separators parse as numbers', () => {
  assert.equal(parseNumFlexible('2,194'), 2194);
  assert.equal(parseNumFlexible('-71,66,26,441'), -716626441);
});

// --- EDATE month-end clamping ---
test('EDATE clamps to month end (31 Jan -3mo -> 31 Oct, not 31 Nov)', () => {
  const d = new Date(Date.UTC(2027, 0, 31));
  const e = edate(d, -3);
  assert.equal(e.getUTCFullYear(), 2026);
  assert.equal(e.getUTCMonth(), 9); // October
  assert.equal(e.getUTCDate(), 31);
});
test('EDATE clamps 31 Mar -1mo -> 28/29 Feb', () => {
  const d = new Date(Date.UTC(2026, 2, 31));
  const e = edate(d, -1);
  assert.equal(e.getUTCMonth(), 1);
  assert.equal(e.getUTCDate(), 28);
});

// --- classify: today / yesterday / bands / grace / no-phone ---
test('paid exactly on REF date -> PAID_TODAY regardless of balance', () => {
  const r = row({ 'Last Payment Date': '12/10/2026', Balance: '500' });
  assert.equal(classify(r, REF).status, 'PAID_TODAY');
});
test('paid exactly REF-1 day -> PAID_YESTERDAY', () => {
  const r = row({ 'Last Payment Date': '11/10/2026', Balance: '500' });
  assert.equal(classify(r, REF).status, 'PAID_YESTERDAY');
});
test('balance above threshold (-500) is not a defaulter', () => {
  const r = row({ 'Last Payment Date': '01/01/2026', Balance: '-400' });
  assert.equal(classify(r, REF).status, 'SKIP');
});
test('balance exactly -500 is NOT a defaulter (threshold is <=-500 excluded via >)', () => {
  // rule: "else if Balance > -500 -> skip", so -500 itself proceeds to defaulter checks
  const r = row({ 'Last Payment Date': '01/01/2024', Balance: '-500' });
  assert.notEqual(classify(r, REF).status, 'SKIP');
});
test('recharged within grace window (3 months) is skipped even with big negative balance', () => {
  const r = row({ 'Last Payment Date': '01/09/2026', Balance: '-50000' }); // within 3 months of 12/10/2026
  assert.equal(classify(r, REF).status, 'SKIP');
});
test('no payment record at all -> "No payment record" band', () => {
  const r = row({ 'Last Payment Date': '', Balance: '-5000' });
  const c = classify(r, REF);
  assert.equal(c.status, 'DEFAULTER');
  assert.equal(c.band, 'No payment record');
});
test('3-6 months band boundary', () => {
  // exactly 6 months back from REF = 12/04/2026
  const r = row({ 'Last Payment Date': '12/04/2026', Balance: '-5000' });
  assert.equal(classify(r, REF).band, '3-6 months');
});
test('6-12 months band', () => {
  const r = row({ 'Last Payment Date': '01/01/2026', Balance: '-5000' });
  assert.equal(classify(r, REF).band, '6-12 months');
});
test('above 1 year band', () => {
  const r = row({ 'Last Payment Date': '01/01/2020', Balance: '-5000' });
  assert.equal(classify(r, REF).band, 'Above 1 year');
});
test('phone shorter than 10 digits -> NO_PHONE, excluded from call list', () => {
  const r = row({ 'Last Payment Date': '01/01/2020', Balance: '-5000', 'Phone No': '12345' });
  assert.equal(classify(r, REF).status, 'NO_PHONE');
});
test('empty phone -> NO_PHONE', () => {
  const r = row({ 'Last Payment Date': '01/01/2020', Balance: '-5000', 'Phone No': '' });
  assert.equal(classify(r, REF).status, 'NO_PHONE');
});

// --- ESD mapping ---
test('ESD is derived from first 3 chars of Consumer No, with the confirmed sub-division names', () => {
  assert.deepEqual(esdForConsumerNo('038000000002'), { code: '038', label: 'Dhupdhara' });
  assert.deepEqual(esdForConsumerNo('039000000002'), { code: '039', label: 'Dudhnoi' });
  assert.deepEqual(esdForConsumerNo('040000000002'), { code: '040', label: 'Goalpara' });
  assert.deepEqual(esdForConsumerNo('041000000002'), { code: '041', label: 'Lakhipur' });
  assert.deepEqual(esdForConsumerNo('042000000002'), { code: '042', label: 'Mankachar' });
});

// --- excluded-consumer tracking ---
test('eligibilityReason reports a category for each scope filter', () => {
  assert.equal(eligibilityReason(row({ 'Govt Flag': 'G' })).category, 'Government consumer');
  assert.equal(eligibilityReason(row({ 'Connection Status': 'PDC' })).category, 'PDC connection');
  assert.equal(eligibilityReason(row({ 'Dept Govt Tower ESD': 'X' })).category, 'Dept/Govt Tower consumer');
  assert.equal(eligibilityReason(row({ 'Category Name': 'General Purpose' })).category, 'Category not in scope');
  assert.equal(eligibilityReason(row({ 'DTR No': 'GHDT1' })).category, 'GHDT DTR');
  assert.equal(eligibilityReason(row({ 'Consumer Name': 'X TOWER' })).category, 'Excluded name keyword');
  assert.equal(eligibilityReason(row({})), null);
});

test('processSheet tracks excluded rows separately from the call list', () => {
  const rows = [
    { 'Consumer No': '040000000010', 'Consumer Name': 'GOVT ONE', 'Phone No': '9000000010', 'Category Name': 'DOM A', 'Govt Flag': 'G', 'Connection Status': 'RUNNING', Balance: '-9000' },
  ];
  const processed = processSheet(rows, REF, DEFAULT_SETTINGS);
  assert.equal(processed.callListRows.length, 0);
  assert.equal(processed.excludedRows.length, 1);
  assert.equal(processed.excludedRows[0].reasonCategory, 'Government consumer');
  const merged = mergeProcessed([processed]);
  const excluded = summarizeExcluded(merged);
  assert.equal(excluded.grandTotal, 1);
});

test('buildStillUnpaidTracker classifies still-unpaid vs paid-since vs dropped', () => {
  const previous = [
    { consumerNo: 'A', esdCode: '040' }, // still unpaid
    { consumerNo: 'B', esdCode: '040' }, // paid since
    { consumerNo: 'C', esdCode: '040' }, // no longer in report
  ];
  const current = [{ consumerNo: 'A', esdCode: '040' }];
  const payments = [{ consumerNo: 'B', esdCode: '040' }];
  const tracked = buildStillUnpaidTracker(previous, current, payments);
  assert.equal(tracked.find((r) => r.consumerNo === 'A').status, 'Still unpaid');
  assert.equal(tracked.find((r) => r.consumerNo === 'B').status, 'Paid since last upload');
  assert.equal(tracked.find((r) => r.consumerNo === 'C').status, 'No longer in report');
});

// --- end-to-end on a tiny synthetic sheet ---
test('processSheet + summarize end-to-end on synthetic rows', () => {
  const rows = [
    { 'Consumer No': '040000000001', 'Consumer Name': 'A', 'Phone No': '9000000001', 'Category Name': 'DOM A', 'Govt Flag': '0', 'Connection Status': 'RUNNING', 'Last Payment Date': '12/10/2026', 'Last Payment Amount': '300', Balance: '0' }, // paid today
    { 'Consumer No': '040000000002', 'Consumer Name': 'B', 'Phone No': '9000000002', 'Category Name': 'DOM A', 'Govt Flag': '0', 'Connection Status': 'RUNNING', 'Last Payment Date': '01/01/2020', 'Last Payment Amount': '0', Balance: '-2000' }, // above 1 year defaulter
    { 'Consumer No': '041000000003', 'Consumer Name': 'C TOWER', 'Phone No': '9000000003', 'Category Name': 'DOM A', 'Govt Flag': '0', 'Connection Status': 'RUNNING', 'Last Payment Date': '01/01/2020', 'Last Payment Amount': '0', Balance: '-2000' }, // excluded by TOWER keyword
    { 'Consumer No': '041000000004', 'Consumer Name': 'D', 'Phone No': '123', 'Category Name': 'DOM A', 'Govt Flag': '0', 'Connection Status': 'RUNNING', 'Last Payment Date': '01/01/2020', 'Last Payment Amount': '0', Balance: '-2000' }, // no phone
  ];
  const processed = processSheet(rows, REF, DEFAULT_SETTINGS);
  const merged = mergeProcessed([processed]);
  const { rows: summaryRows, total } = summarize(merged, REF);

  const r040 = summaryRows.find((r) => r.esdCode === '040');
  assert.equal(r040.paidTodayCount, 1);
  assert.equal(r040.paidTodayAmount, 300);
  assert.equal(r040.bandAbove1y, 1);
  assert.equal(r040.negBandAbove1y, -2000);

  const r041 = summaryRows.find((r) => r.esdCode === '041');
  assert.equal(r041.callListTotal, 0); // one excluded by name, one by no-phone
  assert.equal(r041.noPhoneExcluded, 1);

  assert.equal(total.paidTodayCount, 1);
  assert.equal(total.bandAbove1y, 1);
});

console.log(`\n${passed} test(s) passed.`);
