import { getOverallCE } from '../../../../lib/overallCeDb.js';
import OverallCeView from './OverallCeView.jsx';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function OverallCeReportPage({ params }) {
  const { date } = params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return (
      <div className="card">
        <h1>Overall CE</h1>
        <p className="status error">&quot;{date}&quot; is not a valid date (use YYYY-MM-DD).</p>
      </div>
    );
  }

  let report;
  try {
    report = await getOverallCE(date);
  } catch (err) {
    return (
      <div className="card">
        <h1>Overall CE for {date}</h1>
        <p className="status error">Could not load this report: {err.message}</p>
        <p>If this is the first time, run <code>schema_overall_ce.sql</code> in the Supabase SQL editor.</p>
      </div>
    );
  }
  return <OverallCeView report={report} />;
}
