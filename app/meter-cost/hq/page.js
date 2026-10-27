import LedgerManager from './LedgerManager';
import { getDepositsForFy, listPrs } from '../../../lib/meterCostDb';
import { loadHq } from '../../../lib/meterCostHqDb';
import { buildHqStatus } from '../../../lib/meterCostHq';
import { fyStartOf, fyLabel } from '../../../lib/meterCostCore';
import { CircleHqTable, RequisitionTable } from '../HqTables';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HqPage({ searchParams }) {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const fy = Number(searchParams?.fy) || fyStartOf(ist);
  let data = null;
  let hq = null;
  let error = null;
  try {
    const [deposits, lists, prs] = await Promise.all([getDepositsForFy(fy), loadHq(fy), listPrs(fy)]);
    data = lists;
    hq = buildHqStatus({ deposits, ...lists, prs, fyStart: fy });
  } catch (err) {
    error = err.message;
  }
  const label = fyLabel(fy);
  const reqNumbers = data ? [...new Set(data.reqs.map((r) => r.req_no))] : [];
  return (
    <>
      <div className="card">
        <h1>HQ requisition, supply and issue</h1>
        <p style={{ color: '#6b7280', fontSize: 13 }}>Financial year {label}. Meters issued to ESDs are the PRs entered under Add / view PR.</p>
        <div className="field-row">
          <a className="btn secondary" href="/meter-cost">Back</a>
          <a className="btn secondary" href="/meter-cost/pr">Add / view PR</a>
          <a className="btn secondary" href={`/api/meter-cost/export?fy=${fy}`}>Download Excel</a>
        </div>
        {error && (
          <p className="status error">Could not read the data: {error}. If this is the first time, run schema_meter_cost_hq.sql in the Supabase SQL editor.</p>
        )}
      </div>

      {hq && (
        <>
          <div className="card">
            <h2>Requisition to HQ vs received</h2>
            <CircleHqTable circle={hq.circle} />
          </div>
          <div className="card">
            <h2>Each requisition</h2>
            <RequisitionTable hq={hq} />
          </div>
          <LedgerManager type="req" rows={data.reqs} today={ist} fyLabel={label} />
          <LedgerManager type="supply" rows={data.supplies} today={ist} fyLabel={label} reqNumbers={reqNumbers} />
        </>
      )}
    </>
  );
}
