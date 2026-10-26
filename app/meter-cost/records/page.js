import RecordsManager from './RecordsManager';
import { fyStartOf } from '../../../lib/meterCostCore';

export default function RecordsPage({ searchParams }) {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const fy = Number(searchParams?.fy) || fyStartOf(ist);
  return <RecordsManager initialFy={fy} />;
}
