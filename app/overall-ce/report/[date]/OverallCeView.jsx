'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toPng } from 'html-to-image';

// Column layout, the same as the CE_All sheet in the Excel report.
// kind: n = amount, p = percentage.  heat = gets the red-yellow-green scale.
// The normal version is the original layout. The "with additional columns"
// version adds Conventional Prepaid and Temporary to both sides, but each one
// is drawn in the image only when at least one ESD has a value in it (the
// Excel always carries both).
const SOLO = new Set(['grand_demand', 'grand_collection', 'overall_ce', 'grand_demand_ext', 'grand_collection_ext', 'overall_ce_ext']);
const hasValue = (rows, key) => rows.some((r) => !r.isTotal && Math.abs(Number(r[key]) || 0) > 0);

function buildLayout(rows, ext) {
  const gd = ext ? 'grand_demand_ext' : 'grand_demand';
  const gc = ext ? 'grand_collection_ext' : 'grand_collection';
  const ce = ext ? 'overall_ce_ext' : 'overall_ce';
  const conv = ext && hasValue(rows, 'conv_prepaid_amount');
  const temp = ext && hasValue(rows, 'temporary_amount');
  const dExtra = [
    ...(conv ? [['Conventional Prepaid Amount Not Reflected in ARMS', 'conv_prepaid_amount', 'n']] : []),
    ...(temp ? [['Temporary Connection Amount', 'temporary_amount', 'n']] : []),
  ];
  const cExtra = [
    ...(conv ? [['Conventional Prepaid Amount Not Reflected in ARMS', 'conv_prepaid_collection', 'n']] : []),
    ...(temp ? [['Temporary Connection Amount', 'temporary_collection', 'n']] : []),
  ];
  const cols = [
    ['Current Demand (Postpaid)', 'postpaid_current', 'n'],
    ['Arrear Demand (Postpaid)', 'postpaid_arrear', 'n'],
    ['Daily Collection (Postpaid)', 'postpaid_daily', 'n', true],
    ['Total Collection (Postpaid)', 'postpaid_total', 'n'],
    ['Coll Eff. % (Postpaid)', 'postpaid_ce', 'p', true],
    ['Current Demand (Prepaid)', 'prepaid_current', 'n'],
    ['Manual Amount Not Reflected in ARMS', 'manual_amount', 'n'],
    ['Assessment Amount', 'assessment_amount', 'n'],
    ...dExtra,
    ['Converted Current Demand', 'converted_current', 'n'],
    ['Grand Total Current Demand', gd, 'n'],
    ['Recharge of Smart Prepaid', 'recharge', 'n'],
    ['Credit Adjustment', 'credit_adjustment', 'n'],
    ['Outstanding Payment Amount', 'outstanding_payment', 'n'],
    ['Manual Amount Not Reflected in ARMS', 'manual_collection', 'n'],
    ['Assessment Amount', 'assessment_collection', 'n'],
    ...cExtra,
    ['Collection Against Converted', 'converted_collection', 'n'],
    ['Grand Total Collection (Prepaid & Postpaid)', gc, 'n'],
    ['Overall Coll Eff. %', ce, 'p', true],
  ];
  const bands = [
    ['Postpaid Demand and Collection', 5, 'grey'],
    ['Prepaid and Additional Demand', 4 + dExtra.length, 'grey'],
    ['Grand Total Current Demand', 1, 'green'],
    ['Prepaid and Additional Collection', 6 + cExtra.length, 'grey'],
    ['Grand Total Collection (Prepaid & Postpaid)', 1, 'green'],
    ['Overall Coll Eff. %', 1, 'green'],
  ];
  // The wide table is shown as two tables, one below the other: up to Grand
  // Total Current Demand, then the collection side.
  const split = cols.findIndex((c) => c[1] === gd) + 1;
  return {
    tables: [
      { bands: bands.slice(0, 3), cols: cols.slice(0, split) },
      { bands: bands.slice(3), cols: cols.slice(split) },
    ],
    heatKeys: ['postpaid_daily', 'postpaid_ce', ce],
  };
}

// Excel's 3-colour scale on the 5 sub-division rows only (totals are not
// coloured): lowest = red, middle (50th percentile) = yellow, highest = green.
const RED = [248, 105, 107];
const YELLOW = [255, 235, 132];
const GREEN = [99, 190, 123];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const heatColor = (t) => {
  const [r, g, b] = t < 0.5 ? mix(RED, YELLOW, t / 0.5) : mix(YELLOW, GREEN, (t - 0.5) / 0.5);
  return `rgb(${r}, ${g}, ${b})`;
};

