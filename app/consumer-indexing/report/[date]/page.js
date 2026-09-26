import { getConsumerIndexingSummary } from '../../../../lib/consumerIndexingDb.js';
import ConsumerIndexingView from './ConsumerIndexingView.jsx';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ConsumerIndexingReportPage({ params }) {
  const { date } = params;
  let rows = [];
  let error = null;

  try {
    rows = await getConsumerIndexingSummary(date);
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

  if (rows.length === 0) {
    return (
      <div className="card">
        <h1>Consumer Indexing Report — {date}</h1>
        <p>No data has been uploaded for this date yet.</p>
        <a className="btn" href="/consumer-indexing">Upload files</a>
      </div>
    );
  }

  return <ConsumerIndexingView reportDate={date} rows={rows} />;
}
