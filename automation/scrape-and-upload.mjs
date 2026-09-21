// Fetches ONE report from the APDCL ARMS portal and uploads it to the
// GpEC Daily Report app - the same as uploading it by hand on /upload.
//
// Which report to fetch is controlled by the SHEET_TYPE environment
// variable (set by whichever GitHub Actions workflow calls this - see
// .github/workflows/daily-fetch-*.yml, one per report). This script
// handles exactly one report per run by design: isolated failures (one
// report breaking doesn't block the other 4), independent retriggering,
// and a separate pass/fail status per report in the Actions tab.
//
// REPORT_LINK_TEXT below has real, working entries for 360_Daily and
// 360_Cum. The other 3 (Converted, Prepaid_Bill, IRCA_Bill) still need
// their own codegen recording - see the bottom of this file for the
// steps, or ask for them again if you forget.
//
// FROM_DATE / TO_DATE (optional): some reports need a date range selected
// on the portal itself before downloading, rather than just using today.
// These are threaded through end-to-end already, but actually using them
// to fill in each report's date picker on the ARMS portal is a TODO -
// that needs its own codegen recording per report showing exactly how
// that report's date picker works, since portals often differ (a single
// calendar widget, separate from/to fields, a month+year dropdown, etc).

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const PORTAL_USERNAME = process.env.PORTAL_USERNAME;
const PORTAL_PASSWORD = process.env.PORTAL_PASSWORD;
const APP_URL = process.env.APP_URL; // e.g. https://your-app.vercel.app
const APP_UPLOAD_SECRET = process.env.APP_UPLOAD_SECRET; // optional
const SHEET_TYPE = process.env.SHEET_TYPE; // which single report to fetch this run
const FROM_DATE = process.env.FROM_DATE || null; // optional, YYYY-MM-DD
const TO_DATE = process.env.TO_DATE || null; // optional, YYYY-MM-DD

const LOGIN_URL = 'https://www.apdclrms.com/cbs/login';

const REPORT_LINK_TEXT = {
  '360_Daily': 'Daily Report',
  '360_Cum': 'Cumulative Monthly Report',
  Converted: null, // TODO: record this one with codegen
  Prepaid_Bill: null, // TODO: record this one with codegen
  IRCA_Bill: null, // TODO: record this one with codegen
};

function todayISO() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

function firstOfMonthISO() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

// IRCA_Bill always needs "1st of the current month through today" on the
// portal, not a single fixed date - and that range shifts every single
// day (today's date changes, and on the 1st of a new month, "1st" itself
// changes too). This computes it fresh on every run rather than relying
// on a value that would go stale.
function resolveDateRange(sheetType, explicitFrom, explicitTo) {
  const to = explicitTo || todayISO();
  if (sheetType === 'IRCA_Bill' && !explicitFrom) {
    return { from: firstOfMonthISO(), to };
  }
  return { from: explicitFrom, to };
}

