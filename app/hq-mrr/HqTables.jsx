// Server-rendered tables for the HQ MRR page (no client JavaScript needed).
import { groupSpans, fmtValue } from '../../lib/hqMrrColumns';

const STRONG = { background: '#fff2cc', fontWeight: 700 };

function Header({ lead, cols }) {
  const groups = groupSpans(cols);
  const hasGroups = groups.some((g) => g.label);
  let idx = 0;
  const top = groups.map((g, gi) => {
    const first = idx;
    idx += g.span;
    return g.label ? (
      <th key={gi} colSpan={g.span} style={{ textAlign: 'center' }}>{g.label}</th>
    ) : (
      <th key={gi} rowSpan={2} style={{ textAlign: 'center', minWidth: 90 }}>{cols[first].label}</th>
    );
  });
  const second = cols.filter((c) => c.group).map((c) => (
    <th key={c.key + c.label + c.group} style={{ textAlign: 'center', minWidth: 90 }}>{c.label}</th>
  ));
  return (
    <thead>
      <tr>
        {lead.map((l) => <th key={l} rowSpan={hasGroups ? 2 : 1} style={{ textAlign: 'left' }}>{l}</th>)}
        {top}
      </tr>
      {hasGroups && <tr>{second}</tr>}
    </thead>
  );
}

function Cells({ cols, values }) {
  return cols.map((c) => (
    <td key={c.key + c.group} style={c.strong ? STRONG : undefined}>{fmtValue(values[c.key], c.fmt)}</td>
  ));
}

/** rows: [{ label, values, total? }] */
export function WideTable({ lead, cols, rows }) {
  return (
    <div className="table-scroll">
      <table className="report-table">
        <Header lead={lead} cols={cols} />
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className={r.total ? 'total-row' : undefined}>
              <td style={{ whiteSpace: 'nowrap' }}>{r.label}</td>
              <Cells cols={cols} values={r.values} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One ESD's figures, one under the other. */
export function SummaryList({ cols, values }) {
  const seen = new Set();
  const rows = [];
  for (const c of cols) {
    const label = c.group ? `${c.group} - ${c.label}` : c.label;
    if (seen.has(label)) continue;
    seen.add(label);
    rows.push({ label, c });
  }
  return (
    <table className="report-table" style={{ maxWidth: 640 }}>
      <tbody>
        {rows.map(({ label, c }) => (
          <tr key={label}>
            <td style={c.strong ? STRONG : undefined}>{label}</td>
            <td style={c.strong ? STRONG : undefined}>{fmtValue(values[c.key], c.fmt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
