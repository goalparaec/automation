'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LEDGERS } from '../../../lib/meterCostHq';

export default function LedgerManager({ type, rows, today, fyLabel, reqNumbers = [] }) {
  const L = LEDGERS[type];
  const router = useRouter();
  const blank = { esd_code: '', no: '', ph1: '', ph3: '', note: '', req_no: '' };
  const [form, setForm] = useState({ ...blank, date: today });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [editId, setEditId] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(force = false) {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/meter-cost/hq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, type, force, id: editId }),
      });
      const data = await res.json();
      if (res.status === 409) { setConflict(data); return; }
      if (!res.ok) throw new Error(data.error || 'Could not save.');
      setConflict(null);
      setForm((f) => ({ ...blank, date: f.date }));
      setStatus({ type: 'success', message: `${form.no} ${editId ? 'updated' : 'saved'}.` });
      setEditId(null);
      router.refresh();
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  function edit(p) {
    setEditId(p.id);
    setConflict(null);
    setStatus(null);
    setForm({ no: p[L.noCol], date: String(p[L.dateCol]).slice(0, 10), ph1: String(p.ph1), ph3: String(p.ph3), note: p.note || '', req_no: p.req_no || '' });
  }

  function cancelEdit() {
    setEditId(null);
    setForm((f) => ({ ...blank, date: f.date }));
  }

  async function remove(id) {
    if (!confirm('Delete this entry?')) return;
    const res = await fetch(`/api/meter-cost/hq?type=${type}&id=${id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
    else setStatus({ type: 'error', message: (await res.json()).error || 'Delete failed.' });
  }

  return (
    <>
      <div className="card">
        <h2>{L.title}</h2>
        <div className="field-row">
          <label>{L.noLabel}</label>
          <input value={form.no} onChange={set('no')} />
          <label>Date</label>
          <input type="date" value={form.date} onChange={set('date')} />
          {L.link && (
            <>
              <label>Against requisition</label>
              <input list="req-numbers" value={form.req_no} onChange={set('req_no')} placeholder="leave empty if not known yet" />
              <datalist id="req-numbers">
                {reqNumbers.map((n) => <option key={n} value={n} />)}
              </datalist>
            </>
          )}
        </div>
        <div className="field-row">
          <label>1-Phase</label>
          <input type="number" min="0" value={form.ph1} onChange={set('ph1')} style={{ width: 90 }} />
          <label>3-Phase</label>
          <input type="number" min="0" value={form.ph3} onChange={set('ph3')} style={{ width: 90 }} />
          <label>Note</label>
          <input value={form.note} onChange={set('note')} placeholder="optional" />
        </div>
        <div className="field-row">
          <button className="btn" onClick={() => submit(false)} disabled={busy}>{editId ? 'Save changes' : 'Add'}</button>
          {editId && <button className="btn secondary" onClick={cancelEdit}>Cancel edit</button>}
        </div>
        {status && <p className={`status ${status.type === 'error' ? 'error' : 'success'}`}>{status.message}</p>}

        {conflict && (
          <div style={{ border: '2px solid #d97706', borderRadius: 8, padding: 12, marginTop: 12, background: '#fffbeb' }}>
            <b>Conflict: {conflict.message}</b>
            <div className="table-scroll" style={{ marginTop: 8 }}>
              <table className="report-table">
                <thead><tr><th>Date</th><th>1-Ph</th><th>3-Ph</th></tr></thead>
                <tbody>
                  {conflict.existing.map((p) => (
                    <tr key={p.id}>
                      <td>{String(p[L.dateCol]).slice(0, 10)}</td>
                      <td>{p.ph1}</td><td>{p.ph3}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn" onClick={() => submit(true)} disabled={busy}>Add</button>{' '}
            <button className="btn secondary" onClick={() => setConflict(null)}>Delete (do not save)</button>
          </div>
        )}

        <h3 style={{ marginTop: 18 }}>Entries - FY {fyLabel}</h3>
        {rows.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: 13 }}>Nothing added yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Date</th><th>{L.noLabel}</th>{L.link && <th>Requisition</th>}
                  <th>1-Ph</th><th>3-Ph</th><th>Note</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>{String(p[L.dateCol]).slice(0, 10)}</td>
                                        <td style={{ textAlign: 'left' }}>{p[L.noCol]}</td>
                    {L.link && <td style={{ textAlign: 'left' }}>{p.req_no || ''}</td>}
                    <td>{p.ph1}</td><td>{p.ph3}</td>
                    <td style={{ textAlign: 'left' }}>{p.note || ''}</td>
                    <td><button className="btn secondary" onClick={() => edit(p)}>Edit</button>{' '}<button className="btn secondary" onClick={() => remove(p.id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
