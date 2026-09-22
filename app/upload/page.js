'use client';

import { useState } from 'react';
import { SHEET_TYPES } from '../../lib/sheetConfig.js';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function UploadRow({ sheetType, label, reportDate }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState(null); // { type, message }
  const [showRange, setShowRange] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  async function handleFetch() {
    setStatus({ type: 'loading', message: 'Triggering fetch on GitHub Actions...' });
    try {
      const res = await fetch('/api/fetch-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetType,
          fromDate: fromDate || null,
          toDate: toDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Trigger failed.');
      setStatus({ type: 'success', message: data.message });
    } catch (err) {
      setStatus({ type: 'error', message: `${err.message} You can still upload the file manually below.` });
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
    formData.append('reportDate', toDate || reportDate);
    formData.append('sheetType', sheetType);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed.');
      setStatus({ type: 'success', message: `Saved ${data.rowCount} rows for ${toDate || reportDate}.` });
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    }
  }

  return (
    <div style={{ borderBottom: '1px solid #e5e7eb', padding: '14px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <strong style={{ minWidth: 200 }}>{label}</strong>
        <button className="btn" onClick={handleFetch} disabled={status?.type === 'loading'}>
          Fetch from Portal
        </button>
        <button
          className="btn secondary"
          style={{ padding: '4px 10px', fontSize: 12 }}
          onClick={() => setShowRange((v) => !v)}
          type="button"
        >
          {showRange ? 'Hide date range' : 'Need a different date/range?'}
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

      {showRange && (
        <div className="field-row" style={{ marginTop: 8, marginBottom: 0 }}>
          <label>From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <label>To</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <span style={{ color: '#9ca3af', fontSize: 12 }}>
            Leave blank to use the report date above. Note: date-range fetching from the portal
            isn't wired up for every report yet - it'll fall back to the portal's default date
            until that's recorded for this report.
          </span>
        </div>
      )}

      {status && (
        <p
          className={`status ${status.type === 'error' ? 'error' : status.type === 'success' ? 'success' : ''}`}
          style={{ marginBottom: 0, marginTop: 8 }}
        >
          {status.message}
        </p>
      )}
    </div>
  );
}

export default function UploadPage() {
  const [reportDate, setReportDate] = useState(todayISO());

  return (
    <div className="card">
      <h1>Get today's reports</h1>
      <p>
        Try <strong>Fetch from Portal</strong> first — it triggers the automated fetch on GitHub Actions for that
        company portal and pulls the report automatically. If that fails for
        any reason (portal down, layout changed, session issue), just
        upload the file manually using the option next to it — nothing
        blocks you from continuing that way.
      </p>
      <p>
        Need a report for a date other than today, or a date range? Click
        <strong> "Need a different date/range?"</strong> next to that
        report — it only applies to that one report, not all of them.
      </p>
      <p>
        You don't need every report present to generate a report: if a file
        hasn't come in yet for a report, the app uses that report's most
        recent earlier values automatically, and swaps in the real data the
        moment it's uploaded or fetched.
      </p>
      <p>
        Re-fetching or re-uploading a report for a date that's already been
        saved fully replaces the previous data — useful for corrections.
      </p>

      <div className="field-row">
        <label>Report date</label>
        <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
      </div>

      <div style={{ marginTop: 10 }}>
        {SHEET_TYPES.map(({ key, label }) => (
          <UploadRow key={key} sheetType={key} label={label} reportDate={reportDate} />
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        <a className="btn secondary" href={`/reports/${reportDate}`}>
          View report for {reportDate}
        </a>
      </div>
    </div>
  );
}
