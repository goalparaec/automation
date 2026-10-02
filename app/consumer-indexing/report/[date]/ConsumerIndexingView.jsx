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
function formatTimestamp(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const datePart = d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timePart = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  return `${datePart} ${timePart} IST`;
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

function DownloadableCard({ id, title, children }) {
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <button className="btn secondary" onClick={downloadImage} disabled={busy}>
          {busy ? 'Rendering...' : 'Download image'}
        </button>
      </div>
      <div ref={ref} style={{ background: '#fff', padding: '20px 16px 12px' }}>
        {children}
      </div>
    </div>
  );
}

function IndexingChart({ rows }) {
  const esdRows = rows.filter((r) => r.esd_name !== 'Circle Total');
  const circleRow = rows.find((r) => r.esd_name === 'Circle Total');
  const pcts = esdRows.map((r) => Number(r.indexing_pct) || 0);
  const min = Math.min(...pcts);
  const max = Math.min(...pcts) === Math.max(...pcts) ? min + 1 : Math.max(...pcts);

  return (
    <>
      {esdRows.map((r) => {
        const p = Number(r.indexing_pct) || 0;
        const t = max === min ? 1 : (p - min) / (max - min);
        const color = heatColor(t);
        return (
          <div key={r.esd_name} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ width: 100, fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{r.esd_name}</div>
            <div style={{ flex: 1, background: '#eef1f5', borderRadius: 6, height: 28, overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(p * 100, 3)}%`, background: color, height: '100%', borderRadius: 6 }} />
            </div>
            <div style={{ width: 64, fontSize: 13, fontWeight: 700 }}>{pct(r.indexing_pct)}</div>
          </div>
        );
      })}
      {circleRow && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, paddingTop: 14, borderTop: '2px solid #333' }}>
          <div style={{ width: 100, fontSize: 14, fontWeight: 700, textAlign: 'right' }}>Circle Total</div>
          <div style={{ flex: 1, background: '#eef1f5', borderRadius: 6, height: 32, overflow: 'hidden' }}>
            <div style={{ width: `${Math.max((Number(circleRow.indexing_pct) || 0) * 100, 3)}%`, background: '#1f4e79', height: '100%', borderRadius: 6 }} />
          </div>
          <div style={{ width: 64, fontSize: 14, fontWeight: 800 }}>{pct(circleRow.indexing_pct)}</div>
        </div>
      )}
    </>
  );
}

function SummaryTable({ rows }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
      <thead>
        <tr>
          {['Sub-Division', 'Total DTRs', 'Indexed DTRs', 'Total Consumers', 'Indexed Consumers', 'Consumer Indexing %', 'Total Indexed DTRs with Zero Consumer'].map((h, i) => (
            <th
              key={h}
              style={{
                textAlign: i === 0 ? 'left' : 'right',
                padding: '10px 14px',
                background: '#1f4e79',
                color: '#fff',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const isTotal = r.esd_name === 'Circle Total';
          return (
            <tr
              key={r.esd_name}
              style={{
                background: isTotal ? '#fff2cc' : i % 2 === 0 ? '#ffffff' : '#f7f9fb',
                fontWeight: isTotal ? 700 : 400,
              }}
            >
              <td style={{ padding: '10px 14px', textAlign: 'left', borderTop: isTotal ? '2px solid #1f4e79' : '1px solid #e5e7eb' }}>{r.esd_name}</td>
              <td style={{ padding: '10px 14px', textAlign: 'right', borderTop: isTotal ? '2px solid #1f4e79' : '1px solid #e5e7eb' }}>{num(r.total_dtrs)}</td>
              <td style={{ padding: '10px 14px', textAlign: 'right', borderTop: isTotal ? '2px solid #1f4e79' : '1px solid #e5e7eb' }}>{num(r.indexed_dtrs)}</td>
              <td style={{ padding: '10px 14px', textAlign: 'right', borderTop: isTotal ? '2px solid #1f4e79' : '1px solid #e5e7eb' }}>{num(r.total_consumers)}</td>
              <td style={{ padding: '10px 14px', textAlign: 'right', borderTop: isTotal ? '2px solid #1f4e79' : '1px solid #e5e7eb' }}>{num(r.indexed_consumers)}</td>
              <td style={{ padding: '10px 14px', textAlign: 'right', borderTop: isTotal ? '2px solid #1f4e79' : '1px solid #e5e7eb' }}>{pct(r.indexing_pct)}</td>
              <td style={{ padding: '10px 14px', textAlign: 'right', borderTop: isTotal ? '2px solid #1f4e79' : '1px solid #e5e7eb' }}>{num(r.indexed_dtrs_zero_consumers)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function ConsumerIndexingView({ reportDate, rows, lastUpdated }) {
  return (
    <div>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0 }}>Consumer Indexing Report — {toDMY(reportDate)}</h1>
          {lastUpdated && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
              Last updated: {formatTimestamp(lastUpdated)}
            </p>
          )}
        </div>
        <a className="btn" href={`/api/consumer-indexing/report/${reportDate}/excel`}>Download Excel</a>
      </div>

      <DownloadableCard id={`Consumer_Indexing_Chart_${reportDate}`} title="Consumer Indexing %">
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 16, textDecoration: 'underline', marginBottom: 20 }}>
          Consumer Indexing — Goalpara Electrical Circle — {toDMY(reportDate)}
        </div>
        <IndexingChart rows={rows} />
      </DownloadableCard>

      <DownloadableCard id={`Consumer_Indexing_Summary_${reportDate}`} title="Summary">
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 16, textDecoration: 'underline', marginBottom: 16 }}>
          Consumer Indexing Summary — Goalpara Electrical Circle — {toDMY(reportDate)}
        </div>
        <SummaryTable rows={rows} />
      </DownloadableCard>

      <div className="card">
        <a className="btn secondary" href="/consumer-indexing">Back to upload page</a>
      </div>
    </div>
  );
}
