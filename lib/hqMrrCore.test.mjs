// Run with: node lib/hqMrrCore.test.mjs
import assert from 'node:assert/strict';
import {
  parseIrcaGrid, parseCommercialGrid, parseConsumerwiseGrid, buildSummary, sumRows, buildCategoryTable, CATEGORY_CODES,
  buildHqMrrReport, buildFyReport, fiscalYear, fyMonthsUpTo, monthFromFileName,
} from './hqMrrCore.js';

const HEAD = ['Sl. No', 'Category Code', 'Category Name', 'Unit Billed', 'Connected Load', 'PDC', 'TDC', 'Regular Cons', 'Total Cons',
  'Total Cons Billed', 'Total Consumer Not Billed', 'Total Defective Meter', 'Current Demand', 'Arrear Demand', 'Total Demand',
  'Current Demand Collection', 'Arrear Collection', 'Govt. Adjustment', 'Total Collection', 'Non Cash Adjustment', 'Govt. Subsidy',
  'Tariff Adjustment', 'Grand Total Collection', 'No. Of Cons. Paid', 'No. Of Defaulter', 'Arrear Reg TDC', 'Arrea PDC', 'Freeze Arrear', 'Month', 'Year'];
const row = (code, v) => [Number(code), code, 'x', ...v, 'September', '2026'];
//        unit  load pdc tdc reg tot bil nb def  cur   arr    tot    cc   ac  ga  tc    nc  sub tar  grand paid dfl rg pdc fz
const A = [1000, 10, 1, 2, 3, 5, 4, 1, 0, 1000, 500, 1500, 800, 50, 10, 860, 20, 30, 40, 950, 4, 1, 100, 10, 5];
const B = [3000, 20, 0, 0, 7, 7, 7, 0, 1, 2000, 100, 2100, 1900, 20, 0, 1920, 0, 0, 0, 1920, 7, 0, 50, 0, 0];
const grid = [['title'], HEAD, row('02', A), row('10', B), ['', '', 'TOTAL']];

const p = parseCommercialGrid(grid);
assert.equal(p.month, '2026-09-01');
assert.equal(p.rows.length, 2);
assert.deepEqual(p.warnings.filter((w) => !w.includes('of the 30')), []);

const t = sumRows(p.rows);
assert.equal(t.unit_billed, 4000);
assert.equal(t.grand_coll, 2870);

// BE = (ESD + IRCA units) / injection ; CE = grand collection / current demand (ESD only)
const s = buildSummary(t, 8000, 1000);
assert.ok(Math.abs(s.billing_eff - 5000 / 8000) < 1e-12);
assert.ok(Math.abs(s.collection_eff - 2870 / 3000) < 1e-12);
assert.ok(Math.abs(s.atc_loss - (1 - (5000 / 8000) * (2870 / 3000))) < 1e-12);
assert.ok(Math.abs(s.required_100 - (3000 - 2870) / 1e5) < 1e-12);
// no injection entered -> BE is blank, CE still works
assert.equal(buildSummary(t, null, 0).billing_eff, null);

// categories always come out 01..30 in order (not 10..30 first)
const cat = buildCategoryTable(p.rows);
assert.deepEqual(cat.rows.map((r) => r.code), CATEGORY_CODES);
assert.equal(cat.rows[0].code, '01');
assert.equal(cat.rows[1].dmd_current, 1000 / 1e5);

// a wrong file is rejected, an inconsistent file is flagged
assert.throws(() => parseCommercialGrid([['a', 'b'], [1, 2]]), /does not look like/);
const bad = JSON.parse(JSON.stringify(grid));
bad[2][22] = 5; // grand total no longer adds up
assert.ok(parseCommercialGrid(bad).warnings.some((w) => w.includes('Grand Total')));

// IRCA ESD-wise MRR: values arrive as text, only codes 038-042 are kept, all five must be present
const ih = ['Sl. No', 'ESD Code', 'ESD Name', 'Unit Billed', 'Current Demand'];
const ig = [ih, [1, '000', 'Dhubri', '4060.62', '1'], [6, '038', 'Dhupdhara', '243415.71', '5'], [7, '039', 'Dudhnoi', '467868.99', '5'],
  [8, '040', 'Goalpara', '4264253.80', '5'], [9, '041', 'Lakhipur', '150157.27', '5'], [10, '042', 'Mankachar', '265657.24', '5']];
