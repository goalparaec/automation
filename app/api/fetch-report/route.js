export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel Hobby caps this at 60s regardless; Pro allows more

import { NextResponse } from 'next/server';
import chromium from '@sparticuz/chromium';
import { chromium as playwright } from 'playwright-core';
import { readSingleSheetFile } from '../../../lib/xlsxReader.js';
import { replaceInputRows, recordUpload, generateAllOutputs } from '../../../lib/db.js';
import { SHEET_CONFIGS } from '../../../lib/sheetConfig.js';

// TODO: same placeholders as the standalone script - fill these in using
// `npx playwright codegen <login-url>` on your own machine, then copy the
// exact selectors here. See automation/scrape-and-upload.mjs for the fuller
// walkthrough of how to record them.
const LOGIN_URL = 'https://TODO-your-portal.example.com/login';
const REPORT_URLS = {
  '360_Daily': 'https://TODO-your-portal.example.com/reports/360-daily',
  '360_Cum': 'https://TODO-your-portal.example.com/reports/360-cumulative',
  Converted: 'https://TODO-your-portal.example.com/reports/converted',
  Prepaid_Bill: 'https://TODO-your-portal.example.com/reports/prepaid-billing',
  IRCA_Bill: 'https://TODO-your-portal.example.com/reports/irca-billing',
};

async function fetchFileFromPortal(sheetType) {
  const browser = await playwright.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();

    await page.goto(LOGIN_URL);
    // TODO: replace with your portal's real login field/button selectors.
    await page.fill('#username', process.env.PORTAL_USERNAME);
    await page.fill('#password', process.env.PORTAL_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    await page.goto(REPORT_URLS[sheetType]);
    // TODO: replace with the actual "Download" button's selector/text.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('text=Download'),
    ]);

    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
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
