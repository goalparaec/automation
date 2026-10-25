'use client';

import { useState } from 'react';

const INPUTS = [
  { key: '360_Cum', label: '360 Cumulative Report', fetchable: true,
    hint: 'Month-to-date postpaid demand and collection.' },
  { key: '360_Daily', label: '360 Daily Report', fetchable: true,
    hint: "The day's postpaid collection (shown for information)." },
  { key: 'Prepaid_Bill', label: 'Prepaid Billing Report', fetchable: false,
    hint: "Prepaid demand. Upload the previous month's file under this month's date." },
  { key: 'Prepaid_Coll', label: 'Prepaid Recharge Report', fetchable: false,
    hint: "Prepaid collection. Upload the previous month's file under this month's date." },
  { key: 'Converted', label: 'Smart Prepaid Converted Status Report', fetchable: false,
    hint: "This month's converted-consumer demand and collection." },
];

function todayIST() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function UploadRow({ input, reportDate }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState(null);

  async function handleFetch() {
    setStatus({ type: 'loading', message: 'Triggering fetch on GitHub Actions...' });
    try {
      const res = await fetch('/api/fetch-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetType: input.key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Trigger failed.');
      setStatus({ type: 'success', message: data.message });
    } catch (err) {
      setStatus({ type: 'error', message: `${err.message} You can still upload the file below.` });
    }
  }

  async function handleUpload() {
    if (!file) {
      setStatus({ type: 'error', message: 'Choose a file first.' });
      return;
    }
    setStatus({ type: 'loading', message: 'Uploading...' });
    const form = new FormData();
    form.append('file', file);
    form.append('reportDate', reportDate);
    form.append('sheetType', input.key);
    // Four of the five reports are shared with the daily report and go through
    // its existing upload route; only Prepaid Recharge has its own.
    const url = input.key === 'Prepaid_Coll' ? '/api/overall-ce/upload' : '/api/upload';
    try {
      const res = await fetch(url, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed.');
      setStatus({ type: 'success', message: `Saved ${data.rowCount} rows under ${reportDate}.` });
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    }
  }

  return (
    <div style={{ borderBottom: '1px solid #e5e7eb', padding: '14px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <strong style={{ minWidth: 260 }}>{input.label}</strong>
        {input.fetchable && (
          <>
            <button className="btn" onClick={handleFetch} disabled={status?.type === 'loading'}>
              Fetch from Portal
            </button>
            <span style={{ color: '#9ca3af', fontSize: 13 }}>or</span>
          </>
        )}
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setStatus(null); }}
        />
        <button className="btn secondary" onClick={handleUpload} disabled={status?.type === 'loading'}>
          {status?.type === 'loading' ? 'Working...' : 'Upload File'}
        </button>
      </div>
      <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>{input.hint}</div>
      {status && (
        <p className={`status ${status.type === 'error' ? 'error' : status.type === 'success' ? 'success' : ''}`}
           style={{ marginBottom: 0, marginTop: 6 }}>
          {status.message}
        </p>
      )}
    </div>
  );
}

export default function OverallCeUpload({ recentDates }) {
  const [reportDate, setReportDate] = useState(todayIST());

  return (
    <div>
      <h1>Overall CE</h1>
      <div className="card">
        <p>
          Overall collection efficiency of the circle: postpaid plus prepaid plus converted consumers, plus the
          monthly manual and assessment amounts. Upload whichever reports have come in; the report uses the
          latest upload of each one <strong>from the same month only</strong>, and never mixes in an earlier month.
          A report not yet uploaded this month is shown as missing and counted as 0.
        </p>
        <p>
          The 360 reports, Prepaid Billing and Converted are the same files the daily report uses, so uploading
          here also updates the daily report for that date.
        </p>

        <div className="field-row">
          <label>Report date</label>
          <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
          <span style={{ color: '#9ca3af', fontSize: 12 }}>
            Counts for {reportDate.slice(0, 7)}. Use this month&apos;s date even for a previous month&apos;s prepaid file.
          </span>
        </div>

        {INPUTS.map((input) => (
          <UploadRow key={input.key} input={input} reportDate={reportDate} />
        ))}

        <div style={{ marginTop: 20 }}>
          <a className="btn" href={`/overall-ce/report/${reportDate}`}>View Overall CE for {reportDate}</a>
          <a className="btn secondary" href={`/overall-ce/monthly?month=${reportDate.slice(0, 7)}`}>Monthly inputs</a>
        </div>
      </div>

      {recentDates?.length > 0 && (
        <div className="card">
          <h2>Previous dates</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {recentDates.map((d) => (
              <a key={d} href={`/overall-ce/report/${d}`}>{d}</a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