const ir = parseIrcaGrid(ig);
assert.deepEqual(Object.keys(ir.byEsd).sort(), ['Dhupdhara', 'Dudhnoi', 'Goalpara', 'Lakhipur', 'Mankachar']);
assert.equal(ir.byEsd.Goalpara.units_kwh, 4264253.8);
assert.throws(() => parseIrcaGrid(ig.slice(0, 6)), /no row for Mankachar/);
assert.throws(() => parseIrcaGrid([['a'], [1]]), /does not look like the IRCA/);

// ---- Solar Unit Adjustment: BE = billed units / (injection + solar adjustment)
const sol = buildSummary(t, 8000, 1000, 500);
assert.ok(Math.abs(sol.billing_eff - 5000 / 8500) < 1e-12);
assert.equal(sol.solar_adj_mu, 500 / 1e6);
assert.ok(Math.abs(sol.inj_adj_mu - 8500 / 1e6) < 1e-12);
assert.equal(sol.injected_mu, 8000 / 1e6);
// solar does not touch the collection side
assert.equal(sol.collection_eff, s.collection_eff);
// no solar -> same as before
assert.equal(buildSummary(t, 8000, 1000, 0).billing_eff, s.billing_eff);

// ---- Consumer-wise MRR: total of the Solar Unit Adjustment column
const cg = [
  ['CONSUMER WISE MRR - Goalpara'],
  ['Sl', 'Consumer No', 'Name', 'Units Billed', 'Solar Unit Adjustment', 'Month', 'Year'],
  [1, '100001', 'A', 120, 30, 'September', 2026],
  [2, '100002', 'B', 80, '', 'September', 2026],
  [3, '100003', 'C', 200, '45.5', 'September', 2026],
  ['', '', 'TOTAL', 400, 75.5],
];
const cw = parseConsumerwiseGrid(cg);
assert.equal(cw.solar_kwh, 75.5);
assert.equal(cw.consumers, 3);
assert.equal(cw.solar_consumers, 2);
assert.equal(cw.month, '2026-09-01');
assert.equal(cw.column, 'Solar Unit Adjustment');
assert.throws(() => parseConsumerwiseGrid([['Consumer No', 'Units'], [1, 2]]), /No "Solar Unit Adjustment" column/);
assert.throws(() => parseConsumerwiseGrid([['Consumer No', 'Solar Export', 'Solar Import'], [1, 2, 3]]), /More than one Solar column/);
// two solar columns, only one says "adjustment" -> that one is used
assert.equal(parseConsumerwiseGrid([['Consumer No', 'Solar Export Units', 'Solar Adjusted Units'], [1, 9, 4]]).solar_kwh, 4);

// ---- report: solar flows into the ESD and circle BE; missing files are listed
const mk = (unit) => [{ category_code: '02', category_name: 'x', ...Object.fromEntries(Object.keys(sumRows([])).map((k) => [k, 0])), unit_billed: unit, current_dmd: 1000, grand_coll: 900, curdmd_coll: 900, total_coll: 900, total_dmd: 1000 }];
const rep = buildHqMrrReport({
  month: '2026-09-01',
  rowsByEsd: { Goalpara: mk(6000), Lakhipur: mk(2000) },
  injectionByEsd: { Goalpara: 8000, Lakhipur: 3000 },
  ircaByEsd: { Goalpara: 1000 },
  solarByEsd: { Goalpara: 500 },
});
const g = rep.esds.find((e) => e.name === 'Goalpara');
const l = rep.esds.find((e) => e.name === 'Lakhipur');
assert.ok(Math.abs(g.summary.billing_eff - 7000 / 8500) < 1e-12);
assert.ok(Math.abs(l.summary.billing_eff - 2000 / 3000) < 1e-12); // no solar file -> zero adjustment
assert.deepEqual(rep.missingSolar, ['Lakhipur']);
assert.ok(Math.abs(rep.circle.summary.billing_eff - 9000 / 11500) < 1e-12);

