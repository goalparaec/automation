import WatchlistManager from './WatchlistManager';
import { listWatchlists } from '../../lib/watchlistDb';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function WatchlistPage() {
  let lists = [];
  let loadError = '';
  try {
    lists = await listWatchlists();
  } catch (err) {
    console.error('Could not load watchlists', err);
    loadError = err?.message || 'Could not load the lists. Has schema_watchlist.sql been run in Supabase?';
  }

  return (
    <div>
      <h1>Consumer Watchlist</h1>
      <p style={{ color: '#6b7280', fontSize: 14, marginTop: -6 }}>
        Upload a list of consumers once, then upload each day&apos;s Billing Payment Status files to see which of
        them have made a payment and how much has been realized.
      </p>
      {loadError && (
        <div className="card">
          <pre style={{ whiteSpace: 'pre-wrap', background: '#fef2f2', padding: 10, margin: 0 }}>{loadError}</pre>
        </div>
      )}
      <WatchlistManager initialLists={lists} />
    </div>
  );
}
