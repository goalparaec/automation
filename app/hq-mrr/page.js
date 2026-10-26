import { loadReportInputs, listMrrMonths } from '../../lib/hqMrrDb';
import { buildHqMrrReport, monthName, ESDS } from '../../lib/hqMrrCore';
import { SUMMARY_COLS, CATEGORY_COLS, fmtValue } from '../../lib/hqMrrColumns';
import { WideTable, SummaryList } from './HqTables';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const KPI = [
  ['billing_eff', 'Billing efficiency', 'pct'],
  ['collection_eff', 'Collection efficiency', 'pct'],
  ['atc_loss', 'AT&C losses', 'pct'],
  ['required_100', 'Required for 100% CE (Rs lakhs)', 'lakh'],
];

export default async function HqMrrPage({ searchParams }) {
  let months = [];
  let error = null;
  try {
    months = await listMrrMonths();
  } catch (err) {
    error = err.message;
  }
  const month = /^\d{4}-\d{2}-01$/.test(searchParams?.month || '') ? searchParams.month : months[0];
  const view = [...ESDS, 'circle'].includes(searchParams?.view) ? searchParams.view : 'circle';

  let report = null;
  if (month && !error) {
    try {
      const inputs = await loadReportInputs(month);
      report = buildHqMrrReport({ month, ...inputs });
    } catch (err) {
      error = err.message;
    }
  }

  const link = (m, v) => `/hq-mrr?month=${m}&view=${v}`;
  const esd = report?.esds.find((e) => e.name === view);

  return (
    <>
      <div className="card">
        <h1>HQ MRR - BE / CE</h1>
        <p style={{ color: '#6b7280', fontSize: 13 }}>
          Built from the category-wise commercial MRR of each ESD, the same way HQ prepares its circle report.
          Energy injection comes from the Monthly Inputs page.
        </p>
        <div className="field-row">
          <a className="btn" href={`/hq-mrr/upload${month ? `?month=${month.slice(0, 7)}` : ''}`}>Upload MRR files</a>
          {report?.circle && <a className="btn secondary" href={`/api/hq-mrr/excel?month=${month}`}>Download Excel</a>}
        </div>
        {months.length > 0 && (
          <div className="field-row">
            {months.slice(0, 12).map((m) => (
              <a key={m} className={m === month ? 'btn' : 'btn secondary'} href={link(m, view)}>{monthName(m)}</a>
            ))}
          </div>
        )}
        {error && (
          <p className="status error">
            Could not read the data: {error}. If this is the first time, run schema_hq_mrr.sql in the Supabase SQL editor.
          </p>
        )}
        {!error && months.length === 0 && <p>No MRR has been uploaded yet.</p>}
        {report && report.missingFiles.length > 0 && (
          <p className="status error">Not uploaded yet for {monthName(month)}: {report.missingFiles.join(', ')}. The circle total covers only the ESDs shown.</p>
        )}
        {report && !report.ircaLoaded && (
          <p className="status error">
            The IRCA MRR is not uploaded for {monthName(month)} - Billing efficiency below does not include IRCA units until it is.{' '}
            <a href={`/hq-mrr/upload?month=${month.slice(0, 7)}`}>Upload it</a>.
          </p>
        )}
        {report && report.missingInjection.length > 0 && (
          <p className="status error">
            Energy injection is missing for {report.missingInjection.join(', ')} - Billing efficiency is blank until it is entered on the{' '}
            <a href="/manual-inputs">Monthly Inputs</a> page.
          </p>
        )}
      </div>

      {report?.circle && (
        <>
          <div className="card">
            <div className="field-row">
              <a className={view === 'circle' ? 'btn' : 'btn secondary'} href={link(month, 'circle')}>Circle</a>
              {ESDS.map((n) => (
                <a key={n} className={view === n ? 'btn' : 'btn secondary'} href={link(month, n)}>{n}</a>
              ))}
            </div>

            {view === 'circle' && (
              <>
                <div className="report-title">Goalpara Electrical Circle - {report.monthLabel}</div>
                <WideTable
                  lead={['ESD']}
                  cols={SUMMARY_COLS}
                  rows={[
                    ...report.esds.filter((e) => e.present).map((e) => ({ label: e.name, values: e.summary })),
                    { label: 'Goalpara Circle', values: report.circle.summary, total: true },
                  ]}
                />
                <p style={{ color: '#6b7280', fontSize: 12 }}>
                  Amounts in Rs lakhs, energy in MU. Required for 100% CE = Current demand - Grand total collection (negative = already above 100%).
                </p>
              </>
            )}

            {view !== 'circle' && !esd?.present && <p>No MRR file has been uploaded for {view} in {report.monthLabel}.</p>}
            {esd?.present && (
              <>
                <div className="report-title">{esd.name} ESD - {report.monthLabel}</div>
                <div className="field-row">
                  {KPI.map(([k, label, f]) => (
                    <div key={k} className="card" style={{ margin: 0, padding: 12, minWidth: 150 }}>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtValue(esd.summary[k], f)}</div>
                    </div>
                  ))}
                </div>
                <h2>Summary</h2>
                <SummaryList cols={SUMMARY_COLS} values={esd.summary} />
              </>
            )}
          </div>

          <div className="card">
            <div className="report-title">
              Category-wise - {view === 'circle' ? 'Goalpara Circle' : `${view} ESD`} - {report.monthLabel}
            </div>
            {(view === 'circle' || esd?.present) && (
              <WideTable
                lead={['Category']}
                cols={CATEGORY_COLS}
                rows={[
                  ...(view === 'circle' ? report.circle.categories : esd.categories).rows.map((r, i) => ({ label: `${i + 1}. ${r.name}`, values: r })),
                  { label: 'TOTAL', values: (view === 'circle' ? report.circle.categories : esd.categories).total, total: true },
                ]}
              />
            )}
          </div>
        </>
      )}
    </>
  );
}