// ---- Financial Year
assert.equal(fiscalYear('2026-09-01').label, '2026-27');
assert.equal(fiscalYear('2027-02-01').label, '2026-27');
assert.equal(fiscalYear('2027-04-01').label, '2027-28');
assert.deepEqual(fyMonthsUpTo('2026-06-01'), ['2026-04-01', '2026-05-01', '2026-06-01']);
assert.equal(fyMonthsUpTo('2027-03-01').length, 12);
assert.equal(fyMonthsUpTo('2027-03-01')[11], '2027-03-01');

const mk2 = (unit, cur, grand) => [{ ...mk(unit)[0], current_dmd: cur, curdmd_coll: grand, grand_coll: grand }];
const fy = buildFyReport({
  month: '2026-06-01',
  monthly: [
    { month: '2026-04-01', rowsByEsd: { Goalpara: mk2(1000, 2000, 1000) }, injectionByEsd: { Goalpara: 2000 }, ircaByEsd: { Goalpara: 0 }, solarByEsd: { Goalpara: 200 } },
    { month: '2026-05-01', rowsByEsd: { Goalpara: mk2(3000, 4000, 4000) }, injectionByEsd: { Goalpara: 4000 }, ircaByEsd: { Goalpara: 0 }, solarByEsd: { Goalpara: 0 } },
    { month: '2026-06-01', rowsByEsd: { Goalpara: mk2(2000, 4000, 3000) }, injectionByEsd: { Goalpara: 3000 }, ircaByEsd: { Goalpara: 0 }, solarByEsd: {} },
  ],
});
const fg = fy.esds.find((e) => e.name === 'Goalpara').summary;
// FY BE = (1000+3000+2000) / ((2000+200)+(4000+0)+(3000+0)) - a total over the year, not the average of 3 monthly BEs
assert.ok(Math.abs(fg.billing_eff - 6000 / 9200) < 1e-12);
// FY CE = (1000+4000+3000) / (2000+4000+4000)
assert.ok(Math.abs(fg.collection_eff - 8000 / 10000) < 1e-12);
assert.ok(Math.abs(fg.atc_loss - (1 - (6000 / 9200) * 0.8)) < 1e-12);
assert.ok(Math.abs(fg.inj_adj_mu - 9200 / 1e6) < 1e-12);
assert.equal(fy.missingSolar.length, 1); // June has no solar file
assert.equal(fy.fyLabel, '2026-27');
assert.equal(fy.months.length, 3);
// a month with no injection is left out of BE (units and injection together) but stays in CE
const fy2 = buildFyReport({
  month: '2026-05-01',
  monthly: [
    { month: '2026-04-01', rowsByEsd: { Goalpara: mk2(1000, 2000, 1000) }, injectionByEsd: { Goalpara: 2000 }, ircaByEsd: {}, solarByEsd: { Goalpara: 0 } },
    { month: '2026-05-01', rowsByEsd: { Goalpara: mk2(3000, 4000, 4000) }, injectionByEsd: {}, ircaByEsd: {}, solarByEsd: { Goalpara: 0 } },
  ],
});
const f2 = fy2.esds.find((e) => e.name === 'Goalpara').summary;
assert.ok(Math.abs(f2.billing_eff - 1000 / 2000) < 1e-12);
assert.ok(Math.abs(f2.collection_eff - 5000 / 6000) < 1e-12);
assert.equal(fy2.missingInjection.length, 1);

// month from a consumer-wise file name; "Solar Unit Adjusted" is preferred over "Solar Rebate"
assert.equal(monthFromFileName('OCTOBER_2026_10.xls'), '2026-10-01');
assert.equal(monthFromFileName('goalpara.xls'), null);
assert.equal(parseConsumerwiseGrid([['Consumer No', 'Solar Unit Adjusted', 'Solar Rebate'], ['A', 5, 99], ['B', 2.5, 1]]).solar_kwh, 7.5);

console.log('hqMrrCore: all tests passed');
