import OverallCeUpload from './OverallCeUpload';
import { listOverallDates } from '../../lib/overallCeDb';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function OverallCePage() {
  let dates = [];
  try {
    dates = await listOverallDates();
  } catch (err) {
    console.error('Could not list Overall CE dates', err);
  }
  return <OverallCeUpload recentDates={dates} />;
}
