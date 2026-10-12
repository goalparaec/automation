import PrepaidRecoveryView from './PrepaidRecoveryView';
import {
  getSummaryForDate, getPaymentsForDate, getCallListForDate, getEsdMap,
} from '../../../../lib/prepaidRecoveryDb';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PrepaidRecoveryReportPage({ params }) {
  const { date } = params;
  const [summaryRows, paymentsRows, callListRows, esdMap] = await Promise.all([
    getSummaryForDate(date),
    getPaymentsForDate(date),
    getCallListForDate(date),
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

  return (
    <PrepaidRecoveryView
      reportDate={date}
      summaryRows={summaryRows}
      paymentsRows={paymentsRows}
      callListRows={callListRows}
      esdMap={esdMap}
    />
  );
}
