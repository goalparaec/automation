import { getCheck, getChecksForList } from '../../../../../../lib/watchlistDb';
import { getEsdMap } from '../../../../../../lib/prepaidRecoveryDb';
import { buildWatchlistWorkbook } from '../../../../../../lib/watchlistExcelExport';
import { xlsxResponse, xlsxError, dmy } from '../../../../../../lib/xlsxResponse';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 60;

export async function GET(request, { params }) {
  const { listId, date } = params;
  try {
    const [check, checks, esdMap] = await Promise.all([getCheck(listId, date), getChecksForList(listId), getEsdMap()]);
    if (!check || !check.header) {
      return new Response(JSON.stringify({ error: 'No check has been saved for this list and date.' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }
    const wb = await buildWatchlistWorkbook({
      list: check.list, reportDate: date, rows: check.rows, checks, esdMap,
      asOnDate: check.asOnDate || date, criteria: check.list.criteria_text || '',
    });
    const safeName = String(check.list.name).replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'List';
    return xlsxResponse(wb, `Watchlist-${safeName}-${dmy(date)}.xlsx`);
  } catch (err) {
    return xlsxError(err);
  }
}
