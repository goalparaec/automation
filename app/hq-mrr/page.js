import { loadReportInputs, listMrrMonths } from '../../lib/hqMrrDb';
import { buildHqMrrReport, monthName, ESDS } from '../../lib/hqMrrCore';
import { SUMMARY_COLS, CATEGORY_COLS, SUMMARY_SECTIONS, CATEGORY_SECTIONS, fmtValue } from '../../lib/hqMrrColumns';
import { trimSummaryCols, trimCategoryCols, keepNonEmpty } from '../../lib/hqMrrTrim';
import { StackedTables, SummaryList } from './HqTables';
import DownloadImageButton from './DownloadImageButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const KPI = [
  ['billing_eff', 'Billing efficiency', 'pct'],
  ['collection_eff', 'Collection efficiency', 'pct'],
  ['atc_loss', 'AT&C losses', 'pct'],
  ['required_100', 'Required for 100% CE (Rs lakhs)', 'lakh'],
];

const IMG_BOX = { background: '#ffffff', padding: 12 };

export default async function HqMrrPage({ searchParams }) {
  let months = [];
  let error = null;
  try {
    months = await listMrrMonths();
  } catch (err) {
    error = err.message;
  }
  const month = /^\d{4}-\d{2}-01$/.test(searchParams?.month || '') ? searchParams.month : months[0];
  const short = searchParams?.short === '1';
  const sCols = short ? trimSummaryCols() : SUMMARY_COLS;
  const cCols = short ? trimCategoryCols() : CATEGORY_COLS;
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

  const link = (m, v) => `/hq-mrr?month=${m}&view=${v}${short ? '&short=1' : ''}`;
  const flip = (m, v) => `/hq-mrr?month=${m}&view=${v}${short ? '' : '&short=1'}`;
  const esd = report?.esds.find((e) => e.name === view);
  const tag = report ? `${report.monthLabel.replace(' ', '_')}${short ? '_Short' : ''}` : '';

  // the category table of whoever is on screen
  const owner = view === 'circle' ? report?.circle : esd;
  const catRows = owner?.categories
    ? (short ? keepNonEmpty(owner.categories.rows) : owner.categories.rows).map((r) => ({ label: `${owner.categories.rows.indexOf(r) + 1}. ${r.name}`, values: r }))
    : [];
  if (owner?.categories) catRows.push({ label: 'TOTAL', values: owner.categories.total, total: true });
  const ownerName = view === 'circle' ? 'Goalpara Circle' : `${view} ESD`;

  return (
    <>
      <div className="card">
        <h1>HQ MRR - BE / CE</h1>
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
            The IRCA MRR is not uploaded for {monthName(month)} - Billing efficiency does not include IRCA units until it is.{' '}
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
              <a className="btn" style={{ marginLeft: 'auto', background: '#0f766e' }} href={flip(month, view)}>
                {short ? 'Show full version' : 'Show short version'}
              </a>
            </div>

            {view !== 'circle' && !esd?.present && <p>No MRR file has been uploaded for {view} in {report.monthLabel}.</p>}

            {view === 'circle' && (
              <>
                <div className="field-row">
                  <DownloadImageButton targetId="img-summary" fileName={`HQ_MRR_Circle_Summary_${tag}.png`} />
                </div>
                <div id="img-summary" style={IMG_BOX}>
                  <div className="report-title">Goalpara Electrical Circle - MRR Summary{short ? ' (Short)' : ''} - {report.monthLabel}</div>
                  <StackedTables
                    lead={['ESD']}
                    cols={sCols}
                    sections={SUMMARY_SECTIONS}
                    max={11}
                    rows={[
                      ...report.esds.filter((e) => e.present).map((e) => ({ label: e.name, values: e.summary })),
                      { label: 'Goalpara Circle', values: report.circle.summary, total: true },
                    ]}
                  />
                </div>
              </>
            )}

            {esd?.present && (
              <>
                <div className="field-row">
                  {KPI.map(([k, label, f]) => (
                    <div key={k} className="card" style={{ margin: 0, padding: 12, minWidth: 150 }}>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtValue(esd.summary[k], f)}</div>
                    </div>
                  ))}
                </div>
                <div className="field-row">
                  <DownloadImageButton targetId="img-summary" fileName={`HQ_MRR_${view}_Summary_${tag}.png`} />
                </div>
                <div id="img-summary" style={IMG_BOX}>
                  <div className="report-title">{esd.name} ESD - Summary{short ? ' (Short)' : ''} - {report.monthLabel}</div>
                  <SummaryList cols={sCols} values={esd.summary} />
                </div>
              </>
            )}
          </div>

          {(view === 'circle' || esd?.present) && (
            <div className="card">
              <div className="field-row">
                <DownloadImageButton targetId="img-category" fileName={`HQ_MRR_${view === 'circle' ? 'Circle' : view}_Category_${tag}.png`} />
              </div>
              <div id="img-category" style={IMG_BOX}>
                <div className="report-title">{ownerName} - Category-wise{short ? ' (Short)' : ''} - {report.monthLabel}</div>
                <StackedTables lead={['Category']} cols={cCols} sections={CATEGORY_SECTIONS} max={10} rows={catRows} />
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
