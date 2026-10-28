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
  // Consumers eligible for Workmaster billing (Non-Comm, unbilled). Built from the files just
  // uploaded and kept only in this browser page: it is never sent to the server or saved.
  const [eligible, setEligible] = useState(null); // { date, byEsd: { code: { label, rows } } }

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
    setEligible(null);
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
      const eligibleByEsd = {};
      for (const e of merged.nonCommEligibleRows || []) {
        if (!eligibleByEsd[e.esdCode]) eligibleByEsd[e.esdCode] = { label: e.esdLabel, rows: [] };
        eligibleByEsd[e.esdCode].rows.push(e.raw);
      }

      setStatus('Saving to the database…');
      const saved = {};
      for (const summaryRow of summaryRows) {
        const code = summaryRow.esdCode;
        const callListRows = merged.callListRows.filter((r) => r.esdCode === code);
        const paymentsRows = merged.paymentsRows.filter((r) => r.esdCode === code);
        const excludedRows = merged.excludedRows.filter((r) => r.esdCode === code);
        const { analysis, ...summaryOnly } = summaryRow;
        const label = summaryRow.esdLabel;

        // Sends one JSON request; shows a readable error even when the server
        // (e.g. Vercel's size limit) replies with something that isn't JSON.
        const post = async (payload) => {
          const res = await fetch('/api/prepaid-recovery/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportDate, esdCode: code, ...payload }),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            let msg = '';
            try { msg = JSON.parse(text).error; } catch { /* not JSON */ }
            throw new Error(`${label}: ${msg || text.slice(0, 120) || `HTTP ${res.status}`}`);
          }
        };

        // Same ordering the server used: largest negative balance first.
        const sortedCalls = [...callListRows].sort(
          (x, y) => (x.balance ?? 0) - (y.balance ?? 0) || String(x.consumerNo).localeCompare(String(y.consumerNo)),
        );

        setStatus(`Saving ${label} (summary)…`);
        await post({ part: 'start', esdLabel: label, summary: summaryOnly, analysis });

        const BATCH = 4000; // keeps each request well under Vercel's 4.5 MB limit
        const sendRows = async (kind, list, name) => {
          for (let off = 0; off < list.length; off += BATCH) {
            setStatus(`Saving ${label} ${name} (${Math.min(off + BATCH, list.length).toLocaleString('en-IN')}/${list.length.toLocaleString('en-IN')})…`);
            await post({ part: 'rows', kind, rows: list.slice(off, off + BATCH), serialStart: off + 1 });
          }
        };
        await sendRows('calllist', sortedCalls, 'call list');
        await sendRows('payments', paymentsRows, 'payments');
        await sendRows('excluded', excludedRows, 'excluded');
        saved[code] = { label: summaryRow.esdLabel, summaryRow };
      }

      setResults(saved);
      setEligible({ date: reportDate, byEsd: eligibleByEsd });
      setRecentDates((d) => [reportDate, ...d.filter((x) => x !== reportDate)]);
      setStatus(`Done. ${Object.keys(saved).length} ESD(s) saved for ${reportDate}. Payments counted since ${prevDate ? prevDate.toISOString().slice(0, 10) : 'the previous day'}.`);
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message || 'Something went wrong while processing the files.'}`);
    } finally {
      setBusy(false);
    }
  }

  // Writes the eligible list straight from the browser. Every column of the billing status
  // file is kept exactly as it was in the file (same order, same values), no colouring.
  async function downloadEligible() {
    if (!eligible) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    let any = false;
    for (const [code, e] of Object.entries(eligible.byEsd).sort(([a], [b]) => a.localeCompare(b))) {
      if (!e.rows.length) continue;
      any = true;
      const sheet = XLSX.utils.json_to_sheet(e.rows, { header: Object.keys(e.rows[0]) });
      XLSX.utils.book_append_sheet(wb, sheet, String(e.label || code).replace(/[\\/*?:[\]]/g, ' ').slice(0, 31));
    }
    if (!any) { setStatus('No consumers are eligible for Workmaster billing in these files.'); return; }
    const [y, m, d] = eligible.date.split('-');
    XLSX.writeFile(wb, `Prepaid-NonComm-Eligible-for-Billing-${d}.${m}.${y}.xlsx`);
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

      {results && eligible && (
        <div style={{ marginTop: 16, padding: 12, background: '#eef3f9', borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            Non-Comm consumers eligible for Workmaster billing: {Object.values(eligible.byEsd).reduce((t, e) => t + e.rows.length, 0).toLocaleString('en-IN')}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {Object.entries(eligible.byEsd).sort(([a], [b]) => a.localeCompare(b)).map(([code, e]) => (
              <span key={code} style={{ background: '#fff', borderRadius: 999, padding: '4px 10px', fontSize: 13 }}>
                {e.label}: {e.rows.length.toLocaleString('en-IN')}
              </span>
            ))}
          </div>
          <button className="btn" onClick={downloadEligible}>Download eligible list (Excel)</button>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
            This list is not saved. Download it before leaving this page; to get it again, upload the files again.
          </div>
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
