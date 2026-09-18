import { getReportForDate } from '../../../lib/db.js';
import ReportView from './ReportView.jsx';

// Without this, Next.js can cache this page's data indefinitely and keep
// serving whatever it first fetched - meaning corrections made in Supabase
// after that point would silently never show up here. This forces a fresh
// fetch on every single visit.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ReportPage({ params }) {
  const { date } = params;
  let report;
  let error = null;

  try {
    report = await getReportForDate(date);
  } catch (err) {
    error = err.message;
  }

  if (error) {
    return (
      <div className="card">
        <h1>Report for {date}</h1>
        <p className="status error">Could not load this report: {error}</p>
      </div>
    );
  }

  const hasData = report.beCons.length > 0 || report.be.length > 0 || report.cePostpaid.length > 0;

  if (!hasData) {
    return (
      <div className="card">
        <h1>Report for {date}</h1>
        <p>No data has been uploaded for this date yet.</p>
        <a className="btn" href="/upload">Upload workbook</a>
      </div>
    );
  }

  return <ReportView report={report} />;
}