async function elementAppears(locator, timeoutMs) {
  try {
    await locator.waitFor({ state: 'visible', timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

// This portal repeatedly shows a transient overlay (a div with id
// "outOfSync") that sits on top of whatever's underneath and blocks
// normal clicks, at seemingly random points throughout the flow. Every
// click in this script goes through here: wait briefly for the overlay
// to clear on its own, then force the click through if it's still there.
async function robustClick(page, locator) {
  const overlay = page.locator('#outOfSync');
  await overlay.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
  try {
    await locator.click({ timeout: 8000 });
  } catch {
    await locator.click({ force: true });
  }
}

async function login(page) {
  await page.goto(LOGIN_URL);
  await page.getByRole('textbox', { name: 'your username' }).fill(PORTAL_USERNAME);
  await page.getByRole('textbox', { name: '**********' }).fill(PORTAL_PASSWORD);
  await robustClick(page, page.getByRole('button', { name: 'Log in' }));

  const promptAppeared = await elementAppears(page.getByText('User is already logged in'), 5000);
  if (promptAppeared) {
    await robustClick(page, page.getByRole('button', { name: 'Log in' }));
  }
}

async function openDashboard(page) {
  await robustClick(page, page.locator('span').nth(4));

  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    robustClick(page, page.getByText('ARMS 360 Dashboard')),
  ]);
  await robustClick(popup, popup.getByText('APDCL Performance'));
  return popup;
}

// TODO: once a report's date-picker is recorded, fill it in here before
// clicking into the report - e.g. clicking a "from" field, typing
// fromDate, clicking a "to" field, typing toDate, then confirming.
// Left as a no-op for reports that don't need date selection (or when no
// range applies) so nothing breaks in the meantime. For IRCA_Bill
// specifically, fromDate/toDate are already computed correctly (1st of
// month -> today) by the time this is called - this function just needs
// the actual clicks recorded to put them into the portal's own fields.
async function selectDateRangeIfNeeded(popup, sheetType, fromDate, toDate) {
  if (!fromDate && !toDate) return;
  console.log(`(fromDate=${fromDate} toDate=${toDate} for ${sheetType}, but date-picker automation isn't recorded yet - using the portal's default date instead.)`);
}

async function downloadReport(popup, sheetType, fromDate, toDate) {
  const linkText = REPORT_LINK_TEXT[sheetType];
  if (!linkText) {
    throw new Error(`No recorded steps yet for "${sheetType}" - record it with codegen and fill in REPORT_LINK_TEXT.`);
  }

  try {
    await popup.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await robustClick(popup, popup.getByText(linkText));

    await selectDateRangeIfNeeded(popup, sheetType, fromDate, toDate);

    const [download] = await Promise.all([
      // 3 minutes - some reports (especially cumulative/monthly ones)
      // take noticeably longer to generate server-side than a daily one.
      popup.waitForEvent('download', { timeout: 180000 }),
      robustClick(popup, popup.getByText('Excel')),
    ]);

    const savePath = path.join('/tmp', download.suggestedFilename());
    await download.saveAs(savePath);
    await robustClick(popup, popup.getByRole('button', { name: 'Close' })).catch(() => {});
    return savePath;
  } catch (err) {
    await popup.screenshot({ path: `/tmp/error-${sheetType}.png`, fullPage: true }).catch(() => {});
    throw err;
  }
}

async function logout(page) {
  // Best-effort - a failed logout shouldn't fail the whole run, since the
  // report has already been fetched and uploaded successfully by now.
  try {
    await robustClick(page, page.getByText('P', { exact: true }));
    await robustClick(page, page.getByText('Log out'));
  } catch (err) {
    console.warn(`Logout did not complete cleanly (non-fatal): ${err.message}`);
  }
}

async function uploadToApp(sheetType, reportDate, filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormData();
  // Prefixed so the report page can later tell "fetched automatically by
  // GitHub Actions" apart from a manual browser upload or the in-app
  // "Fetch from Portal" button, without needing a database schema change.
  const taggedFilename = `github-actions-${sheetType}-${path.basename(filePath)}`;
  form.append('file', new Blob([fileBuffer]), taggedFilename);
  form.append('reportDate', reportDate);
  form.append('sheetType', sheetType);

  const headers = {};
  if (APP_UPLOAD_SECRET) headers['x-upload-secret'] = APP_UPLOAD_SECRET;

  // The app's own /api/upload endpoint validates the parsed data (all 5
  // sub-divisions present, plausible totals) before storing anything - so
  // a malformed or wrong file gets rejected here with a clear error,
  // exactly as it would for a manual upload.
  const res = await fetch(`${APP_URL}/api/upload`, { method: 'POST', body: form, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(`Upload failed for ${sheetType}: ${data.error}`);
  console.log(`${sheetType}: uploaded ${data.rowCount} rows for ${reportDate}`);
}

async function main() {
  if (!PORTAL_USERNAME || !PORTAL_PASSWORD || !APP_URL) {
    throw new Error('Missing PORTAL_USERNAME, PORTAL_PASSWORD, or APP_URL environment variables.');
  }
  if (!SHEET_TYPE || !(SHEET_TYPE in REPORT_LINK_TEXT)) {
    throw new Error(`SHEET_TYPE must be one of: ${Object.keys(REPORT_LINK_TEXT).join(', ')} (got "${SHEET_TYPE}").`);
  }

  const { from: resolvedFromDate, to: resolvedToDate } = resolveDateRange(SHEET_TYPE, FROM_DATE, TO_DATE);
  const reportDate = resolvedToDate;
  console.log(`Fetching ${SHEET_TYPE} for range: ${resolvedFromDate || '(single date)'} -> ${resolvedToDate}`);
  const browser = await chromium.launch();
  const context = await browser.newContext({ timezoneId: 'Asia/Kolkata' });
  const page = await context.newPage();

  try {
    await login(page);
    await page.screenshot({ path: '/tmp/after-login.png', fullPage: true }).catch(() => {});

    const popup = await openDashboard(page);
    const filePath = await downloadReport(popup, SHEET_TYPE, resolvedFromDate, resolvedToDate);
    await uploadToApp(SHEET_TYPE, reportDate, filePath);

    await logout(page);
  } catch (err) {
    await page.screenshot({ path: '/tmp/error-screenshot.png', fullPage: true }).catch(() => {});
    fs.writeFileSync('/tmp/error-page.html', await page.content().catch(() => 'Could not read page content.'));
    throw err;
  } finally {
    await browser.close();
  }
}

main();
