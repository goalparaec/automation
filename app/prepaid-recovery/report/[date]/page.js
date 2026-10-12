import PrepaidRecoveryView from './PrepaidRecoveryView';
import { buildStillUnpaidTracker } from '../../../../lib/prepaidRecoveryCore';
import {
  getSummaryForDate, getPaymentsForDate, getCallListForDate, getExcludedForDate, getEsdMap,
  getPreviousReportDate, getCallListKeysForDate, getPaymentsKeysForDate,
} from '../../../../lib/prepaidRecoveryDb';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PrepaidRecoveryReportPage({ params }) {
  const { date } = params;
  const [summaryRows, paymentsRows, callListRows, excludedRows, esdMap] = await Promise.all([
    getSummaryForDate(date),
    getPaymentsForDate(date),
    getCallListForDate(date),
    getExcludedForDate(date),
    getEsdMap(),
  ]);

  if (!summaryRows || summaryRows.length === 0) {
    return (
      <div className="card">
        <h1>Prepaid Recovery — {date}</h1>
        <p>No report has been uploaded for this date yet.</p>
        <a href="/prepaid-recovery">← Back to upload page</a>
      </div>
    );
  }

  const previousDate = await getPreviousReportDate(date);
  let stillUnpaidTracker = [];
  if (previousDate) {
    const [previousCallList, currentCallKeys, currentPaymentKeys] = await Promise.all([
      getCallListKeysForDate(previousDate),
      getCallListKeysForDate(date),
      getPaymentsKeysForDate(date),
    ]);
    stillUnpaidTracker = buildStillUnpaidTracker(previousCallList, currentCallKeys, currentPaymentKeys);
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
