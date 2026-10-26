import HqMrrUpload from './HqMrrUpload';
import { getInjection, getIrca, getUploads } from '../../../lib/hqMrrDb';
import { monthName } from '../../../lib/hqMrrCore';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

function previousMonth() {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

export default async function HqMrrUploadPage({ searchParams }) {
  const m = /^\d{4}-\d{2}$/.test(searchParams?.month || '') ? searchParams.month : previousMonth();
  const month = `${m}-01`;
  let injection = {};
  let irca = { units: {}, fileName: null };
  let uploads = {};
  let error = null;
  try {
    let ircaInfo;
    [injection, ircaInfo, uploads] = await Promise.all([getInjection(month), getIrca(month), getUploads(month)]);
    irca = ircaInfo;
  } catch (err) {
    error = err.message;
  }
  return (
    <div className="card">
      <h1>Upload MRR - {monthName(month)}</h1>
      <form method="get" className="field-row">
        <label htmlFor="month">MRR month</label>
        <input id="month" name="month" type="month" defaultValue={m} />
        <button className="btn secondary" type="submit">Change month</button>
      </form>
      {error && (
        <p className="status error">
          Could not read the saved data: {error}. If this is the first time, run schema_hq_mrr.sql in the Supabase SQL editor.
        </p>
      )}
      <HqMrrUpload month={m} injection={injection} irca={irca} uploads={uploads} />
    </div>
  );
}
