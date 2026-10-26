// Plain (server-rendered) tables shared by the Meter Cost pages.

const th = { whiteSpace: 'normal', textAlign: 'center' };

export function StatusTable({ status }) {
  const rows = [...status.rows, status.total];
  return (
    <div className="table-scroll">
      <table className="report-table">
        <thead>
          <tr>
            <th rowSpan={2} style={th}>ESD</th>
            <th rowSpan={2} style={th}>Type</th>
            <th colSpan={2} style={th}>Deposited</th>
            <th colSpan={2} style={th}>PR raised</th>
            <th colSpan={2} style={th}>Pending PR</th>
            <th colSpan={2} style={th}>Advance PR</th>
          </tr>
          <tr>
            {['1-Ph', '3-Ph', '1-Ph', '3-Ph', '1-Ph', '3-Ph', '1-Ph', '3-Ph'].map((h, i) => <th key={i} style={th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) =>
            ['new', 'rep'].map((k) => {
              const s = r[k];
              const isTotal = r === status.total;
              return (
                <tr key={r.esd + k} className={isTotal ? 'total-row' : ''}>
                  {k === 'new' && <td rowSpan={2} style={{ textAlign: 'left', verticalAlign: 'middle' }}>{r.esd}</td>}
                  <td style={{ textAlign: 'left' }}>{k === 'new' ? 'New connection' : 'Replacement'}</td>
                  <td>{s.dep1}</td><td>{s.dep3}</td>
                  <td>{s.pr1}</td><td>{s.pr3}</td>
                  <td style={s.pending1 ? { color: '#b91c1c', fontWeight: 700 } : null}>{s.pending1}</td>
                  <td style={s.pending3 ? { color: '#b91c1c', fontWeight: 700 } : null}>{s.pending3}</td>
                  <td style={s.advance1 ? { color: '#15803d', fontWeight: 700 } : null}>{s.advance1}</td>
                  <td style={s.advance3 ? { color: '#15803d', fontWeight: 700 } : null}>{s.advance3}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

const COUNT_HEAD = ['New 1-Ph', 'New 3-Ph', 'New total', 'Repl. 1-Ph', 'Repl. 3-Ph', 'Repl. total', 'Total 1-Ph', 'Total 3-Ph'];
const cells = (c) => [c.new1, c.new3, c.newTotal, c.rep1, c.rep3, c.repTotal, c.total1, c.total3];

export function MonthlyTable({ summary }) {
  let lastWithData = -1;
  summary.monthly.forEach((m, i) => { if (m.total.total1 + m.total.total3 > 0) lastWithData = i; });
  const months = summary.monthly.slice(0, lastWithData + 1);
  if (months.length === 0) return <p style={{ color: "#6b7280", fontSize: 13 }}>No deposits counted yet for this financial year.</p>;
  return (
    <div className="table-scroll">
      <table className="report-table">
        <thead>
          <tr>
            <th style={th}>Month</th><th style={th}>ESD</th>
            {COUNT_HEAD.map((h) => <th key={h} style={th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {months.map((m) => [
            ...m.rows.map((r, i) => (
              <tr key={m.month + r.esd_code}>
                {i === 0 && <td rowSpan={m.rows.length + 1} style={{ verticalAlign: 'middle' }}>{m.label}</td>}
                <td style={{ textAlign: 'left' }}>{r.esd}</td>
                {cells(r).map((v, j) => <td key={j}>{v}</td>)}
              </tr>
            )),
            <tr key={m.month + 'T'} className="total-row">
              <td style={{ textAlign: 'left' }}>Total</td>
              {cells(m.total).map((v, j) => <td key={j}>{v}</td>)}
            </tr>,
          ])}
          <tr className="total-row">
            <td colSpan={2} style={{ textAlign: 'left' }}>Grand total FY {summary.label}</td>
            {cells(summary.grand).map((v, j) => <td key={j}>{v}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function QuarterlyTable({ summary }) {
  return (
    <div className="table-scroll">
      <table className="report-table">
        <thead>
          <tr>
            <th style={th}>Quarter</th><th style={th}>ESD</th>
            {COUNT_HEAD.map((h) => <th key={h} style={th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {summary.quarterly.map((q) => [
            ...q.rows.map((r, i) => (
              <tr key={q.label + r.esd_code}>
                {i === 0 && <td rowSpan={q.rows.length + 1} style={{ verticalAlign: 'middle' }}>{q.label}</td>}
                <td style={{ textAlign: 'left' }}>{r.esd}</td>
                {cells(r).map((v, j) => <td key={j}>{v}</td>)}
              </tr>
            )),
            <tr key={q.label + 'T'} className="total-row">
              <td style={{ textAlign: 'left' }}>Total</td>
              {cells(q.total).map((v, j) => <td key={j}>{v}</td>)}
            </tr>,
          ])}
        </tbody>
      </table>
    </div>
  );
}
