'use client';

import { useMemo, useState } from 'react';
import {
  DEFAULT_TOLERANCE, normalizeStatement, normalizeStatus, billDateCounts, findSingleBillCandidates, toDate,
} from '../../lib/prepaidSingleBillCore.js';
import { buildSingleBillWorkbook } from '../../lib/prepaidSingleBillExcel.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (d) => d.toISOString().slice(0, 10);
const dmy = (d) => (d ? iso(d).split('-').reverse().join('-') : '');
const n0 = (v) => Math.round(v).toLocaleString('en-IN');
const n2 = (v) => (v == null ? '' : Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

async function readSheet(XLSX, file) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
}

export default function SingleBillClient() {
  const [stmtFile, setStmtFile] = useState(null);
  const [statusFile, setStatusFile] = useState(null);
  const [data, setData] = useState(null); // { statement, status }
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tolerance, setTolerance] = useState(String(DEFAULT_TOLERANCE));
  const [minUnits, setMinUnits] = useState('0');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const dates = useMemo(() => (data ? billDateCounts(data.statement) : []), [data]);

  async function readFiles() {
    if (!stmtFile || !statusFile) { setMsg({ type: 'error', text: 'Choose both files first.' }); return; }
    setBusy(true); setResult(null); setMsg({ type: 'loading', text: 'Loading parser…' });
    try {
      const XLSX = await import('xlsx');
      setMsg({ type: 'loading', text: `Reading ${stmtFile.name}…` });
      await sleep(0);
      const statement = normalizeStatement(await readSheet(XLSX, stmtFile));
      setMsg({ type: 'loading', text: `Reading ${statusFile.name}…` });
      await sleep(0);
      const status = normalizeStatus(await readSheet(XLSX, statusFile));
      const bd = billDateCounts(statement);
      if (bd.length) {
        // Default: the last four Bill Dates in the statement (usually the last days of the month).
        const last = bd[bd.length - 1].date;
        setTo(iso(last));
        setFrom(iso(new Date(last.getTime() - 3 * 86400000)));
      }
      setData({ statement, status });
      setMsg({ type: 'success', text: `Read ${statement.length.toLocaleString('en-IN')} statement rows and ${status.length.toLocaleString('en-IN')} status rows. Choose the Bill Dates and click Find consumers.` });
    } catch (e) {
      setData(null);
      setMsg({ type: 'error', text: e.message });
    } finally { setBusy(false); }
  }

  function find() {
    const f = toDate(from ? from.split('-').reverse().join('/') : '');
    const t = toDate(to ? to.split('-').reverse().join('/') : '');
    if (!f || !t || f > t) { setMsg({ type: 'error', text: 'Choose a valid From and To date.' }); return; }
    const r = findSingleBillCandidates({
      statement: data.statement, status: data.status, from: f, to: t,
      tolerance: Number(tolerance) || 0, minUnits: Number(minUnits) || 0,
    });
    setResult({ ...r, from: f, to: t });
    setMsg(null);
  }

  async function download() {
    setBusy(true); setMsg({ type: 'loading', text: 'Building the Excel…' });
    try {
      await sleep(0);
      const ExcelJS = (await import('exceljs')).default;
      const wb = buildSingleBillWorkbook(ExcelJS, { statement: data.statement, status: data.status, result, from: result.from, to: result.to });
      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `Prepaid_Single_Bill_${dmy(result.from)}_to_${dmy(result.to)}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setMsg(null);
    } catch (e) {
      setMsg({ type: 'error', text: `Could not build the Excel: ${e.message}` });
    } finally { setBusy(false); }
  }

  const s = result?.summary;
  return (
    <div>
      <div className="card">
        <h1>Prepaid single-bill check</h1>
        <p>
          Finds consumers whose <strong>whole month was billed in one bill</strong>: the last bill in the Billing Payment
          Status file is the same bill as the Prepaid Statement&apos;s last Bill Date, and its Unit Billed equals the
          statement&apos;s total month units. Shows the month-end balance, the current balance and any payment made on or
          after that bill (any month).
        </p>
        <div className="field-row">
          <label>Prepaid Statement (previous month)</label>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setStmtFile(e.target.files?.[0] ?? null)} />
        </div>
        <div className="field-row">
          <label>Billing Payment Status (this month)</label>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setStatusFile(e.target.files?.[0] ?? null)} />
        </div>
        <button className="btn" onClick={readFiles} disabled={busy}>{busy ? 'Please wait…' : 'Read files'}</button>
        {msg && <p className={`status ${msg.type === 'error' ? 'error' : msg.type === 'success' ? 'success' : ''}`}>{msg.text}</p>}
      </div>

      {data && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Bill Dates to consider (from the statement)</h2>
          <div className="field-row">
            <label>From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <label>To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="field-row">
            <label>Units tolerance</label>
            <input type="number" step="0.1" min="0" value={tolerance} onChange={(e) => setTolerance(e.target.value)} style={{ width: 90 }} />
            <label>Minimum month units</label>
            <input type="number" min="0" value={minUnits} onChange={(e) => setMinUnits(e.target.value)} style={{ width: 90 }} />
          </div>
          <p style={{ fontSize: 13, margin: '4px 0 10px' }}>
            Bill Dates in the statement:{' '}
            {dates.slice(-12).map((d) => `${dmy(d.date)} (${d.count.toLocaleString('en-IN')})`).join(', ')}
          </p>
          <button className="btn" onClick={find}>Find consumers</button>
        </div>
      )}

      {result && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>
            {s.consumers.toLocaleString('en-IN')} consumers billed once for the whole month ({dmy(result.from)} to {dmy(result.to)})
          </h2>
          <div className="table-scroll">
            <table className="report-table" style={{ fontSize: 13 }}>
              <tbody>
                <tr><td>Statement consumers with a Bill Date in range</td><td>{result.stats.inRange.toLocaleString('en-IN')}</td></tr>
                <tr><td>Left out: month units not above minimum</td><td>{result.stats.belowMinUnits.toLocaleString('en-IN')}</td></tr>
                <tr><td>Left out: not in the status file</td><td>{result.stats.notInStatus.toLocaleString('en-IN')}</td></tr>
                <tr><td>Left out: billed again since (a newer last bill)</td><td>{result.stats.billedAgain.toLocaleString('en-IN')}</td></tr>
                <tr><td>Left out: last bill is only part of the month</td><td>{result.stats.severalBills.toLocaleString('en-IN')}</td></tr>
                <tr><td><strong>Consumers listed</strong></td><td><strong>{s.consumers.toLocaleString('en-IN')}</strong></td></tr>
                <tr><td>Units billed (last bill)</td><td>{n2(s.unitBilled)}</td></tr>
                <tr><td>Balance at month end (Rs)</td><td>{n0(s.balanceMonth)}</td></tr>
                <tr><td>Current balance (Rs)</td><td>{n0(s.balanceNow)}</td></tr>
                <tr><td>Paid on or after bill date</td><td>{s.paidCount.toLocaleString('en-IN')} consumers, Rs {n0(s.paidAmount)}</td></tr>
              </tbody>
            </table>
          </div>
          <button className="btn" style={{ marginTop: 12 }} onClick={download} disabled={busy || s.consumers === 0}>Download Excel</button>

          {s.consumers > 0 && (
            <>
              <h3>First {Math.min(50, s.consumers)} consumers</h3>
              <div className="table-scroll">
                <table className="report-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Consumer No</th><th>Name</th><th>Last bill</th><th>Unit billed</th><th>Balance month end</th>
                      <th>Current balance</th><th>Last payment</th><th>Paid on/after bill</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.candidates.slice(0, 50).map((c) => (
                      <tr key={c.consumerNo}>
                        <td>{c.consumerNo}</td><td style={{ textAlign: 'left' }}>{c.name}</td><td>{dmy(c.lastBillDate)}</td>
                        <td>{n2(c.unitBilled)}</td><td>{n2(c.balanceMonth)}</td><td>{n2(c.balanceNow)}</td>
                        <td>{c.lastPaymentDate ? `${dmy(c.lastPaymentDate)} / ${n2(c.lastPaymentAmount)}` : ''}</td><td>{n2(c.paidAfterBill)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
