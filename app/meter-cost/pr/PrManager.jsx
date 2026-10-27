'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ESD_BY_CODE } from '../../../lib/meterCostCore';

const EMPTY = { esd_code: '', pr_no: '', ph1: '', ph3: '', note: '' };

export default function PrManager({ prs, today, fyLabel }) {
  const router = useRouter();
  const [form, setForm] = useState({ ...EMPTY, pr_date: today });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [conflict, setConflict] = useState(null); // { message, existing }
  const [editId, setEditId] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(force = false) {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/meter-cost/pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, force, id: editId }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setConflict(data);
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Could not save the PR.');
      setConflict(null);
      setForm((f) => ({ ...EMPTY, esd_code: f.esd_code, pr_date: f.pr_date }));
      setStatus({ type: 'success', message: `PR ${data.row.pr_no} ${editId ? 'updated' : 'saved'}.` });
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
    setForm({ esd_code: p.esd_code, pr_no: p.pr_no, pr_date: String(p.pr_date).slice(0, 10), ph1: String(p.ph1), ph3: String(p.ph3), note: p.note || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditId(null);
    setForm((f) => ({ ...EMPTY, pr_date: f.pr_date }));
  }

  async function remove(id) {
    if (!confirm('Delete this PR?')) return;
    const res = await fetch(`/api/meter-cost/pr?id=${id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
    else setStatus({ type: 'error', message: (await res.json()).error || 'Delete failed.' });
  }

  return (
    <>
      <div className="card">
        <h1>PR (purchase requisition)</h1>
        <p style={{ color: '#6b7280', fontSize: 13 }}>
          Enter each PR for an ESD. A PR is also the issue of those meters to the ESD. Use Edit on a row to change it later.
        </p>
        <div className="field-row">
          <label>ESD</label>
          <select value={form.esd_code} onChange={set('esd_code')}>
            <option value="">Choose...</option>
            {Object.entries(ESD_BY_CODE).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
          <label>PR number</label>
          <input value={form.pr_no} onChange={set('pr_no')} placeholder="e.g. 1100041532" />
          <label>PR date</label>
          <input type="date" value={form.pr_date} onChange={set('pr_date')} />
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
          <button className="btn" onClick={() => submit(false)} disabled={busy}>{editId ? 'Save changes' : 'Add PR'}</button>
          {editId && <button className="btn secondary" onClick={cancelEdit}>Cancel edit</button>}
          <a className="btn secondary" href="/meter-cost">Back</a>
        </div>
        {status && <p className={`status ${status.type === 'error' ? 'error' : 'success'}`}>{status.message}</p>}

        {conflict && (
          <div style={{ border: '2px solid #d97706', borderRadius: 8, padding: 12, marginTop: 12, background: '#fffbeb' }}>
            <b>Conflict: {conflict.message}</b>
            <div className="table-scroll" style={{ marginTop: 8 }}>
              <table className="report-table">
                <thead><tr><th>Date</th><th>ESD</th><th>1-Ph</th><th>3-Ph</th><th>Note</th></tr></thead>
                <tbody>
                  {conflict.existing.map((p) => (
                    <tr key={p.id}>
                      <td>{String(p.pr_date).slice(0, 10)}</td>
                      <td style={{ textAlign: 'left' }}>{ESD_BY_CODE[p.esd_code]}</td>
                      <td>{p.ph1}</td><td>{p.ph3}</td><td style={{ textAlign: 'left' }}>{p.note || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>The one you are entering: {ESD_BY_CODE[form.esd_code]}, 1-Ph {form.ph1 || 0}, 3-Ph {form.ph3 || 0}.</p>
            <button className="btn" onClick={() => submit(true)} disabled={busy}>Add</button>{' '}
            <button className="btn secondary" onClick={() => setConflict(null)}>Delete (do not save)</button>
          </div>
        )}
      </div>

      <div className="card">
        <h2>PRs raised - FY {fyLabel}</h2>
        {prs.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: 13 }}>No PR added yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="report-table">
              <thead><tr><th>Date</th><th>ESD</th><th>PR no</th><th>1-Ph</th><th>3-Ph</th><th>Note</th><th></th></tr></thead>
              <tbody>
                {prs.map((p) => (
                  <tr key={p.id}>
                    <td>{String(p.pr_date).slice(0, 10)}</td>
                    <td style={{ textAlign: 'left' }}>{ESD_BY_CODE[p.esd_code]}</td>
                    <td style={{ textAlign: 'left' }}>{p.pr_no}</td>
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
