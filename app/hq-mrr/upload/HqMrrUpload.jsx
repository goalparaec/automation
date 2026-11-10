'use client';

import { useState } from 'react';
import { parseConsumerwiseGrid, monthFromFileName, monthName } from '../../../lib/hqMrrCore';

const ESDS = ['Dhupdhara', 'Dudhnoi', 'Goalpara', 'Lakhipur', 'Mankachar'];

export default function HqMrrUpload({ month, injection, irca, uploads, solar }) {
  const [files, setFiles] = useState({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [results, setResults] = useState([]);

  // Consumer-wise MRRs are big, so they are read here in the browser; only the totals are sent.
  async function readSolar(file) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', dense: true });
    let lastErr = null;
    for (const name of wb.SheetNames) {
      const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true, blankrows: false });
      try {
        return parseConsumerwiseGrid(grid);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('No sheets found in the file.');
  }

  async function save() {
    const form = new FormData();
    form.append('month', month);
    let n = 0;
    for (const e of [...ESDS, 'IRCA']) {
      if (files[e]) { form.append(`file_${e}`, files[e]); n += 1; }
    }
    const solarEsds = ESDS.filter((e) => files[`solar_${e}`]);
    n += solarEsds.length;
    if (n === 0) return setStatus({ type: 'error', message: 'Choose at least one file.' });
    setBusy(true);
    setResults([]);
    setStatus({ type: 'loading', message: 'Reading and saving...' });
    try {
      // 1. read every consumer-wise file first; if one is bad nothing is saved
      const solarItems = {};
      const solarResults = [];
      for (const e of solarEsds) {
        const f = files[`solar_${e}`];
        try {
          const p = await readSolar(f);
          // consumer-wise files carry no month column, so the month is checked against the file name
          const fm = p.month || monthFromFileName(f.name);
          if (fm && fm !== `${month}-01`) {
            throw new Error(`The file is for ${monthName(fm)}, but you chose ${monthName(`${month}-01`)}.`);
          }
          solarItems[e] = { solar_kwh: p.solar_kwh, consumers: p.consumers, column: p.column, file_name: f.name };
          solarResults.push({ esd: `solar_${e}`, ok: true, rows: p.consumers, kwh: p.solar_kwh, column: p.column, warnings: p.warnings });
        } catch (err) {
          solarResults.push({ esd: `solar_${e}`, file: f.name, ok: false, error: err.message });
        }
      }
      if (solarResults.some((r) => !r.ok)) {
        setResults(solarResults);
        throw new Error('Nothing was saved. Fix the consumer-wise files marked below and try again.');
      }
      // 2. commercial MRR / IRCA files
      let mainResults = [];
      if (n > solarEsds.length) {
        const res = await fetch('/api/hq-mrr/upload', { method: 'POST', body: form });
        const data = await res.json();
        mainResults = data.results || [];
        setResults([...mainResults, ...solarResults]);
        if (!res.ok) throw new Error(data.error || 'Could not save.');
      }
      // 3. solar totals
      if (solarEsds.length) {
        setResults([...mainResults, ...solarResults]);
        const res = await fetch('/api/hq-mrr/solar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month, items: solarItems }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not save the solar adjustment.');
      }
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
      {r && r.ok && r.kwh === undefined && r.warnings?.length > 0 && <div className="status error">{r.warnings.join(' ')}</div>}
      {r && r.ok && r.kwh !== undefined && (
        <div className="status success">
          Read {r.rows} consumers - solar adjustment {Math.round(r.kwh).toLocaleString('en-IN')} kWh (column &quot;{r.column}&quot;)
          {r.warnings?.length > 0 && <> - {r.warnings.join(' ')}</>}
        </div>
      )}
      {r && r.ok && r.kwh === undefined && !r.warnings?.length && <div className="status success">Read {r.rows} {r.esd === 'IRCA' ? 'ESD rows' : 'categories'}</div>}
    </>
  );
  const pick = (key) => (ev) => setFiles((f) => ({ ...f, [key]: ev.target.files?.[0] || null }));

  return (
    <>
      <p style={{ color: '#6b7280', fontSize: 13 }}>
        For each ESD choose its <b>category-wise commercial MRR</b> (the HQ-format file, sheet &quot;Smart Prepaid Converted Data&quot;).
        Also choose each ESD&apos;s <b>consumer-wise MRR</b> - its <b>Solar Unit Adjustment</b> column is totalled and added to the energy injection for Billing Efficiency.
        Then choose the circle&apos;s <b>IRCA ESD-wise MRR</b> once - its units billed against our five ESDs are added for Billing Efficiency.
        You can upload one file at a time; a new file replaces the one saved before. Energy injection comes from Monthly Inputs.
      </p>
      <div className="table-scroll">
        <table className="report-table">
          <thead>
            <tr>
              <th>ESD</th>
              <th style={{ textAlign: 'left' }}>Commercial MRR file</th>
              <th style={{ textAlign: 'left' }}>Consumer-wise MRR file (solar)</th>
              <th>Energy injection in app (kWh)</th>
              <th>IRCA units saved (kWh)</th>
              <th>Solar adjustment saved (kWh)</th>
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
                <td style={{ textAlign: 'left' }}>
                  <input type="file" accept=".xls,.xlsx,.csv" onChange={pick(`solar_${e}`)} />
                  {note(results.find((x) => x.esd === `solar_${e}`))}
                </td>
                <td>{injection?.[e] ? Number(injection[e]).toLocaleString('en-IN') : <span style={{ color: '#b91c1c' }}>not entered</span>}</td>
                <td>{irca?.units?.[e] ? Number(irca.units[e]).toLocaleString('en-IN') : <span style={{ color: '#b91c1c' }}>not uploaded</span>}</td>
                <td>{solar?.units?.[e] !== undefined ? Math.round(solar.units[e]).toLocaleString('en-IN') : <span style={{ color: '#b91c1c' }}>not uploaded</span>}</td>
                <td style={{ textAlign: 'left', fontSize: 12 }}>{uploads?.[e]?.file_name || '-'}{solar?.info?.[e]?.file_name ? <><br />{solar.info[e].file_name}</> : null}</td>
              </tr>
            ))}
            <tr>
              <td>IRCA</td>
              <td style={{ textAlign: 'left' }} colSpan={4}>
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
