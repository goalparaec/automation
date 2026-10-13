import PrepaidRecoveryUpload from './PrepaidRecoveryUpload';
import { listAvailableDates } from '../../lib/prepaidRecoveryDb';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PrepaidRecoveryPage() {
  let dates = [];
  try {
    dates = await listAvailableDates();
  } catch (err) {
    console.error('Could not list Prepaid Reports dates', err);
  }

  return (
    <div>
      <h1>Prepaid Reports</h1>
      <PrepaidRecoveryUpload />

      {dates.length > 0 && (
        <div className="card">
          <h2>Previous reports</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {dates.map((d) => (
              <a key={d} href={`/prepaid-recovery/report/${d}`}>{d}</a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
