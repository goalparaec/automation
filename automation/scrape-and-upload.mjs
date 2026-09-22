// Fetches ONE report from the APDCL ARMS portal and uploads it to the
// Goalpara Circle Reporting System - the same as uploading it by hand on
// /upload. Which report is controlled by the SHEET_TYPE environment
// variable (set by whichever GitHub Actions workflow calls this).

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const PORTAL_USERNAME = process.env.PORTAL_USERNAME;
const PORTAL_PASSWORD = process.env.PORTAL_PASSWORD;
const APP_URL = process.env.APP_URL;
const APP_UPLOAD_SECRET = process.env.APP_UPLOAD_SECRET;
const SHEET_TYPE = process.env.SHEET_TYPE;
const FROM_DATE = process.env.FROM_DATE || null;
const TO_DATE = process.env.TO_DATE || null;

const LOGIN_URL = 'https://www.apdclrms.com/cbs/login';

const REPORT_LINK_TEXT = {
  '360_Daily': 'Daily Report',
  '360_Cum': 'Cumulative Monthly Report',
  Converted: null, // TODO: record with codegen
  IRCA_Bill: null, // TODO: record with codegen
};

function todayISO() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

function firstOfMonthISO() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function lastDayOfMonth(year, monthIndex0) {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

function previousMonthRangeISO() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  let y = ist.getUTCFullYear();
  let m = ist.getUTCMonth() - 1; // previous month, 0-indexed
  if (m < 0) { m = 11; y -= 1; }
  const lastDay = lastDayOfMonth(y, m);
  const mm = String(m + 1).padStart(2, '0');
  return {
    from: `${y}-${mm}-01`,
    to: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

// IRCA_Bill: always 1st-of-current-month -> today, recomputed every run.
// Prepaid_Bill: always the full previous calendar month, recomputed every
// run (so it stays correct across a month boundary without editing).
function resolveDateRange(sheetType, explicitFrom, explicitTo) {
  if (sheetType === 'IRCA_Bill' && !explicitFrom) {
    return { from: firstOfMonthISO(), to: explicitTo || todayISO() };
  }
  if (sheetType === 'Prepaid_Bill' && !explicitFrom) {
    return previousMonthRangeISO();
  }
  return { from: explicitFrom, to: explicitTo || todayISO() };
}

async function elementAppears(locator, timeoutMs) {
  try {
    await locator.waitFor({ state: 'visible', timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

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

async function openArms360Dashboard(page) {
  await robustClick(page, page.locator('span').nth(4));
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    robustClick(page, page.getByText('ARMS 360 Dashboard')),
  ]);
  return popup;
}

async function logout(page) {
  try {
    await robustClick(page, page.locator('span').nth(4));
    await robustClick(page, page.getByText('Log Out'));
  } catch (err) {
    console.warn(`Logout did not complete cleanly (non-fatal): ${err.message}`);
  }
}

// 360_Daily / 360_Cum: default report, no date selection needed.
async function downloadViaApdclPerformance(page1, sheetType) {
  const linkText = REPORT_LINK_TEXT[sheetType];
  if (!linkText) {
    throw new Error(`No recorded steps yet for "${sheetType}" - record it with codegen.`);
  }
  await robustClick(page1, page1.getByText('APDCL Performance'));
  await page1.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await robustClick(page1, page1.getByText(linkText));

  const [download] = await Promise.all([
    page1.waitForEvent('download', { timeout: 180000 }),
    robustClick(page1, page1.getByText('Excel')),
  ]);
  const savePath = path.join('/tmp', download.suggestedFilename());
  await download.saveAs(savePath);
  await robustClick(page1, page1.getByRole('button', { name: 'Close' })).catch(() => {});
  return savePath;
}

// Prepaid_Bill: goes through its own "Prepaid Dashboard" popup (a second
// popup opened from page1), with a date-range calendar. The calendar
// appeared already showing the correct (previous) month with no
// navigation needed when this was recorded - if the portal ever defaults
// to a different month, this needs a follow-up recording that includes
// navigating the calendar first.
async function downloadPrepaidBill(page1, fromDate, toDate) {
  const [page2] = await Promise.all([
    page1.waitForEvent('popup'),
    robustClick(page1, page1.getByText('Prepaid Dashboard')),
  ]);
  await robustClick(page2, page2.getByText('Others'));

  const from = new Date(fromDate);
  const to = new Date(toDate);
  const fromLabel = `${from.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} ${from.getUTCDate()},`;
  const toLabel = `${to.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} ${to.getUTCDate()},`;

  await robustClick(page2, page2.getByText('JanuaryFebruaryMarchAprilMayJuneJulyAugustSeptember SunMonTueWedThuFriSat'));
  await robustClick(page2, page2.getByLabel(fromLabel));
  await robustClick(page2, page2.getByLabel(toLabel));

  // Confirms the generated summary before downloading (recorded as
  // clicking the "Unit billed ..." line - the exact number varies every
  // time, so match on the stable leading text instead).
  await robustClick(page2, page2.getByText(/Unit billed/));

  const [download] = await Promise.all([
    page2.waitForEvent('download', { timeout: 180000 }),
    robustClick(page2, page2.getByText('Excel')),
  ]);
  const savePath = path.join('/tmp', download.suggestedFilename());
  await download.saveAs(savePath);
  return savePath;
}

async function downloadReport(page1, sheetType, fromDate, toDate) {
  try {
    if (sheetType === 'Prepaid_Bill') {
      return await downloadPrepaidBill(page1, fromDate, toDate);
    }
    return await downloadViaApdclPerformance(page1, sheetType);
  } catch (err) {
    await page1.screenshot({ path: `/tmp/error-${sheetType}.png`, fullPage: true }).catch(() => {});
    throw err;
  }
}

async function uploadToApp(sheetType, reportDate, filePath, fromDate, toDate) {
  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormData();
  // Tags who fetched this and (when relevant) the date range actually
  // used, so the report page can show it without needing a schema change.
  const rangeTag = fromDate ? `-range-${fromDate}_to_${toDate}` : '';
  const taggedFilename = `github-actions-${sheetType}${rangeTag}-${path.basename(filePath)}`;
  form.append('file', new Blob([fileBuffer]), taggedFilename);
  form.append('reportDate', reportDate);
  form.append('sheetType', sheetType);

  const headers = {};
  if (APP_UPLOAD_SECRET) headers['x-upload-secret'] = APP_UPLOAD_SECRET;

  const res = await fetch(`${APP_URL}/api/upload`, { method: 'POST', body: form, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(`Upload failed for ${sheetType}: ${data.error}`);
  console.log(`${sheetType}: uploaded ${data.rowCount} rows for ${reportDate}`);
}

async function main() {
  if (!PORTAL_USERNAME || !PORTAL_PASSWORD || !APP_URL) {
    throw new Error('Missing PORTAL_USERNAME, PORTAL_PASSWORD, or APP_URL environment variables.');
  }
  if (!SHEET_TYPE) {
    throw new Error('SHEET_TYPE environment variable is required.');
  }

  const { from: resolvedFromDate, to: resolvedToDate } = resolveDateRange(SHEET_TYPE, FROM_DATE, TO_DATE);
  const reportDate = resolvedToDate;
  console.log(`Fetching ${SHEET_TYPE} for range: ${resolvedFromDate || '(default)'} -> ${resolvedToDate}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ timezoneId: 'Asia/Kolkata' });
  const page = await context.newPage();

  try {
    await login(page);
    await page.screenshot({ path: '/tmp/after-login.png', fullPage: true }).catch(() => {});

    const page1 = await openArms360Dashboard(page);
    const filePath = await downloadReport(page1, SHEET_TYPE, resolvedFromDate, resolvedToDate);
    await uploadToApp(SHEET_TYPE, reportDate, filePath, resolvedFromDate, resolvedToDate);

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
