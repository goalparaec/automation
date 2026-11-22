// Draws the Progress Report table as a PNG image (browser only, no extra libraries).
// Input is the object returned by progressReport() in watchlistCore.js.
// Plain black-on-white report style: thin borders, light-grey header and total row,
// header text wraps inside each column, numbers are right aligned.

const FONT = 'Arial, "Segoe UI", Helvetica, sans-serif';
// Column widths (px) in the order of progressReport().columns
const COL_WIDTHS = [44, 92, 92, 112, 100, 118, 112, 108, 128, 128, 128];

function wrapLines(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(test).width > maxWidth) { lines.push(line); line = w; } else { line = test; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export function renderProgressPng(report, { scale = 2, showNotes = false } = {}) {
  const cols = report.columns;
  const widths = cols.map((_, i) => COL_WIDTHS[i] || 140);
  const tableW = widths.reduce((s, w) => s + w, 0);
  const margin = 16;
  const W = tableW + margin * 2;

  const PAD = 6;
  const TITLE_FONT = `bold 19px ${FONT}`;
  const HEAD_FONT = `bold 13px ${FONT}`;
  const BODY_FONT = `14px ${FONT}`;
  const BODY_BOLD = `bold 14px ${FONT}`;
  const NOTE_FONT = `italic 13px ${FONT}`;
  const TITLE_LH = 26; const HEAD_LH = 17; const ROW_H = 30; const NOTE_LH = 19;

  // --- measure everything first so the canvas is exactly as tall as it needs to be
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = TITLE_FONT;
  const titleLines = wrapLines(probe, report.title, tableW);
  probe.font = HEAD_FONT;
  const headLines = cols.map((c, i) => wrapLines(probe, c.header, widths[i] - PAD * 2));
  const headH = Math.max(...headLines.map((l) => l.length)) * HEAD_LH + PAD * 2;
  probe.font = NOTE_FONT;
  const noteLines = showNotes ? (report.notes || []).flatMap((n) => wrapLines(probe, n, tableW)) : [];

  const titleH = titleLines.length * TITLE_LH;
  const H = margin + titleH + 10 + headH + ROW_H * report.rows.length + (noteLines.length ? 14 + noteLines.length * NOTE_LH : 0) + margin;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  // --- title
  ctx.fillStyle = '#1f3b5c';
  ctx.font = TITLE_FONT;
  ctx.textAlign = 'center';
  titleLines.forEach((l, i) => ctx.fillText(l, W / 2, margin + TITLE_LH * i + TITLE_LH / 2));

  // --- table
  const x0 = margin;
  let y = margin + titleH + 10;
  const xs = [x0];
  widths.forEach((w) => xs.push(xs[xs.length - 1] + w));

  const line = (x1, y1, x2, y2, w = 1, color = '#5f7a96') => {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  };

  // header
  ctx.fillStyle = '#dbe8f5'; // light blue header
  ctx.fillRect(x0, y, tableW, headH);
  ctx.fillStyle = '#1b2a3a';
  ctx.font = HEAD_FONT;
  ctx.textAlign = 'center';
  headLines.forEach((lines, i) => {
    const total = lines.length * HEAD_LH;
    lines.forEach((l, k) => ctx.fillText(l, xs[i] + widths[i] / 2, y + (headH - total) / 2 + HEAD_LH * k + HEAD_LH / 2));
  });
  const headTop = y;
  y += headH;

  // body
  const bodyTop = y;
  report.rows.forEach((row) => {
    if (row._total) { ctx.fillStyle = '#eaf2fa'; ctx.fillRect(x0, y, tableW, ROW_H); }
    ctx.fillStyle = '#1b2a3a';
    ctx.font = row._total ? BODY_BOLD : BODY_FONT;
    cols.forEach((c, i) => {
      const text = row.display[i];
      if (c.key === 'esd') { ctx.textAlign = 'left'; ctx.fillText(text, xs[i] + PAD + 2, y + ROW_H / 2); }
      else if (c.key === 'sl') { ctx.textAlign = 'center'; ctx.fillText(text, xs[i] + widths[i] / 2, y + ROW_H / 2); }
      else { ctx.textAlign = 'right'; ctx.fillText(text, xs[i + 1] - PAD - 4, y + ROW_H / 2); }
    });
    y += ROW_H;
  });
  const bottom = y;

  // grid lines
  for (let r = 0; r <= report.rows.length; r += 1) {
    const ly = bodyTop + ROW_H * r;
    const heavy = r === 0 || r === report.rows.length || (r === report.rows.length - 1 && report.rows[report.rows.length - 1]._total);
    line(x0, ly, x0 + tableW, ly, heavy ? 1.5 : 0.8, heavy ? '#5f7a96' : '#b9c9da');
  }
  line(x0, headTop, x0 + tableW, headTop, 1.5, '#5f7a96');
  line(x0, headTop + headH, x0 + tableW, headTop + headH, 1.2, '#5f7a96');
  xs.forEach((x, i) => line(x, headTop, x, bottom, i === 0 || i === xs.length - 1 ? 1.5 : 0.8, i === 0 || i === xs.length - 1 ? '#5f7a96' : '#b9c9da'));

  // notes
  if (noteLines.length) {
    ctx.fillStyle = '#444444';
    ctx.font = NOTE_FONT;
    ctx.textAlign = 'left';
    noteLines.forEach((l, i) => ctx.fillText(l, x0, bottom + 14 + NOTE_LH * i + NOTE_LH / 2));
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not create the image.'))), 'image/png');
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
