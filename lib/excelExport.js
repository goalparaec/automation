import ExcelJS from 'exceljs';

const PCT = '0.00%';
const NUM = '#,##0';
const NUM2 = '#,##0.000';

function styleHeader(row) {
  row.font = { bold: true };
  row.alignment = { vertical: 'middle', horizontal: 'center' };
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
    cell.border = { bottom: { style: 'thin' } };
  });
}

export async function buildReportWorkbook(report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GpEC Daily Report App';
  wb.created = new Date();

  // ---- BE_(Cons) ----
  const beConsSheet = wb.addWorksheet('BE_(Cons)');
  beConsSheet.columns = [
    { header: 'Sub-Division', key: 'sub_division', width: 16 },
    { header: 'Total Consumers', key: 'total_consumers', width: 16 },
    { header: 'Total Billable Consumers', key: 'total_billable_consumers', width: 20 },
    { header: 'Total Billed Consumers', key: 'total_billed_consumers', width: 18 },
    { header: 'Total Ghost Consumers', key: 'total_ghost_consumers', width: 18 },
    { header: 'Billing %', key: 'billing_pct', width: 12 },
    { header: 'Total Unbilled', key: 'total_unbilled', width: 14 },
  ];
  styleHeader(beConsSheet.getRow(1));
  for (const r of report.beCons) {
    const row = beConsSheet.addRow(r);
    row.getCell('billing_pct').numFmt = PCT;
    ['total_consumers', 'total_billable_consumers', 'total_billed_consumers', 'total_ghost_consumers', 'total_unbilled']
      .forEach((k) => (row.getCell(k).numFmt = NUM));
    if (r.sub_division === 'Circle Total' || r.sub_division === 'Goalpara ED') row.font = { bold: true };
  }

  // ---- BE ----
  const beSheet = wb.addWorksheet('BE');
  beSheet.columns = [
    { header: 'Sub-Division', key: 'sub_division', width: 16 },
    { header: 'MU Injection', key: 'mu_injection', width: 14 },
    { header: 'MUB S/D', key: 'mub_sd', width: 12 },
    { header: 'MUB IRCA', key: 'mub_irca', width: 12 },
    { header: 'MUB Converted', key: 'mub_converted', width: 14 },
    { header: 'MUB Prepaid', key: 'mub_prepaid', width: 12 },
    { header: 'Total MUB', key: 'total_mub', width: 12 },
    { header: 'BE Target', key: 'be_target', width: 12 },
    { header: 'MU To Be Billed', key: 'mu_to_be_billed', width: 16 },
    { header: 'BE (incl. IRCA)', key: 'be_incl_irca', width: 14 },
    { header: 'BE (excl. IRCA)', key: 'be_excl_irca', width: 14 },
  ];
  styleHeader(beSheet.getRow(1));
  for (const r of report.be) {
    const row = beSheet.addRow(r);
    ['mu_injection', 'mub_sd', 'mub_irca', 'mub_converted', 'mub_prepaid', 'total_mub', 'mu_to_be_billed']
      .forEach((k) => (row.getCell(k).numFmt = NUM2));
    ['be_target', 'be_incl_irca', 'be_excl_irca'].forEach((k) => (row.getCell(k).numFmt = PCT));
    if (r.sub_division === 'Circle Total' || r.sub_division === 'Goalpara ED') row.font = { bold: true };
  }

  // ---- CE_Postpaid ----
  const ceSheet = wb.addWorksheet('CE_Postpaid');
  ceSheet.columns = [
    { header: 'Sub-Division', key: 'sub_division', width: 16 },
    { header: 'Current Demand', key: 'current_demand', width: 16 },
    { header: 'Arrear Demand', key: 'arrear_demand', width: 16 },
    { header: 'Arrear Collection', key: 'arrear_collection', width: 16 },
    { header: 'Daily Collection', key: 'daily_collection', width: 16 },
    { header: 'Total Collection', key: 'total_collection', width: 16 },
    { header: 'Collection Eff. %', key: 'coll_eff_pct', width: 16 },
    { header: 'Remaining Amount', key: 'remaining_amount', width: 16 },
  ];
  styleHeader(ceSheet.getRow(1));
  for (const r of report.cePostpaid) {
    const row = ceSheet.addRow(r);
    row.getCell('coll_eff_pct').numFmt = PCT;
    ['current_demand', 'arrear_demand', 'arrear_collection', 'daily_collection', 'total_collection', 'remaining_amount']
      .forEach((k) => (row.getCell(k).numFmt = NUM));
    if (r.sub_division === 'Circle Total' || r.sub_division === 'Goalpara ED') row.font = { bold: true };
  }

  // ---- CEO_Sir (text) ----
  const ceoSheet = wb.addWorksheet('CEO_Sir');
  ceoSheet.getColumn(1).width = 100;
  ceoSheet.getCell('A1').value = report.ceoSir?.message_text ?? 'No data generated for this date yet.';
  ceoSheet.getCell('A1').alignment = { wrapText: true, vertical: 'top' };

  return wb;
}
