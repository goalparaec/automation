'use client';

import { useState, useEffect } from 'react';
import {
  DEFAULT_SETTINGS, processSheet, mergeProcessed, summarize,
} from '../../lib/prepaidRecoveryCore';

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function PrepaidRecoveryUpload() {
  const [reportDate, setReportDate] = useState(todayISO());
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [esdMap, setEsdMap] = useState(DEFAULT_SETTINGS.esdMap);
  const [results, setResults] = useState(null); // { esdCode: { label, summaryRow } }
  const [recentDates, setRecentDates] = useState([]);

  useEffect(() => {
    fetch('/api/prepaid-recovery/esd-map')
      .then((r) => r.json())
      .then((d) => { if (d.map) setEsdMap(d.map); })
      .catch(() => {});
  }, []);

  async function handleProcess() {
    if (files.length === 0) {
      setStatus('Choose at least one file first.');
      return;
    }
    setBusy(true);
    setResults(null);
    setStatus('Loading parser…');
    try {
      const XLSX = await import('xlsx');
      const settings = { ...DEFAULT_SETTINGS, esdMap };
      const refDate = new Date(`${reportDate}T00:00:00Z`);
      const processedList = [];

      // Payments are counted "since the last report", so find that date first.
      let prevDate = null;
      try {
        const pr = await fetch(`/api/prepaid-recovery/previous-date?reportDate=${reportDate}`);
        const pd = await pr.json();
        if (pr.ok && pd.previousDate) prevDate = new Date(`${String(pd.previousDate).slice(0, 10)}T00:00:00Z`);
      } catch (e) { /* fall back to the one-day window */ }

      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        setStatus(`Reading ${file.name} (${i + 1}/${files.length})…`);
        await sleep(0); // let the UI paint before the heavy parse
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
        setStatus(`Classifying ${file.name} (${rawRows.length.toLocaleString('en-IN')} rows)…`);
        await sleep(0);
        processedList.push(processSheet(rawRows, refDate, settings, prevDate));
      }

      setStatus('Combining ESDs and summarizing…');
      await sleep(0);
      const merged = mergeProcessed(processedList);
      const { rows: summaryRows } = summarize(merged, refDate, prevDate);

      setStatus('Saving to the database…');
      const saved = {};
      for (const summaryRow of summaryRows) {
        const code = summaryRow.esdCode;
        const callListRows = merged.callListRows.filter((r) => r.esdCode === code);
        const paymentsRows = merged.paymentsRows.filter((r) => r.esdCode === code);
        const excludedRows = merged.excludedRows.filter((r) => r.esdCode === code);
        const { analysis, ...summaryOnly } = summaryRow;
        const res = await fetch('/api/prepaid-recovery/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reportDate,
            esdCode: code,
            esdLabel: summaryRow.esdLabel,
            summary: summaryOnly,
            analysis,
            callListRows,
            paymentsRows,
            excludedRows,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(`${summaryRow.esdLabel}: ${err.error || res.statusText}`);
        }
        saved[code] = { label: summaryRow.esdLabel, summaryRow };
      }

      setResults(saved);
      setRecentDates((d) => [reportDate, ...d.filter((x) => x !== reportDate)]);
      setStatus(`Done. ${Object.keys(saved).length} ESD(s) saved for ${reportDate}. Payments counted since ${prevDate ? prevDate.toISOString().slice(0, 10) : 'the previous day'}.`);
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message || 'Something went wrong while processing the files.'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Upload today&apos;s Prepaid Billing Payment Status files</h2>
      <div className="field-row">
        <label>Report date</label>
        <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
      </div>
      <div className="field-row">
        <label>Files</label>
        <input
          type="file"
          multiple
          accept=".xls,.xlsx"
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
        />
      </div>
      {files.length > 0 && (
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>
          {files.map((f) => f.name).join(', ')}
        </div>
      )}
      <button className="btn" onClick={handleProcess} disabled={busy}>
        {busy ? 'Processing…' : 'Process & Save'}
      </button>
      {status && <div className={`status ${status.startsWith('Error') ? 'error' : ''}`}>{status}</div>}

      {results && (
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(results).map(([code, r]) => (
            <span
              key={code}
              style={{
                background: '#dce6f1', borderRadius: 999, padding: '6px 12px', fontSize: 13,
              }}
            >
              {r.label} ({code}) — {r.summaryRow.callListTotal} to call
            </span>
          ))}
        </div>
      )}

      {results && (
        <div style={{ marginTop: 16 }}>
          <a className="btn" href={`/prepaid-recovery/report/${reportDate}`}>
            View {reportDate} report
          </a>
        </div>
      )}

      {recentDates.length > 1 && (
        <div style={{ marginTop: 16, fontSize: 13 }}>
          Also saved this session: {recentDates.slice(1).map((d) => (
            <a key={d} href={`/prepaid-recovery/report/${d}`} style={{ marginRight: 10 }}>{d}</a>
          ))}
        </div>
      )}
    </div>
  );
}
