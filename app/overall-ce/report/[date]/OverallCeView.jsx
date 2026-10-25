'use client';

import { useState } from 'react';

const BANDS = [
  ['Postpaid Demand and Collection', 5],
  ['Prepaid and Additional Demand', 4],
  ['Grand Total Current Demand', 1],
  ['Prepaid and Additional Collection', 5],
  ['Grand Total Collection (Prepaid & Postpaid)', 1],
  ['Overall Coll Eff. %', 1],
];

// [header, key, kind]  kind: n = amount, p = percentage
const COLS = [
  ['Current Demand', 'postpaid_current', 'n'],
  ['Arrear Demand', 'postpaid_arrear', 'n'],
  ['Daily Collection', 'postpaid_daily', 'n'],
  ['Total Collection', 'postpaid_total', 'n'],
  ['Coll Eff. %', 'postpaid_ce', 'p'],
  ['Current Demand (Prepaid)', 'prepaid_current', 'n'],
  ['Manual Amount Not in ARMS', 'manual_amount', 'n'],
  ['Assessment Amount Not in ARMS', 'assessment_amount', 'n'],
  ['Converted Current Demand', 'converted_current', 'n'],
  ['Grand Total Current Demand', 'grand_demand', 'n'],
  ['Recharge of Smart Prepaid', 'recharge', 'n'],
  ['Credit Adjustment', 'credit_adjustment', 'n'],
  ['Manual Amount Not in ARMS', 'manual_collection', 'n'],
  ['Assessment Amount Not in ARMS', 'assessment_collection', 'n'],
  ['Collection Against Converted', 'converted_collection', 'n'],
  ['Grand Total Collection', 'grand_collection', 'n'],
  ['Overall Coll Eff. %', 'overall_ce', 'p'],
];

function dmy(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}
function monthName(iso) {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function fmt(v, kind, lakhs) {
  if (v === null || v === undefined) return '-';
  if (kind === 'p') return `${(v * 100).toFixed(2)}%`;
  if (lakhs) return (v / 100000).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return Math.round(v).toLocaleString('en-IN');
}

export default function OverallCeView({ report }) {
  const [lakhs, setLakhs] = useState(false);
  const [date, setDate] = useState(report.reportDate);
  const { rows, sources, missing, monthlyPresent } = report;

  return (
    <div>
      <div className="card">
        <div className="field-row" style={{ marginBottom: 0 }}>
          <label>Report date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn" onClick={() => { if (date) window.location.href = `/overall-ce/report/${date}`; }}>View</button>
          <label style={{ minWidth: 0 }}>
            <input type="checkbox" checked={lakhs} onChange={(e) => setLakhs(e.target.checked)} /> Show in Rs Lakhs
          </label>
          <a className="btn secondary" href={`/api/overall-ce/report/${report.reportDate}/excel`}>Download Excel</a>
          <a className="btn secondary" href="/overall-ce">Upload</a>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="card" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
          <strong>Incomplete for {monthName(report.month)}.</strong> Nothing has been uploaded this month for:
          <ul style={{ margin: '6px 0 0' }}>{missing.map((m) => <li key={m}>{m}</li>)}</ul>
          <div style={{ fontSize: 13, marginTop: 6 }}>They are counted as 0, so the figures below are not final.</div>
        </div>
      )}

      <div className="card">
        <div className="report-title">
          Overall Collection Efficiency of Goalpara Electrical Circle for the Month of {monthName(report.month)} (as on {dmy(report.reportDate)})
          {lakhs && ' - Rs Lakhs'}
        </div>
        <div className="table-scroll">
          <table className="report-table">
            <thead>
              <tr>
                <th rowSpan={2}>Sl No</th>
                <th rowSpan={2}>Sub-Division</th>
                {BANDS.map(([label, span]) => (
                  <th key={label} colSpan={span} style={{ textAlign: 'center' }}>{label}</th>
                ))}
              </tr>
              <tr>
                {COLS.map(([h], i) => (<th key={i} style={{ textAlign: 'center' }}>{h}</th>))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className={r.isTotal ? 'total-row' : undefined}>
                  <td>{r.sl_no ?? ''}</td>
                  <td className="subdiv-cell">{r.name}</td>
                  {COLS.map(([, key, kind]) => (<td key={key}>{fmt(r[key], kind, lakhs)}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          Overall CE = grand total collection / grand total current demand. Manual and assessment amounts count as
          fully collected. Daily collection is already part of the postpaid total and is not added again.
        </div>
      </div>

      <div className="card" style={{ background: '#f8fafc' }}>
        <h2 style={{ marginTop: 0 }}>Data used for this report</h2>
        <table className="report-table" style={{ fontSize: 13 }}>
          <thead>
            <tr><th>Input</th><th>Data from</th><th>Status</th><th>Source</th></tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.key}>
                <td>{s.label}</td>
                <td style={{ textAlign: 'center' }}>{s.effectiveDate ? dmy(s.effectiveDate) : '-'}</td>
                <td style={{ textAlign: 'left', color: !s.present ? '#b91c1c' : s.isCarriedForward ? '#b45309' : '#15803d' }}>
                  {!s.present ? 'Not uploaded this month (counted as 0)' : s.isCarriedForward ? 'Carried forward from earlier this month' : 'Uploaded for this date'}
                </td>
                <td style={{ textAlign: 'left' }}>{s.source}</td>
              </tr>
            ))}
            <tr>
              <td>Monthly inputs (manual / assessment)</td>
              <td style={{ textAlign: 'center' }}>{monthName(report.month)}</td>
              <td style={{ textAlign: 'left', color: monthlyPresent ? '#15803d' : '#b91c1c' }}>
                {monthlyPresent ? 'Entered for this month' : 'Not entered this month (counted as 0)'}
              </td>
              <td style={{ textAlign: 'left' }}><a href={`/overall-ce/monthly?month=${report.month.slice(0, 7)}`}>Edit</a></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
