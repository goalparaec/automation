'use client';

import { useState } from 'react';
import { SHEET_TYPES } from '../../lib/sheetConfig.js';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function UploadRow({ sheetType, label, reportDate }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState(null); // { type, message }

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
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setStatus(null);
          }}
        />
        <button className="btn" onClick={handleUpload} disabled={status?.type === 'loading'}>
          {status?.type === 'loading' ? 'Uploading...' : 'Upload'}
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
      <h1>Upload today's reports</h1>
      <p>
        Upload each report file separately, as they come in from the source
        system — there is no need to combine them into one workbook. Every
        report shares the same layout as before, so no other change is
        needed on that end.
      </p>
      <p>
        Re-uploading a file for a date that's already been uploaded fully
        replaces the previous data for that report and date — useful if a
        wrong file was uploaded earlier and needs correcting. Nothing needs
        to be uploaded again for the other reports; each is independent.
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
