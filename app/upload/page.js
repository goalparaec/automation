'use client';

import { useState } from 'react';
import { SHEET_TYPES } from '../../lib/sheetConfig.js';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function UploadRow({ sheetType, label, reportDate }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState(null); // { type, message }

  async function handleFetch() {
    setStatus({ type: 'loading', message: 'Fetching from portal...' });
    try {
      const res = await fetch('/api/fetch-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetType, reportDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fetch failed.');
      setStatus({ type: 'success', message: `Fetched & saved ${data.rowCount} rows for ${reportDate}.` });
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
    formData.append('reportDate', reportDate);
    formData.append('sheetType', sheetType);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed.');
      setStatus({ type: 'success', message: `Saved ${data.rowCount} rows for ${reportDate}.` });
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
        <span style={{ color: '#9ca3af', fontSize: 13 }}>or</span>
        <input
          type="file"
          accept=".xlsx"
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
        <p
          className={`status ${status.type === 'error' ? 'error' : status.type === 'success' ? 'success' : ''}`}
          style={{ marginBottom: 0 }}
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
        Try <strong>Fetch from Portal</strong> first — it logs into the
        company portal and pulls the report automatically. If that fails for
        any reason (portal down, layout changed, session issue), just
        upload the file manually using the option next to it — nothing
        blocks you from continuing that way.
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
