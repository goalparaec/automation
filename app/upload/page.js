'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function UploadPage() {
  const [date, setDate] = useState(todayISO());
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState(null); // { type: 'success'|'error'|'loading', message }
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) {
      setStatus({ type: 'error', message: 'Please choose the workbook file first.' });
      return;
    }
    setStatus({ type: 'loading', message: 'Uploading and parsing... this can take a little while for a large file.' });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('reportDate', date);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed.');

      const summary = Object.entries(data.rowCounts)
        .map(([sheet, count]) => `${sheet}: ${count} rows`)
        .join(', ');
      setStatus({ type: 'success', message: `Done. ${summary}` });

      setTimeout(() => router.push(`/reports/${date}`), 1200);
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    }
  }

  return (
    <div className="card">
      <h1>Upload daily workbook</h1>
      <p>
        Upload the master GpEC workbook for a given date. Only the 5 sheets the
        report needs (360_Daily, 360_Cum, Converted, Prepaid_Bill, IRCA_Bill)
        are read — the large unused sheets are skipped automatically.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <label>Report date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="field-row">
          <label>Workbook (.xlsx)</label>
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
        </div>
        <button className="btn" type="submit" disabled={status?.type === 'loading'}>
          Upload & Generate
        </button>
      </form>
      {status && (
        <p className={`status ${status.type === 'error' ? 'error' : status.type === 'success' ? 'success' : ''}`}>
          {status.message}
        </p>
      )}
    </div>
  );
}
