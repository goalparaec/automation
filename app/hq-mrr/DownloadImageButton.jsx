'use client';

import { useState } from 'react';
import { toPng } from 'html-to-image';

/** Saves the element with the given id as a PNG picture. */
export default function DownloadImageButton({ targetId, fileName }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function save() {
    const node = document.getElementById(targetId);
    if (!node) return;
    setBusy(true);
    setErr(null);
    try {
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        width: node.scrollWidth,
        height: node.scrollHeight,
        skipFonts: true,
      });
      const a = document.createElement('a');
      a.download = fileName;
      a.href = dataUrl;
      a.click();
    } catch (e) {
      setErr(`Could not create the image: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn secondary" onClick={save} disabled={busy}>{busy ? 'Preparing...' : 'Download image'}</button>
      {err && <span className="status error">{err}</span>}
    </>
  );
}
