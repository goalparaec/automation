import { NextResponse } from 'next/server';

/** "2026-10-12" -> "12.10.2026" for file names. */
export function dmy(date) {
  const m = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(date);
}

export async function xlsxResponse(wb, fileName) {
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

export function xlsxError(err, fallback = 'Could not build the Excel file.') {
  console.error(fallback, err);
  return NextResponse.json({ error: err?.message || fallback }, { status: 500 });
}
