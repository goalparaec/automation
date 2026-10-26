'use client';

import { useMemo, useState } from 'react';
import { ESD_BY_CODE, buildDepositSummary, fyStartOf } from '../../../lib/meterCostCore';

const FLAG_TITLE = {
  different_price: 'Different price',
  phase_mismatch: 'Phase does not match load',
  duplicate: 'Already recorded',
};

export default function MeterCostUpload() {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [preview, setPreview] = useState(null); // { files, stats }
  const [rows, setRows] = useState([]);
  const [saved, setSaved] = useState(null);

  async function readFiles() {
    if (files.length === 0) return setStatus({ type: 'error', message: 'Choose at least one file.' });
    setBusy(true);
    setSaved(null);
    setStatus({ type: 'loading', message: 'Reading files...' });
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    try {
      const res = await fetch('/api/meter-cost/preview', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not read the files.');
      setPreview({ files: data.files, stats: data.stats });
      setRows(data.records.map((r, i) => ({ ...r, _i: i, _needs: r.decision === 'pending' })));
      setStatus(null);
    } catch (err) {
      setPreview(null);
      setRows([]);
      setStatus({ type: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  const update = (i, patch) => setRows((rs) => rs.map((r) => (r._i === i ? { ...r, ...patch } : r)));
  const needs = rows.filter((r) => r._needs);
  const undecided = needs.filter((r) => r.decision === 'pending');

  const impact = useMemo(() => {
    const counted = rows
      .filter((r) => r.decision === 'count')
      .map((r) => ({ esd_code: r.esd_code, kind: r.kind, phase: r.phase, payment_date: r.payment_date, status: 'counted' }));
    if (counted.length === 0) return [];
    const years = [...new Set(counted.map((c) => fyStartOf(c.payment_date)))].sort();
    const out = [];
    for (const fy of years) {
      const s = buildDepositSummary(counted, fy);
      for (const m of s.monthly) {
        if (m.total.total1 + m.total.total3 === 0) continue;
        for (const r of m.rows) if (r.total1 + r.total3 > 0) out.push({ month: m.label, ...r });
      }
    }
    return out;
  }, [rows]);

  async function commit() {
    setBusy(true);
    setStatus({ type: 'loading', message: 'Saving...' });
    try {
      const payload = rows.map(({ _i, _needs, ...r }) => r);
      const res = await fetch('/api/meter-cost/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed.');
      setSaved(data);
      setPreview(null);
      setRows([]);
      setFiles([]);
      setStatus(null);
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  const stats = preview?.stats;
  const autoCount = rows.filter((r) => !r._needs && r.decision === 'count').length;
  const autoIgnore = rows.filter((r) => !r._needs && r.decision === 'ignore').length;

  return (
    <>
      <div className="card">
        <h1>Upload deposit files</h1>
        <p style={{ color: "#6b7280", fontSize: 13 }}>
          Head-wise Collection reports (.xls / .xlsx), any ESD, any month. The ESD is read from the
          consumer number and the month from the payment date. Nothing is saved until you press Save.
        </p>
        <div className="field-row">
          <input type="file" multiple accept=".xls,.xlsx,.csv" onChange={(e) => setFiles([...e.target.files])} />
          <button className="btn" onClick={readFiles} disabled={busy || files.length === 0}>Read files</button>
          <a className="btn secondary" href="/meter-cost">Back</a>
        </div>
        {files.length > 0 && <p style={{ color: "#6b7280", fontSize: 13 }}>{files.length} file(s) chosen.</p>}
        {status && <p className={`status ${status.type === 'error' ? 'error' : ''}`}>{status.message}</p>}
        {saved && (
          <p className="status success">
            Saved {saved.saved} rows ({saved.counted} counted, {saved.ignored} ignored
            {saved.skipped ? `, ${saved.skipped} were already saved` : ''}). <a href="/meter-cost">View the summary</a>
          </p>
        )}
      </div>

      {preview && (
        <>
          <div className="card">
            <h2>Files read</h2>
            <div className="table-scroll">
              <table className="report-table">
                <thead><tr><th>File</th><th>Rows</th><th>Meter-cost rows</th><th>Result</th></tr></thead>
                <tbody>
                  {preview.files.map((f) => (
                    <tr key={f.name}>
                      <td style={{ textAlign: 'left' }}>{f.name}</td>
                      <td>{f.ok ? f.rowsRead : '-'}</td>
                      <td>{f.ok ? f.meterCostRows : '-'}</td>
                      <td style={{ textAlign: 'left', color: f.ok ? undefined : '#b91c1c' }}>
                        {f.ok ? (f.notOurEsd ? `${f.notOurEsd} row(s) from another ESD set aside` : 'OK') : f.error}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ color: "#6b7280", fontSize: 13 }}>
              {autoCount} counted automatically (6,490 / 9,047) - {autoIgnore} ignored (0 / 2,400) -{' '}
              {needs.length} need your decision
              {stats.alreadyImported ? ` - ${stats.alreadyImported} already saved earlier (skipped)` : ''}
              {stats.repeatedInFile ? ` - ${stats.repeatedInFile} repeated rows merged` : ''}.
            </p>
          </div>

          {needs.length > 0 && (
            <div className="card">
              <h2>Needs your decision ({undecided.length} left)</h2>
              <p style={{ color: "#6b7280", fontSize: 13 }}>
                Approve or Add counts the row (choose 1-Ph or 3-Ph). Reject or Delete leaves it out and remembers
                that, so the same file will not ask again.
              </p>
              <div className="table-scroll">
                <table className="report-table">
                  <thead>
                    <tr><th>ESD</th><th>Application</th><th>Consumer</th><th>Head</th><th>Amount</th><th>Load kW</th><th>Paid on</th><th>Why</th><th>Decision</th></tr>
                  </thead>
                  <tbody>
                    {needs.map((r) => (
                      <tr key={r._i}>
                        <td style={{ textAlign: 'left' }}>{ESD_BY_CODE[r.esd_code]}</td>
                        <td style={{ textAlign: 'left' }}>{r.application_no}</td>
                        <td style={{ textAlign: 'left' }}>{r.consumer_no}<br /><small>{r.consumer_name}</small></td>
                        <td style={{ textAlign: 'left' }}>{r.head}</td>
                        <td>{r.amount}</td>
                        <td>{r.load_kw ?? '-'}</td>
                        <td>{r.payment_date}</td>
                        <td style={{ textAlign: 'left', minWidth: 220 }}>
                          <b>{FLAG_TITLE[r.flag] || r.flag}</b><br />{r.message}
                        </td>
                        <td style={{ minWidth: 190 }}>
                          {r.decision === 'pending' ? (
                            <>
                              <select value={r.phase} onChange={(e) => update(r._i, { phase: e.target.value })}>
                                <option value="1">1-Ph</option>
                                <option value="3">3-Ph</option>
                              </select>{' '}
                              <button className="btn" onClick={() => update(r._i, { decision: 'count' })}>
                                {r.flag === 'duplicate' ? 'Add' : 'Approve'}
                              </button>{' '}
                              <button className="btn secondary" onClick={() => update(r._i, { decision: 'ignore' })}>
                                {r.flag === 'duplicate' ? 'Delete' : 'Reject'}
                              </button>
                            </>
                          ) : (
                            <>
                              {r.decision === 'count' ? `Counted as ${r.phase}-Ph` : 'Left out'}{' '}
                              <a href="#" onClick={(e) => { e.preventDefault(); update(r._i, { decision: 'pending' }); }}>Undo</a>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card">
            <h2>What this upload will add</h2>
            {impact.length === 0 ? (
              <p style={{ color: "#6b7280", fontSize: 13 }}>Nothing is counted yet.</p>
            ) : (
              <div className="table-scroll">
                <table className="report-table">
                  <thead><tr><th>Month</th><th>ESD</th><th>New 1-Ph</th><th>New 3-Ph</th><th>Repl. 1-Ph</th><th>Repl. 3-Ph</th></tr></thead>
                  <tbody>
                    {impact.map((r) => (
                      <tr key={r.month + r.esd_code}>
                        <td style={{ textAlign: 'left' }}>{r.month}</td>
                        <td style={{ textAlign: 'left' }}>{r.esd}</td>
                        <td>{r.new1}</td><td>{r.new3}</td><td>{r.rep1}</td><td>{r.rep3}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="field-row" style={{ marginTop: 14 }}>
              <button className="btn" onClick={commit} disabled={busy || undecided.length > 0 || rows.length === 0}>
                Save
              </button>
              {undecided.length > 0 && <span style={{ color: "#6b7280", fontSize: 13 }}>Decide the {undecided.length} row(s) above first.</span>}
              {rows.length === 0 && <span style={{ color: "#6b7280", fontSize: 13 }}>Nothing new to save from these files.</span>}
            </div>
            {status && <p className={`status ${status.type === 'error' ? 'error' : ''}`}>{status.message}</p>}
          </div>
        </>
      )}
    </>
  );
}
