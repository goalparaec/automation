export const runtime = 'nodejs';
// Vercel Hobby caps functions at 60s regardless of this setting - Pro
// allows up to 300s+. Set high here so it isn't the limiting factor on
// plans that do allow more; on Hobby, Vercel silently caps it at 60s.
export const maxDuration = 180;

import { NextResponse } from 'next/server';
import chromium from '@sparticuz/chromium-min';
import { chromium as playwright } from 'playwright-core';
import { readSingleSheetFile } from '../../../lib/xlsxReader.js';
import { replaceInputRows, recordUpload, generateAllOutputs, validateReportRows } from '../../../lib/db.js';
import { SHEET_CONFIGS } from '../../../lib/sheetConfig.js';

const LOGIN_URL = 'https://www.apdclrms.com/cbs/login';

const CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v119.0.2/chromium-v119.0.2-pack.tar';

// The exact clickable text for each report inside the ARMS 360 Dashboard
// popup, as recorded via `npx playwright codegen`. Fill in the remaining
// 3 the same way (record just the "click through to that report and
// download" part - login/dashboard-opening is shared and already covered).
const REPORT_LINK_TEXT = {
  '360_Daily': 'Daily Report',
  '360_Cum': 'Cumulative Monthly Report',
  Converted: null, // TODO: record this one with codegen
  Prepaid_Bill: null, // TODO: record this one with codegen
  IRCA_Bill: null, // TODO: record this one with codegen
};

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
  await page.getByRole('textbox', { name: 'your username' }).fill(process.env.PORTAL_USERNAME);
  await page.getByRole('textbox', { name: '**********' }).fill(process.env.PORTAL_PASSWORD);
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
// clicking into the report. No-op for now so nothing breaks when a date
// range is passed for a report that doesn't have this wired up yet.
async function selectDateRangeIfNeeded(popup, sheetType, fromDate, toDate) {
  if (!fromDate && !toDate) return;
  console.log(`(fromDate=${fromDate} toDate=${toDate} given for ${sheetType}, but date-picker automation isn't recorded yet - using the portal's default date instead.)`);
}

async function downloadReport(popup, sheetType, fromDate, toDate) {
  const linkText = REPORT_LINK_TEXT[sheetType];
  if (!linkText) {
    throw new Error(
      `No recorded steps yet for "${sheetType}" on the portal - record it with ` +
      `"npx playwright codegen" and send the generated code over.`
    );
  }

  await popup.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await robustClick(popup, popup.getByText(linkText));

  await selectDateRangeIfNeeded(popup, sheetType, fromDate, toDate);

  const [download] = await Promise.all([
    // 3 minutes - some reports take noticeably longer to generate
    // server-side. Note this is still bounded by Vercel's own function
    // time limit (maxDuration above), which wins if it's the smaller one.
    popup.waitForEvent('download', { timeout: 180000 }),
    robustClick(popup, popup.getByText('Excel')),
  ]);

  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);

  await robustClick(popup, popup.getByRole('button', { name: 'Close' })).catch(() => {});

  return Buffer.concat(chunks);
}

async function logout(page) {
  try {
    await robustClick(page, page.getByText('P', { exact: true }));
    await robustClick(page, page.getByText('Log out'));
  } catch (err) {
    console.warn(`Logout did not complete cleanly (non-fatal): ${err.message}`);
  }
}

async function fetchFileFromPortal(sheetType, fromDate, toDate) {
  const browser = await playwright.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
    headless: true,
  });

  try {
    const context = await browser.newContext({ timezoneId: 'Asia/Kolkata' });
    const page = await context.newPage();
    await login(page);
    const popup = await openDashboard(page);
    const buffer = await downloadReport(popup, sheetType, fromDate, toDate);
    await logout(page);
    return buffer;
  } finally {
    await browser.close();
  }
}

function firstOfMonthISO() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

// IRCA_Bill always needs "1st of the current month through the chosen
// date" on the portal - computed automatically here so the in-app button
// doesn't require the person to fill in From/To manually every time.
function resolveDateRange(sheetType, explicitFrom, explicitTo, reportDate) {
  const to = explicitTo || reportDate;
  if (sheetType === 'IRCA_Bill' && !explicitFrom) {
    return { from: firstOfMonthISO(), to };
  }
  return { from: explicitFrom, to };
}

export async function POST(request) {
  const { sheetType, reportDate, fromDate, toDate } = await request.json();

  const config = SHEET_CONFIGS[sheetType];
  if (!config) {
    return NextResponse.json({ error: `Unknown report type "${sheetType}".` }, { status: 400 });
  }
  if (!reportDate) {
    return NextResponse.json({ error: 'reportDate is required.' }, { status: 400 });
  }
  if (!process.env.PORTAL_USERNAME || !process.env.PORTAL_PASSWORD) {
    return NextResponse.json(
      { error: 'Portal credentials are not configured on the server (PORTAL_USERNAME / PORTAL_PASSWORD).' },
      { status: 500 }
    );
  }

  const { from: resolvedFromDate, to: resolvedToDate } = resolveDateRange(sheetType, fromDate, toDate, reportDate);

  let buffer;
  try {
    buffer = await fetchFileFromPortal(sheetType, resolvedFromDate, resolvedToDate);
  } catch (err) {
    return NextResponse.json(
      { error: `Could not fetch from the portal: ${err.message}. Please upload the file manually instead.` },
      { status: 502 }
    );
  }

  try {
    const rows = await readSingleSheetFile(buffer, sheetType);
    if (rows.length === 0) {
      throw new Error('The fetched file had no recognizable data rows.');
    }
    // Every fetched file goes through the same validation a manual upload
    // does - all 5 sub-divisions present, plausible totals - before
    // anything is stored.
    const problems = validateReportRows(sheetType, rows);
    if (problems.length > 0) {
      throw new Error(`This file doesn't look complete: ${problems.join(' ')}`);
    }
    const count = await replaceInputRows(config.table, reportDate, rows);
    await generateAllOutputs(reportDate);
    await recordUpload({
      reportDate,
      filename: `portal-fetch-${sheetType}.xlsx`,
      fileSizeBytes: buffer.length,
      sheetsParsed: [sheetType],
      rowCounts: { [sheetType]: count },
      status: 'success',
    });
    return NextResponse.json({ ok: true, reportDate, sheetType, rowCount: count });
  } catch (err) {
    await recordUpload({
      reportDate,
      filename: `portal-fetch-${sheetType}.xlsx`,
      fileSizeBytes: buffer.length,
      sheetsParsed: [sheetType],
      rowCounts: {},
      status: 'failed',
      errorMessage: err.message,
    });
    return NextResponse.json(
      { error: `Fetched the file but could not process it: ${err.message}. Please upload it manually instead.` },
      { status: 422 }
    );
  }
}
