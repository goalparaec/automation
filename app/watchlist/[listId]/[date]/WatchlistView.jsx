'use client';

import { useMemo, useState } from 'react';
import {
  esdOverviewRows, categoryEsdMatrix, MATRIX_ORDER, trendRows, rowStatus, esdLabelOf, esdsMissingFromFiles,
  totalsOf, fmtDateDMY, withToday, progressReport,
} from '../../../../lib/watchlistCore';
import { renderProgressPng, downloadBlob } from '../../../../lib/watchlistProgressImage';

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
const money = (n) => (n == null || isNaN(n) ? '-' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const int = (n) => (n == null || isNaN(n) ? '-' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }));
const pct = (n) => (n == null || isNaN(n) ? '-' : `${Number(n).toFixed(1)}%`);
const lakhs = (n) => (n == null || isNaN(n) ? '-' : (Number(n) / 100000).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtBy = (fmt, v) => (fmt === 'int' ? int(v) : money(v));

const PAGE = 300; // rows shown per list before "Show more"

function Styles() {
  return (
    <style jsx global>{`
      .wl-scope { max-width: 1200px; margin: 0 auto; }
      .wl-scope .wl-wrap { overflow-x: auto; border: 1px solid #cfd8e3; border-radius: 8px; margin-bottom: 18px; background: #fff; }
      .wl-scope table.wl-table { width: 100%; border-collapse: collapse; font-size: 13px; }
      .wl-scope .wl-table th {
        background: #1f3b5c; color: #fff; padding: 9px 10px; text-align: center; font-weight: 600;
        line-height: 1.25; border: 1px solid #1f3b5c; vertical-align: middle; white-space: normal;
      }
      .wl-scope .wl-table td { padding: 7px 10px; border: 1px solid #d9e1ea; text-align: center; vertical-align: middle; line-height: 1.3; }
      .wl-scope .wl-table td.num { white-space: nowrap; text-align: right; }
      .wl-scope .wl-table td.left { text-align: left; }
      .wl-scope .wl-table tbody tr:nth-child(even) td { background: #f3f6fa; }
      .wl-scope .wl-table tr.total td { background: #fff2cc; font-weight: 700; }
      .wl-scope .wl-table tr.section td { background: #dce6f1; font-weight: 700; text-align: left; }
      .wl-scope h3.wl-h { margin: 18px 0 8px; font-size: 15px; color: #1f3b5c; }
      .wl-scope .wl-note { color: #5b6776; font-size: 13px; margin: 0 0 12px; line-height: 1.45; }
      .wl-scope .wl-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
      .wl-scope .wl-chip { background: #eef3f9; border-radius: 999px; padding: 6px 12px; font-size: 13px; }
      .wl-scope .wl-chip.good { background: #d6f0db; }
      .wl-scope .wl-warn { background: #fff2cc; border-radius: 6px; padding: 8px 12px; font-size: 13px; margin-bottom: 12px; }
      .wl-scope .wl-tabs { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
      .wl-scope .wl-filters { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
      @media print {
        .app-header, .no-print { display: none !important; }
        .wl-scope .wl-wrap { overflow: visible; border: none; }
        .wl-scope .wl-table { font-size: 10px; }
        .wl-scope .wl-table th, .wl-scope .wl-table td { padding: 4px 5px; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        @page { size: A4 landscape; margin: 10mm; }
      }
    `}</style>
  );
}

/** columns: [{ header, render: (row, i) => node, left?, num? }]; rows may carry _total / _section. */
function DataTable({ columns, rows }) {
  return (
    <div className="wl-wrap">
      <table className="wl-table">
        <thead><tr>{columns.map((c, i) => <th key={i}>{c.header}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className={r._total ? 'total' : r._section ? 'section' : undefined}>
              {r._section ? (
                <td colSpan={columns.length}>{r._label}</td>
              ) : columns.map((c, ci) => (
                <td key={ci} className={`${c.left ? 'left' : ''}${c.num ? ' num' : ''}`}>{c.render(r, ri)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ShowMore({ visible, total, onMore }) {
  if (visible >= total) return null;
  return (
    <button className="btn secondary no-print" style={{ marginTop: 4 }} onClick={onMore}>
      Show more ({(total - visible).toLocaleString('en-IN')} remaining)
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
const TABS = [
  ['progress', 'Progress Report'],
  ['summary', 'Summary'],
  ['today', 'Paid today'],
  ['paid', 'Paid since last check'],
  ['ever', 'Paid since listing'],
  ['notpaid', 'Not paid'],
  ['notfound', 'Not in billing file'],
  ['trend', 'Daily trend'],
];

function ProgressTab({ rows, esdMap, reportDate, asOnDate, criteria, listName }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const report = useMemo(
    () => progressReport({ rows, reportDate, asOnDate, criteria, esdMap }),
    [rows, reportDate, asOnDate, criteria, esdMap],
  );

  async function downloadImage() {
    setBusy(true); setErr('');
    try {
      const blob = await renderProgressPng(report, { scale: 2 });
      const safe = String(listName || 'List').replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'List';
      downloadBlob(blob, `Progress-Report-${safe}-${fmtDateDMY(reportDate)}.png`);
    } catch (e) {
      setErr(e.message || 'Could not create the image.');
    } finally {
      setBusy(false);
    }
  }

  const cols = report.columns.map((c, i) => ({
    header: c.header,
    render: (r) => r.display[i],
    left: c.key === 'esd',
    num: c.kind === 'lakh' || (c.kind === 'int' && c.key !== 'sl'),
  }));
  return (
    <div>
      <div className="no-print" style={{ marginBottom: 12 }}>
        <button className="btn" onClick={downloadImage} disabled={busy}>{busy ? 'Creating image…' : 'Download image (PNG)'}</button>
        {err && <span className="status error" style={{ marginLeft: 10 }}>{err}</span>}
      </div>
      <h3 className="wl-h" style={{ textAlign: 'center', fontSize: 17, color: '#111' }}>{report.title}</h3>
      <DataTable columns={cols} rows={report.rows} />
    </div>
  );
}

function SummaryTab({ rows, esdMap }) {
  const overview = useMemo(() => esdOverviewRows(rows, esdMap), [rows, esdMap]);
  const matrices = useMemo(
    () => MATRIX_ORDER.map((k) => categoryEsdMatrix(rows, k, esdMap)).filter((m) => !(m.key === 'notInFile' && m.totals.total === 0)),
    [rows, esdMap],
  );
  const cols = [
    { header: 'ESD', render: (r) => r.label, left: true },
    { header: 'Consumers on list', render: (r) => int(r.listed), num: true },
    { header: 'Found in billing files', render: (r) => int(r.inFile), num: true },
    { header: 'Not found', render: (r) => int(r.notInFile), num: true },
    { header: 'Paid today (consumers)', render: (r) => int(r.todayN), num: true },
    { header: 'Amount realized today (Rs)', render: (r) => money(r.todayAmt), num: true },
    { header: 'Paid since last check (consumers)', render: (r) => int(r.paidN), num: true },
    { header: '% of found who paid', render: (r) => (r.inFile ? pct(r.paidPct) : '-'), num: true },
    { header: 'Amount realized since last check (Rs)', render: (r) => money(r.paidAmt), num: true },
    { header: 'Paid since listing (consumers)', render: (r) => int(r.cumN), num: true },
    { header: 'Amount realized since listing (Rs)', render: (r) => money(r.cumAmt), num: true },
    { header: 'Negative balance when listed (Rs Lakh)', render: (r) => lakhs(r.listedNeg), num: true },
    { header: 'Balance now of listed consumers (Rs Lakh)', render: (r) => lakhs(r.balanceNow), num: true },
  ];
  return (
    <div>
      <h3 className="wl-h">ESD wise</h3>
      <DataTable columns={cols} rows={overview} />
      {matrices.map((m) => {
        const mcols = [
          { header: 'Category', render: (r) => r.label, left: true },
          ...m.esdLabels.map((l, i) => ({ header: l, render: (r) => fmtBy(m.fmt, r.cells[i]), num: true })),
          { header: 'Total', render: (r) => fmtBy(m.fmt, r.total), num: true },
        ];
        const mrows = [
          ...m.body,
          { label: 'Grand Total', cells: m.totals.cells, total: m.totals.total, _total: true },
        ];
        return (
          <div key={m.key}>
            <h3 className="wl-h">{m.title}</h3>
            <DataTable columns={mcols} rows={mrows} />
          </div>
        );
      })}
    </div>
  );
}

function ConsumerTab({ rows, esdMap, kind }) {
  const [esd, setEsd] = useState('');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE);

  const base = useMemo(() => {
    let list;
    if (kind === 'today') list = rows.filter((r) => r.paidToday).sort((a, b) => b.todayAmount - a.todayAmount || a.consumerNo.localeCompare(b.consumerNo));
    else if (kind === 'paid') list = rows.filter((r) => r.newPayment).sort((a, b) => b.paidAmount - a.paidAmount || a.consumerNo.localeCompare(b.consumerNo));
    else if (kind === 'ever') list = rows.filter((r) => r.cumPaidCount > 0).sort((a, b) => b.cumPaidAmount - a.cumPaidAmount || a.consumerNo.localeCompare(b.consumerNo));
    else if (kind === 'notpaid') list = rows.filter((r) => rowStatus(r) !== 'NOT_IN_FILE' && r.cumPaidCount === 0).sort((a, b) => (a.balanceNow ?? 0) - (b.balanceNow ?? 0));
    else list = rows.filter((r) => rowStatus(r) === 'NOT_IN_FILE');
    return list;
  }, [rows, kind]);

  const esdCodes = useMemo(() => [...new Set(base.map((r) => r.esdCode))].sort(), [base]);
  const categories = useMemo(() => [...new Set(base.map((r) => r.categoryName))].sort(), [base]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return base.filter((r) => (!esd || r.esdCode === esd)
      && (!category || r.categoryName === category)
      && (!needle || r.consumerNo.toLowerCase().includes(needle) || (r.consumerName || '').toLowerCase().includes(needle)
        || (r.phoneNo || '').includes(needle)));
  }, [base, esd, category, q]);
  const t = useMemo(() => totalsOf(filtered), [filtered]);

  const notes = {
    today: 'Consumers whose last payment in the billing file is dated on the report date (payments made today only).',
    paid: 'Consumers whose Last Payment Date / Amount in today\'s billing file is newer than at the previous check.',
    ever: 'Every consumer who has paid at any check since being added to the list, with the total realized.',
    notpaid: 'Found in the billing files, but no payment seen since the consumer was listed.',
    notfound: 'On the list but not in any uploaded billing file (their ESD\'s file was probably not uploaded). Their earlier status is carried forward.',
  };

  const cols = [
    { header: 'Sl.', render: (_, i) => i + 1, num: true },
    { header: 'ESD', render: (r) => esdLabelOf(r.esdCode, esdMap) },
    { header: 'Consumer No', render: (r) => r.consumerNo, num: true },
    { header: 'Consumer Name', render: (r) => r.consumerName, left: true },
    { header: 'Category', render: (r) => r.categoryName },
    { header: 'Phone No', render: (r) => r.phoneNo || '-' },
    { header: 'Conn. status', render: (r) => r.connectionStatus || '-' },
    { header: 'Balance when listed (Rs)', render: (r) => money(r.listedBalance), num: true },
    { header: 'Balance now (Rs)', render: (r) => (r.inFile ? money(r.balanceNow) : '-'), num: true },
    { header: 'Last payment date', render: (r) => fmtDateDMY(r.lastPaymentDate) || '-' },
    { header: 'Paid today (Rs)', render: (r) => (r.paidToday ? money(r.todayAmount) : '-'), num: true },
    { header: 'Paid since last check (Rs)', render: (r) => (r.newPayment ? money(r.paidAmount) : '-'), num: true },
    { header: 'Total paid since listing (Rs)', render: (r) => (r.cumPaidAmount ? money(r.cumPaidAmount) : '-'), num: true },
    { header: 'Remarks', render: (r) => r.remarks || '', left: true },
  ];
  const shownRows = filtered.slice(0, shown);

  return (
    <div>
      <p className="wl-note">{notes[kind]}</p>
      <div className="wl-filters no-print">
        <select value={esd} onChange={(e) => { setEsd(e.target.value); setShown(PAGE); }}>
          <option value="">All ESDs</option>
          {esdCodes.map((c) => <option key={c} value={c}>{esdLabelOf(c, esdMap)}</option>)}
        </select>
        <select value={category} onChange={(e) => { setCategory(e.target.value); setShown(PAGE); }}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c || '(blank)'}</option>)}
        </select>
        <input placeholder="Search name / consumer no / phone" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} style={{ minWidth: 250 }} />
      </div>
      <div className="wl-chips">
        <span className="wl-chip">{int(filtered.length)} consumers</span>
        {kind !== 'notfound' && <span className="wl-chip">Balance when listed: Rs {lakhs(t.listedNeg)} Lakh</span>}
        {kind === 'today' && <span className="wl-chip good">Realized today: Rs {money(t.todayAmt)}</span>}
        {kind === 'paid' && <span className="wl-chip good">Realized since last check: Rs {money(t.paidAmt)}</span>}
        {kind === 'ever' && <span className="wl-chip good">Realized since listing: Rs {money(t.cumAmt)}</span>}
      </div>
      {filtered.length === 0 ? (
        <p className="wl-note">Nothing to show here.</p>
      ) : (
        <>
          <DataTable columns={cols} rows={shownRows} />
          <ShowMore visible={shown} total={filtered.length} onMore={() => setShown((n) => n + PAGE)} />
        </>
      )}
    </div>
  );
}

function TrendTab({ checks }) {
  const rows = useMemo(() => trendRows(checks).reverse(), [checks]);
  const cols = [
    { header: 'Report date', render: (r) => fmtDateDMY(r.reportDate) },
    { header: 'Consumers on list', render: (r) => int(r.listed), num: true },
    { header: 'Found in files', render: (r) => int(r.inFile), num: true },
    { header: 'Paid since previous check (consumers)', render: (r) => int(r.paidN), num: true },
    { header: 'Amount realized since previous check (Rs)', render: (r) => money(r.paidAmt), num: true },
    { header: 'Paid since listing (consumers)', render: (r) => int(r.cumN), num: true },
    { header: 'Amount realized since listing (Rs)', render: (r) => money(r.cumAmt), num: true },
  ];
  return (
    <div>
      <p className="wl-note">One line per saved check, newest first.</p>
      <DataTable columns={cols} rows={rows} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function WatchlistView({ list, reportDate, asOnDate, criteria, header, rows: rawRows, checks, esdMap }) {
  const [tab, setTab] = useState('progress');
  const rows = useMemo(() => withToday(rawRows, reportDate), [rawRows, reportDate]);
  const total = useMemo(() => totalsOf(rows), [rows]);
  const missingEsds = useMemo(() => esdsMissingFromFiles(rows), [rows]);
  const dates = useMemo(() => checks.map((c) => c.report_date).sort().reverse(), [checks]);

  return (
    <div className="wl-scope">
      <Styles />
      <div className="no-print" style={{ marginBottom: 6 }}><a href="/watchlist">← Consumer Watchlist</a></div>
      <h1>{list.name} — {fmtDateDMY(reportDate)}</h1>

      <div className="field-row no-print">
        <label>Date</label>
        <select value={reportDate} onChange={(e) => { window.location.href = `/watchlist/${list.id}/${e.target.value}`; }}>
          {dates.map((d) => <option key={d} value={d}>{fmtDateDMY(d)}</option>)}
        </select>
        <a className="btn" href={`/api/watchlist/export/${list.id}/${reportDate}`}>Download Excel</a>
        <button className="btn secondary" onClick={() => window.print()}>Print</button>
      </div>

      <div className="wl-chips">
        <span className="wl-chip">On list: {int(total.listed)}</span>
        <span className="wl-chip">Found in billing files: {int(total.inFile)}</span>
        <span className="wl-chip good">Paid today: {int(total.todayN)} (Rs {money(total.todayAmt)})</span>
        <span className="wl-chip good">Paid since last check: {int(total.paidN)} (Rs {money(total.paidAmt)})</span>
        <span className="wl-chip good">Paid since listing: {int(total.cumN)} (Rs {money(total.cumAmt)})</span>
        {total.notInFile > 0 && <span className="wl-chip">Not found in files: {int(total.notInFile)}</span>}
      </div>
      {missingEsds.length > 0 && (
        <div className="wl-warn">
          No billing file was found for {missingEsds.map((c) => esdLabelOf(c, esdMap)).join(', ')} on this date, so those consumers could not be checked.
        </div>
      )}
      {header.stale_warning && <div className="wl-warn">{header.stale_warning}</div>}

      <div className="wl-tabs no-print">
        {TABS.map(([key, label]) => (
          <button key={key} className={`btn${tab === key ? '' : ' secondary'}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === 'progress' && (
        <ProgressTab rows={rows} esdMap={esdMap} reportDate={reportDate} asOnDate={asOnDate} criteria={criteria} listName={list.name} />
      )}
      {tab === 'summary' && <SummaryTab rows={rows} esdMap={esdMap} />}
      {tab === 'today' && <ConsumerTab rows={rows} esdMap={esdMap} kind="today" />}
      {tab === 'paid' && <ConsumerTab rows={rows} esdMap={esdMap} kind="paid" />}
      {tab === 'ever' && <ConsumerTab rows={rows} esdMap={esdMap} kind="ever" />}
      {tab === 'notpaid' && <ConsumerTab rows={rows} esdMap={esdMap} kind="notpaid" />}
      {tab === 'notfound' && <ConsumerTab rows={rows} esdMap={esdMap} kind="notfound" />}
      {tab === 'trend' && <TrendTab checks={checks} />}

      <p className="wl-note" style={{ marginTop: 20 }}>
        Checked from: {header.file_names || '-'}{header.rows_in_files ? ` (${int(header.rows_in_files)} rows)` : ''}.
        Payments are read from the Last Payment Date / Amount columns, which show only each consumer&apos;s latest payment.
      </p>
    </div>
  );
}
