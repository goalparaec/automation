import { getConsumerIndexingSummary, getUploadedEsdCoverage } from '../../../../lib/consumerIndexingDb.js';
import ConsumerIndexingView from './ConsumerIndexingView.jsx';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ConsumerIndexingReportPage({ params }) {
  const { date } = params;
  let coverage;
  let error = null;

  try {
    coverage = await getUploadedEsdCoverage(date);
  } catch (err) {
    error = err.message;
  }

  if (error) {
    return (
      <div className="card">
        <h1>Consumer Indexing Report — {date}</h1>
        <p className="status error">Could not load this report: {error}</p>
      </div>
    );
  }

  if (!coverage.isComplete) {
    return (
      <div className="card">
        <h1>Consumer Indexing Report — {date}</h1>
        <p>
          This report isn't ready yet - only {coverage.covered.length} of 5 ESDs
          have been uploaded for this date. Still waiting on:{' '}
          <strong>{coverage.missing.join(', ')}</strong>.
        </p>
        <p>The report becomes available automatically once all 5 are in for this same date.</p>
        <a className="btn" href="/consumer-indexing">Go to upload page</a>
      </div>
    );
  }

  let rows = [];
  try {
    rows = await getConsumerIndexingSummary(date);
  } catch (err) {
    return (
      <div className="card">
        <h1>Consumer Indexing Report — {date}</h1>
        <p className="status error">Could not load this report: {err.message}</p>
      </div>
    );
  }

  return <ConsumerIndexingView reportDate={date} rows={rows} lastUpdated={coverage.lastUpdated} />;
}
