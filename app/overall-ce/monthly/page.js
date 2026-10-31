'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';

const ESDS = ['Dhupdhara', 'Dudhnoi', 'Goalpara', 'Lakhipur', 'Mankachar'];

function currentMonthISO() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return `${ist.toISOString().slice(0, 7)}-01`;
}

function emptyValues() {
  return Object.fromEntries(ESDS.map((e) => [e, { manual_amount: '', assessment_amount: '', conv_prepaid_amount: '', temporary_amount: '' }]));
}

function fromServer(data) {
  const next = emptyValues();
  for (const [name, v] of Object.entries(data || {})) {
    if (next[name]) next[name] = {
      manual_amount: v.manual_amount ?? '', assessment_amount: v.assessment_amount ?? '',
      conv_prepaid_amount: v.conv_prepaid_amount ?? '', temporary_amount: v.temporary_amount ?? '',
    };
  }
  return next;
}

export default function OverallCeMonthlyPage() {
  const [month, setMonth] = useState(currentMonthISO());
  const [values, setValues] = useState(emptyValues());
  const [status, setStatus] = useState(null);
  const [file, setFile] = useState(null);

  // ?month=YYYY-MM from the Overall CE page
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get('month');
    if (m && /^\d{4}-\d{2}$/.test(m)) setMonth(`${m}-01`);
  }, []);

  const load = useCallback(async () => {
    setStatus({ type: 'loading', message: 'Loading...' });
    try {
      const res = await fetch(`/api/overall-ce/monthly-inputs?month=${month}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setValues(fromServer(data.data));
      setStatus(null);
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  function update(esd, field, val) {
    setValues((prev) => ({ ...prev, [esd]: { ...prev[esd], [field]: val } }));
  }

  async function handleSave() {
    setStatus({ type: 'loading', message: 'Saving...' });
    const payload = Object.fromEntries(
      ESDS.map((e) => [e, {
        manual_amount: Number(values[e].manual_amount) || 0,
        assessment_amount: Number(values[e].assessment_amount) || 0,
        conv_prepaid_amount: Number(values[e].conv_prepaid_amount) || 0,
        temporary_amount: Number(values[e].temporary_amount) || 0,
      }])
    );
    try {
      const res = await fetch('/api/overall-ce/monthly-inputs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, values: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus({ type: 'success', message: 'Saved. Every Overall CE report for this month now uses these values.' });
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    }
  }

  async function handleUpload() {
    if (!file) {
      setStatus({ type: 'error', message: 'Choose a file first.' });
      return;
    }
    setStatus({ type: 'loading', message: 'Uploading...' });
    const form = new FormData();
    form.append('file', file);
    form.append('month', month);
    try {
      const res = await fetch('/api/overall-ce/monthly-inputs', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setValues(fromServer(data.data));
      setStatus({ type: 'success', message: 'File read and saved. Check the values below.' });
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    }
  }

  return (
    <div className="card">
      <h1>Overall CE: monthly inputs</h1>
      <p>
        Typed or uploaded once a month per sub-division: the <strong>manual amount</strong> and the
        <strong> assessment amount</strong> not reflected in ARMS. Each counts as both demand and collection in
        Overall CE. If nothing is entered for a month, they count as 0 and the report says so. The
        <strong> conventional prepaid</strong> and <strong>temporary</strong> amounts are used only in the
        &quot;with additional columns&quot; version of the report.
      </p>
      <div className="field-row">
        <label>Month</label>
        <input type="month" value={month.slice(0, 7)} onChange={(e) => e.target.value && setMonth(`${e.target.value}-01`)} />
      </div>

      <div className="manual-grid" style={{ marginTop: 16, gridTemplateColumns: '140px 1fr 1fr 1fr 1fr' }}>
        <div className="head">Sub-Division</div>
        <div className="head">Manual Amount (Rs)</div>
        <div className="head">Assessment Amount (Rs)</div>
        <div className="head">Conventional Prepaid Collection (Rs)</div>
        <div className="head">Temporary Collection (Rs)</div>
        {ESDS.map((esd) => (
          <Fragment key={esd}>
            <div>{esd}</div>
            <input type="number" value={values[esd].manual_amount}
                   onChange={(e) => update(esd, 'manual_amount', e.target.value)} />
            <input type="number" value={values[esd].assessment_amount}
                   onChange={(e) => update(esd, 'assessment_amount', e.target.value)} />
            <input type="number" value={values[esd].conv_prepaid_amount}
                   onChange={(e) => update(esd, 'conv_prepaid_amount', e.target.value)} />
            <input type="number" value={values[esd].temporary_amount}
                   onChange={(e) => update(esd, 'temporary_amount', e.target.value)} />
          </Fragment>
        ))}
      </div>

      <button className="btn" style={{ marginTop: 16 }} onClick={handleSave}>Save</button>

      <h2 style={{ marginTop: 28 }}>Or upload an Excel / CSV file</h2>
      <p style={{ marginTop: 0 }}>
        One row per sub-division with the columns Sub-Division, Manual Amount, Assessment Amount, Conventional Prepaid Collection, Temporary Collection (the last two are optional).{' '}
        <a href={`/api/overall-ce/monthly-inputs?month=${month}&template=1`}>Download the template</a> (pre-filled with this month&apos;s values).
      </p>
      <div className="field-row">
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button className="btn secondary" onClick={handleUpload}>Upload File</button>
      </div>

      {status && (
        <p className={`status ${status.type === 'error' ? 'error' : status.type === 'success' ? 'success' : ''}`}>
          {status.message}
        </p>
      )}
      <div style={{ marginTop: 12 }}><a href="/overall-ce">Back to Overall CE</a></div>
    </div>
  );
}
