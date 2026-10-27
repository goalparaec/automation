// Server-rendered tables for HQ requisition / supply / issue status.
const th = { whiteSpace: 'normal', textAlign: 'center' };
const red = (v) => (v ? { color: '#b91c1c', fontWeight: 700 } : null);
const green = (v) => (v ? { color: '#15803d', fontWeight: 700 } : null);

export function CircleHqTable({ circle }) {
  const groups = ['Deposited', 'Requisition to HQ', 'Received from HQ', 'Pending from HQ', 'Advance received', 'Issued to ESDs (PR)', 'Stock in hand'];
  const f = (r) => [[r.dep1, r.dep3], [r.req1, r.req3], [r.sup1, r.sup3], [r.pend1, r.pend3], [r.adv1, r.adv3], [r.iss1, r.iss3], [r.stock1, r.stock3]];
  const style = (g, v) => (g === 3 ? red(v) : g === 4 ? green(v) : g === 6 && v < 0 ? red(v) : null);
  return (
    <div className="table-scroll">
      <table className="report-table">
        <thead>
          <tr>
            {groups.map((g) => <th key={g} colSpan={2} style={th}>{g}</th>)}
          </tr>
          <tr>{groups.flatMap((g) => ['1-Ph', '3-Ph'].map((h) => <th key={g + h} style={th}>{h}</th>))}</tr>
        </thead>
        <tbody>
          <tr>
            {f(circle).flatMap((pair, g) => pair.map((v, i) => <td key={g + '-' + i} style={style(g, v)}>{v}</td>))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function RequisitionTable({ hq }) {
  if (hq.requisitions.length === 0) return <p style={{ color: '#6b7280', fontSize: 13 }}>No requisition added yet.</p>;
  return (
    <div className="table-scroll">
      <table className="report-table">
        <thead>
          <tr>
            <th rowSpan={2} style={th}>Requisition no</th><th rowSpan={2} style={th}>Date</th>
            <th colSpan={2} style={th}>Requisitioned</th><th colSpan={2} style={th}>Received</th>
            <th colSpan={2} style={th}>Pending</th><th colSpan={2} style={th}>Advance</th>
          </tr>
          <tr>{Array.from({ length: 4 }).flatMap((_, g) => ['1-Ph', '3-Ph'].map((h) => <th key={g + h} style={th}>{h}</th>))}</tr>
        </thead>
        <tbody>
          {hq.requisitions.map((r) => (
            <tr key={r.req_no}>
              <td style={{ textAlign: 'left' }}>{r.req_no}</td>
              <td>{r.date}</td>
              <td>{r.r1}</td><td>{r.r3}</td><td>{r.h1}</td><td>{r.h3}</td>
              <td style={red(r.pend1)}>{r.pend1}</td><td style={red(r.pend3)}>{r.pend3}</td>
              <td style={green(r.adv1)}>{r.adv1}</td><td style={green(r.adv3)}>{r.adv3}</td>
            </tr>
          ))}
          {(hq.unlinked.h1 || hq.unlinked.h3) ? (
            <tr>
              <td colSpan={2} style={{ textAlign: 'left' }}>Received, not yet against a requisition (advance)</td>
              <td>-</td><td>-</td><td>{hq.unlinked.h1}</td><td>{hq.unlinked.h3}</td>
              <td>-</td><td>-</td><td>-</td><td>-</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