function buildHeat(rows, key) {
  const data = rows.filter((r) => !r.isTotal && Number.isFinite(r[key]));
  if (data.length < 2) return {};
  const sorted = data.map((r) => r[key]).sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (min === max) return {};
  const h = (sorted.length - 1) / 2;
  const mid = (sorted[Math.floor(h)] + sorted[Math.ceil(h)]) / 2;
  const out = {};
  for (const r of data) {
    const v = r[key];
    const t = v <= mid
      ? (mid === min ? 0 : (0.5 * (v - min)) / (mid - min))
      : 0.5 + (0.5 * (v - mid)) / (max - mid);
    out[r.name] = heatColor(t);
  }
  return out;
}

const dmy = (iso) => iso.split('-').reverse().join('-');
function monthName(iso) {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function fmt(v, kind, lakhs) {
  if (v === null || v === undefined) return '-';
  if (kind === 'p') return `${(v * 100).toFixed(2)}%`;
  if (lakhs) return (v / 100000).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return Math.round(v).toLocaleString('en-IN');
}

const CSS = `
.ce-scroll { overflow-x: auto; padding-bottom: 6px; }
.ce-capture { display: inline-block; background: #fff; padding: 18px 20px; color: #111; }
.ce-title { font-size: 17px; font-weight: 700; text-align: center; line-height: 1.35; margin: 0 auto 4px; max-width: 1100px; }
.ce-sub { font-size: 13px; text-align: center; color: #374151; margin-bottom: 12px; }
.ce-warn { font-size: 13px; text-align: center; color: #b91c1c; font-weight: 600; margin: 0 auto 10px; max-width: 1100px; line-height: 1.35; }
table.ce-table { border-collapse: collapse; table-layout: fixed; font-size: 13px; border: 2px solid #222; }
.ce-table th, .ce-table td { border: 1.5px solid #222; padding: 7px 8px; }
.ce-table th { text-align: center; vertical-align: middle; font-weight: 700; line-height: 1.3; white-space: normal; overflow-wrap: break-word; }
.ce-table td { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ce-table td.l { text-align: left; font-weight: 600; }
.ce-table td.c { text-align: center; }
.ce-table .grey { background: #D6DCE4; }
.ce-table .green { background: #E2EFDA; }
.ce-table tr.ed td { font-weight: 700; background: #fff; }
.ce-table tr.ct td { font-weight: 700; background: #FCE4D6; }
.ce-table td.heat { font-weight: 700; }
`;

export default function OverallCeView({ report }) {
  const [lakhs, setLakhs] = useState(false);
  const [ext, setExt] = useState(false); // version with Conventional Prepaid + Temporary
  const [date, setDate] = useState(report.reportDate);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const ref = useRef(null);
  const router = useRouter();

  // Always show the latest stored data: re-read it when the page is opened,
  // restored from the browser's back/forward cache, or the tab is brought back.
  useEffect(() => {
    router.refresh();
    const again = () => { if (document.visibilityState === 'visible') router.refresh(); };
    const restored = (e) => { if (e.persisted) router.refresh(); };
    document.addEventListener('visibilitychange', again);
    window.addEventListener('pageshow', restored);
    return () => {
      document.removeEventListener('visibilitychange', again);
      window.removeEventListener('pageshow', restored);
    };
  }, [router]);
  const { rows, sources, missing, monthlyPresent } = report;

  const layout = useMemo(() => buildLayout(rows, ext), [rows, ext]);
  const TABLES = layout.tables;
  const heat = useMemo(() => {
    const h = {};
    for (const key of layout.heatKeys) h[key] = buildHeat(rows, key);
    return h;
  }, [rows, layout]);

  // The Excel is built from the very report shown on this page, so it always matches the image.
  async function downloadExcel() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/overall-ce/report/${report.reportDate}/excel${ext ? '?ext=1' : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not build the Excel file.');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `Overall_CE_${report.reportDate.split('-').reverse().join('.')}${ext ? '_with_additional_columns' : ''}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadImage() {
    if (!ref.current) return;
    setBusy(true);
    setErr(null);
    try {
      const node = ref.current;
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        width: node.scrollWidth,
        height: node.scrollHeight,
        skipFonts: true,
      });
      const a = document.createElement('a');
      a.download = `Overall_CE_${report.reportDate}${ext ? '_with_additional_columns' : ''}${lakhs ? '_Lakhs' : ''}.png`;
      a.href = dataUrl;
      a.click();
    } catch (e) {
      setErr(`Could not create the image: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <style>{CSS}</style>

      <div className="card">
        <div className="field-row" style={{ marginBottom: 0 }}>
          <label>Report date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn" onClick={() => { if (date) window.location.href = `/overall-ce/report/${date}`; }}>View</button>
          <label style={{ minWidth: 0 }}>
            <input type="checkbox" checked={lakhs} onChange={(e) => setLakhs(e.target.checked)} /> Show in Rs Lakhs
          </label>
          <label style={{ minWidth: 0 }}>
            <input type="checkbox" checked={ext} onChange={(e) => setExt(e.target.checked)} /> With Conventional Prepaid and Temporary columns
          </label>
          <button className="btn secondary" onClick={downloadImage} disabled={busy}>
            {busy ? 'Rendering...' : 'Download image'}
          </button>
          <button className="btn secondary" onClick={downloadExcel} disabled={busy}>Download Excel</button>
          <a className="btn secondary" href="/overall-ce">Upload</a>
        </div>
        {err && <p className="status error">{err}</p>}
      </div>

      <div className="card">
        <div className="ce-scroll">
          <div className="ce-capture" ref={ref}>
            <div className="ce-title">
              Overall Collection Efficiency of Goalpara Electrical Circle for the Month of {monthName(report.month)}
            </div>
            <div className="ce-sub">
              As on {dmy(report.reportDate)} &nbsp;|&nbsp; Amounts in {lakhs ? 'Rs Lakhs' : 'Rs'}
            </div>
            {missing.length > 0 && (
              <div className="ce-warn">
                Incomplete, not yet uploaded this month (counted as 0): {missing.join('; ')}
              </div>
            )}

            {TABLES.map((t, ti) => (
              <table key={ti} className="ce-table" style={ti > 0 ? { marginTop: 22 } : undefined}>
                <colgroup>
                  <col style={{ width: 46 }} />
                  <col style={{ width: 118 }} />
                  {t.cols.map(([, key]) => (
                    <col key={key} style={{ width: lakhs ? 108 : 118 }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th rowSpan={2} className="green">Sl No</th>
                    <th rowSpan={2} className="green">Sub-Division</th>
                    {t.bands.map(([label, span, tone]) =>
                      span === 1 ? (
                        <th key={label} rowSpan={2} className={tone}>{label}</th>
                      ) : (
                        <th key={label} colSpan={span} className={tone}>{label}</th>
                      )
                    )}
                  </tr>
                  <tr>
                    {t.cols.filter(([, key]) => !SOLO.has(key)).map(([h, key]) => (
                      <th key={key} className="green">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.name} className={r.name === 'Goalpara ED' ? 'ed' : r.name === 'Circle Total' ? 'ct' : undefined}>
                      {r.isTotal ? (
                        <td colSpan={2} className="c">{r.name}</td>
                      ) : (
                        <>
                          <td className="c">{r.sl_no}</td>
                          <td className="l">{r.name}</td>
                        </>
                      )}
                      {t.cols.map(([, key, kind, isHeat]) => (
                        <td
                          key={key}
                          className={isHeat ? 'heat' : undefined}
                          style={isHeat && heat[key]?.[r.name] ? { backgroundColor: heat[key][r.name] } : undefined}
                        >
                          {fmt(r[key], kind, lakhs)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

          </div>
        </div>
      </div>

      <div className="card" style={{ background: '#f8fafc' }}>
        <h2 style={{ marginTop: 0 }}>Data used for this report</h2>
        <div className="table-scroll">
          <table className="report-table" style={{ fontSize: 13 }}>
            <thead>
              <tr><th>Input</th><th>Data from</th><th>Status</th><th>Source</th></tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.key}>
                  <td>{s.label}</td>
                  <td style={{ textAlign: 'center' }}>{s.effectiveDate ? dmy(s.effectiveDate) : '-'}</td>
                  <td style={{ textAlign: 'left', color: !s.present ? '#b91c1c' : s.isCarriedForward ? '#b45309' : '#15803d' }}>
                    {!s.present ? 'Not uploaded this month (counted as 0)' : s.isCarriedForward ? 'Carried forward from earlier this month' : 'Uploaded for this date'}
                  </td>
                  <td style={{ textAlign: 'left' }}>{s.source}</td>
                </tr>
              ))}
              <tr>
                <td>Monthly inputs (manual / assessment)</td>
                <td style={{ textAlign: 'center' }}>{monthName(report.month)}</td>
                <td style={{ textAlign: 'left', color: monthlyPresent ? '#15803d' : '#b91c1c' }}>
                  {monthlyPresent ? 'Entered for this month' : 'Not entered this month (counted as 0)'}
                </td>
                <td style={{ textAlign: 'left' }}><a href={`/overall-ce/monthly?month=${report.month.slice(0, 7)}`}>Edit</a></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
