// Describes exactly where each needed sheet's header and data rows are, and
// which column letter maps to which database field. If the source system
// ever changes its export layout (extra header rows, reordered columns),
// update the relevant entry here - nothing else needs to change.
//
// `headerRow` is the 1-indexed row number the column titles sit on.
// `stopField` is the field used to detect the end of data: once a row's
// value for that field is empty, reading for that sheet stops.
// `dateFields` lists fields that are stored as Excel date serial numbers
// and need converting to real dates.

export const SHEET_CONFIGS = {
  '360_Daily': {
    table: 'input_360_daily',
    headerRow: 1,
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
    headerRow: 1,
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
    headerRow: 5,
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
    headerRow: 5,
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
    headerRow: 1,
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
