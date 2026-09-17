'use client';

import { useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';

function pct(v) {
  if (v === null || v === undefined) return '-';
  return `${(Number(v) * 100).toFixed(2)}%`;
}
function num(v, digits = 0) {
  if (v === null || v === undefined) return '-';
  return Number(v).toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
function toDMY(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

// Excel-style red -> yellow -> green 3-stop scale.
const RED = [248, 105, 107];
const YELLOW = [255, 235, 132];
const GREEN = [99, 190, 123];

function mix(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}
function heatColor(t) {
  const [r, g, b] = t < 0.5 ? mix(RED, YELLOW, t / 0.5) : mix(YELLOW, GREEN, (t - 0.5) / 0.5);
  return `rgb(${r}, ${g}, ${b})`;
}

function buildHeatMap(rows, field, higherIsBetter) {
  const dataRows = rows.filter((r) => r.sub_division !== 'Circle Total' && r.sub_division !== 'Goalpara ED');
  const values = dataRows.map((r) => Number(r[field])).filter((v) => Number.isFinite(v));
  if (values.length < 2) return {};

  const min = Math.min(...values);
  const max = Math.max(...values);
  const map = {};
  for (const r of dataRows) {
    const v = Number(r[field]);
    if (!Number.isFinite(v) || min === max) continue;
    let t = (v - min) / (max - min);
    if (!higherIsBetter) t = 1 - t;
    map[r.sub_division] = heatColor(t);
  }
  return map;
}

function heatStyle(colorMap, subDivision) {
  const bg = colorMap[subDivision];
  if (!bg) return undefined;
  return { backgroundColor: bg, color: '#1a1a1a', fontWeight: 700 };
}

function isTotalRow(subDivision) {
  return subDivision === 'Circle Total' || subDivision === 'Goalpara ED';
}

// Renders the leading "Sl No" + "Sub-Division" pair of cells. For a normal
// data row that's two separate cells; for a totals row ("Goalpara ED" /
// "Circle Total") the Sl No cell would otherwise sit empty, so instead the
// two are rendered as one merged, centered cell spanning both columns.
function LabelCells({ subDivision, index }) {
  if (isTotalRow(subDivision)) {
    return <td colSpan={2} className="merged-total-label">{subDivision}</td>;
  }
  return (
    <>
      <td>{index + 1}</td>
      <td className="subdiv-cell">{subDivision}</td>
    </>
  );
}

function ExportableTable({ id, title, children }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);

  async function downloadImage() {
    if (!ref.current) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(ref.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.download = `${id}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div ref={ref} style={{ background: '#fff', padding: 8 }}>
        <div className="report-title">{title}</div>
        <div className="table-scroll">{children}</div>
      </div>
      <div style={{ marginTop: 10, textAlign: 'right' }}>
        <button className="btn secondary" onClick={downloadImage} disabled={busy}>
          {busy ? 'Rendering...' : 'Download image'}
        </button>
      </div>
    </div>
  );
}

export default function ReportView({ report }) {
  const { reportDate, beCons, be, cePostpaid, ceoSir } = report;
  const dmy = toDMY(reportDate);

  const beConsHeat = useMemo(() => buildHeatMap(beCons, 'billing_pct', true), [beCons]);

  const beHeat = useMemo(
    () => ({
      be_incl_irca: buildHeatMap(be, 'be_incl_irca', true),
      be_excl_irca: buildHeatMap(be, 'be_excl_irca', true),
      mu_to_be_billed: buildHeatMap(be, 'mu_to_be_billed', false),
    }),
    [be]
  );

  const ceHeat = useMemo(
    () => ({
      daily_collection: buildHeatMap(cePostpaid, 'daily_collection', true),
      coll_eff_pct: buildHeatMap(cePostpaid, 'coll_eff_pct', true),
      remaining_amount: buildHeatMap(cePostpaid, 'remaining_amount', false),
    }),
    [cePostpaid]
  );

  return (
    <div>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>GpEC Daily Report — {dmy}</h1>
        <a className="btn" href={`/api/reports/${reportDate}/excel`}>Download Excel (all sheets)</a>
      </div>

      <ExportableTable id={`CE_Postpaid_${reportDate}`} title={`COLLECTION of Goalpara Electrical Circle -  ${dmy}`}>
        <table className="report-table">
          <thead>
            <tr>
              <th>Sl No</th><th>Sub-Division</th><th>Current Demand<br/>(Postpaid)</th>
              <th>Arrear Demand<br/>(Postpaid)</th><th>Arrear Collection<br/>(Postpaid)</th>
              <th>Daily Collection<br/>(Postpaid)</th><th>Total Collection<br/>(Postpaid)</th>
              <th>Coll Eff. %<br/>(Postpaid)</th><th>Remaining Amount for<br/>100% CE (Postpaid)</th>
            </tr>
          </thead>
          <tbody>
            {cePostpaid.map((r, i) => (
              <tr key={r.sub_division} className={isTotalRow(r.sub_division) ? 'total-row' : ''}>
                <LabelCells subDivision={r.sub_division} index={i} />
                <td>₹{num(r.current_demand)}</td>
                <td>₹{num(r.arrear_demand)}</td>
                <td>₹{num(r.arrear_collection)}</td>
                <td style={heatStyle(ceHeat.daily_collection, r.sub_division)}>₹{num(r.daily_collection)}</td>
                <td>₹{num(r.total_collection)}</td>
                <td style={heatStyle(ceHeat.coll_eff_pct, r.sub_division)}>{pct(r.coll_eff_pct)}</td>
                <td style={heatStyle(ceHeat.remaining_amount, r.sub_division)}>₹{num(r.remaining_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ExportableTable>

      <ExportableTable id={`BE_${reportDate}`} title={`BILLING EFFICIENCY of Goalpara Electrical Circle as on  ${dmy}`}>
        <table className="report-table">
          <thead>
            <tr>
              <th>Name of Sub Division</th><th>MU Injection</th><th>MUB S/D</th><th>MUB IRCA</th>
              <th>MUB Converted</th><th>MUB Prepaid</th><th>Total MUB</th><th>BE Target</th>
              <th>MU to be Billed for<br/>Achieving BE Target</th><th>BE (Including IRCA)</th><th>BE (Excluding IRCA)</th>
            </tr>
          </thead>
          <tbody>
            {be.map((r) => (
              <tr key={r.sub_division} className={isTotalRow(r.sub_division) ? 'total-row' : ''}>
                <td className="subdiv-cell">{r.sub_division}</td>
                <td>{num(r.mu_injection, 3)}</td>
                <td>{num(r.mub_sd, 3)}</td>
                <td>{num(r.mub_irca, 3)}</td>
                <td>{num(r.mub_converted, 3)}</td>
                <td>{num(r.mub_prepaid, 3)}</td>
                <td>{num(r.total_mub, 3)}</td>
                <td>{pct(r.be_target)}</td>
                <td style={heatStyle(beHeat.mu_to_be_billed, r.sub_division)}>{num(r.mu_to_be_billed, 3)}</td>
                <td style={heatStyle(beHeat.be_incl_irca, r.sub_division)}>{pct(r.be_incl_irca)}</td>
                <td style={heatStyle(beHeat.be_excl_irca, r.sub_division)}>{pct(r.be_excl_irca)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ExportableTable>

      <ExportableTable id={`BE_Cons_${reportDate}`} title={`CONSUMER WISE BILLING of Goalpara Electrical Circle as on  ${dmy}`}>
        <table className="report-table">
          <thead>
            <tr>
              <th>Sl No</th><th>Sub-Division</th><th>Total Consumers</th><th>Total Billable Consumers</th>
              <th>Total Billed Consumers</th><th>Total Ghost Consumers</th><th>Billing %</th><th>Total Unbilled</th>
            </tr>
          </thead>
          <tbody>
            {beCons.map((r, i) => (
              <tr key={r.sub_division} className={isTotalRow(r.sub_division) ? 'total-row' : ''}>
                <LabelCells subDivision={r.sub_division} index={i} />
                <td>{num(r.total_consumers)}</td>
                <td>{num(r.total_billable_consumers)}</td>
                <td>{num(r.total_billed_consumers)}</td>
                <td>{num(r.total_ghost_consumers)}</td>
                <td style={heatStyle(beConsHeat, r.sub_division)}>{pct(r.billing_pct)}</td>
                <td>{num(r.total_unbilled)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ExportableTable>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>CEO_Sir message</h2>
          <button
            className="btn secondary"
            onClick={() => navigator.clipboard.writeText(ceoSir?.message_text ?? '')}
          >
            Copy text
          </button>
        </div>
        <div className="ceo-text">{ceoSir?.message_text ?? 'Not generated yet.'}</div>
      </div>
    </div>
  );
}
