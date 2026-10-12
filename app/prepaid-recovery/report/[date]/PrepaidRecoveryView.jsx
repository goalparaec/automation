'use client';

import { useMemo, useState } from 'react';

function inr(n) {
  if (n == null || isNaN(n)) return '-';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function PRINT_CSS() {
  return (
    <style jsx global>{`
      @media print {
        .app-header, .no-print, .tabs, .btn.secondary { display: none !important; }
        .print-table { font-size: 10px; }
        table { page-break-inside: auto; }
        tr { page-break-inside: avoid; }
        thead { display: table-header-group; }
        @page { size: A4 landscape; margin: 10mm; }
      }
    `}</style>
  );
}

function SummaryTab({ reportDate, summaryRows }) {
  const total = summaryRows.reduce(
    (acc, r) => {
      acc.band_3_6 += r.band_3_6;
      acc.band_6_12 += r.band_6_12;
      acc.band_above_1y += r.band_above_1y;
      acc.band_no_payment += r.band_no_payment;
      acc.call_list_total += r.call_list_total;
      acc.neg_total += Number(r.neg_total);
      acc.no_phone_excluded += r.no_phone_excluded;
      acc.paid_yesterday_count += r.paid_yesterday_count;
      acc.paid_yesterday_amount += Number(r.paid_yesterday_amount);
      acc.paid_today_count += r.paid_today_count;
      acc.paid_today_amount += Number(r.paid_today_amount);
      acc.rows_in_report += r.rows_in_report;
      return acc;
    },
    { band_3_6: 0, band_6_12: 0, band_above_1y: 0, band_no_payment: 0, call_list_total: 0,
      neg_total: 0, no_phone_excluded: 0, paid_yesterday_count: 0, paid_yesterday_amount: 0,
      paid_today_count: 0, paid_today_amount: 0, rows_in_report: 0 }
  );

  return (
    <div>
      <div className="no-print" style={{ marginBottom: 10 }}>
        <a className="btn" href={`/api/prepaid-recovery/export/summary/${reportDate}`}>Download Excel</a>
      </div>
      {summaryRows.some((r) => r.stale_warning) && (
        <div className="status error" style={{ marginBottom: 10 }}>
          {summaryRows.filter((r) => r.stale_warning).map((r) => (
            <div key={r.esd_code}>{r.esd_label}: {r.stale_warning}</div>
          ))}
        </div>
      )}
      <table className="report-table print-table">
        <thead>
          <tr>
            <th>ESD</th><th>3-6 mo</th><th>6-12 mo</th><th>&gt;1y</th><th>No payment</th>
            <th>Call list</th><th>Neg. balance (Rs)</th><th>No phone</th>
            <th>Paid yesterday</th><th>Paid today</th><th>Rows in report</th>
          </tr>
        </thead>
        <tbody>
          {summaryRows.map((r) => (
            <tr key={r.esd_code}>
              <td>{r.esd_label}</td>
              <td>{r.band_3_6}</td>
              <td>{r.band_6_12}</td>
              <td>{r.band_above_1y}</td>
              <td>{r.band_no_payment}</td>
              <td>{r.call_list_total}</td>
              <td>{inr(r.neg_total)}</td>
              <td>{r.no_phone_excluded}</td>
              <td>{r.paid_yesterday_count} ({inr(r.paid_yesterday_amount)})</td>
              <td>{r.paid_today_count} ({inr(r.paid_today_amount)})</td>
              <td>{r.rows_in_report}</td>
            </tr>
          ))}
          <tr className="total-row">
            <td>Goalpara Circle Total</td>
            <td>{total.band_3_6}</td>
            <td>{total.band_6_12}</td>
            <td>{total.band_above_1y}</td>
            <td>{total.band_no_payment}</td>
            <td>{total.call_list_total}</td>
            <td>{inr(total.neg_total)}</td>
            <td>{total.no_phone_excluded}</td>
            <td>{total.paid_yesterday_count} ({inr(total.paid_yesterday_amount)})</td>
            <td>{total.paid_today_count} ({inr(total.paid_today_amount)})</td>
            <td>{total.rows_in_report}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function PaymentsTab({ reportDate, paymentsRows }) {
  return (
    <div>
      <div className="no-print" style={{ marginBottom: 10 }}>
        <a className="btn" href={`/api/prepaid-recovery/export/payments/${reportDate}`}>Download Excel</a>
      </div>
      <table className="report-table print-table">
        <thead>
          <tr><th>ESD</th><th>Consumer No</th><th>Name</th><th>Category</th><th>Paid Rs</th><th>Balance now</th><th>When</th></tr>
        </thead>
        <tbody>
          {paymentsRows.map((r, i) => (
            <tr key={`${r.consumer_no}-${i}`}>
              <td>{r.esd_code}</td>
              <td>{r.consumer_no}</td>
              <td>{r.consumer_name}</td>
              <td>{r.category_name}</td>
              <td>{inr(r.paid_amount)}</td>
              <td>{inr(r.balance_now)}</td>
              <td>{r.paid_when}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CallListTab({ reportDate, callListRows, esdMap }) {
  const [esdFilter, setEsdFilter] = useState('');
  const [bandFilter, setBandFilter] = useState('');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(300);
  const [remarks, setRemarks] = useState(() => {
    const m = {};
    for (const r of callListRows) m[`${r.consumer_no}|${r.esd_code}`] = r.remark || '';
    return m;
  });
  const [savingKey, setSavingKey] = useState(null);

  const bands = ['3-6 months', '6-12 months', 'Above 1 year', 'No payment record'];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return callListRows.filter((r) => {
      if (esdFilter && r.esd_code !== esdFilter) return false;
      if (bandFilter && r.band !== bandFilter) return false;
      if (q) {
        const hay = `${r.consumer_name} ${r.consumer_no} ${r.phone_no} ${r.consumer_address}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [callListRows, esdFilter, bandFilter, search]);

  async function saveRemark(consumerNo, esdCode, value) {
    const key = `${consumerNo}|${esdCode}`;
    setRemarks((m) => ({ ...m, [key]: value }));
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
        <select value={esdFilter} onChange={(e) => setEsdFilter(e.target.value)}>
          <option value="">All ESDs</option>
          {Object.entries(esdMap).map(([code, label]) => (
            <option key={code} value={code}>{label}</option>
          ))}
        </select>
        <select value={bandFilter} onChange={(e) => setBandFilter(e.target.value)}>
          <option value="">All bands</option>
          {bands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <input
          type="text"
          placeholder="Search name / consumer no / phone / address"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 260 }}
        />
        <a className="btn" href={`/api/prepaid-recovery/export/calllist/${reportDate}`}>Download Excel</a>
      </div>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
        {filtered.length.toLocaleString('en-IN')} consumer(s) match.
      </div>
      <table className="report-table print-table">
        <thead>
          <tr>
            <th>ESD</th><th>Consumer No</th><th>Name</th><th>Address</th><th>Category</th>
            <th>Status</th><th>Phone</th><th>Last Payment</th><th>Neg. Balance</th><th>Not Recharged For</th><th>Remarks</th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, visibleCount).map((r) => {
            const key = `${r.consumer_no}|${r.esd_code}`;
            return (
              <tr key={key}>
                <td>{esdMap[r.esd_code] || r.esd_code}</td>
                <td>{r.consumer_no}</td>
                <td>{r.consumer_name}</td>
                <td>{r.consumer_address}</td>
                <td>{r.category_name}</td>
                <td>{r.connection_status}</td>
                <td>{r.phone_no}</td>
                <td>{r.last_payment_date || 'No record'}</td>
                <td>{inr(r.balance)}</td>
                <td>{r.band}</td>
                <td className="no-print">
                  <input
                    type="text"
                    defaultValue={remarks[key] ?? ''}
                    onBlur={(e) => saveRemark(r.consumer_no, r.esd_code, e.target.value)}
                    style={{ width: 180, fontSize: 12 }}
                  />
                  {savingKey === key && <span style={{ fontSize: 11, color: '#6b7280' }}> saving…</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {visibleCount < filtered.length && (
        <button className="btn secondary no-print" style={{ marginTop: 10 }} onClick={() => setVisibleCount((v) => v + 300)}>
          Show more ({filtered.length - visibleCount} remaining)
        </button>
      )}
    </div>
  );
}

function ExcludedTab({ reportDate, excludedRows, esdMap }) {
  const [esdFilter, setEsdFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [visibleCount, setVisibleCount] = useState(300);

  const reasons = useMemo(() => [...new Set(excludedRows.map((r) => r.reason_category))].sort(), [excludedRows]);

  const byReasonCount = useMemo(() => {
    const m = {};
    for (const r of excludedRows) m[r.reason_category] = (m[r.reason_category] || 0) + 1;
    return m;
  }, [excludedRows]);

  const filtered = useMemo(() => excludedRows.filter((r) => {
    if (esdFilter && r.esd_code !== esdFilter) return false;
    if (reasonFilter && r.reason_category !== reasonFilter) return false;
    return true;
  }), [excludedRows, esdFilter, reasonFilter]);

  return (
    <div>
      <p style={{ color: '#6b7280', fontSize: 13 }}>
        These consumers are dropped by the scope rules (government, PDC, tower/department, category not in
        scope, GHDT, or name keyword) and never appear in the Summary, Payments or Call List tabs. This tab
        is only for review.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {reasons.map((r) => (
          <span key={r} style={{ background: '#f0f4f8', borderRadius: 999, padding: '6px 12px', fontSize: 13 }}>
            {r}: {byReasonCount[r]}
          </span>
        ))}
        <span style={{ background: '#fff2cc', borderRadius: 999, padding: '6px 12px', fontSize: 13, fontWeight: 700 }}>
          Total: {excludedRows.length}
        </span>
      </div>
      <div className="no-print field-row" style={{ marginBottom: 10 }}>
        <select value={esdFilter} onChange={(e) => setEsdFilter(e.target.value)}>
          <option value="">All ESDs</option>
          {Object.entries(esdMap).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select>
        <select value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value)}>
          <option value="">All reasons</option>
          {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <a className="btn" href={`/api/prepaid-recovery/export/excluded/${reportDate}`}>Download Excel</a>
      </div>
      <table className="report-table print-table">
        <thead>
          <tr><th>ESD</th><th>Consumer No</th><th>Name</th><th>Category</th><th>Status</th><th>Phone</th><th>Balance</th><th>Reason</th><th>Detail</th></tr>
        </thead>
        <tbody>
          {filtered.slice(0, visibleCount).map((r, i) => (
            <tr key={`${r.consumer_no}-${i}`}>
              <td>{esdMap[r.esd_code] || r.esd_code}</td>
              <td>{r.consumer_no}</td>
              <td>{r.consumer_name}</td>
              <td>{r.category_name}</td>
              <td>{r.connection_status}</td>
              <td>{r.phone_no}</td>
              <td>{inr(r.balance)}</td>
              <td>{r.reason_category}</td>
              <td>{r.reason_detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {visibleCount < filtered.length && (
        <button className="btn secondary no-print" style={{ marginTop: 10 }} onClick={() => setVisibleCount((v) => v + 300)}>
          Show more ({filtered.length - visibleCount} remaining)
        </button>
      )}
    </div>
  );
}

function StillUnpaidTab({ reportDate, previousDate, stillUnpaidTracker, esdMap }) {
  const [esdFilter, setEsdFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [visibleCount, setVisibleCount] = useState(300);

  if (!previousDate) {
    return <p>No earlier report exists yet to compare against — this will show up once a second day is uploaded.</p>;
  }

  const counts = useMemo(() => {
    const m = { 'Still unpaid': 0, 'Paid since last upload': 0, 'No longer in report': 0 };
    for (const r of stillUnpaidTracker) m[r.status] = (m[r.status] || 0) + 1;
    return m;
  }, [stillUnpaidTracker]);

  const filtered = useMemo(() => stillUnpaidTracker.filter((r) => {
    if (esdFilter && r.esdCode !== esdFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    return true;
  }), [stillUnpaidTracker, esdFilter, statusFilter]);

  return (
    <div>
      <p style={{ color: '#6b7280', fontSize: 13 }}>
        Comparing today&apos;s ({reportDate}) call list to the previous report on {previousDate}.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ background: '#f8cbcb', borderRadius: 999, padding: '6px 12px', fontSize: 13 }}>Still unpaid: {counts['Still unpaid']}</span>
        <span style={{ background: '#d6f0db', borderRadius: 999, padding: '6px 12px', fontSize: 13 }}>Paid since last upload: {counts['Paid since last upload']}</span>
        <span style={{ background: '#f0f4f8', borderRadius: 999, padding: '6px 12px', fontSize: 13 }}>No longer in report: {counts['No longer in report']}</span>
      </div>
      <div className="no-print field-row" style={{ marginBottom: 10 }}>
        <select value={esdFilter} onChange={(e) => setEsdFilter(e.target.value)}>
          <option value="">All ESDs</option>
          {Object.entries(esdMap).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="Still unpaid">Still unpaid</option>
          <option value="Paid since last upload">Paid since last upload</option>
          <option value="No longer in report">No longer in report</option>
        </select>
      </div>
      <table className="report-table print-table">
        <thead>
          <tr><th>ESD</th><th>Consumer No</th><th>Name</th><th>Balance ({previousDate})</th><th>Band ({previousDate})</th><th>Status</th></tr>
        </thead>
        <tbody>
          {filtered.slice(0, visibleCount).map((r, i) => (
            <tr key={`${r.consumerNo}-${i}`}>
              <td>{esdMap[r.esdCode] || r.esdCode}</td>
              <td>{r.consumerNo}</td>
              <td>{r.consumerName}</td>
              <td>{inr(r.balance)}</td>
              <td>{r.band}</td>
              <td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {visibleCount < filtered.length && (
        <button className="btn secondary no-print" style={{ marginTop: 10 }} onClick={() => setVisibleCount((v) => v + 300)}>
          Show more ({filtered.length - visibleCount} remaining)
        </button>
      )}
    </div>
  );
}

export default function PrepaidRecoveryView({
  reportDate, summaryRows, paymentsRows, callListRows, excludedRows, esdMap, previousDate, stillUnpaidTracker,
}) {
  const [tab, setTab] = useState('summary');

  return (
    <div>
      <PRINT_CSS />
      <div className="report-title">
        <span>Prepaid Recovery — {reportDate}</span>
        <a href="/prepaid-recovery" className="no-print">← Back to upload page</a>
      </div>

      <div className="tabs no-print" style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button className={`btn ${tab === 'summary' ? '' : 'secondary'}`} onClick={() => setTab('summary')}>Summary</button>
        <button className={`btn ${tab === 'payments' ? '' : 'secondary'}`} onClick={() => setTab('payments')}>Payments</button>
        <button className={`btn ${tab === 'calllist' ? '' : 'secondary'}`} onClick={() => setTab('calllist')}>Call List</button>
        <button className={`btn ${tab === 'stillunpaid' ? '' : 'secondary'}`} onClick={() => setTab('stillunpaid')}>Still Unpaid Tracker</button>
        <button className={`btn ${tab === 'excluded' ? '' : 'secondary'}`} onClick={() => setTab('excluded')}>Excluded</button>
      </div>

      <div className="card">
        {tab === 'summary' && <SummaryTab reportDate={reportDate} summaryRows={summaryRows} />}
        {tab === 'payments' && <PaymentsTab reportDate={reportDate} paymentsRows={paymentsRows} />}
        {tab === 'calllist' && <CallListTab reportDate={reportDate} callListRows={callListRows} esdMap={esdMap} />}
        {tab === 'stillunpaid' && (
          <StillUnpaidTab reportDate={reportDate} previousDate={previousDate} stillUnpaidTracker={stillUnpaidTracker} esdMap={esdMap} />
        )}
        {tab === 'excluded' && <ExcludedTab reportDate={reportDate} excludedRows={excludedRows} esdMap={esdMap} />}
      </div>
    </div>
  );
}
