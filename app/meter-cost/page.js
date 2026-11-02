import { getDepositsForFy, listPrs } from '../../lib/meterCostDb';
import { buildDepositSummary, buildPrStatus, fyStartOf, fyLabel } from '../../lib/meterCostCore';
import { StatusTable, MonthlyTable, QuarterlyTable } from './MeterCostTables';
import { CircleHqTable, IssueStatusTable } from './HqTables';
import { loadHq } from '../../lib/meterCostHqDb';
import { buildHqStatus, buildIssueStatus } from '../../lib/meterCostHq';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function currentFy() {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  return fyStartOf(ist);
}

export default async function MeterCostPage({ searchParams }) {
  const nowFy = currentFy();
  const fy = Number(searchParams?.fy) || nowFy;

  let summary = null;
  let status = null;
  let hq = null;
  let issueStatus = null;
  let error = null;
  try {
    const [deposits, prs] = await Promise.all([getDepositsForFy(fy), listPrs(fy)]);
    summary = buildDepositSummary(deposits, fy);
    let lists = { issues: [] };
    try { lists = await loadHq(fy); } catch { /* HQ tables missing */ }
    status = buildPrStatus(deposits, lists.issues || [], fy);
    try {
      hq = buildHqStatus({ deposits, reqs: lists.reqs, supplies: lists.supplies, prs, issues: lists.issues, fyStart: fy });
      issueStatus = buildIssueStatus({ prs, issues: lists.issues, fyStart: fy });
    } catch { hq = null; issueStatus = null; }
  } catch (err) {
    error = err.message;
  }

  return (
    <>
      <div className="card">
        <h1>Meter Cost Record</h1>
        <p style={{ color: "#6b7280", fontSize: 13 }}>
          New-connection and replacement smart-meter cost deposits, and the PRs raised against them.
          Financial year {fyLabel(fy)}.
        </p>
        <div className="field-row">
          {[nowFy, nowFy - 1, nowFy - 2].map((y) => (
            <a key={y} className={y === fy ? 'btn' : 'btn secondary'} href={`/meter-cost?fy=${y}`}>FY {fyLabel(y)}</a>
          ))}
        </div>
        <div className="field-row">
          <a className="btn" href="/meter-cost/upload">Upload deposit files</a>
          <a className="btn" href="/meter-cost/pr">Add / view PR</a>
          <a className="btn" href={`/meter-cost/hq?fy=${fy}`}>Issue Register, HQ requisition, supply</a>
          <a className="btn secondary" href={`/meter-cost/records?fy=${fy}`}>Records</a>
          <a className="btn secondary" href={`/api/meter-cost/export?fy=${fy}`}>Download Excel</a>
        </div>
        {error && (
          <p className="status error">
            Could not read the data: {error}. If this is the first time, run schema_meter_cost.sql in the Supabase SQL editor.
          </p>
        )}
      </div>

      {summary && (
        <>
          <div className="card">
            <h2>Deposits vs Issue</h2>
            <p style={{ color: "#6b7280", fontSize: 13 }}>
              Pending issue = deposits received but meters not yet issued (Issue Register). Advance issue = meters issued ahead of deposits.
            </p>
            <StatusTable status={status} />
          </div>
          {issueStatus && (
            <div className="card">
              <h2>PR vs Issue Register</h2>
              <p style={{ color: "#6b7280", fontSize: 13 }}>
                PR to be raised = meters issued to the ESD beyond its PRs. Yet to be issued = PRs raised but meters not issued yet.
                Issues are entered in the <a href={`/meter-cost/hq?fy=${fy}`}>Issue Register</a>.
              </p>
              <IssueStatusTable issueStatus={issueStatus} />
            </div>
          )}
          {hq && (
            <>
              <div className="card">
                <h2>Requisition to HQ vs received</h2>
                <CircleHqTable circle={hq.circle} />
              </div>
            </>
          )}
          <div className="card">
            <h2>Monthly deposits</h2>
            <MonthlyTable summary={summary} />
          </div>
          <div className="card">
            <h2>Quarterly summary</h2>
            <QuarterlyTable summary={summary} />
          </div>
        </>
      )}
    </>
  );
}
