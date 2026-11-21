'use client';

import { useState } from 'react';
import {
  parseListSheets, indexBillingRows, evaluateCheck, totalsOf, checkHeaderTotals, esdsMissingFromFiles,
  staleWarning as buildStaleWarning, esdLabelOf, fmtDateDMY,
} from '../../lib/watchlistCore';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const inr = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const BATCH = 1500; // keeps each request well under Vercel's 4.5 MB limit

/** One JSON request that shows a readable error even when the server replies with something that isn't JSON. */
async function postJson(url, payload, what) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const text = await res.text().catch(() => '');
  let data = {};
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  if (!res.ok) throw new Error(`${what}: ${data.error || text.slice(0, 140) || `HTTP ${res.status}`}`);
  return data;
}

export default function WatchlistManager({ initialLists }) {
  const [lists, setLists] = useState(initialLists || []);

  // ---- 1. list upload
  const [listName, setListName] = useState(initialLists && initialLists[0] ? initialLists[0].name : '');
  const [listMode, setListMode] = useState('replace');
  const [listFile, setListFile] = useState(null);
  const [asOnDate, setAsOnDate] = useState(todayISO());
  const [edits, setEdits] = useState({}); // per list: { asOn, criteria } being edited in the table
  const [metaStatus, setMetaStatus] = useState('');
  const [listStatus, setListStatus] = useState('');
  const [listBusy, setListBusy] = useState(false);

  // ---- 2. daily check
  const [checkListId, setCheckListId] = useState(initialLists && initialLists[0] ? String(initialLists[0].id) : '');
  const [reportDate, setReportDate] = useState(todayISO());
  const [files, setFiles] = useState([]);
  const [checkStatus, setCheckStatus] = useState('');
  const [checkBusy, setCheckBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function refreshLists() {
    try {
      const res = await fetch('/api/watchlist/lists', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) {
        setLists(data.lists || []);
        return data.lists || [];
      }
    } catch { /* keep what we have */ }
    return null;
  }

  async function handleListUpload() {
    if (!listName.trim()) { setListStatus('Error: give the list a name.'); return; }
    if (!listFile) { setListStatus('Error: choose the Excel file with the consumer list.'); return; }
    const existing = lists.find((l) => l.name === listName.trim());
    if (existing && existing.as_on_date && existing.as_on_date !== asOnDate && existing.dates && existing.dates.length > 0
      && !window.confirm(`The reference date changes from ${fmtDateDMY(existing.as_on_date)} to ${fmtDateDMY(asOnDate)}. `
        + 'All saved daily checks of this list will be removed and you will need to upload the billing files again. Continue?')) {
      return;
    }
    setListBusy(true);
    setListStatus('Reading the file…');
    try {
      const XLSX = await import('xlsx');
      await sleep(0);
      const wb = XLSX.read(await listFile.arrayBuffer(), { type: 'array' });
      const sheets = wb.SheetNames.map((sheetName) => ({
        sheetName, rows: XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' }),
      }));
      const parsed = parseListSheets(sheets);
      if (parsed.consumers.length === 0) {
        throw new Error('No consumers found. The file needs a "Consumer No" column header on at least one sheet.');
      }
      const byEsd = {};
      for (const c of parsed.consumers) byEsd[c.esdCode] = (byEsd[c.esdCode] || 0) + 1;

      setListStatus(`Found ${parsed.consumers.length.toLocaleString('en-IN')} consumers on sheet(s) ${parsed.readSheets.join(', ')}. Saving…`);
      const start = await postJson('/api/watchlist/lists', { part: 'start', name: listName.trim(), sourceFile: listFile.name, asOnDate }, 'Could not start');
      const { listId, syncId } = start;
      const listedOn = asOnDate; // the date the balances in this file are "as on"
      for (let off = 0; off < parsed.consumers.length; off += BATCH) {
        setListStatus(`Saving consumers (${Math.min(off + BATCH, parsed.consumers.length).toLocaleString('en-IN')}/${parsed.consumers.length.toLocaleString('en-IN')})…`);
        await postJson('/api/watchlist/lists', {
          part: 'rows', listId, syncId, listedOn, consumers: parsed.consumers.slice(off, off + BATCH),
        }, 'Could not save consumers');
      }
      const fin = await postJson('/api/watchlist/lists', { part: 'finish', listId, syncId, mode: listMode }, 'Could not finish');
      const esdText = Object.entries(byEsd).sort(([a], [b]) => a.localeCompare(b))
        .map(([c, n]) => `${esdLabelOf(c)} ${n}`).join(', ');
      setListStatus(
        `Done. "${listName.trim()}" now has ${fin.total.toLocaleString('en-IN')} consumers (${esdText}).`
        + `${fin.removed ? ` ${fin.removed} consumer(s) no longer in the file were removed from the list.` : ''}`
        + `${parsed.skippedSheets.length ? ` Skipped sheet(s) without a Consumer No column: ${parsed.skippedSheets.join(', ')}.` : ''}`,
      );
      await refreshLists();
      if (!checkListId) setCheckListId(String(listId));
    } catch (err) {
      console.error(err);
      setListStatus(`Error: ${err.message || 'Something went wrong while saving the list.'}`);
    } finally {
      setListBusy(false);
    }
  }

  async function handleSaveMeta(l) {
    const e = edits[l.id] || {};
    const asOn = e.asOn !== undefined ? e.asOn : (l.as_on_date || '');
    const criteria = e.criteria !== undefined ? e.criteria : (l.criteria_text || '');
    if (asOn !== (l.as_on_date || '') && l.as_on_date && l.dates && l.dates.length > 0
      && !window.confirm(`Changing the reference date from ${fmtDateDMY(l.as_on_date)} to ${fmtDateDMY(asOn)} removes all saved daily checks of "${l.name}" `
        + '(cumulative figures start again from the new date). You will need to upload the billing files again. Continue?')) {
      return;
    }
    try {
      const res = await fetch('/api/watchlist/lists', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: l.id, asOnDate: asOn || null, criteriaText: criteria }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMetaStatus(`Saved "${l.name}".${data.clearedChecks ? ' Saved daily checks were removed; upload the billing files again.' : ''}`);
      setEdits((prev) => { const n = { ...prev }; delete n[l.id]; return n; });
      await refreshLists();
    } catch (err) {
      setMetaStatus(`Error: ${err.message}`);
    }
  }

  async function handleDeleteList(l) {
    if (!window.confirm(`Delete the list "${l.name}" with all its daily results? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/watchlist/lists?id=${l.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const fresh = await refreshLists();
      if (String(l.id) === checkListId) setCheckListId(fresh && fresh[0] ? String(fresh[0].id) : '');
    } catch (err) {
      setListStatus(`Error: ${err.message}`);
    }
  }

  async function handleCheck() {
    if (!checkListId) { setCheckStatus('Error: choose a list (upload one first).'); return; }
    if (files.length === 0) { setCheckStatus('Error: choose at least one Billing Payment Status file.'); return; }
    setCheckBusy(true);
    setResult(null);
    try {
      setCheckStatus('Loading the list…');
      const bres = await fetch(`/api/watchlist/baseline?listId=${checkListId}&reportDate=${reportDate}`, { cache: 'no-store' });
      const baseline = await bres.json();
      if (!bres.ok) throw new Error(baseline.error || 'Could not load the list.');
      if (baseline.laterDate) {
        throw new Error(`A check for ${fmtDateDMY(baseline.laterDate)} is already saved for this list. Checks must be uploaded in date order.`);
      }
      if (baseline.items.length === 0) throw new Error('This list has no consumers.');

      setCheckStatus('Loading parser…');
      const XLSX = await import('xlsx');
      const rowsByFile = [];
      for (let i = 0; i < files.length; i += 1) {
        setCheckStatus(`Reading ${files[i].name} (${i + 1}/${files.length})…`);
        await sleep(0); // let the UI paint before the heavy parse
        const wb = XLSX.read(await files[i].arrayBuffer(), { type: 'array' });
        rowsByFile.push(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }));
      }

      setCheckStatus('Matching the listed consumers…');
      await sleep(0);
      const idx = indexBillingRows(rowsByFile, baseline.items.map((it) => it.consumerNo));
      const rows = evaluateCheck({ listItems: baseline.items, billingByNo: idx.byNo });
      const totals = checkHeaderTotals(rows);
      const sum = totalsOf(rows);
      const stale = buildStaleWarning(reportDate, idx.latestBillDate);
      const missingEsds = esdsMissingFromFiles(rows);

      setCheckStatus('Saving…');
      await postJson('/api/watchlist/check', {
        part: 'start', listId: checkListId, reportDate, fileNames: files.map((f) => f.name).join(', '),
        rowsInFiles: idx.totalRows, staleWarning: stale,
      }, 'Could not start saving');
      for (let off = 0; off < rows.length; off += BATCH) {
        setCheckStatus(`Saving (${Math.min(off + BATCH, rows.length).toLocaleString('en-IN')}/${rows.length.toLocaleString('en-IN')})…`);
        await postJson('/api/watchlist/check', {
          part: 'rows', listId: checkListId, reportDate, rows: rows.slice(off, off + BATCH),
        }, 'Could not save results');
      }
      await postJson('/api/watchlist/check', { part: 'finish', listId: checkListId, reportDate, totals }, 'Could not finish');

      setResult({ listId: checkListId, reportDate, sum, stale, missingEsds, previousDate: baseline.previousDate, totalRows: idx.totalRows });
      setCheckStatus(`Done. ${sum.paidN.toLocaleString('en-IN')} consumer(s) paid, Rs ${inr(sum.paidAmt)} realized since `
        + `${baseline.previousDate ? `the previous check (${fmtDateDMY(baseline.previousDate)})` : 'the list was uploaded'}.`);
      refreshLists();
    } catch (err) {
      console.error(err);
      setCheckStatus(`Error: ${err.message || 'Something went wrong while checking the files.'}`);
    } finally {
      setCheckBusy(false);
    }
  }

  const selected = lists.find((l) => String(l.id) === String(checkListId));

  return (
    <div>
      {/* ---------------- Lists ---------------- */}
      <div className="card">
        <h2>1. Consumer list</h2>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 0 }}>
          Upload the Excel file with the consumers to track (any sheets; each needs a <b>Consumer No</b> column; the ESD is taken
          from the first 3 digits). The list stays fixed until you upload it again: the same name with Replace swaps it for the new
          file, Add / update only adds to it. Consumers already on a list keep their original &quot;before&quot; balance and past realization.
        </p>
        <div className="field-row">
          <label>List name</label>
          <input
            list="wl-names" value={listName}
            onChange={(e) => {
              const v = e.target.value;
              setListName(v);
              const hit = lists.find((l) => l.name === v.trim());
              if (hit && hit.as_on_date) setAsOnDate(hit.as_on_date); // keep the list's saved reference date
            }}
            placeholder="e.g. Negative balance more than 10K" style={{ minWidth: 300 }}
          />
          <datalist id="wl-names">{lists.map((l) => <option key={l.id} value={l.name} />)}</datalist>
        </div>
        <div className="field-row">
          <label>Excel file</label>
          <input type="file" accept=".xls,.xlsx" onChange={(e) => setListFile((e.target.files || [])[0] || null)} />
        </div>
        <div className="field-row">
          <label>Balances as on</label>
          <input type="date" value={asOnDate} onChange={(e) => setAsOnDate(e.target.value)} />
          <span style={{ fontSize: 13, color: '#6b7280' }}>
            reference date: the balances in this file are as on this date, and every payment dated AFTER it is counted as realized
          </span>
        </div>
        <div className="field-row">
          <label>If the list exists</label>
          <label style={{ minWidth: 0, color: '#1a1a1a' }}>
            <input type="radio" name="wl-mode" checked={listMode === 'replace'} onChange={() => setListMode('replace')} />{' '}
            Replace (consumers not in this file are removed)
          </label>
          <label style={{ minWidth: 0, color: '#1a1a1a' }}>
            <input type="radio" name="wl-mode" checked={listMode === 'add'} onChange={() => setListMode('add')} />{' '}
            Add / update only
          </label>
        </div>
        <button className="btn" onClick={handleListUpload} disabled={listBusy}>{listBusy ? 'Saving…' : 'Save list'}</button>
        {listStatus && <div className={`status ${listStatus.startsWith('Error') ? 'error' : 'success'}`}>{listStatus}</div>}

        {lists.length > 0 && (
          <div style={{ marginTop: 16, overflowX: 'auto' }}>
            <table className="report-table" style={{ fontSize: 13 }}>
              <thead>
                <tr><th>List</th><th>Consumers</th><th>ESD-wise</th><th>Balances as on</th><th>Report title text</th><th>Last checked</th><th /></tr>
              </thead>
              <tbody>
                {lists.map((l) => (
                  <tr key={l.id}>
                    <td style={{ textAlign: 'left' }}>{l.name}</td>
                    <td>{l.consumer_count.toLocaleString('en-IN')}</td>
                    <td style={{ textAlign: 'left' }}>
                      {Object.entries(l.byEsd || {}).sort(([a], [b]) => a.localeCompare(b)).map(([c, n]) => `${esdLabelOf(c)} ${n}`).join(' · ')}
                    </td>
                    <td>
                      <input
                        type="date" value={edits[l.id]?.asOn !== undefined ? edits[l.id].asOn : (l.as_on_date || '')}
                        onChange={(e) => setEdits((p) => ({ ...p, [l.id]: { ...p[l.id], asOn: e.target.value } }))}
                      />
                    </td>
                    <td>
                      <input
                        value={edits[l.id]?.criteria !== undefined ? edits[l.id].criteria : (l.criteria_text || '')}
                        placeholder="with negative balance less than -10K" style={{ minWidth: 240 }}
                        onChange={(e) => setEdits((p) => ({ ...p, [l.id]: { ...p[l.id], criteria: e.target.value } }))}
                      />
                      {edits[l.id] && (
                        <button className="btn" style={{ padding: '3px 10px', fontSize: 12, marginLeft: 6 }} onClick={() => handleSaveMeta(l)}>Save</button>
                      )}
                    </td>
                    <td>
                      {l.dates && l.dates.length > 0
                        ? <a href={`/watchlist/${l.id}/${l.dates[0]}`}>{fmtDateDMY(l.dates[0])}</a>
                        : '—'}
                    </td>
                    <td>
                      <button className="btn secondary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => handleDeleteList(l)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {metaStatus && <div className={`status ${metaStatus.startsWith('Error') ? 'error' : 'success'}`}>{metaStatus}</div>}
          </div>
        )}
      </div>

      {/* ---------------- Daily check ---------------- */}
      <div className="card">
        <h2>2. Daily payment check</h2>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 0 }}>
          Upload the day&apos;s Billing Payment Status files (all the ESDs your list covers). A consumer counts as paid if the
          file shows a payment newer than at the previous check. Only the latest payment per consumer is visible in the
          file, so two recharges between two checks count as one.
        </p>
        <div className="field-row">
          <label>List</label>
          <select value={checkListId} onChange={(e) => setCheckListId(e.target.value)} style={{ minWidth: 300 }}>
            <option value="">— choose a list —</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.consumer_count.toLocaleString('en-IN')})</option>)}
          </select>
        </div>
        <div className="field-row">
          <label>Report date</label>
          <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
        </div>
        <div className="field-row">
          <label>Billing files</label>
          <input type="file" multiple accept=".xls,.xlsx" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
        </div>
        {files.length > 0 && <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>{files.map((f) => f.name).join(', ')}</div>}
        {selected && selected.dates && selected.dates.length > 0 && (
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>
            Last saved check for this list: {fmtDateDMY(selected.dates[0])}
          </div>
        )}
        <button className="btn" onClick={handleCheck} disabled={checkBusy}>{checkBusy ? 'Checking…' : 'Check & Save'}</button>
        {checkStatus && <div className={`status ${checkStatus.startsWith('Error') ? 'error' : 'success'}`}>{checkStatus}</div>}

        {result && (
          <div style={{ marginTop: 16, padding: 12, background: '#eef3f9', borderRadius: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {[
                `On list: ${result.sum.listed.toLocaleString('en-IN')}`,
                `Found in files: ${result.sum.inFile.toLocaleString('en-IN')}`,
                `Paid: ${result.sum.paidN.toLocaleString('en-IN')}`,
                `Realized: Rs ${inr(result.sum.paidAmt)}`,
                `Paid since listing: ${result.sum.cumN.toLocaleString('en-IN')} (Rs ${inr(result.sum.cumAmt)})`,
              ].map((t) => <span key={t} style={{ background: '#fff', borderRadius: 999, padding: '4px 12px', fontSize: 13 }}>{t}</span>)}
            </div>
            {result.missingEsds.length > 0 && (
              <div style={{ background: '#fff2cc', borderRadius: 6, padding: '6px 10px', fontSize: 13, marginBottom: 8 }}>
                No consumer was found for {result.missingEsds.map((c) => esdLabelOf(c)).join(', ')} — upload that ESD&apos;s billing file too.
              </div>
            )}
            {result.stale && (
              <div style={{ background: '#fff2cc', borderRadius: 6, padding: '6px 10px', fontSize: 13, marginBottom: 8 }}>{result.stale}</div>
            )}
            <a className="btn" href={`/watchlist/${result.listId}/${result.reportDate}`}>View report</a>
            <a className="btn secondary" href={`/api/watchlist/export/${result.listId}/${result.reportDate}`}>Download Excel</a>
          </div>
        )}
      </div>
    </div>
  );
}
