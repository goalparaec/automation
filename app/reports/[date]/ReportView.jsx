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

// Builds a continuous red -> yellow -> green background color per row for
// one column, based on where that row's value falls between the lowest and
// highest value seen (excluding the Circle Total row, which isn't a
// sub-division being compared). `higherIsBetter` flips the direction for
// columns like "MU to be billed" or "remaining amount" where a smaller
// number is the good outcome.
function buildHeatMap(rows, field, higherIsBetter) {
  const values = rows
    .filter((r) => r.sub_division !== 'Circle Total')
    .map((r) => Number(r[field]))
    .filter((v) => Number.isFinite(v));

  if (values.length < 2) return {};

  const min = Math.min(...values);
  const max = Math.max(...values);
  const map = {};

  for (const r of rows) {
    if (r.sub_division === 'Circle Total') continue;
    const v = Number(r[field]);
    if (!Number.isFinite(v) || min === max) continue;
    let t = (v - min) / (max - min); // 0 = worst end, 1 = best end (before flip)
    if (!higherIsBetter) t = 1 - t;
    const hue = t * 120; // 0 = red, 120 = green
    map[r.sub_division] = `hsl(${hue}, 65%, 78%)`;
  }
  return map;
}

function heatStyle(colorMap, subDivision) {
  const bg = colorMap[subDivision];
  if (!bg) return undefined;
  return { backgroundColor: bg, color: '#1a1a1a', fontWeight: 600 };
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>{title}</h2>
        <button className="btn secondary" onClick={downloadImage} disabled={busy}>
          {busy ? 'Rendering...' : 'Download image'}
        </button>
      </div>
      <div ref={ref} style={{ background: '#fff', padding: 8 }}>
        {children}
      </div>
    </div>
  );
}

function RowClass(subDivision) {
  return subDivision === 'Circle Total' ? 'total-row' : '';
}

export default function ReportView({ report }) {
  const { reportDate, beCons, be, cePostpaid, ceoSir } = report;

  // Higher-is-better for billing %; the totals row is left uncolored.
  const beConsHeat = useMemo(() => buildHeatMap(beCons, 'billing_pct', true), [beCons]);

  const beHeat = useMemo(
    () => ({
      be_incl_irca: buildHeatMap(be, 'be_incl_irca', true),
      be_excl_irca: buildHeatMap(be, 'be_excl_irca', true),
      mu_to_be_billed: buildHeatMap(be, 'mu_to_be_billed', false), // lower is better
    }),
    [be]
  );

  const ceHeat = useMemo(
    () => ({
      daily_collection: buildHeatMap(cePostpaid, 'daily_collection', true),
      coll_eff_pct: buildHeatMap(cePostpaid, 'coll_eff_pct', true),
      remaining_amount: buildHeatMap(cePostpaid, 'remaining_amount', false), // lower is better
    }),
    [cePostpaid]
  );

  return (
    <div>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>Report — {reportDate}</h1>
        <a className="btn" href={`/api/reports/${reportDate}/excel`}>Download Excel (all sheets)</a>
      </div>

      <ExportableTable id={`BE_Cons_${reportDate}`} title="BE_(Cons)">
        <table className="report-table">
          <thead>
            <tr>
              <th>Sub-Division</th><th>Total Consumers</th><th>Total Billable</th>
              <th>Total Billed</th><th>Ghost Consumers</th><th>Billing %</th><th>Unbilled</th>
            </tr>
          </thead>
          <tbody>
            {beCons.map((r) => (
              <tr key={r.sub_division} className={RowClass(r.sub_division)}>
                <td>{r.sub_division}</td>
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
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
          Billing % shaded green (best) to red (worst) across sub-divisions.
        </p>
      </ExportableTable>

      <ExportableTable id={`BE_${reportDate}`} title="BE">
        <table className="report-table">
          <thead>
            <tr>
              <th>Sub-Division</th><th>MU Injection</th><th>MUB S/D</th><th>MUB IRCA</th>
              <th>MUB Converted</th><th>MUB Prepaid</th><th>Total MUB</th><th>BE Target</th>
              <th>MU To Be Billed</th><th>BE incl. IRCA</th><th>BE excl. IRCA</th>
            </tr>
          </thead>
          <tbody>
            {be.map((r) => (
              <tr key={r.sub_division} className={RowClass(r.sub_division)}>
                <td>{r.sub_division}</td>
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
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
          BE incl./excl. IRCA: green = highest. MU To Be Billed: green = lowest (least still needed to hit target).
        </p>
      </ExportableTable>

      <ExportableTable id={`CE_Postpaid_${reportDate}`} title="CE_Postpaid">
        <table className="report-table">
          <thead>
            <tr>
              <th>Sub-Division</th><th>Current Demand</th><th>Arrear Demand</th>
              <th>Arrear Collection</th><th>Daily Collection</th><th>Total Collection</th>
              <th>Coll. Eff. %</th><th>Remaining</th>
            </tr>
          </thead>
          <tbody>
            {cePostpaid.map((r) => (
              <tr key={r.sub_division} className={RowClass(r.sub_division)}>
                <td>{r.sub_division}</td>
                <td>{num(r.current_demand)}</td>
                <td>{num(r.arrear_demand)}</td>
                <td>{num(r.arrear_collection)}</td>
                <td style={heatStyle(ceHeat.daily_collection, r.sub_division)}>{num(r.daily_collection)}</td>
                <td>{num(r.total_collection)}</td>
                <td style={heatStyle(ceHeat.coll_eff_pct, r.sub_division)}>{pct(r.coll_eff_pct)}</td>
                <td style={heatStyle(ceHeat.remaining_amount, r.sub_division)}>{num(r.remaining_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
          Daily Collection & Collection Eff.: green = highest. Remaining: green = lowest (closest to 100% CE).
        </p>
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
