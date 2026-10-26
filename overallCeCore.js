// Overall CE (collection efficiency of the whole circle: postpaid + prepaid +
// converted + the two monthly "not reflected in ARMS" amounts). Pure functions
// only - no database access - so the arithmetic can be tested on its own.
//
// Mirrors the CE_All sheet of the Excel report:
//   Grand demand     = postpaid current demand + prepaid current demand
//                      + manual amount + assessment amount + converted current demand
//   Grand collection = postpaid total collection + prepaid recharge + credit adjustment
//                      + outstanding payment + manual amount + assessment amount
//                      + (converted adjusted load security + converted postpaid bill payment)
//   Overall CE %     = grand collection / grand demand
// Manual and assessment amounts count as fully collected (as in the sheet).
// "Daily collection (postpaid)" is shown for information only - it is already
// inside the cumulative total, so it is NOT added again.

export const CIRCLE_FILTER = 'Bongaigaon'; // circle name the portal reports use for our 5 ESDs
export const ESDS = ['Dhupdhara', 'Dudhnoi', 'Goalpara', 'Lakhipur', 'Mankachar'];

const num = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

function forEsd(rows, esd, key) {
  return (rows || []).filter((r) => r.circle === CIRCLE_FILTER && r[key] === esd);
}
function sum(rows, field) {
  return rows.reduce((t, r) => t + num(r[field]), 0);
}
function ratio(a, b) {
  return b > 0 ? a / b : null;
}

const SUM_FIELDS = [
  'postpaid_current', 'postpaid_arrear', 'postpaid_daily', 'postpaid_total',
  'prepaid_current', 'manual_amount', 'assessment_amount', 'converted_current', 'grand_demand',
  'recharge', 'credit_adjustment', 'outstanding_payment', 'manual_collection', 'assessment_collection',
  'converted_collection', 'grand_collection', 'required_100',
];

function withRatios(r) {
  r.postpaid_ce = ratio(r.postpaid_total, r.postpaid_current);
  r.overall_ce = ratio(r.grand_collection, r.grand_demand);
  r.required_100 = r.grand_demand - r.grand_collection; // negative = already above 100%
  return r;
}

/**
 * @param {{cum, daily, prepaidBill, converted, prepaidColl}} inputs  row arrays from the input tables
 * @param {Object<string,{manual_amount:number, assessment_amount:number}>} monthly  keyed by ESD name
 * @returns {object[]} 5 ESD rows, then "Goalpara ED" and "Circle Total"
 */
export function buildOverallCE(inputs, monthly = {}) {
  const rows = ESDS.map((esd, i) => {
    const cum = forEsd(inputs.cum, esd, 'sub_division');
    const daily = forEsd(inputs.daily, esd, 'sub_division');
    const bill = forEsd(inputs.prepaidBill, esd, 'sub_division_name');
    const conv = forEsd(inputs.converted, esd, 'sub_division_name');
    const coll = forEsd(inputs.prepaidColl, esd, 'sub_division_name');
    const m = monthly[esd] || {};

    const r = {
      sl_no: i + 1,
      name: esd,
      postpaid_current: sum(cum, 'current_demand'),
      postpaid_arrear: sum(cum, 'arrear_demand'),
      postpaid_daily: sum(daily, 'total_collection'),
      postpaid_total: sum(cum, 'total_collection'),
      prepaid_current: sum(bill, 'current_demand'),
      manual_amount: num(m.manual_amount),
      assessment_amount: num(m.assessment_amount),
      converted_current: sum(conv, 'current_demand'),
      recharge: sum(coll, 'total_recharge'),
      credit_adjustment: sum(coll, 'credit_adjustment'),
      outstanding_payment: sum(coll, 'outstanding_payment'),
      converted_collection: sum(conv, 'adjusted_load_security') + sum(conv, 'postpaid_bill_payment'),
    };
    r.manual_collection = r.manual_amount;
    r.assessment_collection = r.assessment_amount;
    r.grand_demand = r.postpaid_current + r.prepaid_current + r.manual_amount + r.assessment_amount + r.converted_current;
    r.grand_collection = r.postpaid_total + r.recharge + r.credit_adjustment + r.outstanding_payment + r.manual_collection
      + r.assessment_collection + r.converted_collection;
    return withRatios(r);
  });

  const total = { sl_no: null, name: 'Goalpara ED', isTotal: true };
  for (const f of SUM_FIELDS) total[f] = rows.reduce((t, r) => t + r[f], 0);
  withRatios(total);

  return [...rows, total, { ...total, name: 'Circle Total' }];
}
