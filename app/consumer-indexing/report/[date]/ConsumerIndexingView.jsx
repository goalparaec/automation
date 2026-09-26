'use client';

import { useRef, useState } from 'react';
import { toPng } from 'html-to-image';

function pct(v) {
  if (v === null || v === undefined) return '-';
  return `${(Number(v) * 100).toFixed(2)}%`;
}
function num(v) {
  if (v === null || v === undefined) return '-';
  return Number(v).toLocaleString('en-IN');
}
function toDMY(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

// Excel-style red -> yellow -> green 3-stop scale, matching the daily
// report's heat-map styling for visual consistency across the app.
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

function IndexingChart({ rows, reportDate }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);

  const esdRows = rows.filter((r) => r.esd_name !== 'Circle Total' && r.esd_name !== 'Unmapped');
  const circleRow = rows.find((r) => r.esd_name === 'Circle Total');

  const pcts = esdRows.map((r) => Number(r.indexing_pct) || 0);
  const min = Math.min(...pcts);
  const max = Math.max(...pcts);

  async function downloadImage() {
    if (!ref.current) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(ref.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.download = `Consumer_Indexing_${reportDate}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Consumer Indexing %</h2>
        <button className="btn secondary" onClick={downloadImage} disabled={busy}>
          {busy ? 'Rendering...' : 'Download image'}
        </button>
      </div>

      <div ref={ref} style={{ background: '#fff', padding: '24px 16px 8px' }}>
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 16, textDecoration: 'underline', marginBottom: 20 }}>
          Consumer Indexing — Goalpara Electrical Circle — {toDMY(reportDate)}
        </div>

        {esdRows.map((r) => {
          const p = Number(r.indexing_pct) || 0;
          const t = max === min ? 1 : (p - min) / (max - min);
          const color = heatColor(t);
          return (
            <div key={r.esd_name} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 100, fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{r.esd_name}</div>
              <div style={{ flex: 1, background: '#eef1f5', borderRadius: 6, height: 28, position: 'relative', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.max(p * 100, 3)}%`,
                    background: color,
                    height: '100%',
                    borderRadius: 6,
                    transition: 'width 0.3s',
                  }}
                />
              </div>
              <div style={{ width: 64, fontSize: 13, fontWeight: 700 }}>{pct(r.indexing_pct)}</div>
            </div>
          );
        })}

        {circleRow && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, paddingTop: 14, borderTop: '2px solid #333' }}>
            <div style={{ width: 100, fontSize: 14, fontWeight: 700, textAlign: 'right' }}>Circle Total</div>
            <div style={{ flex: 1, background: '#eef1f5', borderRadius: 6, height: 32, position: 'relative', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.max((Number(circleRow.indexing_pct) || 0) * 100, 3)}%`,
                  background: '#1f4e79',
                  height: '100%',
                  borderRadius: 6,
                }}
              />
            </div>
            <div style={{ width: 64, fontSize: 14, fontWeight: 800 }}>{pct(circleRow.indexing_pct)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ConsumerIndexingView({ reportDate, rows }) {
  return (
    <div>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>Consumer Indexing Report — {toDMY(reportDate)}</h1>
        <a className="btn" href={`/api/consumer-indexing/report/${reportDate}/excel`}>Download Excel</a>
      </div>

      <IndexingChart rows={rows} reportDate={reportDate} />

      <div className="card">
        <table className="report-table">
          <thead>
            <tr>
              <th>Sub-Division</th>
              <th>Total DTRs</th>
              <th>Total Consumers</th>
              <th>Indexed</th>
              <th>Un-Indexed</th>
              <th>Indexing %</th>
              <th>Indexed DTRs w/ 0 Consumers</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.esd_name}
                className={r.esd_name === 'Circle Total' ? 'total-row' : ''}
                style={r.esd_name === 'Unmapped' ? { color: '#9ca3af', fontStyle: 'italic' } : undefined}
              >
                <td>{r.esd_name}</td>
                <td>{num(r.total_dtrs)}</td>
                <td>{num(r.total_consumers)}</td>
                <td>{num(r.indexed_consumers)}</td>
                <td>{num(r.unindexed_consumers)}</td>
                <td>{pct(r.indexing_pct)}</td>
                <td>{num(r.indexed_dtrs_zero_consumers)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
          "Unmapped" rows didn't match a known sub-division's feeder-name
          prefix (038-042) and aren't GHDT-marked either - worth a quick
          look, but excluded from the Circle Total above. DTRs with "GHDT"
          in their DTR No. are excluded from every row entirely.
        </p>
      </div>

      <div className="card">
        <a className="btn secondary" href="/consumer-indexing">Upload a different date</a>
      </div>
    </div>
  );
}
