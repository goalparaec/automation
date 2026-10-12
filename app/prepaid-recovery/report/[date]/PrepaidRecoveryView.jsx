'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

function inr(n) {
  if (n == null || isNaN(n)) return '-';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function lakhs(n) {
  if (n == null || isNaN(n)) return '-';
  return (Number(n) / 100000).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Internal band values stay unchanged in the database (so old uploads keep
// filtering correctly) — only how they're shown on screen changes.
const BAND_LABELS = {
  '3-6 months': 'Not recharged 3-6 months',
  '6-12 months': 'Not recharged 6-12 months',
  'Above 1 year': 'Not recharged above 1 year',
  'No payment record': 'Never recharged',
};
function bandLabel(band) {
  return BAND_LABELS[band] || band;
}

const REASON_LABELS = {
  'No phone (left out of call list)': 'No Phone numbers',
};
const ALL_EXCLUDE_REASONS = [
  'Government consumer', 'PDC connection', 'Dept/Govt Tower consumer',
  'Category not in scope', 'GHDT DTR', 'Excluded name keyword',
  'No phone (left out of call list)',
];
function reasonLabel(reason) {
  return REASON_LABELS[reason] || reason;
}

// Shared table styling: headers wrap onto multiple lines without ever
// splitting a word, and every column (header + data) lines up centered.
const th = {
  border: '1px solid #333', background: '#dce6f1', padding: '7px 6px', fontWeight: 700,
  textAlign: 'center', whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'normal',
  lineHeight: 1.25, verticalAlign: 'middle',
};
const td = {
  border: '1px solid #333', padding: '6px 6px', textAlign: 'center',
  whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'normal', lineHeight: 1.3,
};
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 12.5, tableLayout: 'fixed' };

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

function SummaryTab({ reportDate, summaryRows, esdMap }) {
  const total = summaryRows.reduce(
    (acc, r) => {
      acc.band_3_6 += r.band_3_6;
      acc.band_6_12 += r.band_6_12;
      acc.band_above_1y += r.band_above_1y;
      acc.band_no_payment += r.band_no_payment;
      acc.call_list_total += r.call_list_total;
      acc.neg_total += Number(r.neg_total);
      acc.no_phone_excluded += r.no_phone_excluded;
      acc.good_standing_count += r.good_standing_count || 0;
      acc.paid_yesterday_count += r.paid_yesterday_count;
      acc.paid_yesterday_amount += Number(r.paid_yesterday_amount);
      acc.paid_today_count += r.paid_today_count;
      acc.paid_today_amount += Number(r.paid_today_amount);
      return acc;
    },
    { band_3_6: 0, band_6_12: 0, band_above_1y: 0, band_no_payment: 0, call_list_total: 0,
      neg_total: 0, no_phone_excluded: 0, good_standing_count: 0, paid_yesterday_count: 0, paid_yesterday_amount: 0,
      paid_today_count: 0, paid_today_amount: 0 }
  );

  return (
    <div>
      <div className="no-print" style={{ marginBottom: 10 }}>
        <a className="btn" href={`/api/prepaid-recovery/export/summary/${reportDate}`}>Download Excel</a>
      </div>
      {summaryRows.some((r) => r.stale_warning) && (
        <div className="status error" style={{ marginBottom: 10 }}>
          {summaryRows.filter((r) => r.stale_warning).map((r) => (
            <div key={r.esd_code}>{esdMap[r.esd_code] || r.esd_label || r.esd_code}: {r.stale_warning}</div>
          ))}
        </div>
      )}
      <table className="print-table" style={tableStyle}>
        <thead>
          <tr>
            <th style={th}>ESD</th>
            <th style={th}>{bandLabel('3-6 months')}</th>
            <th style={th}>{bandLabel('6-12 months')}</th>
            <th style={th}>{bandLabel('Above 1 year')}</th>
            <th style={th}>{bandLabel('No payment record')}</th>
            <th style={th}>Call list total</th>
            <th style={th}>Negative balance (Lakhs)</th>
            <th style={th}>No Phone numbers</th>
          </tr>
        </thead>
        <tbody>
          {summaryRows.map((r) => (
            <tr key={r.esd_code}>
              <td style={td}>{esdMap[r.esd_code] || r.esd_label || r.esd_code}</td>
              <td style={td}>{r.band_3_6}</td>
              <td style={td}>{r.band_6_12}</td>
              <td style={td}>{r.band_above_1y}</td>
              <td style={td}>{r.band_no_payment}</td>
              <td style={td}>{r.call_list_total}</td>
              <td style={td}>{lakhs(r.neg_total)}</td>
              <td style={td}>{r.no_phone_excluded}</td>
            </tr>
          ))}
          <tr className="total-row">
            <td style={td}>Goalpara Circle Total</td>
            <td style={td}>{total.band_3_6}</td>
            <td style={td}>{total.band_6_12}</td>
            <td style={td}>{total.band_above_1y}</td>
            <td style={td}>{total.band_no_payment}</td>
            <td style={td}>{total.call_list_total}</td>
            <td style={td}>{lakhs(total.neg_total)}</td>
            <td style={td}>{total.no_phone_excluded}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function PaymentsTab({ reportDate, paymentsRows, esdMap }) {
  const [esdFilter, setEsdFilter] = useState('');
  const [whenFilter, setWhenFilter] = useState('');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(300);

  // Per-ESD roll-up built from the full list, so it always matches the rows below.
  const summary = useMemo(() => {
    const by = {};
    for (const r of paymentsRows) {
      const b = by[r.esd_code] || (by[r.esd_code] = { yc: 0, ya: 0, tc: 0, ta: 0 });
      const amt = Number(r.paid_amount || 0);
      if (r.paid_when === 'today') { b.tc += 1; b.ta += amt; } else { b.yc += 1; b.ya += amt; }
    }
    const codes = Object.keys(by).sort();
    const grand = { yc: 0, ya: 0, tc: 0, ta: 0 };
    for (const c of codes) for (const k of Object.keys(grand)) grand[k] += by[c][k];
    return { by, codes, grand };
  }, [paymentsRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return paymentsRows.filter((r) => {
      if (esdFilter && r.esd_code !== esdFilter) return false;
      if (whenFilter && r.paid_when !== whenFilter) return false;
      if (q && !`${r.consumer_no} ${r.consumer_name}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [paymentsRows, esdFilter, whenFilter, search]);

  const row = (label, b, key, bold) => (
    <tr key={key} style={bold ? { fontWeight: 700, background: '#fff2cc' } : undefined}>
      <td style={td}>{label}</td>
      <td style={td}>{b.yc}</td><td style={td}>{inr(b.ya)}</td>
      <td style={td}>{b.tc}</td><td style={td}>{inr(b.ta)}</td>
      <td style={td}>{b.yc + b.tc}</td><td style={td}>{inr(b.ya + b.ta)}</td>
    </tr>
  );

  return (
    <div>
      <div className="no-print" style={{ marginBottom: 10 }}>
        <a className="btn" href={`/api/prepaid-recovery/export/payments/${reportDate}`}>Download Excel</a>
      </div>
      <p style={{ color: '#6b7280', fontSize: 13 }}>
        Consumers who recharged since the previous report: &quot;Recharged Yesterday&quot; and &quot;Recharged Today&quot; are
        the last two payment days in this report.
      </p>
      <table className="print-table" style={{ ...tableStyle, marginBottom: 16 }}>
        <thead>
          <tr>
            <th style={th}>ESD</th>
            <th style={th}>Recharged Yesterday (consumers)</th><th style={th}>Recharged Yesterday (Rs)</th>
            <th style={th}>Recharged Today (consumers)</th><th style={th}>Recharged Today (Rs)</th>
            <th style={th}>Total (consumers)</th><th style={th}>Total (Rs)</th>
          </tr>
        </thead>
        <tbody>
          {summary.codes.map((c) => row(esdMap[c] || c, summary.by[c], c, false))}
          {row('Goalpara Circle Total', summary.grand, 'total', true)}
        </tbody>
      </table>

      <div className="no-print field-row" style={{ marginBottom: 10 }}>
        <select value={esdFilter} onChange={(e) => setEsdFilter(e.target.value)}>
          <option value="">All ESDs</option>
          {Object.entries(esdMap).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select>
        <select value={whenFilter} onChange={(e) => setWhenFilter(e.target.value)}>
          <option value="">Yesterday + Today</option>
          <option value="yesterday">Recharged Yesterday</option>
          <option value="today">Recharged Today</option>
        </select>
        <input type="text" placeholder="Search name / consumer no" value={search}
          onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 220 }} />
      </div>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
        {filtered.length.toLocaleString('en-IN')} payment(s) match.
      </div>
      <table className="print-table" style={tableStyle}>
        <thead>
          <tr>
            <th style={th}>ESD</th><th style={th}>Consumer No</th><th style={th}>Name</th>
            <th style={th}>Category</th><th style={th}>Paid Rs</th><th style={th}>Balance now</th>
            <th style={th}>When</th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, visibleCount).map((r, i) => (
            <tr key={`${r.consumer_no}-${i}`}>
              <td style={td}>{esdMap[r.esd_code] || r.esd_code}</td>
              <td style={td}>{r.consumer_no}</td>
              <td style={td}>{r.consumer_name}</td>
              <td style={td}>{r.category_name}</td>
              <td style={td}>{inr(r.paid_amount)}</td>
              <td style={td}>{inr(r.balance_now)}</td>
              <td style={td}>{r.paid_when === 'today' ? 'Recharged Today' : 'Recharged Yesterday'}</td>
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
          {bands.map((b) => <option key={b} value={b}>{bandLabel(b)}</option>)}
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
      <table className="print-table" style={tableStyle}>
        <thead>
          <tr>
            <th style={th}>Sr. No.</th><th style={th}>ESD</th><th style={th}>Consumer No</th><th style={th}>Name</th>
            <th style={th}>Address</th><th style={th}>Category</th><th style={th}>Status</th>
            <th style={th}>Phone</th><th style={th}>Last Payment</th><th style={th}>Neg. Balance</th>
            <th style={th}>Not Recharged For</th><th style={th}>Remarks</th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, visibleCount).map((r) => {
            const key = `${r.consumer_no}|${r.esd_code}`;
            return (
              <tr key={key}>
                <td style={td}>{r.serial_no ?? '-'}</td>
                <td style={td}>{esdMap[r.esd_code] || r.esd_code}</td>
                <td style={td}>{r.consumer_no}</td>
                <td style={td}>{r.consumer_name}</td>
                <td style={td}>{r.consumer_address}</td>
                <td style={td}>{r.category_name}</td>
                <td style={td}>{r.connection_status}</td>
                <td style={td}>{r.phone_no}</td>
                <td style={td}>{r.last_payment_date || 'No record'}</td>
                <td style={td}>{inr(r.balance)}</td>
                <td style={td}>{bandLabel(r.band)}</td>
                <td className="no-print" style={{ ...td, textAlign: 'left' }}>
                  <input
                    type="text"
                    defaultValue={remarks[key] ?? ''}
                    onBlur={(e) => saveRemark(r.consumer_no, r.esd_code, e.target.value)}
                    style={{ width: '100%', fontSize: 12 }}
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

  // Always offer every category — even one with zero consumers today (e.g. GHDT) —
  // so it is clear the rule ran and found nobody, rather than looking missing.
  const reasons = useMemo(
    () => [...new Set([...ALL_EXCLUDE_REASONS, ...excludedRows.map((r) => r.reason_category)])],
    [excludedRows],
  );

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
        scope, GHDT, name keyword, or no usable phone number) and never appear in the Summary, Payments or
        Call List tabs. Filter by ESD or by reason category below.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {reasons.map((r) => (
          <span key={r} style={{ background: '#f0f4f8', borderRadius: 999, padding: '6px 12px', fontSize: 13 }}>
            {reasonLabel(r)}: {byReasonCount[r] || 0}
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
          {reasons.map((r) => <option key={r} value={r}>{reasonLabel(r)}</option>)}
        </select>
        <a className="btn" href={`/api/prepaid-recovery/export/excluded/${reportDate}`}>Download Excel</a>
      </div>
      <table className="print-table" style={tableStyle}>
        <thead>
          <tr>
            <th style={th}>ESD</th><th style={th}>Consumer No</th><th style={th}>Name</th>
            <th style={th}>Category</th><th style={th}>Status</th><th style={th}>Phone</th>
            <th style={th}>Balance</th><th style={th}>Reason</th><th style={th}>Detail</th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, visibleCount).map((r, i) => (
            <tr key={`${r.consumer_no}-${i}`}>
              <td style={td}>{esdMap[r.esd_code] || r.esd_code}</td>
              <td style={td}>{r.consumer_no}</td>
              <td style={td}>{r.consumer_name}</td>
              <td style={td}>{r.category_name}</td>
              <td style={td}>{r.connection_status}</td>
              <td style={td}>{r.phone_no}</td>
              <td style={td}>{inr(r.balance)}</td>
              <td style={td}>{reasonLabel(r.reason_category)}</td>
              <td style={td}>{r.reason_detail}</td>
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
      <table className="print-table" style={tableStyle}>
        <thead>
          <tr>
            <th style={th}>ESD</th><th style={th}>Consumer No</th><th style={th}>Name</th>
            <th style={th}>Balance ({previousDate})</th><th style={th}>Not Recharged For ({previousDate})</th>
            <th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, visibleCount).map((r, i) => (
            <tr key={`${r.consumerNo}-${i}`}>
              <td style={td}>{esdMap[r.esdCode] || r.esdCode}</td>
              <td style={td}>{r.consumerNo}</td>
              <td style={td}>{r.consumerName}</td>
              <td style={td}>{inr(r.balance)}</td>
              <td style={td}>{bandLabel(r.band)}</td>
              <td style={td}>{r.status}</td>
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

function GoodStandingTab({ reportDate, esdMap }) {
  const [esdFilter, setEsdFilter] = useState('');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const reqIdRef = useRef(0);
  const PAGE_SIZE = 300;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setOffset(0);
  }, [esdFilter, debouncedQ, reportDate]);

  useEffect(() => {
    const myReqId = ++reqIdRef.current;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({
      reportDate, offset: String(offset), limit: String(PAGE_SIZE),
    });
    if (esdFilter) params.set('esdCode', esdFilter);
    if (debouncedQ) params.set('q', debouncedQ);
    fetch(`/api/prepaid-recovery/good-standing/search?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (reqIdRef.current !== myReqId) return;
        if (d.error) { setError(d.error); setRows([]); setTotal(0); return; }
        setRows((prev) => (offset === 0 ? d.rows : [...prev, ...d.rows]));
        setTotal(d.total ?? 0);
      })
      .catch((err) => { if (reqIdRef.current === myReqId) setError(err.message || 'Search failed.'); })
      .finally(() => { if (reqIdRef.current === myReqId) setLoading(false); });
  }, [reportDate, esdFilter, debouncedQ, offset]);

  return (
    <div>
      <p style={{ color: '#6b7280', fontSize: 13 }}>
        Consumers who are eligible for prepaid recovery tracking but are not currently a defaulter — balance
        above the threshold, or recharged within the grace period. Together with Call List and Excluded, every
        consumer in the uploaded files can be found in one of these three places. Search to look someone up;
        this list is too large to browse in full.
      </p>
      <div className="no-print field-row" style={{ marginBottom: 10 }}>
        <select value={esdFilter} onChange={(e) => setEsdFilter(e.target.value)}>
          <option value="">All ESDs</option>
          {Object.entries(esdMap).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select>
        <input
          type="text"
          placeholder="Search name / consumer no"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 260 }}
        />
      </div>
      {error && <div className="status error" style={{ marginBottom: 10 }}>{error}</div>}
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
        {loading && offset === 0 ? 'Searching…' : `${total.toLocaleString('en-IN')} consumer(s) match.`}
      </div>
      <table className="print-table" style={tableStyle}>
        <thead>
          <tr>
            <th style={th}>ESD</th><th style={th}>Consumer No</th><th style={th}>Name</th>
            <th style={th}>Category</th><th style={th}>Balance</th><th style={th}>Last Payment</th>
            <th style={th}>Why not in call list</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.consumer_no}-${i}`}>
              <td style={td}>{esdMap[r.esd_code] || r.esd_code}</td>
              <td style={td}>{r.consumer_no}</td>
              <td style={td}>{r.consumer_name}</td>
              <td style={td}>{r.category_name}</td>
              <td style={td}>{inr(r.balance)}</td>
              <td style={td}>{r.last_payment_date || 'No record'}</td>
              <td style={td}>{r.skip_reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length < total && (
        <button
          className="btn secondary no-print"
          style={{ marginTop: 10 }}
          disabled={loading}
          onClick={() => setOffset((o) => o + PAGE_SIZE)}
        >
          {loading ? 'Loading…' : `Show more (${total - rows.length} remaining)`}
        </button>
      )}
    </div>
  );
}

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
      setMsg(`Allotted ${d.allotment.consumer_count} consumers to "${d.allotment.label}". Open this tab on a later report to see how many paid.`);
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

  return (
    <div>
      <p style={{ color: '#6b7280', fontSize: 13 }}>
        Hand out calling work by ESD and serial number range (Sr. No. is shown in the Call List tab; 1 = largest
        negative balance). The consumers are saved when you allot them. Open this tab on a later day&apos;s report
        to see, for each allotment, how many have since paid. &quot;Cleared&quot; means the consumer&apos;s balance is
        no longer a defaulter (recharged earlier or back above the threshold).
      </p>

      <div className="no-print field-row" style={{ marginBottom: 10 }}>
        <select value={esdCode} onChange={(e) => setEsdCode(e.target.value)}>
          <option value="">Choose ESD</option>
          {Object.entries(esdMap).map(([code, l]) => (
            <option key={code} value={code}>{l} ({callCounts[code] || 0} on call list)</option>
          ))}
        </select>
        <input type="number" min="1" placeholder="From Sr. No." value={fromSerial}
          onChange={(e) => setFromSerial(e.target.value)} style={{ width: 120 }} />
        <input type="number" min="1" placeholder="To Sr. No." value={toSerial}
          onChange={(e) => setToSerial(e.target.value)} style={{ width: 120 }} />
        <input type="text" placeholder="Allotted to (caller name)" value={label}
          onChange={(e) => setLabel(e.target.value)} style={{ minWidth: 200 }} />
        <button className="btn" onClick={create} disabled={busy}>{busy ? 'Saving…' : 'Create allotment'}</button>
        <a className="btn" href={`/api/prepaid-recovery/export/allotments/${reportDate}`}>Download Excel</a>
      </div>
      {msg && <div className={`status ${msg.startsWith('Error') ? 'error' : ''}`} style={{ marginBottom: 10 }}>{msg}</div>}
      {error && <div className="status error" style={{ marginBottom: 10 }}>{error}</div>}

      {list && list.length === 0 && <p>No allotments yet.</p>}
      {list && list.length > 0 && (
        <table className="print-table" style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Allotted to</th><th style={th}>ESD</th><th style={th}>Sr. No. range</th>
              <th style={th}>Allotted on</th><th style={th}>Consumers allotted</th>
              <th style={th}>Paid since allotment</th><th style={th}>Cleared</th>
              <th style={th}>Total recovered</th><th style={th}>Still unpaid</th>
              <th style={th}>Not in report</th><th style={th}>Recovered %</th>
              <th style={th}>Amount paid (Rs)</th><th className="no-print" style={th}> </th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => {
              const a = e.allotment;
              const st = e.stats;
              return (
                <tr key={a.id}>
                  <td style={td}>{a.label}</td>
                  <td style={td}>{esdMap[a.esd_code] || a.esd_code}</td>
                  <td style={td}>{a.from_serial}-{a.to_serial}</td>
                  <td style={td}>{a.allotted_on}</td>
                  <td style={td}>{a.consumer_count}</td>
                  {e.pending ? (
                    <td style={td} colSpan={7}>Allotted on this report — check from the next report</td>
                  ) : (
                    <>
                      <td style={td}>{st.paid}</td><td style={td}>{st.cleared}</td>
                      <td style={td}><b>{st.recovered}</b></td><td style={td}>{st.stillUnpaid}</td>
                      <td style={td}>{st.notInReport}</td><td style={td}>{st.recoveredPct.toFixed(1)}%</td>
                      <td style={td}>{inr(st.paidAmount)}</td>
                    </>
                  )}
                  <td className="no-print" style={td}>
                    {!e.pending && <button className="btn secondary" onClick={() => toggle(a.id)}>{openId === a.id ? 'Hide' : 'View'}</button>}
                    {' '}<button className="btn secondary" onClick={() => remove(a.id)}>Delete</button>
                  </td>
                </tr>
              );
            })}
            <tr style={{ fontWeight: 700, background: '#fff2cc' }}>
              <td style={td} colSpan={4}>TOTAL (all allotments checked against {reportDate})</td>
              <td style={td}>{totals.allotted}</td><td style={td}>{totals.paid}</td><td style={td}>{totals.cleared}</td>
              <td style={td}>{totals.recovered}</td><td style={td}>{totals.stillUnpaid}</td>
              <td style={td}>{totals.notInReport}</td><td style={td}>{totals.pct.toFixed(1)}%</td>
              <td style={td}>{inr(totals.paidAmount)}</td><td className="no-print" style={td}> </td>
            </tr>
          </tbody>
        </table>
      )}

      {openId && (
        <div style={{ marginTop: 16 }}>
          {!detail && <p>Loading…</p>}
          {detail && (
            <>
              <div className="no-print field-row" style={{ marginBottom: 8 }}>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">All statuses</option>
                  <option value="Paid">Paid</option>
                  <option value="Cleared">Cleared</option>
                  <option value="Still unpaid">Still unpaid</option>
                  <option value="Not in report">Not in report</option>
                </select>
              </div>
              <table className="print-table" style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th}>Sr. No.</th><th style={th}>Consumer No</th><th style={th}>Name</th>
                    <th style={th}>Phone</th><th style={th}>Not Recharged For (at allotment)</th>
                    <th style={th}>Balance at allotment</th><th style={th}>Status now</th><th style={th}>Amount paid</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.filter((it) => !statusFilter || it.status === statusFilter).map((it) => (
                    <tr key={it.id}>
                      <td style={td}>{it.serial_no}</td><td style={td}>{it.consumer_no}</td>
                      <td style={td}>{it.consumer_name}</td><td style={td}>{it.phone_no}</td>
                      <td style={td}>{bandLabel(it.band)}</td><td style={td}>{inr(it.balance)}</td>
                      <td style={td}>{it.status}</td><td style={td}>{it.paid_amount != null ? inr(it.paid_amount) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
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
        <button className={`btn ${tab === 'allotments' ? '' : 'secondary'}`} onClick={() => setTab('allotments')}>Allotments</button>
        <button className={`btn ${tab === 'goodstanding' ? '' : 'secondary'}`} onClick={() => setTab('goodstanding')}>Good Standing</button>
      </div>

      <div className="card">
        {tab === 'summary' && <SummaryTab reportDate={reportDate} summaryRows={summaryRows} esdMap={esdMap} />}
        {tab === 'payments' && <PaymentsTab reportDate={reportDate} paymentsRows={paymentsRows} esdMap={esdMap} />}
        {tab === 'calllist' && <CallListTab reportDate={reportDate} callListRows={callListRows} esdMap={esdMap} />}
        {tab === 'stillunpaid' && (
          <StillUnpaidTab reportDate={reportDate} previousDate={previousDate} stillUnpaidTracker={stillUnpaidTracker} esdMap={esdMap} />
        )}
        {tab === 'excluded' && <ExcludedTab reportDate={reportDate} excludedRows={excludedRows} esdMap={esdMap} />}
        {tab === 'allotments' && <AllotmentsTab reportDate={reportDate} esdMap={esdMap} callListRows={callListRows} />}
        {tab === 'goodstanding' && <GoodStandingTab reportDate={reportDate} esdMap={esdMap} />}
      </div>
    </div>
  );
}
