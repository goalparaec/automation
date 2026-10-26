'use client';

import { useCallback, useEffect, useState } from 'react';
import { ESD_BY_CODE, KIND_LABEL, fyLabel } from '../../../lib/meterCostCore';

export default function RecordsManager({ initialFy }) {
  const [fy, setFy] = useState(initialFy);
  const [esd, setEsd] = useState('');
  const [status, setStatus] = useState('ignored');
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    const q = new URLSearchParams({ fy: String(fy), limit: '500' });
    if (esd) q.set('esd', esd);
    if (status) q.set('status', status);
    try {
      const res = await fetch(`/api/meter-cost/deposits?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load.');
      setRows(data.rows);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setLoading(false);
    }
  }, [fy, esd, status]);

  useEffect(() => { load(); }, [load]);

  async function change(id, body) {
    const res = await fetch('/api/meter-cost/deposits', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) });
    if (res.ok) load();
    else setMsg((await res.json()).error || 'Could not update.');
  }
  async function remove(id) {
    if (!confirm('Delete this record permanently?')) return;
    const res = await fetch(`/api/meter-cost/deposits?id=${id}`, { method: 'DELETE' });
    if (res.ok) load();
    else setMsg((await res.json()).error || 'Could not delete.');
  }

  return (
    <div className="card">
      <h1>Deposit records</h1>
      <p style={{ color: '#6b7280', fontSize: 13 }}>
        Every saved meter-cost row. Ignored rows (0 / 2,400 and anything you rejected) are kept here so you can
        count one later or delete it. Showing up to 500.
      </p>
      <div className="field-row">
        <label>Financial year</label>
        <select value={fy} onChange={(e) => setFy(Number(e.target.value))}>
          {[initialFy + 1, initialFy, initialFy - 1, initialFy - 2].map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}
        </select>
        <label>ESD</label>
        <select value={esd} onChange={(e) => setEsd(e.target.value)}>
          <option value="">All</option>
          {Object.entries(ESD_BY_CODE).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
        </select>
        <label>Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ignored">Ignored</option>
          <option value="counted">Counted</option>
          <option value="">Both</option>
        </select>
        <a className="btn secondary" href="/meter-cost">Back</a>
      </div>
      {msg && <p className="status error">{msg}</p>}
      {loading ? <p>Loading...</p> : (
        <div className="table-scroll">
          <table className="report-table">
            <thead>
              <tr><th>Paid on</th><th>ESD</th><th>Application</th><th>Consumer</th><th>Type</th><th>Amount</th><th>Phase</th><th>Status</th><th>Reason</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.payment_date}</td>
                  <td style={{ textAlign: 'left' }}>{ESD_BY_CODE[r.esd_code]}</td>
                  <td style={{ textAlign: 'left' }}>{r.application_no}</td>
                  <td style={{ textAlign: 'left' }}>{r.consumer_no}<br /><small>{r.consumer_name}</small></td>
                  <td style={{ textAlign: 'left' }}>{KIND_LABEL[r.kind]}</td>
                  <td>{r.amount}</td>
                  <td>{r.phase ? `${r.phase}-Ph` : '-'}</td>
                  <td>{r.status}</td>
                  <td style={{ textAlign: 'left', minWidth: 160 }}>{r.reason || ''}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.status === 'counted' ? (
                      <button className="btn secondary" onClick={() => change(r.id, { status: 'ignored' })}>Ignore</button>
                    ) : (
                      <>
                        <button className="btn" onClick={() => change(r.id, { status: 'counted', phase: '1' })}>Count 1-Ph</button>{' '}
                        <button className="btn" onClick={() => change(r.id, { status: 'counted', phase: '3' })}>Count 3-Ph</button>
                      </>
                    )}{' '}
                    <button className="btn secondary" onClick={() => remove(r.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center' }}>Nothing to show.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
