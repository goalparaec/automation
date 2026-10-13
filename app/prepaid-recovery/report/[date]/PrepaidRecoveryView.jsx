'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ANALYSIS_COLUMNS, ANALYSIS_TABLES, analysisTableRows, analysisCrossRows, mergedAnalysis, trendRows,
  summarizePaymentsRows, summarizeExcludedRows, bandLabel, reasonLabel, fmtDate,
} from '../../../../lib/prepaidRecoveryCore';

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
const inr = (n) => (n == null || isNaN(n) ? '-' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }));
const money = (n) => (n == null || isNaN(n) ? '-' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const int = (n) => (n == null || isNaN(n) ? '-' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }));
const lakhs = (n) => (n == null || isNaN(n) ? '-' : (Number(n) / 100000).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtBy = (fmt, v) => {
  if (v == null || (typeof v === 'number' && isNaN(v))) return '-';
  if (fmt === 'int') return int(v);
  if (fmt === 'pct') return `${Number(v).toFixed(1)}%`;
  return money(v); // lakh + money
};
const signed = (fmt, v) => (v == null ? '-' : `${v > 0 ? '+' : ''}${fmtBy(fmt, v)}`);

// ---------------------------------------------------------------------------
// One table component and one stylesheet for every tab, so all reports look
// and wrap identically: headers/cells wrap at spaces only, each column is as
// wide as its longest word, numbers never wrap, and a wide table scrolls
// inside its own box instead of spilling out of the page.
// ---------------------------------------------------------------------------
function Styles() {
  return (
    <style jsx global>{`
      .pr-scope .pr-wrap { overflow-x: auto; border: 1px solid #cfd8e3; border-radius: 8px; margin-bottom: 18px; background: #fff; }
      .pr-scope table.pr-table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: auto; }
      .pr-scope .pr-table th {
        background: #1f3b5c; color: #fff; padding: 9px 10px; text-align: center; font-weight: 600;
        line-height: 1.25; border: 1px solid #1f3b5c; vertical-align: middle;
        white-space: normal; word-break: normal; overflow-wrap: normal;
      }
      .pr-scope .pr-table td {
        padding: 7px 10px; border: 1px solid #d9e1ea; text-align: center; vertical-align: middle; line-height: 1.3;
        white-space: normal; word-break: normal; overflow-wrap: normal;
      }
      .pr-scope .pr-table td.num { white-space: nowrap; }
      .pr-scope .pr-table td.left { text-align: left; }
      .pr-scope .pr-table.tall td { height: 38px; }
      .pr-scope .pr-table tbody tr:nth-child(even) td { background: #f3f6fa; }
      .pr-scope .pr-table tr.total td { background: #fff2cc; font-weight: 700; }
      .pr-scope .pr-table tr.section td { background: #dce6f1; font-weight: 700; text-align: left; }
      .pr-scope h3.pr-h { margin: 18px 0 8px; font-size: 15px; color: #1f3b5c; }
      .pr-scope .pr-note { color: #5b6776; font-size: 13px; margin: 0 0 12px; line-height: 1.45; }
      .pr-scope .pr-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
      .pr-scope .pr-chip { background: #eef3f9; border-radius: 999px; padding: 6px 12px; font-size: 13px; }
      .pr-scope .pr-chip.warn { background: #fff2cc; font-weight: 700; }
      .pr-scope .pr-chip.good { background: #d6f0db; }
      .pr-scope .pr-chip.bad { background: #f8cbcb; }
      .pr-scope .pr-remark { width: 100%; min-width: 180px; font-size: 12px; }
      @media print {
        .app-header, .no-print, .tabs { display: none !important; }
        .pr-scope .pr-wrap { overflow: visible; border: none; }
        .pr-scope .pr-table { font-size: 10px; }
        .pr-scope .pr-table th, .pr-scope .pr-table td { padding: 4px 5px; }
        .pr-scope .pr-remark { border: none; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        @page { size: A4 landscape; margin: 10mm; }
      }
    `}</style>
  );
}

/** columns: [{ header, render: (row, i) => node, left?, num? }]; rows may carry _total / _section. */
function DataTable({ columns, rows, tall }) {
  return (
    <div className="pr-wrap">
      <table className={`pr-table${tall ? ' tall' : ''}`}>
        <thead>
          <tr>{columns.map((c, i) => <th key={i}>{c.header}</th>)}</tr>
        </thead>
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

function ExcelButton({ href, children = 'Download Excel' }) {
  return <a className="btn" href={href}>{children}</a>;
}

function EsdSelect({ esdMap, value, onChange, all = 'All ESDs' }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{all}</option>
      {Object.entries(esdMap).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
    </select>
  );
}

const esdName = (esdMap, code) => esdMap[code] || code;

function ShowMore({ visible, total, onMore }) {
  if (visible >= total) return null;
  return (
    <button className="btn secondary no-print" style={{ marginTop: 4 }} onClick={onMore}>
      Show more ({(total - visible).toLocaleString('en-IN')} remaining)
    </button>
  );
}

function paidWindow(reportDate, from) {
  return from
    ? `Paid since last report = payments dated ${fmtDate(from)} to ${fmtDate(reportDate)}.`
    : `Paid since last report = payments up to ${fmtDate(reportDate)}.`;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
function SummaryTab({ reportDate, summaryRows, esdMap }) {
  const total = summaryRows.reduce((a, r) => {
    a.b36 += r.band_3_6; a.b612 += r.band_6_12; a.b1y += r.band_above_1y; a.bnp += r.band_no_payment;
    a.total += r.call_list_total; a.neg += Number(r.neg_total); a.nophone += r.no_phone_excluded;
    a.pn += r.paid_since_count || 0; a.pa += Number(r.paid_since_amount || 0);
    a.n36 += Number(r.neg_band_3_6); a.n612 += Number(r.neg_band_6_12); a.n1y += Number(r.neg_band_above_1y); a.nnp += Number(r.neg_band_no_payment);
    return a;
  }, { b36: 0, b612: 0, b1y: 0, bnp: 0, total: 0, neg: 0, nophone: 0, pn: 0, pa: 0, n36: 0, n612: 0, n1y: 0, nnp: 0 });
  const paidFrom = (summaryRows[0] || {}).paid_from_date;

  const rows = [
    ...summaryRows.map((r) => ({
      esd: esdName(esdMap, r.esd_code), b36: r.band_3_6, b612: r.band_6_12, b1y: r.band_above_1y, bnp: r.band_no_payment,
      total: r.call_list_total, neg: Number(r.neg_total), nophone: r.no_phone_excluded,
      pn: r.paid_since_count || 0, pa: Number(r.paid_since_amount || 0),
    })),
    { _total: true, esd: 'Goalpara Circle Total', b36: total.b36, b612: total.b612, b1y: total.b1y, bnp: total.bnp,
      total: total.total, neg: total.neg, nophone: total.nophone, pn: total.pn, pa: total.pa },
  ];
  const bandRows = [
    ...summaryRows.map((r) => ({
      esd: esdName(esdMap, r.esd_code), a: Number(r.neg_band_3_6), b: Number(r.neg_band_6_12),
      c: Number(r.neg_band_above_1y), d: Number(r.neg_band_no_payment), e: Number(r.neg_total),
    })),
    { _total: true, esd: 'Goalpara Circle Total', a: total.n36, b: total.n612, c: total.n1y, d: total.nnp, e: total.neg },
  ];

  return (
    <div>
      <div className="no-print" style={{ marginBottom: 10 }}>
        <ExcelButton href={`/api/prepaid-recovery/export/summary/${reportDate}`} />
      </div>
      <p className="pr-note">
        Call list as on {fmtDate(reportDate)}. {paidWindow(reportDate, paidFrom)}
      </p>
      {summaryRows.some((r) => r.stale_warning) && (
        <div className="status error" style={{ marginBottom: 10 }}>
          {summaryRows.filter((r) => r.stale_warning).map((r) => (
            <div key={r.esd_code}>{esdName(esdMap, r.esd_code)}: {r.stale_warning}</div>
          ))}
        </div>
      )}
      <DataTable
        columns={[
          { header: 'ESD', render: (r) => r.esd, left: true },
          { header: bandLabel('3-6 months'), render: (r) => int(r.b36), num: true },
          { header: bandLabel('6-12 months'), render: (r) => int(r.b612), num: true },
          { header: bandLabel('Above 1 year'), render: (r) => int(r.b1y), num: true },
          { header: bandLabel('No payment record'), render: (r) => int(r.bnp), num: true },
          { header: 'Call list total', render: (r) => int(r.total), num: true },
          { header: 'Negative balance (Lakhs)', render: (r) => lakhs(r.neg), num: true },
          { header: 'No Phone numbers', render: (r) => int(r.nophone), num: true },
          { header: 'Paid since last report (consumers)', render: (r) => int(r.pn), num: true },
          { header: 'Paid since last report (Rs)', render: (r) => money(r.pa), num: true },
        ]}
        rows={rows}
      />
      <h3 className="pr-h">Negative balance of the call list by band (Lakhs)</h3>
      <DataTable
        columns={[
          { header: 'ESD', render: (r) => r.esd, left: true },
          { header: bandLabel('3-6 months'), render: (r) => lakhs(r.a), num: true },
          { header: bandLabel('6-12 months'), render: (r) => lakhs(r.b), num: true },
          { header: bandLabel('Above 1 year'), render: (r) => lakhs(r.c), num: true },
          { header: bandLabel('No payment record'), render: (r) => lakhs(r.d), num: true },
          { header: 'Total (Lakhs)', render: (r) => lakhs(r.e), num: true },
        ]}
        rows={bandRows}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payments (paid since last report)
// ---------------------------------------------------------------------------
function PaymentsTab({ reportDate, paymentsRows, summaryRows, esdMap }) {
  const [esdFilter, setEsdFilter] = useState('');
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(300);
  const paidFrom = (summaryRows[0] || {}).paid_from_date;

  const sums = useMemo(() => summarizePaymentsRows(paymentsRows), [paymentsRows]);
  const esdRows = useMemo(() => {
    const codes = [...new Set([...summaryRows.map((r) => r.esd_code), ...Object.keys(sums.byEsd)])].sort();
    return [
      ...codes.map((c) => ({ esd: esdName(esdMap, c), n: (sums.byEsd[c] || {}).n || 0, amt: (sums.byEsd[c] || {}).amt || 0 })),
      { _total: true, esd: 'Goalpara Circle Total', n: sums.total.n, amt: sums.total.amt },
    ];
  }, [sums, summaryRows, esdMap]);
  const catRows = useMemo(() => [
    ...Object.entries(sums.byCategory).sort((a, b) => b[1].amt - a[1].amt).map(([cat, v]) => ({ cat, n: v.n, amt: v.amt })),
    { _total: true, cat: 'Total', n: sums.total.n, amt: sums.total.amt },
  ], [sums]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return paymentsRows.filter((r) => {
      if (esdFilter && r.esd_code !== esdFilter) return false;
      if (q && !`${r.consumer_no} ${r.consumer_name}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [paymentsRows, esdFilter, search]);

  return (
    <div>
      <div className="no-print" style={{ marginBottom: 10 }}>
        <ExcelButton href={`/api/prepaid-recovery/export/payments/${reportDate}`} />
      </div>
      <p className="pr-note">
        Consumers who recharged since the previous report. {paidWindow(reportDate, paidFrom)} Reports need not be
        daily: the window always starts at the date of the last report uploaded.
      </p>
      <DataTable
        columns={[
          { header: 'ESD', render: (r) => r.esd, left: true },
          { header: 'Paid since last report (consumers)', render: (r) => int(r.n), num: true },
          { header: 'Paid since last report (Rs)', render: (r) => money(r.amt), num: true },
        ]}
        rows={esdRows}
      />
      <h3 className="pr-h">Category-wise</h3>
      <DataTable
        columns={[
          { header: 'Category', render: (r) => r.cat, left: true },
          { header: 'Paid since last report (consumers)', render: (r) => int(r.n), num: true },
          { header: 'Paid since last report (Rs)', render: (r) => money(r.amt), num: true },
        ]}
        rows={catRows}
      />
      <h3 className="pr-h">Consumer list</h3>
      <div className="no-print field-row" style={{ marginBottom: 10 }}>
        <EsdSelect esdMap={esdMap} value={esdFilter} onChange={setEsdFilter} />
        <input type="text" placeholder="Search name / consumer no" value={search}
          onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 220 }} />
      </div>
      <p className="pr-note">{filtered.length.toLocaleString('en-IN')} consumer(s) match.</p>
      <DataTable
        columns={[
          { header: 'ESD', render: (r) => esdName(esdMap, r.esd_code) },
          { header: 'Consumer No', render: (r) => r.consumer_no },
          { header: 'Name', render: (r) => r.consumer_name, left: true },
          { header: 'Category', render: (r) => r.category_name },
          { header: 'Paid date', render: (r) => fmtDate(r.paid_date) || '-', num: true },
          { header: 'Paid amount (Rs)', render: (r) => money(r.paid_amount), num: true },
          { header: 'Balance now (Rs)', render: (r) => money(r.balance_now), num: true },
        ]}
        rows={filtered.slice(0, visible)}
      />
      <ShowMore visible={visible} total={filtered.length} onMore={() => setVisible((v) => v + 300)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Call list
// ---------------------------------------------------------------------------
function CallListTab({ reportDate, callListRows, esdMap }) {
  const [esdFilter, setEsdFilter] = useState('');
  const [bandFilter, setBandFilter] = useState('');
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(300);
  const [savingKey, setSavingKey] = useState(null);
  const bands = ['3-6 months', '6-12 months', 'Above 1 year', 'No payment record'];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return callListRows.filter((r) => {
      if (esdFilter && r.esd_code !== esdFilter) return false;
      if (bandFilter && r.band !== bandFilter) return false;
      if (q && !`${r.consumer_name} ${r.consumer_no} ${r.phone_no} ${r.serial_no}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [callListRows, esdFilter, bandFilter, search]);

  async function saveRemark(consumerNo, esdCode, value) {
    const key = `${consumerNo}|${esdCode}`;
    setSavingKey(key);
    try {
      await fetch('/api/prepaid-recovery/remark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consumerNo, esdCode, remark: value }),
      });
    } finally {
      setSavingKey((k) => (k === key ? null : k));
    }
  }

  return (
    <div>
      <div className="no-print field-row" style={{ marginBottom: 10 }}>
        <EsdSelect esdMap={esdMap} value={esdFilter} onChange={setEsdFilter} />
        <select value={bandFilter} onChange={(e) => setBandFilter(e.target.value)}>
          <option value="">All bands</option>
          {bands.map((b) => <option key={b} value={b}>{bandLabel(b)}</option>)}
        </select>
        <input type="text" placeholder="Search name / consumer no / phone / Sr. No." value={search}
          onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 260 }} />
        <ExcelButton href={`/api/prepaid-recovery/export/calllist/${reportDate}`} />
      </div>
      <p className="pr-note">
        {filtered.length.toLocaleString('en-IN')} consumer(s) match. Sr. No. is the position within the ESD:
        1 = largest negative balance. Use it to allot work on the Allotments tab.
      </p>
      <DataTable
        tall
        columns={[
          { header: 'Sr. No.', render: (r) => r.serial_no, num: true },
          { header: 'ESD', render: (r) => esdName(esdMap, r.esd_code) },
          { header: 'Consumer No', render: (r) => r.consumer_no },
          { header: 'Name', render: (r) => r.consumer_name, left: true },
          { header: 'Category', render: (r) => r.category_name },
          { header: 'Status', render: (r) => r.connection_status },
          { header: 'Phone', render: (r) => r.phone_no, num: true },
          { header: 'Last Payment', render: (r) => fmtDate(r.last_payment_date) || 'No record', num: true },
          { header: 'Negative Balance (Rs)', render: (r) => money(r.balance), num: true },
          { header: 'Not Recharged For', render: (r) => bandLabel(r.band) },
          {
            header: 'Remarks',
            left: true,
            render: (r) => (
              <>
                <input
                  className="pr-remark"
                  type="text"
                  defaultValue={r.remark || ''}
                  onBlur={(e) => saveRemark(r.consumer_no, r.esd_code, e.target.value)}
                />
                {savingKey === `${r.consumer_no}|${r.esd_code}` && <span style={{ fontSize: 11, color: '#6b7280' }}> saving…</span>}
              </>
            ),
          },
        ]}
        rows={filtered.slice(0, visible)}
      />
      <ShowMore visible={visible} total={filtered.length} onMore={() => setVisible((v) => v + 300)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Still unpaid tracker
// ---------------------------------------------------------------------------
function StillUnpaidTab({ reportDate, previousDate, stillUnpaidTracker, esdMap }) {
  const [esdFilter, setEsdFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [visible, setVisible] = useState(300);

  const counts = useMemo(() => {
    const m = { 'Still unpaid': 0, 'Paid since last report': 0, 'No longer in report': 0 };
    for (const r of stillUnpaidTracker) m[r.status] = (m[r.status] || 0) + 1;
    return m;
  }, [stillUnpaidTracker]);

  const filtered = useMemo(() => stillUnpaidTracker.filter((r) => {
    if (esdFilter && r.esdCode !== esdFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    return true;
  }), [stillUnpaidTracker, esdFilter, statusFilter]);

  if (!previousDate) {
    return <p className="pr-note">No earlier report is on file yet, so there is nothing to compare. This tab fills in once a second report is uploaded.</p>;
  }

  return (
    <div>
      <p className="pr-note">
        The call list of {fmtDate(previousDate)} compared with this report ({fmtDate(reportDate)}). Only the
        previous report is ever used for this comparison.
      </p>
      <div className="pr-chips">
        <span className="pr-chip bad">Still unpaid: {int(counts['Still unpaid'])}</span>
        <span className="pr-chip good">Paid since last report: {int(counts['Paid since last report'])}</span>
        <span className="pr-chip">No longer in report: {int(counts['No longer in report'])}</span>
      </div>
      <div className="no-print field-row" style={{ marginBottom: 10 }}>
        <EsdSelect esdMap={esdMap} value={esdFilter} onChange={setEsdFilter} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="Still unpaid">Still unpaid</option>
          <option value="Paid since last report">Paid since last report</option>
          <option value="No longer in report">No longer in report</option>
        </select>
        <ExcelButton href={`/api/prepaid-recovery/export/stillunpaid/${reportDate}`} />
      </div>
      <DataTable
        columns={[
          { header: 'ESD', render: (r) => esdName(esdMap, r.esdCode) },
          { header: 'Consumer No', render: (r) => r.consumerNo },
          { header: 'Name', render: (r) => r.consumerName, left: true },
          { header: `Balance on ${fmtDate(previousDate)} (Rs)`, render: (r) => money(r.balance), num: true },
          { header: `Not Recharged For (${fmtDate(previousDate)})`, render: (r) => bandLabel(r.band) },
          { header: 'Status', render: (r) => r.status },
        ]}
        rows={filtered.slice(0, visible)}
      />
      <ShowMore visible={visible} total={filtered.length} onMore={() => setVisible((v) => v + 300)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Excluded
// ---------------------------------------------------------------------------
function ExcludedTab({ reportDate, excludedRows, summaryRows, esdMap }) {
  const [esdFilter, setEsdFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [paidOnly, setPaidOnly] = useState(false);
  const [visible, setVisible] = useState(300);
  const paidFrom = (summaryRows[0] || {}).paid_from_date;

  const sums = useMemo(() => summarizeExcludedRows(excludedRows), [excludedRows]);
  const reasons = sums.reasons;
  const codes = useMemo(
    () => [...new Set([...summaryRows.map((r) => r.esd_code), ...excludedRows.map((r) => r.esd_code)])].sort(),
    [summaryRows, excludedRows],
  );

  const catRows = [
    ...reasons.map((reason) => ({ reason, ...sums.byReason[reason] })),
    { _total: true, reason: 'Total excluded', ...sums.total },
  ];
  const matrixRows = [
    ...reasons.map((reason) => ({ reason, vals: codes.map((c) => sums.matrix[reason][c] || 0), total: sums.byReason[reason].n })),
    { _total: true, reason: 'Total excluded', vals: codes.map((c) => reasons.reduce((t, reason) => t + (sums.matrix[reason][c] || 0), 0)), total: sums.total.n },
  ];

  const filtered = useMemo(() => excludedRows.filter((r) => {
    if (esdFilter && r.esd_code !== esdFilter) return false;
    if (reasonFilter && r.reason_category !== reasonFilter) return false;
    if (paidOnly && !r.paid_since_last) return false;
    return true;
  }), [excludedRows, esdFilter, reasonFilter, paidOnly]);

  return (
    <div>
      <div className="no-print" style={{ marginBottom: 10 }}>
        <ExcelButton href={`/api/prepaid-recovery/export/excluded/${reportDate}`} />
      </div>
      <p className="pr-note">
        These consumers are kept out of the Summary, Payments and Call List (government, PDC, tower/department,
        category not in scope, GHDT, name keyword, or no usable phone number) but are tracked here, including
        whether any of them paid. {paidWindow(reportDate, paidFrom)} Each consumer is listed under the first rule
        that applies. A category showing 0 means the rule ran and found nobody.
      </p>
      <DataTable
        columns={[
          { header: 'Excluded category', render: (r) => reasonLabel(r.reason), left: true },
          { header: 'Consumers', render: (r) => int(r.n), num: true },
          { header: 'Negative balance (Lakhs)', render: (r) => lakhs(r.negAmt), num: true },
          { header: 'Paid since last report (consumers)', render: (r) => int(r.paidN), num: true },
          { header: 'Paid since last report (Rs)', render: (r) => money(r.paidAmt), num: true },
        ]}
        rows={catRows}
      />
      <h3 className="pr-h">Category x ESD</h3>
      <DataTable
        columns={[
          { header: 'Excluded category', render: (r) => reasonLabel(r.reason), left: true },
          ...codes.map((c, i) => ({ header: esdName(esdMap, c), render: (r) => int(r.vals[i]), num: true })),
          { header: 'Total', render: (r) => int(r.total), num: true },
        ]}
        rows={matrixRows}
      />
      <h3 className="pr-h">Consumer list</h3>
      <div className="no-print field-row" style={{ marginBottom: 10 }}>
        <EsdSelect esdMap={esdMap} value={esdFilter} onChange={setEsdFilter} />
        <select value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value)}>
          <option value="">All categories</option>
          {reasons.map((r) => <option key={r} value={r}>{reasonLabel(r)}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={paidOnly} onChange={(e) => setPaidOnly(e.target.checked)} />
          Only those who paid since last report
        </label>
      </div>
      <p className="pr-note">{filtered.length.toLocaleString('en-IN')} consumer(s) match.</p>
      <DataTable
        columns={[
          { header: 'ESD', render: (r) => esdName(esdMap, r.esd_code) },
          { header: 'Consumer No', render: (r) => r.consumer_no },
          { header: 'Name', render: (r) => r.consumer_name, left: true },
          { header: 'Category', render: (r) => r.category_name },
          { header: 'Status', render: (r) => r.connection_status },
          { header: 'Phone', render: (r) => r.phone_no, num: true },
          { header: 'Balance (Rs)', render: (r) => money(r.balance), num: true },
          { header: 'Excluded because', render: (r) => reasonLabel(r.reason_category), left: true },
          { header: 'Detail', render: (r) => r.reason_detail, left: true },
          { header: 'Paid since last report', render: (r) => (r.paid_since_last ? 'Yes' : 'No') },
          { header: 'Paid date', render: (r) => (r.paid_since_last ? fmtDate(r.last_payment_date) : '-'), num: true },
          { header: 'Paid amount (Rs)', render: (r) => (r.paid_since_last ? money(r.last_payment_amount) : '-'), num: true },
        ]}
        rows={filtered.slice(0, visible)}
      />
      <ShowMore visible={visible} total={filtered.length} onMore={() => setVisible((v) => v + 300)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Allotments
// ---------------------------------------------------------------------------
function AllotmentsTab({ reportDate, esdMap, callListRows }) {
  const [esdCode, setEsdCode] = useState('');
  const [fromSerial, setFromSerial] = useState('');
  const [toSerial, setToSerial] = useState('');
  const [label, setLabel] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');

  const callCounts = useMemo(() => {
    const m = {};
    for (const r of callListRows) m[r.esd_code] = (m[r.esd_code] || 0) + 1;
    return m;
  }, [callListRows]);

  async function load() {
    setError('');
    try {
      const res = await fetch(`/api/prepaid-recovery/allotments?reportDate=${reportDate}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to load allotments.');
      setList(d.allotments);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, [reportDate]);

  async function create() {
    setMsg('');
    setBusy(true);
    try {
      const res = await fetch('/api/prepaid-recovery/allotments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportDate, esdCode, fromSerial, toSerial, label }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed.');
      setMsg(`Allotted ${d.allotment.consumer_count} consumers to "${d.allotment.label}". Open this tab on the next report to see how many have paid.`);
      setFromSerial(''); setToSerial(''); setLabel('');
      await load();
    } catch (e) { setMsg(`Error: ${e.message}`); } finally { setBusy(false); }
  }

  async function remove(id) {
    if (!window.confirm('Delete this allotment and its tracking?')) return;
    await fetch(`/api/prepaid-recovery/allotments?id=${id}`, { method: 'DELETE' });
    if (openId === id) { setOpenId(null); setDetail(null); }
    await load();
  }

  async function toggle(id) {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id); setDetail(null); setStatusFilter('');
    const res = await fetch(`/api/prepaid-recovery/allotments?reportDate=${reportDate}&id=${id}`);
    const d = await res.json();
    if (res.ok && d.allotments[0]) setDetail(d.allotments[0].items || []);
  }

  const totals = useMemo(() => {
    const t = { allotted: 0, paid: 0, cleared: 0, recovered: 0, stillUnpaid: 0, notInReport: 0, paidAmount: 0 };
    for (const e of list || []) {
      if (!e.stats) continue;
      for (const k of Object.keys(t)) t[k] += e.stats[k];
    }
    t.pct = t.allotted ? (t.recovered / t.allotted) * 100 : 0;
    return t;
  }, [list]);

  const summaryRows = useMemo(() => {
    if (!list) return [];
    return [
      ...list.map((e) => ({ e })),
      { _total: true, t: totals },
    ];
  }, [list, totals]);

  const pendingCell = (r, fn) => (r.e && r.e.pending ? '-' : fn(r));
  const cell = (fn) => (r) => {
    if (r._total) return fn(r.t);
    if (r.e.pending) return '-';
    return fn(r.e.stats);
  };

  return (
    <div>
      <p className="pr-note">
        Hand out calling work by ESD and Sr. No. range (see the Call List tab). The consumers are saved the
        moment you allot them, so changing serial numbers on later reports never affects an allotment. Open this
        tab on any later report to see how many of each allotment have paid since: <b>Paid</b> = recharged since
        allotment; <b>Balance cleared</b> = no longer a defaulter without a recorded payment; <b>Still unpaid</b> =
        still on the call list; <b>Not in report</b> = now excluded or gone.
      </p>

      <div className="no-print field-row" style={{ marginBottom: 10 }}>
        <select value={esdCode} onChange={(e) => setEsdCode(e.target.value)}>
          <option value="">Choose ESD</option>
          {Object.entries(esdMap).map(([code, l]) => (
            <option key={code} value={code}>{l} ({int(callCounts[code] || 0)} on call list)</option>
          ))}
        </select>
        <input type="number" min="1" placeholder="From Sr. No." value={fromSerial}
          onChange={(e) => setFromSerial(e.target.value)} style={{ width: 120 }} />
        <input type="number" min="1" placeholder="To Sr. No." value={toSerial}
          onChange={(e) => setToSerial(e.target.value)} style={{ width: 120 }} />
        <input type="text" placeholder="Allotted to (caller name)" value={label}
          onChange={(e) => setLabel(e.target.value)} style={{ minWidth: 200 }} />
        <button className="btn" onClick={create} disabled={busy}>{busy ? 'Saving…' : 'Create allotment'}</button>
        <ExcelButton href={`/api/prepaid-recovery/export/allotments/${reportDate}`} />
      </div>
      {msg && <div className={`status ${msg.startsWith('Error') ? 'error' : ''}`} style={{ marginBottom: 10 }}>{msg}</div>}
      {error && <div className="status error" style={{ marginBottom: 10 }}>{error}</div>}

      {list && list.length === 0 && <p className="pr-note">No allotments yet.</p>}
      {list && list.length > 0 && (
        <DataTable
          columns={[
            { header: 'Allotted to', render: (r) => (r._total ? 'TOTAL' : r.e.allotment.label), left: true },
            { header: 'ESD', render: (r) => (r._total ? '' : esdName(esdMap, r.e.allotment.esd_code)) },
            { header: 'Sr. No. range', render: (r) => (r._total ? '' : `${r.e.allotment.from_serial}-${r.e.allotment.to_serial}`), num: true },
            { header: 'Allotted on', render: (r) => (r._total ? '' : fmtDate(r.e.allotment.allotted_on)), num: true },
            { header: 'Consumers allotted', render: (r) => (r._total ? int(r.t.allotted) : int(r.e.allotment.consumer_count)), num: true },
            { header: 'Paid since allotment', render: (r) => (!r._total && r.e.pending ? 'Check from next report' : int(cell((s) => s.paid)(r))), num: true },
            { header: 'Balance cleared', render: (r) => (!r._total && r.e.pending ? '-' : int(cell((s) => s.cleared)(r))), num: true },
            { header: 'Total recovered', render: (r) => (!r._total && r.e.pending ? '-' : int(cell((s) => s.recovered)(r))), num: true },
            { header: 'Still unpaid', render: (r) => (!r._total && r.e.pending ? '-' : int(cell((s) => s.stillUnpaid)(r))), num: true },
            { header: 'Not in report', render: (r) => (!r._total && r.e.pending ? '-' : int(cell((s) => s.notInReport)(r))), num: true },
            { header: 'Recovered %', render: (r) => (!r._total && r.e.pending ? '-' : `${(r._total ? r.t.pct : r.e.stats.recoveredPct).toFixed(1)}%`), num: true },
            { header: 'Amount paid (Rs)', render: (r) => (!r._total && r.e.pending ? '-' : money(cell((s) => s.paidAmount)(r))), num: true },
            {
              header: 'Actions',
              render: (r) => (r._total ? '' : (
                <span className="no-print">
                  {!r.e.pending && <button className="btn secondary" onClick={() => toggle(r.e.allotment.id)}>{openId === r.e.allotment.id ? 'Hide' : 'View'}</button>}
                  {' '}<button className="btn secondary" onClick={() => remove(r.e.allotment.id)}>Delete</button>
                </span>
              )),
            },
          ]}
          rows={summaryRows}
        />
      )}

      {openId && (
        <div style={{ marginTop: 6 }}>
          {!detail && <p className="pr-note">Loading…</p>}
          {detail && (
            <>
              <div className="no-print field-row" style={{ marginBottom: 8 }}>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">All statuses</option>
                  <option value="Paid">Paid</option>
                  <option value="Balance cleared">Balance cleared</option>
                  <option value="Still unpaid">Still unpaid</option>
                  <option value="Not in report">Not in report</option>
                </select>
              </div>
              <DataTable
                columns={[
                  { header: 'Sr. No.', render: (it) => it.serial_no, num: true },
                  { header: 'Consumer No', render: (it) => it.consumer_no },
                  { header: 'Name', render: (it) => it.consumer_name, left: true },
                  { header: 'Phone', render: (it) => it.phone_no, num: true },
                  { header: 'Not Recharged For (at allotment)', render: (it) => bandLabel(it.band) },
                  { header: 'Balance at allotment (Rs)', render: (it) => money(it.balance), num: true },
                  { header: 'Status now', render: (it) => it.status },
                  { header: 'Paid date', render: (it) => (it.paid_date ? fmtDate(it.paid_date) : '-'), num: true },
                  { header: 'Paid amount (Rs)', render: (it) => (it.paid_amount != null ? money(it.paid_amount) : '-'), num: true },
                ]}
                rows={detail.filter((it) => !statusFilter || it.status === statusFilter)}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analysis: every consumer in the billing files
// ---------------------------------------------------------------------------
function AnalysisTab({ reportDate, previousDate, analysis, prevAnalysis, summaryRows, prevSummaryRows, esdMap }) {
  const [scope, setScope] = useState('');
  const codes = Object.keys(analysis || {}).sort();

  const scoped = useMemo(() => mergedAnalysis(analysis, scope ? [scope] : null), [analysis, scope]);
  const overview = useMemo(() => [
    ...codes.map((c) => ({ label: esdName(esdMap, c), m: mergedAnalysis(analysis, [c]).overall })),
    { _total: true, label: 'Goalpara Circle Total', m: mergedAnalysis(analysis).overall },
  ], [analysis, esdMap]); // eslint-disable-line react-hooks/exhaustive-deps
  const trend = useMemo(
    () => (previousDate ? trendRows(summaryRows, prevSummaryRows, analysis, prevAnalysis) : null),
    [previousDate, summaryRows, prevSummaryRows, analysis, prevAnalysis],
  );

  if (!analysis || codes.length === 0) {
    return (
      <p className="pr-note">
        No analysis is stored for this report. Upload the billing files again for this date to generate it.
      </p>
    );
  }

  const metricCols = (first) => [
    first,
    ...ANALYSIS_COLUMNS.map((c) => ({ header: c.header, render: (r) => fmtBy(c.fmt, c.get(r.m)), num: true })),
  ];
  const scopeName = scope ? esdName(esdMap, scope) : 'All ESDs (Goalpara Circle)';
  const paidFrom = (summaryRows[0] || {}).paid_from_date;

  const crossBlock = (field, title, fmt) => {
    const x = analysisCrossRows(scoped, field);
    const rows = [...x.rows.map((r) => ({ ...r })), { _total: true, key: 'Total', vals: x.totals, total: x.grand }];
    return (
      <>
        <h3 className="pr-h">{title}</h3>
        <DataTable
          columns={[
            { header: 'Category', render: (r) => r.key, left: true },
            ...x.conns.map((c, i) => ({ header: c, render: (r) => fmtBy(fmt, r.vals[i]), num: true })),
            { header: 'Total', render: (r) => fmtBy(fmt, r.total), num: true },
          ]}
          rows={rows}
        />
      </>
    );
  };

  return (
    <div>
      <div className="no-print field-row" style={{ marginBottom: 10 }}>
        <EsdSelect esdMap={esdMap} value={scope} onChange={setScope} all="All ESDs (Goalpara Circle)" />
        <ExcelButton href={`/api/prepaid-recovery/export/analysis/${reportDate}`}>Download Excel (all analysis)</ExcelButton>
      </div>
      <p className="pr-note">
        Every consumer in the billing files, whether on the call list or not. <b>Negative balance</b> = sum of
        negative prepaid balances. <b>Advance balance</b> = sum of positive balances. <b>Arrear</b> = the old
        outstanding frozen when the consumer moved to prepaid; <b>Arrear outstanding</b> is what is still unpaid
        (REM OS) and <b>Arrear recovered %</b> is the share already recovered through recharges and payments.
        {' '}{paidWindow(reportDate, paidFrom)} <b>Normal</b> = not Government, Dept/Govt Tower or PDC. LDC is
        listed even when no consumer has that status.
      </p>

      <h3 className="pr-h">ESD-wise overview</h3>
      <DataTable columns={metricCols({ header: 'ESD', render: (r) => r.label, left: true })} rows={overview} />

      <h3 className="pr-h" style={{ fontSize: 17, borderTop: '2px solid #1f3b5c', paddingTop: 14 }}>
        Detailed analysis: {scopeName}
      </h3>
      {ANALYSIS_TABLES.map((tbl) => {
        const { rows, total } = analysisTableRows(scoped, tbl.dim);
        return (
          <div key={tbl.dim}>
            <h3 className="pr-h">{tbl.title}</h3>
            <DataTable
              columns={metricCols({ header: tbl.keyHeader, render: (r) => r.key, left: true })}
              rows={[...rows, { _total: true, key: 'Total', m: total }]}
            />
          </div>
        );
      })}
      {crossBlock('n', 'Category x connection status: consumers', 'int')}
      {crossBlock('negAmt', 'Category x connection status: negative balance (Lakhs)', 'lakh')}

      <h3 className="pr-h">Change since the previous report</h3>
      {!trend ? (
        <p className="pr-note">No earlier report is on file yet, so there is nothing to compare.</p>
      ) : (
        <>
          <p className="pr-note">Previous report: {fmtDate(previousDate)}. Only the previous report is kept for comparison.</p>
          <DataTable
            columns={[
              { header: 'Measure / ESD', render: (r) => r.label, left: true },
              { header: `Previous (${fmtDate(previousDate)})`, render: (r) => fmtBy(r.fmt, r.prev), num: true },
              { header: `This report (${fmtDate(reportDate)})`, render: (r) => fmtBy(r.fmt, r.now), num: true },
              { header: 'Change', render: (r) => signed(r.fmt, r.prev == null ? null : r.now - r.prev), num: true },
            ]}
            rows={trend.metrics.flatMap((m) => [
              { _section: true, _label: m.header },
              ...trend.rows.map((r) => ({
                _total: r.code === 'TOTAL',
                label: r.code === 'TOTAL' ? 'Goalpara Circle Total' : esdName(esdMap, r.code),
                fmt: m.fmt, prev: r.values[m.key].prev, now: r.values[m.key].now,
              })),
            ])}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
const TABS = [
  ['summary', 'Summary'],
  ['payments', 'Payments'],
  ['calllist', 'Call List'],
  ['stillunpaid', 'Still Unpaid'],
  ['excluded', 'Excluded'],
  ['allotments', 'Allotments'],
  ['analysis', 'Analysis'],
];

export default function PrepaidRecoveryView({
  reportDate, summaryRows, paymentsRows, callListRows, excludedRows, esdMap, previousDate, stillUnpaidTracker,
  analysis, prevAnalysis, prevSummaryRows,
}) {
  const [tab, setTab] = useState('summary');

  return (
    <div className="pr-scope">
      <Styles />
      <div className="report-title">
        <span>Prepaid Reports — {fmtDate(reportDate)}</span>
        <a href="/prepaid-recovery" className="no-print">← Back to upload page</a>
      </div>

      <div className="tabs no-print" style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map(([id, label]) => (
          <button key={id} className={`btn ${tab === id ? '' : 'secondary'}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div className="card">
        {tab === 'summary' && <SummaryTab reportDate={reportDate} summaryRows={summaryRows} esdMap={esdMap} />}
        {tab === 'payments' && <PaymentsTab reportDate={reportDate} paymentsRows={paymentsRows} summaryRows={summaryRows} esdMap={esdMap} />}
        {tab === 'calllist' && <CallListTab reportDate={reportDate} callListRows={callListRows} esdMap={esdMap} />}
        {tab === 'stillunpaid' && (
          <StillUnpaidTab reportDate={reportDate} previousDate={previousDate} stillUnpaidTracker={stillUnpaidTracker} esdMap={esdMap} />
        )}
        {tab === 'excluded' && <ExcludedTab reportDate={reportDate} excludedRows={excludedRows} summaryRows={summaryRows} esdMap={esdMap} />}
        {tab === 'allotments' && <AllotmentsTab reportDate={reportDate} esdMap={esdMap} callListRows={callListRows} />}
        {tab === 'analysis' && (
          <AnalysisTab
            reportDate={reportDate} previousDate={previousDate} analysis={analysis} prevAnalysis={prevAnalysis}
            summaryRows={summaryRows} prevSummaryRows={prevSummaryRows} esdMap={esdMap}
          />
        )}
      </div>
    </div>
  );
}
