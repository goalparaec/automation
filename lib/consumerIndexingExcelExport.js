import ExcelJS from 'exceljs';

const PCT = '0.00%';
const NUM = '#,##0';

function styleHeader(row) {
  row.font = { bold: true };
  row.alignment = { vertical: 'middle', horizontal: 'center' };
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
    cell.border = { bottom: { style: 'thin' } };
  });
}

export async function buildConsumerIndexingWorkbook(reportDate, rows) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Goalpara Circle Reporting System';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Consumer Indexing');
  sheet.columns = [
    { header: 'Sub-Division', key: 'esd_name', width: 16 },
    { header: 'Total DTRs', key: 'total_dtrs', width: 12 },
    { header: 'Indexed DTRs', key: 'indexed_dtrs', width: 13 },
    { header: 'Total Consumers', key: 'total_consumers', width: 16 },
    { header: 'Indexed Consumers', key: 'indexed_consumers', width: 16 },
    { header: 'Consumer Indexing %', key: 'indexing_pct', width: 16 },
    { header: 'Total Indexed DTRs with Zero Consumer', key: 'indexed_dtrs_zero_consumers', width: 26 },
  ];
  styleHeader(sheet.getRow(1));

  for (const r of rows) {
    const row = sheet.addRow(r);
    row.getCell('indexing_pct').numFmt = PCT;
    ['total_dtrs', 'indexed_dtrs', 'total_consumers', 'indexed_consumers', 'indexed_dtrs_zero_consumers']
      .forEach((k) => (row.getCell(k).numFmt = NUM));
    if (r.esd_name === 'Circle Total') row.font = { bold: true };
  }

  sheet.getCell(`A${sheet.rowCount + 2}`).value = `Report date: ${reportDate}`;

  return wb;
}
