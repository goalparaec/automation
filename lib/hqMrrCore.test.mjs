// Run with: node lib/hqMrrCore.test.mjs
import assert from 'node:assert/strict';
import { parseIrcaGrid, parseCommercialGrid, buildSummary, sumRows, buildCategoryTable, CATEGORY_CODES } from './hqMrrCore.js';

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

console.log('hqMrrCore: all tests passed');
