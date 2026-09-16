'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function HomePage() {
  const [date, setDate] = useState(todayISO());
  const router = useRouter();

  return (
    <div className="card">
      <h1>GpEC Daily Report</h1>
      <p>Pick a date to view the generated report, or upload today's workbook first.</p>
      <div className="field-row">
        <label>Report date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn" onClick={() => router.push(`/reports/${date}`)}>
          View report
        </button>
      </div>
      <div style={{ marginTop: 16 }}>
        <a className="btn" href="/upload">Upload today's workbook</a>
        <a className="btn secondary" href="/manual-inputs">Set monthly inputs</a>
      </div>
    </div>
  );
}
