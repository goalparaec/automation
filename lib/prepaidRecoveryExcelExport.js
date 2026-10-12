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
    { header: 'Good Standing', key: 'goodstanding', width: 14 },
    { header: 'Recharged Yesterday (count)', key: 'py', width: 18 },
    { header: 'Recharged Yesterday (Rs)', key: 'pya', width: 18 },
    { header: 'Recharged Today (count)', key: 'pt', width: 16 },
    { header: 'Recharged Today (Rs)', key: 'pta', width: 16 },
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
      nophone: r.no_phone_excluded, goodstanding: r.good_standing_count || 0, py: r.paid_yesterday_count, pya: r.paid_yesterday_amount,
      pt: r.paid_today_count, pta: r.paid_today_amount,
      latest: r.latest_last_payment_date, warn: r.stale_warning || '',
    });
  }
  const totalRow = sheet.addRow({
    esd: 'Goalpara Circle Total', b36: total.band36, b612: total.band612, b1y: total.bandAbove1y,
    bnp: total.bandNoPayment, total: total.callListTotal, neg: Number(total.negTotal) / 100000,
    nophone: total.noPhoneExcluded, goodstanding: total.goodStandingCount || 0, py: total.paidYesterdayCount, pya: total.paidYesterdayAmount,
    pt: total.paidTodayCount, pta: total.paidTodayAmount, latest: '', warn: '',
  });
  sheet.getColumn('neg').numFmt = '#,##0.00';
  totalRow.font = { bold: true };

  return wb;
}

export async function buildPaymentsWorkbook(reportDate, paymentsRows, esdMap = {}) {
  const wb = new ExcelJS.Workbook();
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
        cno: r.consumer_no, name: r.consumer_name, addr: r.consumer_address, cat: r.category_name,
        status: r.connection_status, phone: r.phone_no,
        lpd: r.last_payment_date || 'No record', bal: r.balance, band: bandLabel(r.band), remark: r.remark || '',
      });
    }
  }
  return wb;
}
