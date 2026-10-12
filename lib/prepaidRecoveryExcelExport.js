import ExcelJS from 'exceljs';

// Internal band/reason values stay unchanged in the database — only the
// text shown in exported files and the UI changes.
const BAND_LABELS = {
  '3-6 months': 'Not recharged 3-6 months',
  '6-12 months': 'Not recharged 6-12 months',
  'Above 1 year': 'Not recharged above 1 year',
  'No payment record': 'Never recharged',
};
function bandLabel(band) {
  return BAND_LABELS[band] || band;
}
const REASON_LABELS = { 'No phone (left out of call list)': 'No Phone numbers' };
function reasonLabel(reason) {
  return REASON_LABELS[reason] || reason;
}

function pageSetupLandscapeA4(sheet) {
  sheet.pageSetup = {
    orientation: 'landscape',
    paperSize: 9, // A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
  sheet.headerFooter = { oddFooter: '&CPage &P of &N' };
}

export async function buildSummaryWorkbook(reportDate, summaryRows, total, esdMap = {}) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Summary');
  pageSetupLandscapeA4(sheet);
  sheet.columns = [
    { header: 'ESD', key: 'esd', width: 16 },
    { header: bandLabel('3-6 months'), key: 'b36', width: 20 },
    { header: bandLabel('6-12 months'), key: 'b612', width: 20 },
    { header: bandLabel('Above 1 year'), key: 'b1y', width: 20 },
    { header: bandLabel('No payment record'), key: 'bnp', width: 16 },
    { header: 'Call list total', key: 'total', width: 12 },
    { header: 'Negative balance (Lakhs)', key: 'neg', width: 18 },
    { header: 'No Phone numbers', key: 'nophone', width: 16 },
    { header: 'Latest Last Payment Date', key: 'latest', width: 18 },
    { header: 'Warning', key: 'warn', width: 30 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const r of summaryRows) {
    sheet.addRow({
      esd: esdMap[r.esd_code] || r.esd_label || r.esd_code, b36: r.band_3_6, b612: r.band_6_12, b1y: r.band_above_1y,
      bnp: r.band_no_payment, total: r.call_list_total, neg: Number(r.neg_total) / 100000,
      nophone: r.no_phone_excluded,
      latest: r.latest_last_payment_date, warn: r.stale_warning || '',
    });
  }
  const totalRow = sheet.addRow({
    esd: 'Goalpara Circle Total', b36: total.band36, b612: total.band612, b1y: total.bandAbove1y,
    bnp: total.bandNoPayment, total: total.callListTotal, neg: Number(total.negTotal) / 100000,
    nophone: total.noPhoneExcluded, latest: '', warn: '',
  });
  sheet.getColumn('neg').numFmt = '#,##0.00';
  totalRow.font = { bold: true };

  return wb;
}

export async function buildPaymentsWorkbook(reportDate, paymentsRows, esdMap = {}) {
  const wb = new ExcelJS.Workbook();
  const sumSheet = wb.addWorksheet('Payment Summary');
  pageSetupLandscapeA4(sumSheet);
  sumSheet.columns = [
    { header: 'ESD', key: 'esd', width: 18 },
    { header: 'Recharged Yesterday (consumers)', key: 'yc', width: 20 },
    { header: 'Recharged Yesterday (Rs)', key: 'ya', width: 20 },
    { header: 'Recharged Today (consumers)', key: 'tc', width: 20 },
    { header: 'Recharged Today (Rs)', key: 'ta', width: 20 },
    { header: 'Total (consumers)', key: 'c', width: 16 },
    { header: 'Total (Rs)', key: 'a', width: 16 },
  ];
  sumSheet.getRow(1).font = { bold: true };
  sumSheet.getRow(1).alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  const byEsd = {};
  for (const r of paymentsRows) {
    const code = r.esd_code;
    const b = byEsd[code] || (byEsd[code] = { yc: 0, ya: 0, tc: 0, ta: 0 });
    const amt = Number(r.paid_amount ?? r.paidAmount ?? 0);
    if ((r.paid_when || r.when) === 'today') { b.tc += 1; b.ta += amt; } else { b.yc += 1; b.ya += amt; }
  }
  const grand = { yc: 0, ya: 0, tc: 0, ta: 0 };
  for (const code of Object.keys(byEsd).sort()) {
    const b = byEsd[code];
    sumSheet.addRow({ esd: esdMap[code] || code, ...b, c: b.yc + b.tc, a: b.ya + b.ta });
    for (const k of Object.keys(grand)) grand[k] += b[k];
  }
  sumSheet.addRow({ esd: 'Goalpara Circle Total', ...grand, c: grand.yc + grand.tc, a: grand.ya + grand.ta }).font = { bold: true };
  for (const k of ['ya', 'ta', 'a']) sumSheet.getColumn(k).numFmt = '#,##0.00';

  const sheet = wb.addWorksheet('Payments');
  pageSetupLandscapeA4(sheet);
  sheet.columns = [
    { header: 'ESD', key: 'esd', width: 14 },
    { header: 'Consumer No', key: 'cno', width: 16 },
    { header: 'Consumer Name', key: 'name', width: 28 },
    { header: 'Category', key: 'cat', width: 14 },
    { header: 'Paid Rs', key: 'amt', width: 12 },
    { header: 'Balance now', key: 'bal', width: 12 },
    { header: 'When', key: 'when', width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  for (const r of paymentsRows) {
    const when = r.paid_when || r.when;
    sheet.addRow({
      esd: esdMap[r.esd_code] || r.esd_label || r.esdLabel || r.esd_code, cno: r.consumer_no || r.consumerNo, name: r.consumer_name || r.consumerName,
      cat: r.category_name || r.categoryName, amt: r.paid_amount ?? r.paidAmount,
      bal: r.balance_now ?? r.balanceNow, when: when === 'today' ? 'Recharged Today' : 'Recharged Yesterday',
    });
  }
  return wb;
}

export async function buildExcludedWorkbook(reportDate, rows, esdMap) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Excluded');
  pageSetupLandscapeA4(sheet);
  sheet.columns = [
    { header: 'ESD', key: 'esd', width: 14 },
    { header: 'Consumer No', key: 'cno', width: 16 },
    { header: 'Consumer Name', key: 'name', width: 26 },
    { header: 'Category', key: 'cat', width: 14 },
    { header: 'Connection Status', key: 'status', width: 14 },
    { header: 'Phone No', key: 'phone', width: 14 },
    { header: 'Balance', key: 'bal', width: 12 },
    { header: 'Reason', key: 'reason', width: 20 },
    { header: 'Detail', key: 'detail', width: 30 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  for (const r of rows) {
    sheet.addRow({
      esd: esdMap[r.esd_code] || r.esd_code, cno: r.consumer_no, name: r.consumer_name,
      cat: r.category_name, status: r.connection_status, phone: r.phone_no, bal: r.balance,
      reason: reasonLabel(r.reason_category), detail: r.reason_detail,
    });
  }
  return wb;
}

export async function buildCallListWorkbook(reportDate, rowsByEsd) {
  const wb = new ExcelJS.Workbook();
  for (const [esdLabel, rows] of Object.entries(rowsByEsd)) {
    const sheetName = String(esdLabel).slice(0, 31).replace(/[\\/*?:[\]]/g, ' ');
    const sheet = wb.addWorksheet(sheetName || 'ESD');
    pageSetupLandscapeA4(sheet);
    sheet.columns = [
      { header: 'Sr. No.', key: 'sr', width: 8 },
      { header: 'Consumer No', key: 'cno', width: 16 },
      { header: 'Consumer Name', key: 'name', width: 26 },
      { header: 'Address', key: 'addr', width: 30 },
      { header: 'Category', key: 'cat', width: 12 },
      { header: 'Connection Status', key: 'status', width: 14 },
      { header: 'Mobile / Phone No', key: 'phone', width: 16 },
      { header: 'Last Payment Date', key: 'lpd', width: 16 },
      { header: 'Negative Balance (Rs)', key: 'bal', width: 16 },
      { header: 'Not Recharged For', key: 'band', width: 16 },
      { header: 'Remarks', key: 'remark', width: 30 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    for (const r of rows) {
      sheet.addRow({
        sr: r.serial_no, cno: r.consumer_no, name: r.consumer_name, addr: r.consumer_address, cat: r.category_name,
        status: r.connection_status, phone: r.phone_no,
        lpd: r.last_payment_date || 'No record', bal: r.balance, band: bandLabel(r.band), remark: r.remark || '',
      });
    }
  }
  return wb;
}

/** Allotment tracker workbook: a summary sheet (one row per allotment plus a
 * grand total) and one detail sheet per allotment. */
export async function buildAllotmentsWorkbook(reportDate, evaluated, esdMap = {}) {
  const wb = new ExcelJS.Workbook();
  const sum = wb.addWorksheet('Allotment Summary');
  pageSetupLandscapeA4(sum);
  sum.columns = [
    { header: 'Allotment', key: 'label', width: 22 },
    { header: 'ESD', key: 'esd', width: 14 },
    { header: 'Serial range', key: 'range', width: 14 },
    { header: 'Allotted on', key: 'on', width: 13 },
    { header: 'Consumers allotted', key: 'n', width: 12 },
    { header: 'Paid since allotment', key: 'paid', width: 14 },
    { header: 'Cleared (balance ok / recharged earlier)', key: 'cleared', width: 20 },
    { header: 'Total recovered', key: 'rec', width: 12 },
    { header: 'Still unpaid', key: 'still', width: 12 },
    { header: 'Not in report', key: 'nir', width: 12 },
    { header: 'Recovered %', key: 'pct', width: 12 },
    { header: 'Amount paid (Rs)', key: 'amt', width: 16 },
  ];
  sum.getRow(1).font = { bold: true };
  sum.getRow(1).alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  const tot = { n: 0, paid: 0, cleared: 0, rec: 0, still: 0, nir: 0, amt: 0 };
  for (const e of evaluated) {
    const a = e.allotment;
    const base = { label: a.label, esd: esdMap[a.esd_code] || a.esd_code, range: `${a.from_serial}-${a.to_serial}`, on: a.allotted_on };
    if (e.pending) { sum.addRow({ ...base, n: a.consumer_count, paid: 'Check from next report' }); continue; }
    const s = e.stats;
    sum.addRow({ ...base, n: s.allotted, paid: s.paid, cleared: s.cleared, rec: s.recovered, still: s.stillUnpaid,
      nir: s.notInReport, pct: Number(s.recoveredPct.toFixed(1)), amt: s.paidAmount });
    tot.n += s.allotted; tot.paid += s.paid; tot.cleared += s.cleared; tot.rec += s.recovered;
    tot.still += s.stillUnpaid; tot.nir += s.notInReport; tot.amt += s.paidAmount;
  }
  sum.addRow({ label: 'TOTAL', ...tot, pct: tot.n ? Number(((tot.rec / tot.n) * 100).toFixed(1)) : 0 }).font = { bold: true };
  sum.getColumn('amt').numFmt = '#,##0.00';

  evaluated.filter((e) => !e.pending).forEach((e, i) => {
    const a = e.allotment;
    const name = `${i + 1} ${a.label}`.slice(0, 31).replace(/[\\/*?:[\]]/g, ' ');
    const sh = wb.addWorksheet(name);
    pageSetupLandscapeA4(sh);
    sh.columns = [
      { header: 'Sr. No.', key: 'sr', width: 8 },
      { header: 'Consumer No', key: 'cno', width: 16 },
      { header: 'Consumer Name', key: 'name', width: 28 },
      { header: 'Phone', key: 'phone', width: 14 },
      { header: 'Not Recharged For (at allotment)', key: 'band', width: 22 },
      { header: 'Balance at allotment (Rs)', key: 'bal', width: 16 },
      { header: 'Status now', key: 'status', width: 14 },
      { header: 'Amount paid (Rs)', key: 'amt', width: 14 },
    ];
    sh.getRow(1).font = { bold: true };
    sh.getRow(1).alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
    sh.views = [{ state: 'frozen', ySplit: 1 }];
    for (const it of e.items) {
      sh.addRow({ sr: it.serial_no, cno: it.consumer_no, name: it.consumer_name, phone: it.phone_no,
        band: bandLabel(it.band), bal: it.balance, status: it.status, amt: it.paid_amount ?? '' });
    }
  });
  return wb;
}
