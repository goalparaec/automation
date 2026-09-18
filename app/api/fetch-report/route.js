export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel Hobby caps this at 60s regardless; Pro allows more

import { NextResponse } from 'next/server';
import chromium from '@sparticuz/chromium-min';
import { chromium as playwright } from 'playwright-core';
import { readSingleSheetFile } from '../../../lib/xlsxReader.js';
import { replaceInputRows, recordUpload, generateAllOutputs, validateReportRows } from '../../../lib/db.js';
import { SHEET_CONFIGS } from '../../../lib/sheetConfig.js';

const LOGIN_URL = 'https://www.apdclrms.com/cbs/login';

// @sparticuz/chromium-min doesn't bundle the browser binary itself (that's
// what caused the "libnss3.so" error - Next.js's build wasn't reliably
// including the full bundled binary). Instead it downloads a known-good
// Chromium build from this pinned release the moment the function runs.
// Version here must match the @sparticuz/chromium-min version in package.json.
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

async function login(page) {
  await page.goto(LOGIN_URL);
  await page.getByRole('textbox', { name: 'your username' }).fill(process.env.PORTAL_USERNAME);
  await page.getByRole('textbox', { name: '**********' }).fill(process.env.PORTAL_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();

  // The portal sometimes shows a "user is already logged in elsewhere"
  // prompt if a previous session wasn't closed cleanly (e.g. the browser
  // crashed instead of logging out). When it appears, confirming forces a
  // fresh login; when it doesn't appear, this is skipped automatically
  // rather than hanging and waiting for something that isn't there.
  const promptAppeared = await elementAppears(page.getByText('User is already logged in'), 5000);
  if (promptAppeared) {
    await page.getByRole('button', { name: 'Log in' }).click();
  }
}

async function openDashboard(page) {
  // NOTE: this specific click is a position-based locator ("the 4th span
  // on the page") rather than a named one, because that's what codegen
  // recorded for whatever menu/icon needs clicking before the dashboard
  // link becomes available. It's the most fragile step here - if the
  // portal's layout changes, this is the first thing to re-record.
  await page.locator('span').nth(4).click();

  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByText('ARMS 360 Dashboard').click(),
  ]);
  await popup.getByText('APDCL Performance').click();
  return popup;
}

async function downloadReport(popup, sheetType) {
  const linkText = REPORT_LINK_TEXT[sheetType];
  if (!linkText) {
    throw new Error(
      `No recorded steps yet for "${sheetType}" on the portal - record it with ` +
      `"npx playwright codegen" and send the generated code over.`
    );
  }

  await popup.getByText(linkText).click();
  const [download] = await Promise.all([
    popup.waitForEvent('download'),
    popup.getByText('Excel').click(),
  ]);

  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);

  // Close the report dialog so the dashboard is ready for the next report
  // if this same popup gets reused (not currently the case per-request,
  // but keeps the portal's own UI state clean either way).
  await popup.getByRole('button', { name: 'Close' }).click().catch(() => {});

  return Buffer.concat(chunks);
}

async function fetchFileFromPortal(sheetType) {
  const browser = await playwright.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await login(page);
    const popup = await openDashboard(page);
    return await downloadReport(popup, sheetType);
  } finally {
    await browser.close();
  }
}

export async function POST(request) {
  const { sheetType, reportDate } = await request.json();

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

  let buffer;
  try {
    buffer = await fetchFileFromPortal(sheetType);
  } catch (err) {
    // Any portal/browser failure lands here - the frontend falls back to
    // showing the manual upload input for this report, already in place.
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
