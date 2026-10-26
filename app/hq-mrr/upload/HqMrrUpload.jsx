'use client';

import { useState } from 'react';

const ESDS = ['Dhupdhara', 'Dudhnoi', 'Goalpara', 'Lakhipur', 'Mankachar'];

export default function HqMrrUpload({ month, injection, irca, uploads }) {
  const [files, setFiles] = useState({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [results, setResults] = useState([]);

  async function save() {
    const form = new FormData();
    form.append('month', month);
    let n = 0;
    for (const e of [...ESDS, 'IRCA']) {
      if (files[e]) { form.append(`file_${e}`, files[e]); n += 1; }
    }
    if (n === 0) return setStatus({ type: 'error', message: 'Choose at least one file.' });
    setBusy(true);
    setResults([]);
    setStatus({ type: 'loading', message: 'Reading and saving...' });
    try {
      const res = await fetch('/api/hq-mrr/upload', { method: 'POST', body: form });
      const data = await res.json();
      setResults(data.results || []);
      if (!res.ok) throw new Error(data.error || 'Could not save.');
      setStatus({ type: 'success', message: `Saved ${n} file(s) for ${month}. Open the report to see the figures.` });
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  const note = (r) => (
    <>
      {r && !r.ok && <div className="status error">{r.error}</div>}
      {r && r.ok && r.warnings?.length > 0 && <div className="status error">{r.warnings.join(' ')}</div>}
      {r && r.ok && !r.warnings?.length && <div className="status success">Read {r.rows} {r.esd === 'IRCA' ? 'ESD rows' : 'categories'}</div>}
    </>
  );
  const pick = (key) => (ev) => setFiles((f) => ({ ...f, [key]: ev.target.files?.[0] || null }));

  return (
    <>
      <p style={{ color: '#6b7280', fontSize: 13 }}>
        For each ESD choose its <b>category-wise commercial MRR</b> (the HQ-format file, sheet &quot;Smart Prepaid Converted Data&quot;).
        Then choose the circle&apos;s <b>IRCA ESD-wise MRR</b> once - its units billed against our five ESDs are added for Billing Efficiency.
        You can upload one file at a time; a new file replaces the one saved before. Energy injection comes from Monthly Inputs.
      </p>
      <div className="table-scroll">
        <table className="report-table">
          <thead>
            <tr>
              <th>ESD</th>
              <th style={{ textAlign: 'left' }}>Commercial MRR file</th>
              <th>Energy injection in app (kWh)</th>
              <th>IRCA units saved (kWh)</th>
              <th style={{ textAlign: 'left' }}>Saved file</th>
            </tr>
          </thead>
          <tbody>
            {ESDS.map((e) => (
              <tr key={e}>
                <td>{e}</td>
                <td style={{ textAlign: 'left' }}>
                  <input type="file" accept=".xls,.xlsx,.csv" onChange={pick(e)} />
                  {note(results.find((x) => x.esd === e))}
                </td>
                <td>{injection?.[e] ? Number(injection[e]).toLocaleString('en-IN') : <span style={{ color: '#b91c1c' }}>not entered</span>}</td>
                <td>{irca?.units?.[e] ? Number(irca.units[e]).toLocaleString('en-IN') : <span style={{ color: '#b91c1c' }}>not uploaded</span>}</td>
                <td style={{ textAlign: 'left', fontSize: 12 }}>{uploads?.[e]?.file_name || '-'}</td>
              </tr>
            ))}
            <tr>
              <td>IRCA</td>
              <td style={{ textAlign: 'left' }} colSpan={3}>
                <input type="file" accept=".xls,.xlsx,.csv" onChange={pick('IRCA')} />
                {note(results.find((x) => x.esd === 'IRCA'))}
              </td>
              <td style={{ textAlign: 'left', fontSize: 12 }}>{irca?.fileName || '-'}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="field-row">
        <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
        <a className="btn secondary" href={`/hq-mrr?month=${month}-01`}>View report</a>
        <a className="btn secondary" href="/manual-inputs">Monthly Inputs (injection)</a>
      </div>
      {status && <p className={`status ${status.type === 'error' ? 'error' : status.type === 'success' ? 'success' : ''}`}>{status.message}</p>}
    </>
  );
}
