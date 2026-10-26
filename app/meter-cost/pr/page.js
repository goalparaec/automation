import PrManager from './PrManager';
import { getDepositsForFy, listPrs } from '../../../lib/meterCostDb';
import { buildPrStatus, fyStartOf, fyLabel } from '../../../lib/meterCostCore';
import { StatusTable } from '../MeterCostTables';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PrPage({ searchParams }) {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const fy = Number(searchParams?.fy) || fyStartOf(ist);
  let prs = [];
  let status = null;
  let error = null;
  try {
    const [deposits, list] = await Promise.all([getDepositsForFy(fy), listPrs(fy)]);
    prs = list;
    status = buildPrStatus(deposits, list, fy);
  } catch (err) {
    error = err.message;
  }
  return (
    <>
      <PrManager prs={prs} today={ist} fyLabel={fyLabel(fy)} />
      {error && <div className="card"><p className="status error">Could not read the data: {error}</p></div>}
      {status && (
        <div className="card">
          <h2>Deposits vs PR - FY {fyLabel(fy)}</h2>
          <p style={{ color: '#6b7280', fontSize: 13 }}>
            Updates automatically every time a PR or a deposit file is added.
          </p>
          <StatusTable status={status} />
        </div>
      )}
    </>
  );
}
