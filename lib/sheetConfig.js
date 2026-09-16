// Describes exactly where each needed sheet's header and data rows are, and
// which column letter maps to which database field. If the source system
// ever changes its export layout (extra header rows, reordered columns),
// update the relevant entry here - nothing else needs to change.
//
// Header row position is auto-detected at parse time (a row counts as data
// once its first column holds an actual number, not a text label), so files
// exported standalone - with a different number of preamble rows than they
// had inside the old master workbook - are read correctly without changes
// here. `stopField` is the column used for that detection.
// `dateFields` lists fields that are stored as Excel date serial numbers
// and need converting to real dates.

export const SHEET_CONFIGS = {
  '360_Daily': {
    table: 'input_360_daily',
    label: '360 Daily Report',
    stopField: 'sl_no',
    dateFields: [],
    columns: {
      A: 'sl_no',
      B: 'region',
      C: 'circle',
      D: 'division',
      E: 'sub_division',
      F: 'total_consumers',
      G: 'billable_consumers',
      H: 'consumer_billed',
      I: 'units_billed',
      J: 'arrear_demand',
      K: 'current_demand',
      L: 'consumer_paid',
      M: 'arrear_collection',
      N: 'current_collection',
      O: 'solar_rebate',
      P: 'total_collection',
      Q: 'credit_adjustment',
    },
  },

  '360_Cum': {
    table: 'input_360_cum',
    label: '360 Cumulative Report',
    stopField: 'sl_no',
    dateFields: [],
    columns: {
      A: 'sl_no',
      B: 'region',
      C: 'circle',
      D: 'division',
      E: 'sub_division',
      F: 'total_consumers',
      G: 'billable_consumers',
      H: 'consumer_billed',
      I: 'units_billed',
      J: 'arrear_demand',
      K: 'current_demand',
      L: 'consumer_paid',
      M: 'arrear_collection',
      N: 'current_collection',
      O: 'solar_rebate',
      P: 'total_collection',
      Q: 'credit_adjustment',
      R: 'collection_efficiency',
    },
  },

  Converted: {
    table: 'input_converted',
    label: 'Prepaid Converted Report',
    stopField: 'sl_no',
    dateFields: [],
    columns: {
      A: 'sl_no',
      B: 'region',
      C: 'circle',
      D: 'sub_division_name',
      E: 'converted',
      F: 'units_billed',
      G: 'current_demand',
      H: 'total_outstanding',
      I: 'remaining_outstanding',
      J: 'total_load_security',
      K: 'adjusted_load_security',
      L: 'remaining_load_security',
      M: 'postpaid_bill_payment',
    },
  },

  Prepaid_Bill: {
    table: 'input_prepaid_bill',
    label: 'Prepaid Billing Report',
    stopField: 'sl_no',
    dateFields: [],
    columns: {
      A: 'sl_no',
      B: 'region',
      C: 'circle',
      D: 'sub_division_name',
      E: 'consumer_count',
      F: 'billed_count',
      G: 'units_billed',
      H: 'current_demand',
      I: 'govt_subsidy',
      J: 'consumer_neg_balance',
    },
  },

  IRCA_Bill: {
    table: 'input_irca_bill',
    label: 'IRCA Billing Report',
    stopField: 'sl_no',
    dateFields: ['bill_date', 'due_date'],
    columns: {
      A: 'sl_no',
      B: 'consumer_no',
      C: 'consumer_name',
      D: 'bill_no',
      E: 'bill_date',
      F: 'due_date',
      G: 'units_billed',
      H: 'current_demand',
      I: 'net_bill',
      J: 'category',
      K: 'connected_load',
      L: 'bill_type',
      M: 'dtr_no',
      N: 'esd_code',
      O: 'prepared_by',
    },
  },
};

// Fields that must always be sent as text, even if they look numeric
// (leading zeros, values too large for a JS number to keep precisely).
export const TEXT_FIELDS = new Set([
  'consumer_no', 'bill_no', 'dtr_no', 'category', 'bill_type', 'prepared_by',
  'consumer_name', 'region', 'circle', 'division', 'sub_division',
  'sub_division_name',
]);

export const SUB_DIVISIONS = ['Dhupdhara', 'Dudhnoi', 'Goalpara', 'Lakhipur', 'Mankachar'];

// Ordered list for building the 5 separate upload widgets in the UI.
export const SHEET_TYPES = Object.entries(SHEET_CONFIGS).map(([key, cfg]) => ({
  key,
  label: cfg.label,
}));

