// Which columns the short ("trim down") summaries leave out. The full sheets
// always carry every column; the short sheets carry everything except these.
import { SUMMARY_COLS, CATEGORY_COLS } from './hqMrrColumns.js';

// Keys of columns NOT wanted in the short summary / short category table.
export const SHORT_SUMMARY_EXCLUDE = [
  'required_100', 'required_100_rs', 'connected_load_kw', 'bills_served', 'pc_billing', 'def_meters',
  'real_current', 'real_arrear', 'real_total', 'arrear_freeze_pdc', 'arrear_regular', 'arrear_total',
  'cons_paid', 'defaulters', 'coll_ex_govt', 'days_total', 'days_excl',
];
export const SHORT_CATEGORY_EXCLUDE = [
  'connected_load_kw', 'bills_served', 'def_meters', 'arrear_freeze_pdc', 'arrear_regular', 'days_total', 'days_excl',
];

export const trimSummaryCols = () => SUMMARY_COLS.filter((c) => !SHORT_SUMMARY_EXCLUDE.includes(c.key));
export const trimCategoryCols = () => CATEGORY_COLS.filter((c) => !SHORT_CATEGORY_EXCLUDE.includes(c.key));
