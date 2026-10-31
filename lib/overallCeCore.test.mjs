// Plain Node test. Run with: node lib/overallCeCore.test.mjs
// Expected figures are the cached values in the CE_All sheet of GpEC_Daily_Report.xlsx.
import assert from 'node:assert/strict';
import { buildOverallCE } from './overallCeCore.js';

let ok = 0;
function test(name, fn) {
  try { fn(); ok++; console.log('ok -', name); } catch (e) { console.error('FAIL -', name); console.error(e); process.exitCode = 1; }
}
const B = 'Bongaigaon';
const inputs = {
  cum: [
    { circle: B, sub_division: 'Dhupdhara', current_demand: 522824, arrear_demand: 1322915, total_collection: 471029 },
    { circle: B, sub_division: 'Goalpara', current_demand: 2693788, arrear_demand: 6932628, total_collection: 1561302 },
    { circle: 'Other', sub_division: 'Goalpara', current_demand: 999999, total_collection: 999999 }, // other circle: ignored
  ],
  daily: [{ circle: B, sub_division: 'Dhupdhara', total_collection: 0 }, { circle: B, sub_division: 'Goalpara', total_collection: 5238 }],
  prepaidBill: [
    { circle: B, sub_division_name: 'Dhupdhara', current_demand: 22039987 },
    { circle: B, sub_division_name: 'Goalpara', current_demand: 50142548 },
  ],
  converted: [
    { circle: B, sub_division_name: 'Dhupdhara', current_demand: 0, adjusted_load_security: 0, postpaid_bill_payment: 0 },
    { circle: B, sub_division_name: 'Goalpara', current_demand: 0, adjusted_load_security: 0, postpaid_bill_payment: 0 },
    { circle: 'Cachar', sub_division_name: 'Lakhipur', current_demand: 7777, adjusted_load_security: 7777, postpaid_bill_payment: 7777 }, // same name, other circle
  ],
  prepaidColl: [
    { circle: B, sub_division_name: 'Dhupdhara', total_recharge: 24643128, credit_adjustment: 491533 },
    { circle: B, sub_division_name: 'Goalpara', total_recharge: 52399378, credit_adjustment: 411931 },
  ],
};
const monthly = { Goalpara: { manual_amount: 86145, assessment_amount: 279699 } };
const rows = buildOverallCE(inputs, monthly);
const get = (n) => rows.find((r) => r.name === n);

test('Dhupdhara matches the sheet', () => {
  const r = get('Dhupdhara');
  assert.equal(r.grand_demand, 22562811);
  assert.equal(r.grand_collection, 25605690);
  assert.ok(Math.abs(r.overall_ce - 1.1348625842764006) < 1e-12);
  assert.ok(Math.abs(r.postpaid_ce - 0.9009322448854682) < 1e-12);
});
test('Goalpara matches the sheet (manual + assessment in both demand and collection)', () => {
  const r = get('Goalpara');
  assert.equal(r.grand_demand, 53202180);
  assert.equal(r.grand_collection, 54738455);
  assert.ok(Math.abs(r.overall_ce - 1.0288761663525818) < 1e-12);
});
test('daily collection is shown but not added to the grand total', () => {
  assert.equal(get('Goalpara').postpaid_daily, 5238);
});
test('same sub-division name in another circle is ignored', () => {
  assert.equal(get('Lakhipur').converted_collection, 0);
  assert.equal(get('Lakhipur').converted_current, 0);
});
test('missing inputs count as 0 and give no CE rather than dividing by zero', () => {
  assert.equal(get('Mankachar').grand_demand, 0);
  assert.equal(get('Mankachar').overall_ce, null);
});
test('Goalpara ED and Circle Total are sums with recomputed ratios', () => {
  const t = get('Goalpara ED');
  assert.equal(t.grand_demand, 22562811 + 53202180);
  assert.equal(t.grand_collection, 25605690 + 54738455);
  assert.ok(Math.abs(t.overall_ce - t.grand_collection / t.grand_demand) < 1e-12);
  assert.deepEqual({ ...get('Circle Total'), name: 'Goalpara ED' }, t);
  assert.equal(rows.length, 7);
});

const rowsX = buildOverallCE(inputs, { Goalpara: { manual_amount: 86145, assessment_amount: 279699, conv_prepaid_amount: 1000, temporary_amount: 500 } });
const gx = rowsX.find((r) => r.name === 'Goalpara');
test('normal columns are unchanged by the two extra amounts', () => {
  assert.equal(gx.grand_demand, 53202180);
  assert.equal(gx.grand_collection, 54738455);
  assert.ok(Math.abs(gx.overall_ce - 1.0288761663525818) < 1e-12);
});
test('extended version adds the two amounts to both demand and collection', () => {
  assert.equal(gx.grand_demand_ext, 53202180 + 1500);
  assert.equal(gx.grand_collection_ext, 54738455 + 1500);
  assert.ok(Math.abs(gx.overall_ce_ext - (54738455 + 1500) / (53202180 + 1500)) < 1e-12);
  assert.equal(rowsX.find((r) => r.name === 'Circle Total').conv_prepaid_amount, 1000);
});
test('with no extra amounts the extended totals equal the normal ones', () => {
  assert.equal(get('Goalpara').grand_demand_ext, get('Goalpara').grand_demand);
  assert.equal(get('Goalpara').overall_ce_ext, get('Goalpara').overall_ce);
});
console.log(`${ok} passed`);
