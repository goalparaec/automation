'use client';

import { useEffect, useState, useCallback } from 'react';

const ESD_NAMES = ['Dhupdhara', 'Dudhnoi', 'Goalpara', 'Lakhipur', 'Mankachar'];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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
          Waiting on: {coverage.missing.join(', ')}. The report only becomes available once all 5 are uploaded for this same date.
        </p>
      )}
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
  const [latestComplete, setLatestComplete] = useState(null);

  const loadCoverage = useCallback(async (date) => {
    try {
      const res = await fetch(`/api/consumer-indexing/coverage?date=${date}`);
      const data = await res.json();
      if (res.ok) setCoverage(data.coverage);
    } catch {
      // non-fatal - the tracker just won't show until an upload succeeds
    }
  }, []);

  useEffect(() => {
    loadCoverage(reportDate);
  }, [reportDate, loadCoverage]);

  useEffect(() => {
    fetch('/api/consumer-indexing/latest-complete')
      .then((r) => r.json())
      .then((data) => setLatestComplete(data.date ?? null))
      .catch(() => {});
  }, []);

  return (
    <div className="card">
      <h1>Consumer Indexing Report</h1>

      {latestComplete && (
        <p>
          <a href={`/consumer-indexing/report/${latestComplete}`}>
            View latest complete report ({latestComplete})
          </a>
        </p>
      )}

      <div className="field-row">
        <label>Report date</label>
        <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
      </div>

      <CoverageTracker coverage={coverage} />

      <div style={{ marginTop: 10 }}>
        {ESD_NAMES.map((esdName) => (
          <UploadRow key={esdName} esdName={esdName} reportDate={reportDate} onUploaded={setCoverage} />
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
    </div>
  );
}
