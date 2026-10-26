// Server-rendered tables for the HQ MRR page (no client JavaScript needed).
import { groupSpans, fmtValue, packBlocks } from '../../lib/hqMrrColumns';

const STRONG = { background: '#fff2cc', fontWeight: 700 };

function Header({ lead, cols, minW }) {
  const groups = groupSpans(cols);
  const hasGroups = groups.some((g) => g.label);
  let idx = 0;
  const top = groups.map((g, gi) => {
    const first = idx;
    idx += g.span;
    return g.label ? (
      <th key={gi} colSpan={g.span} style={{ textAlign: 'center' }}>{g.label}</th>
    ) : (
      <th key={gi} rowSpan={2} style={{ textAlign: 'center', minWidth: minW }}>{cols[first].label}</th>
    );
  });
  const second = cols.filter((c) => c.group).map((c) => (
    <th key={c.key + c.label + c.group} style={{ textAlign: 'center', minWidth: minW }}>{c.label}</th>
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
export function WideTable({ lead, cols, rows, minW = 72 }) {
  return (
    <table className="report-table" style={{ marginBottom: 14 }}>
      <Header lead={lead} cols={cols} minW={minW} />
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className={r.total ? 'total-row' : undefined}>
            <td style={{ whiteSpace: 'nowrap' }}>{r.label}</td>
            <Cells cols={cols} values={r.values} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A wide table cut into narrower ones, one below the other, so it stays readable on screen, in print and as an image. */
export function StackedTables({ lead, cols, sections, max, rows }) {
  return packBlocks(cols, sections, max).map((block, i) => (
    <WideTable key={i} lead={lead} cols={block} rows={rows} />
  ));
}

/** One ESD's figures, one under the other. */
export function SummaryList({ cols, values }) {
  const seen = new Set();
  const rows = [];
  for (const c of cols) {
    const label = c.group ? `${c.group.replace(' (Rs lakhs)', '')} - ${c.label}` : c.label;
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
