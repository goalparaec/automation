'use client';

import { useRef, useState } from 'react';
import { toPng } from 'html-to-image';

const RED = [248, 105, 107];
const YELLOW = [255, 235, 132];
const GREEN = [99, 190, 123];

function mix(c1, c2, t) {
  return c1.map((v, i) => Math.round(v + (c2[i] - v) * t));
}

function heatColor(value, min, max) {
  if (value == null || isNaN(value) || max === min) return 'transparent';
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const rgb = t < 0.5 ? mix(RED, YELLOW, t / 0.5) : mix(YELLOW, GREEN, (t - 0.5) / 0.5);
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function num(v) {
  if (v == null || isNaN(v)) return '-';
  return Math.round(Number(v)).toLocaleString('en-IN');
}

function pct(v) {
  if (v == null || isNaN(v)) return '-';
  return (Number(v) * 100).toFixed(2) + '%';
}

function toDMY(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-');
  return `${d}-${m}-${y}`;
}

function formatTimestamp(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function DownloadableCard({ fileName, children }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);

  async function handleDownload() {
    if (!ref.current) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(ref.current, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.download = fileName;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Image download failed', err);
      alert('Could not generate image. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div ref={ref} style={{ display: 'inline-block', width: '100%' }}>
        {children}
      </div>
      <div style={{ marginTop: 8 }}>
        <button
          onClick={handleDownload}
          disabled={busy}
          style={{
            background: '#1f4e79',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            padding: '7px 14px',
            fontSize: 13,
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          {busy ? 'Generating…' : 'Download as Image'}
        </button>
      </div>
    </div>
  );
}

function IndexingChart({ rows }) {
  const pctValues = rows.map((r) => (r.indexing_pct == null ? 0 : Number(r.indexing_pct) * 100));
  const maxPct = Math.max(100, ...pctValues);

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #d9dde3',
        borderRadius: 10,
        padding: '14px 16px',
        maxWidth: 640,
        margin: '0 auto',
      }}
    >
      <h3 style={{ margin: '0 0 10px 0', fontSize: 14, color: '#1f4e79', textAlign: 'center' }}>
        Consumer Indexing % by ESD
      </h3>
      {rows.map((r) => {
        const value = r.indexing_pct == null ? 0 : Number(r.indexing_pct) * 100;
        const widthPct = Math.max(2, (value / maxPct) * 100);
        const isTotal = r.esd_name === 'Circle Total';
        return (
          <div key={r.esd_name} style={{ marginBottom: 7, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 90,
                fontSize: 12,
                fontWeight: isTotal ? 700 : 500,
                textAlign: 'right',
                flexShrink: 0,
              }}
            >
              {r.esd_name}
            </div>
            <div style={{ flex: 1, background: '#eef1f5', borderRadius: 4, height: 16, position: 'relative' }}>
              <div
                style={{
                  width: `${widthPct}%`,
                  height: '100%',
                  borderRadius: 4,
                  background: heatColor(value, 0, 100),
                }}
              />
            </div>
            <div style={{ width: 54, fontSize: 12, fontWeight: isTotal ? 700 : 500, flexShrink: 0 }}>
              {pct(r.indexing_pct)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const COLUMNS = [
  { key: 'esd_name', label: 'Sub-Division' },
  { key: 'total_dtrs', label: 'Total DTRs' },
  { key: 'indexed_dtrs', label: 'Indexed DTRs' },
  { key: 'total_consumers', label: 'Total Consumers' },
  { key: 'indexed_consumers', label: 'Indexed Consumers' },
  { key: 'indexing_pct', label: 'Consumer Indexing %' },
  { key: 'indexed_dtrs_zero_consumers', label: 'Total Indexed DTRs with Zero Consumer' },
];

function SummaryTable({ rows }) {
  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #d9dde3',
        borderRadius: 10,
        padding: '12px 14px',
        maxWidth: 720,
        margin: '0 auto',
        overflow: 'hidden',
      }}
    >
      <h3 style={{ margin: '0 0 8px 0', fontSize: 14, color: '#1f4e79', textAlign: 'center' }}>
        Consumer Indexing Summary
      </h3>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 12,
          tableLayout: 'fixed',
        }}
      >
        <colgroup>
          {COLUMNS.map((c) => (
            <col key={c.key} style={{ width: c.key === 'esd_name' ? '14%' : undefined }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {COLUMNS.map((c, i) => (
              <th
                key={c.key}
                style={{
                  border: '1px solid #333',
                  background: '#dce6f1',
                  padding: '6px 4px',
                  fontWeight: 700,
                  textAlign: 'center',
                  whiteSpace: 'normal',
                  wordBreak: 'normal',
                  overflowWrap: 'normal',
                  lineHeight: 1.25,
                  verticalAlign: 'middle',
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isTotal = r.esd_name === 'Circle Total';
            return (
              <tr key={r.esd_name} style={isTotal ? { background: '#fff2cc', fontWeight: 700 } : undefined}>
                {COLUMNS.map((c, i) => {
                  const value = r[c.key];
                  let display;
                  if (c.key === 'esd_name') display = value;
                  else if (c.key === 'indexing_pct') display = pct(value);
                  else display = num(value);
                  return (
                    <td
                      key={c.key}
                      style={{
                        border: '1px solid #333',
                        padding: '5px 4px',
                        textAlign: i === 0 ? 'center' : 'center',
                        whiteSpace: 'normal',
                        wordBreak: 'normal',
                        overflowWrap: 'normal',
                        lineHeight: 1.25,
                      }}
                    >
                      {display}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ConsumerIndexingView({ reportDate, rows, lastUpdated }) {
  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 18, color: '#1f4e79' }}>
            Consumer Indexing Report — {toDMY(reportDate)}
          </h2>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
            Last updated: {formatTimestamp(lastUpdated)}
          </div>
        </div>
        <a
          href={`/api/consumer-indexing/report/${reportDate}/excel`}
          style={{
            background: '#1f4e79',
            color: 'white',
            borderRadius: 6,
            padding: '7px 14px',
            fontSize: 13,
            textDecoration: 'none',
          }}
        >
          Download Excel
        </a>
      </div>

      <DownloadableCard fileName={`consumer-indexing-chart-${reportDate}.png`}>
        <IndexingChart rows={rows} />
      </DownloadableCard>

      <DownloadableCard fileName={`consumer-indexing-summary-${reportDate}.png`}>
        <SummaryTable rows={rows} />
      </DownloadableCard>

      <a href="/consumer-indexing" style={{ fontSize: 13, color: '#1f4e79' }}>
        ← Back to upload page
      </a>
    </div>
  );
}
