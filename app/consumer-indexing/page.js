'use client';

import { useEffect, useState, useCallback } from 'react';

const ESD_NAMES = ['Dhupdhara', 'Dudhnoi', 'Goalpara', 'Lakhipur', 'Mankachar'];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

function CoverageTracker({ coverage }) {
  if (!coverage) return null;
  return (
    <div className="card" style={{ background: coverage.isComplete ? '#f0fdf4' : '#fffbeb' }}>
      <strong>{coverage.covered.length} of 5 ESDs uploaded for this date</strong>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
        {ESD_NAMES.map((name) => (
          <span key={name} style={{ fontSize: 13 }}>
            {coverage.covered.includes(name) ? '✅' : '⬜'} {name}
          </span>
        ))}
      </div>
      {coverage.isComplete ? (
        <p style={{ marginBottom: 0, marginTop: 8, color: '#15803d' }}>
          All 5 ESDs are in - the report is ready to view.
        </p>
      ) : (
        <p style={{ marginBottom: 0, marginTop: 8, color: '#b45309' }}>
          Waiting on: {coverage.missing.join(', ')}.
        </p>
      )}
    </div>
  );
}

function ReportsList({ reports }) {
  if (!reports || reports.length === 0) return null;
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Completed reports</h2>
      <p style={{ fontSize: 13, color: '#6b7280', marginTop: -8 }}>
        Every date where all 5 ESDs have been uploaded stays here and can be reopened any time.
        Re-uploading any ESD for a date updates that same report in place - the latest data always wins.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <tbody>
          {reports.map((r, i) => (
            <tr key={r.date} style={{ borderTop: '1px solid #e5e7eb' }}>
              <td style={{ padding: '8px 4px', fontWeight: i === 0 ? 700 : 400 }}>
                {toDMY(r.date)} {i === 0 && <span style={{ color: '#15803d', fontSize: 12 }}>(latest)</span>}
              </td>
              <td style={{ padding: '8px 4px', color: '#6b7280', fontSize: 13 }}>
                Last updated: {formatTimestamp(r.lastUpdated)}
              </td>
              <td style={{ padding: '8px 4px', textAlign: 'right' }}>
                <a className="btn secondary" href={`/consumer-indexing/report/${r.date}`}>View</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UploadRow({ esdName, reportDate, onUploaded }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState(null);

  async function handleFetch() {
    setStatus({ type: 'loading', message: 'Triggering fetch on GitHub Actions...' });
    try {
      const res = await fetch('/api/consumer-indexing/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportDate, esdName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Trigger failed.');
      setStatus({ type: 'success', message: data.message });
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    }
  }

  async function handleUpload() {
    if (!file) {
      setStatus({ type: 'error', message: 'Choose a file first.' });
      return;
    }
    setStatus({ type: 'loading', message: 'Uploading...' });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('reportDate', reportDate);
    formData.append('esdName', esdName);

    try {
      const res = await fetch('/api/consumer-indexing/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed.');
      setStatus({
        type: 'success',
        message: `Saved ${data.rowCount} DTR rows (${data.excludedCount} excluded as GHDT).`,
      });
      onUploaded(data.coverage);
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    }
  }

  return (
    <div style={{ borderBottom: '1px solid #e5e7eb', padding: '14px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <strong style={{ minWidth: 110 }}>{esdName}</strong>
        <button className="btn" onClick={handleFetch} disabled={status?.type === 'loading'}>
          Fetch from Portal
        </button>
        <span style={{ color: '#9ca3af', fontSize: 13 }}>or</span>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setStatus(null);
          }}
        />
        <button className="btn secondary" onClick={handleUpload} disabled={status?.type === 'loading'}>
          {status?.type === 'loading' ? 'Working...' : 'Upload File'}
        </button>
      </div>
      {status && (
        <p className={`status ${status.type === 'error' ? 'error' : status.type === 'success' ? 'success' : ''}`} style={{ marginBottom: 0 }}>
          {status.message}
        </p>
      )}
    </div>
  );
}

export default function ConsumerIndexingUploadPage() {
  const [reportDate, setReportDate] = useState(todayISO());
  const [coverage, setCoverage] = useState(null);
  const [reports, setReports] = useState([]);

  const loadCoverage = useCallback(async (date) => {
    try {
      const res = await fetch(`/api/consumer-indexing/coverage?date=${date}`);
      const data = await res.json();
      if (res.ok) setCoverage(data.coverage);
    } catch {
      // non-fatal - the tracker just won't show until an upload succeeds
    }
  }, []);

  const loadReports = useCallback(async () => {
    try {
      const res = await fetch('/api/consumer-indexing/reports');
      const data = await res.json();
      if (res.ok) setReports(data.reports);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    loadCoverage(reportDate);
  }, [reportDate, loadCoverage]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  function handleUploaded(newCoverage) {
    setCoverage(newCoverage);
    if (newCoverage?.isComplete) loadReports();
  }

  return (
    <div className="card">
      <h1>Consumer Indexing Report</h1>

      <div className="field-row">
        <label>Report date</label>
        <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
      </div>

      <CoverageTracker coverage={coverage} />

      <div style={{ marginTop: 10 }}>
        {ESD_NAMES.map((esdName) => (
          <UploadRow key={esdName} esdName={esdName} reportDate={reportDate} onUploaded={handleUploaded} />
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        {coverage?.isComplete ? (
          <a className="btn" href={`/consumer-indexing/report/${reportDate}`}>View report for {reportDate}</a>
        ) : (
          <span className="btn secondary" style={{ opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' }}>
            View report for {reportDate} (needs all 5 ESDs first)
          </span>
        )}
      </div>

      <ReportsList reports={reports} />
    </div>
  );
}
