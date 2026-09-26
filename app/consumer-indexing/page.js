'use client';

import { useState } from 'react';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ConsumerIndexingUploadPage() {
  const [reportDate, setReportDate] = useState(todayISO());
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState(null);

  async function handleFetch() {
    setStatus({ type: 'loading', message: 'Triggering fetch on GitHub Actions...' });
    try {
      const res = await fetch('/api/consumer-indexing/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Trigger failed.');
      setStatus({ type: 'success', message: data.message });
    } catch (err) {
      setStatus({ type: 'error', message: `${err.message}` });
    }
  }

  async function handleUpload() {
    if (!files || files.length === 0) {
      setStatus({ type: 'error', message: 'Choose one or more files first.' });
      return;
    }
    setStatus({ type: 'loading', message: 'Uploading and processing...' });

    const formData = new FormData();
    for (const f of files) formData.append('files', f);
    formData.append('reportDate', reportDate);

    try {
      const res = await fetch('/api/consumer-indexing/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed.');
      setStatus({
        type: 'success',
        message: `Processed ${data.rowCount} DTR rows (${data.excludedCount} excluded as GHDT, ${data.unmappedCount} unmapped). View the report below.`,
      });
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    }
  }

  return (
    <div className="card">
      <h1>Consumer Indexing Report</h1>

      <div className="field-row">
        <label>Report date</label>
        <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
        <button className="btn" onClick={handleFetch} disabled={status?.type === 'loading'}>
          Fetch from Portal
        </button>
        <span style={{ color: '#9ca3af', fontSize: 13 }}>or</span>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          multiple
          onChange={(e) => {
            setFiles(Array.from(e.target.files ?? []));
            setStatus(null);
          }}
        />
        <button className="btn secondary" onClick={handleUpload} disabled={status?.type === 'loading'}>
          {status?.type === 'loading' ? 'Working...' : 'Upload File(s)'}
        </button>
      </div>

      {status && (
        <p className={`status ${status.type === 'error' ? 'error' : status.type === 'success' ? 'success' : ''}`}>
          {status.message}
        </p>
      )}

      <div style={{ marginTop: 20 }}>
        <a className="btn secondary" href={`/consumer-indexing/report/${reportDate}`}>
          View report for {reportDate}
        </a>
      </div>
    </div>
  );
}
