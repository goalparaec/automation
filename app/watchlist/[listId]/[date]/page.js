import WatchlistView from './WatchlistView';
import { getCheck, getChecksForList } from '../../../../lib/watchlistDb';
import { getEsdMap } from '../../../../lib/prepaidRecoveryDb';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function Message({ title, children }) {
  return (
    <div className="card">
      <h1>{title}</h1>
      {children}
      <a href="/watchlist">← Back to Consumer Watchlist</a>
    </div>
  );
}

export default async function WatchlistReportPage({ params }) {
  const { listId, date } = params;
  let check; let checks; let esdMap;
  try {
    [check, checks, esdMap] = await Promise.all([getCheck(listId, date), getChecksForList(listId), getEsdMap()]);
  } catch (err) {
    console.error('Watchlist report load failed', err);
    return (
      <Message title={`Consumer Watchlist — ${date}`}>
        <p>This report could not be loaded.</p>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#fef2f2', padding: 10 }}>{err?.message || JSON.stringify(err)}</pre>
      </Message>
    );
  }
  if (!check) return <Message title="Consumer Watchlist"><p>This list does not exist (it may have been deleted).</p></Message>;
  if (!check.header) {
    return (
      <Message title={`${check.list.name} — ${date}`}>
        <p>No daily check has been saved for this date yet.</p>
      </Message>
    );
  }

  return (
    <WatchlistView
      list={{ id: check.list.id, name: check.list.name }}
      reportDate={date}
      asOnDate={check.asOnDate || date}
      criteria={check.list.criteria_text || ''}
      header={{
        stale_warning: check.header.stale_warning, file_names: check.header.file_names,
        rows_in_files: check.header.rows_in_files, uploaded_at: check.header.uploaded_at,
      }}
      rows={check.rows}
      checks={checks.map((c) => ({
        report_date: String(c.report_date).slice(0, 10), listed: c.listed, in_file: c.in_file, not_in_file: c.not_in_file,
        paid_count: c.paid_count, paid_amount: c.paid_amount, cum_count: c.cum_count, cum_amount: c.cum_amount,
      }))}
      esdMap={esdMap}
    />
  );
}
