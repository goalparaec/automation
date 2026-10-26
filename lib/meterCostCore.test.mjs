// Run with: node lib/meterCostCore.test.mjs
import assert from 'node:assert/strict';
import {
  rowsToRecords, classifyRecord, buildPreview, sanitiseDecisions, buildDepositSummary, buildPrStatus,
  esdFromConsumerNo, normConsumerNo, toIsoDate, fyStartOf, fyMonths, recordKey,
} from './meterCostCore.js';

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log('ok -', name); };

const row = (o) => ({
  'Application Number': '100000001', 'Consumer Number': '040010090001', 'Consumer Name': 'A',
  'Bill Number': '2000', 'Receipt Number': '8001', Load: 1, 'Bill Head': 'NEW SERVICE CONNECTION METER COST',
  Amount: 6490, 'Payment Date': '2026-07-02', ...o,
});

test('ESD comes from the consumer-number prefix, leading zero restored', () => {
  assert.equal(esdFromConsumerNo('038010000001'), '038');
  assert.equal(normConsumerNo(40010090789), '040010090789');
  assert.equal(esdFromConsumerNo('099000000001'), null);
});

test('dates: Date, serial, ISO and dd/mm/yyyy all read the same', () => {
  assert.equal(toIsoDate(new Date('2026-07-02T00:00:00Z')), '2026-07-02');
  assert.equal(toIsoDate(46205), '2026-07-02');
  assert.equal(toIsoDate('2026-07-02 00:00:00'), '2026-07-02');
  assert.equal(toIsoDate('02/07/2026'), '2026-07-02');
});

test('financial year runs April to March', () => {
  assert.equal(fyStartOf('2026-04-01'), 2026);
  assert.equal(fyStartOf('2027-03-31'), 2026);
  assert.deepEqual(fyMonths(2026).slice(0, 2), ['2026-04', '2026-05']);
  assert.equal(fyMonths(2026)[11], '2027-03');
});

test('only the three meter-cost heads are read; other ESDs are set aside', () => {
  const { records, notOurEsd } = rowsToRecords([
    row({}), row({ 'Bill Head': 'METER SEAL COST', 'Receipt Number': '8002' }),
    row({ 'Bill Head': 'METER COST BILL', 'Receipt Number': '8003', Load: '---' }),
    row({ 'Consumer Number': '099000000001', 'Receipt Number': '8004' }),
  ]);
  assert.equal(records.length, 2);
  assert.equal(notOurEsd, 1);
  assert.deepEqual(records.map((r) => r.kind), ['new', 'replacement']);
  assert.equal(records[1].load_kw, null);
});

test('6,490 and 9,047 count automatically; 0 and 2,400 are ignored', () => {
  assert.deepEqual(['decision', 'phase'].map((k) => classifyRecord({ amount: 6490, load_kw: 1 })[k]), ['count', '1']);
  assert.deepEqual(['decision', 'phase'].map((k) => classifyRecord({ amount: 9047, load_kw: 8 })[k]), ['count', '3']);
  assert.equal(classifyRecord({ amount: 2400, load_kw: 1 }).decision, 'ignore');
  assert.equal(classifyRecord({ amount: 0, load_kw: 1.5 }).decision, 'ignore');
});

test('a different price waits for approval and suggests a phase', () => {
  const c = classifyRecord({ amount: 8675, load_kw: null });
  assert.equal(c.decision, 'pending');
  assert.equal(c.flag, 'different_price');
  assert.equal(c.phase, '3');
  assert.equal(classifyRecord({ amount: 6116, load_kw: 2 }).phase, '1');
});

test('exact amount with a contradicting load is flagged, not counted', () => {
  const c = classifyRecord({ amount: 6490, load_kw: 10 });
  assert.equal(c.decision, 'pending');
  assert.equal(c.flag, 'phase_mismatch');
});

test('re-uploading the same file adds nothing', () => {
  const { records } = rowsToRecords([row({})]);
  const existing = new Map([[recordKey(records[0]), { ...records[0], status: 'counted' }]]);
  const p = buildPreview(records, existing);
  assert.equal(p.records.length, 0);
  assert.equal(p.stats.alreadyImported, 1);
});

