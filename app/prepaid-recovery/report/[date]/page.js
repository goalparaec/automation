import PrepaidRecoveryView from './PrepaidRecoveryView';
import { buildStillUnpaidTracker } from '../../../../lib/prepaidRecoveryCore';
import {
  getSummaryForDate, getPaymentsForDate, getCallListForDate, getExcludedForDate, getEsdMap,
  getPreviousReportDate, getCallListKeysForDate,
} from '../../../../lib/prepaidRecoveryDb';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function ErrorCard({ date, message }) {
  return (
    <div className="card">
      <h1>Prepaid Recovery — {date}</h1>
      <p>This report could not be loaded.</p>
      <pre style={{ whiteSpace: 'pre-wrap', background: '#fef2f2', padding: 10 }}>{message}</pre>
      <a href="/prepaid-recovery">← Back to upload page</a>
    </div>
  );
}

export default async function PrepaidRecoveryReportPage({ params }) {
  const { date } = params;
  let summaryRows; let paymentsRows; let callListRows; let excludedRows; let esdMap;
  try {
    [summaryRows, paymentsRows, callListRows, excludedRows, esdMap] = await Promise.all([
      getSummaryForDate(date),
      getPaymentsForDate(date),
      getCallListForDate(date),
      getExcludedForDate(date),
      getEsdMap(),
    ]);
  } catch (err) {
    console.error('Prepaid report load failed', err);
    return <ErrorCard date={date} message={err?.message || JSON.stringify(err)} />;
  }

  if (!summaryRows || summaryRows.length === 0) {
    return (
      <div className="card">
        <h1>Prepaid Recovery — {date}</h1>
        <p>No report has been uploaded for this date yet.</p>
        <a href="/prepaid-recovery">← Back to upload page</a>
      </div>
    );
  }

  let previousDate = null;
  let stillUnpaidTracker = [];
  try {
    previousDate = await getPreviousReportDate(date);
    if (previousDate) {
      // Reuse the rows already loaded for today instead of fetching them again.
      const currentCallKeys = callListRows.map((r) => ({
        consumerNo: r.consumer_no, esdCode: r.esd_code, consumerName: r.consumer_name, balance: r.balance, band: r.band,
      }));
      const currentPaymentKeys = paymentsRows.map((r) => ({ consumerNo: r.consumer_no, esdCode: r.esd_code }));
      const previousCallList = await getCallListKeysForDate(previousDate);
      stillUnpaidTracker = buildStillUnpaidTracker(previousCallList, currentCallKeys, currentPaymentKeys);
    }
  } catch (err) {
    console.error('Still-unpaid tracker failed', err);
    previousDate = null; // tracker tab shows its "nothing to compare" message instead of crashing the page
  }

  return (
    <PrepaidRecoveryView
      reportDate={date}
      summaryRows={summaryRows}
      paymentsRows={paymentsRows}
      callListRows={callListRows}
      excludedRows={excludedRows}
      esdMap={esdMap}
      previousDate={previousDate}
      stillUnpaidTracker={stillUnpaidTracker}
    />
  );
}
