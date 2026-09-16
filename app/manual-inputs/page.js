'use client';

import { Fragment, useEffect, useState } from 'react';

const SUB_DIVISIONS = ['Dhupdhara', 'Dudhnoi', 'Goalpara', 'Lakhipur', 'Mankachar'];

function currentMonthISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function emptyValues() {
  return Object.fromEntries(
    SUB_DIVISIONS.map((name) => [name, { energy_injection_kwh: '', ghost_consumers: '', be_target: '' }])
  );
}

export default function ManualInputsPage() {
  const [month, setMonth] = useState(currentMonthISO());
  const [values, setValues] = useState(emptyValues());
  const [status, setStatus] = useState(null);

  useEffect(() => {
    async function load() {
      setStatus({ type: 'loading', message: 'Loading...' });
      try {
        const res = await fetch(`/api/manual-inputs?month=${month}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const next = emptyValues();
        for (const [name, v] of Object.entries(data.data)) {
          next[name] = {
            energy_injection_kwh: v.energy_injection_kwh ?? '',
            ghost_consumers: v.ghost_consumers ?? '',
            be_target: v.be_target ?? '',
          };
        }
        setValues(next);
        setStatus(null);
      } catch (err) {
        setStatus({ type: 'error', message: err.message });
      }
    }
    load();
  }, [month]);

  function updateField(name, field, val) {
    setValues((prev) => ({ ...prev, [name]: { ...prev[name], [field]: val } }));
  }

  async function handleSave() {
    setStatus({ type: 'loading', message: 'Saving...' });
    const payload = Object.fromEntries(
      Object.entries(values).map(([name, v]) => [
        name,
        {
          energy_injection_kwh: v.energy_injection_kwh === '' ? null : Number(v.energy_injection_kwh),
          ghost_consumers: v.ghost_consumers === '' ? null : Number(v.ghost_consumers),
          be_target: v.be_target === '' ? null : Number(v.be_target),
        },
      ])
    );
    try {
      const res = await fetch('/api/manual-inputs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, values: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus({ type: 'success', message: 'Saved. Any dates already uploaded this month will regenerate automatically.' });
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    }
  }

  return (
    <div className="card">
      <h1>Monthly inputs</h1>
      <p>
        These three values are typed by hand once a month per sub-division
        (energy injection in kWh, the "ghost consumer" count, and the billing
        efficiency target as a decimal, e.g. 0.80 for 80%).
      </p>
      <div className="field-row">
        <label>Month</label>
        <input
          type="month"
          value={month.slice(0, 7)}
          onChange={(e) => setMonth(`${e.target.value}-01`)}
        />
      </div>

      <div className="manual-grid" style={{ marginTop: 16 }}>
        <div className="head">Sub-Division</div>
        <div className="head">Energy Injection (kWh)</div>
        <div className="head">Ghost Consumers</div>
        <div className="head">BE Target (0-1)</div>

        {SUB_DIVISIONS.map((name) => (
          <Fragment key={name}>
            <div>{name}</div>
            <input
              type="number"
              value={values[name].energy_injection_kwh}
              onChange={(e) => updateField(name, 'energy_injection_kwh', e.target.value)}
            />
            <input
              type="number"
              value={values[name].ghost_consumers}
              onChange={(e) => updateField(name, 'ghost_consumers', e.target.value)}
            />
            <input
              type="number"
              step="0.01"
              value={values[name].be_target}
              onChange={(e) => updateField(name, 'be_target', e.target.value)}
            />
          </Fragment>
        ))}
      </div>

      <button className="btn" style={{ marginTop: 16 }} onClick={handleSave}>
        Save
      </button>

      {status && (
        <p className={`status ${status.type === 'error' ? 'error' : status.type === 'success' ? 'success' : ''}`}>
          {status.message}
        </p>
      )}
    </div>
  );
}