test('same application paid again under a new receipt is a conflict', () => {
  const { records } = rowsToRecords([row({}), row({ 'Receipt Number': '8009', 'Payment Date': '2026-07-09' })]);
  const p = buildPreview(records);
  assert.equal(p.records.length, 2);
  assert.equal(p.records[0].decision, 'count');
  assert.equal(p.records[1].decision, 'pending');
  assert.equal(p.records[1].flag, 'duplicate');
  assert.equal(p.records[1].existing.receipt_no, '8001');
});

test('same application number in two ESDs is NOT a conflict', () => {
  const { records } = rowsToRecords([row({}), row({ 'Consumer Number': '041010000001', 'Receipt Number': '9001' })]);
  const p = buildPreview(records);
  assert.deepEqual(p.records.map((r) => r.decision), ['count', 'count']);
});

test('pending rows must be decided before saving', () => {
  const { records } = rowsToRecords([row({ Amount: 8675 })]);
  const p = buildPreview(records);
  const bad = sanitiseDecisions(p.records);
  assert.equal(bad.clean.length, 0);
  assert.equal(bad.problems.length, 1);
  const ok = sanitiseDecisions(p.records.map((r) => ({ ...r, decision: 'count', phase: '1' })));
  assert.equal(ok.clean[0].status, 'counted');
  assert.equal(ok.clean[0].phase, '1');
  const rejected = sanitiseDecisions(p.records.map((r) => ({ ...r, decision: 'ignore' })));
  assert.equal(rejected.clean[0].status, 'ignored');
});

test('summary counts only counted rows, by month, ESD and phase', () => {
  const dep = (esd, kind, phase, date, status = 'counted') => ({ esd_code: esd, kind, phase, payment_date: date, status });
  const s = buildDepositSummary([
    dep('040', 'new', '1', '2026-04-10'), dep('040', 'new', '1', '2026-04-11'), dep('040', 'new', '3', '2026-04-12'),
    dep('040', 'replacement', '1', '2026-05-01'), dep('040', 'new', '1', '2026-04-13', 'ignored'),
    dep('041', 'new', '1', '2027-03-31'), dep('041', 'new', '1', '2027-04-01'),
  ], 2026);
  const apr = s.monthly[0];
  const g = apr.rows.find((r) => r.esd_code === '040');
  assert.deepEqual([g.new1, g.new3, g.newTotal], [2, 1, 3]);
  assert.equal(apr.total.newTotal, 3);
  assert.equal(s.monthly[1].rows.find((r) => r.esd_code === '040').rep1, 1);
  assert.equal(s.monthly[11].rows.find((r) => r.esd_code === '041').new1, 1); // 31 Mar belongs to this FY
  assert.equal(s.grand.new1, 3); // 2 in Apr + 1 on 31 Mar; the 1-Apr-2027 row is the next FY
  assert.equal(s.quarterly[0].total.new1, 2);
});

test('PR status: pending when deposits exceed PRs, advance when PRs exceed deposits', () => {
  const dep = (esd, phase, kind = 'new') => ({ esd_code: esd, kind, phase, payment_date: '2026-06-10', status: 'counted' });
  const deposits = [...Array(10).fill(0).map(() => dep('040', '1')), ...Array(2).fill(0).map(() => dep('040', '3')), dep('041', '1')];
  const prs = [
    { esd_code: '040', kind: 'new', pr_date: '2026-06-20', ph1: 6, ph3: 5 },
    { esd_code: '041', kind: 'new', pr_date: '2026-06-20', ph1: 4, ph3: 0 },
  ];
  const s = buildPrStatus(deposits, prs, 2026);
  const g = s.rows.find((r) => r.esd_code === '040').new;
  assert.deepEqual([g.dep1, g.pr1, g.pending1, g.advance1], [10, 6, 4, 0]);
  assert.deepEqual([g.dep3, g.pr3, g.pending3, g.advance3], [2, 5, 0, 3]);
  assert.equal(s.rows.find((r) => r.esd_code === '041').new.advance1, 3);
  assert.equal(s.total.new.pending1, 4);
});

console.log(`\n${passed} tests passed`);
