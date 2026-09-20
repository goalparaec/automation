// Daily portal fetch: logs into the APDCL ARMS portal, downloads each of
// the 5 report files, and uploads them to the GpEC Daily Report app - the
// same as if you'd uploaded them by hand on the /upload page.
//
// 2 of 5 reports (360_Daily, 360_Cum) use real recorded selectors already.
// The remaining 3 (Converted, Prepaid_Bill, IRCA_Bill) still show a clear
// error until you record them the same way and fill in REPORT_LINK_TEXT
// below - run `npx playwright codegen https://www.apdclrms.com/cbs/login`,
// click through to each remaining report and download it, then copy the
// generated code's report-link text into REPORT_LINK_TEXT.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const PORTAL_USERNAME = process.env.PORTAL_USERNAME;
const PORTAL_PASSWORD = process.env.PORTAL_PASSWORD;
const APP_URL = process.env.APP_URL; // e.g. https://your-app.vercel.app
const APP_UPLOAD_SECRET = process.env.APP_UPLOAD_SECRET; // optional

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

async function elementAppears(locator, timeoutMs) {
  try {
    await locator.waitFor({ state: 'visible', timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

// This portal repeatedly shows a transient overlay (a div with id
// "outOfSync" - likely a client-side time/session sync check) that sits on
// top of whatever's underneath and blocks normal clicks, at seemingly
// random points throughout the flow, not just at login. Every click in
// this script goes through here: wait briefly for the overlay to clear on
// its own, then force the click through if it's still sitting there
// rather than failing the whole run over a cosmetic overlay.
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

  // Confirms a forced login if the portal reports a session already active
  // elsewhere; skipped automatically when that prompt doesn't appear.
  const promptAppeared = await elementAppears(page.getByText('User is already logged in'), 5000);
  if (promptAppeared) {
    await robustClick(page, page.getByRole('button', { name: 'Log in' }));
  }
}

async function openDashboard(page) {
  // Fragile, position-based click ("4th span on the page") recorded by
  // codegen - re-record this specific step first if the portal changes.
  await robustClick(page, page.locator('span').nth(4));

  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    robustClick(page, page.getByText('ARMS 360 Dashboard')),
  ]);
  await robustClick(popup, popup.getByText('APDCL Performance'));
  return popup;
}

async function downloadReport(popup, sheetType) {
  const linkText = REPORT_LINK_TEXT[sheetType];
  if (!linkText) {
    throw new Error(`No recorded steps yet for "${sheetType}" - record it with codegen and fill in REPORT_LINK_TEXT.`);
  }

  await robustClick(popup, popup.getByText(linkText));
  const [download] = await Promise.all([
    popup.waitForEvent('download'),
    robustClick(popup, popup.getByText('Excel')),
  ]);

  const savePath = path.join('/tmp', download.suggestedFilename());
  await download.saveAs(savePath);
  await robustClick(popup, popup.getByRole('button', { name: 'Close' })).catch(() => {});
  return savePath;
}

async function uploadToApp(sheetType, reportDate, filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([fileBuffer]), path.basename(filePath));
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

  const reportDate = todayISO();
  const browser = await chromium.launch();
  // The portal's own "time out of sync" check appears to assume the
  // browser is already in India time and does its own comparison math
  // against that assumption - GitHub Actions runners default to UTC,
  // which is exactly a 5.5-hour mismatch from IST, triggering a false
  // positive that blocks login entirely. Setting the browser context's
  // timezone directly fixes this regardless of the actual runner's
  // system clock/timezone.
  const context = await browser.newContext({ timezoneId: 'Asia/Kolkata' });
  const page = await context.newPage();
  const failures = [];

  try {
    await login(page);

    // Diagnostic snapshot right after login, before anything else can go
    // wrong - this alone should reveal whether login actually landed on
    // the expected post-login page or somewhere unexpected (e.g. still on
    // a login-adjacent page, or blocked by the overlay).
    await page.screenshot({ path: '/tmp/after-login.png', fullPage: true }).catch(() => {});

    const popup = await openDashboard(page);

    for (const sheetType of Object.keys(REPORT_LINK_TEXT)) {
      try {
        const filePath = await downloadReport(popup, sheetType);
        await uploadToApp(sheetType, reportDate, filePath);
      } catch (err) {
        console.error(`FAILED: ${sheetType} - ${err.message}`);
        failures.push({ sheetType, error: err.message });
      }
    }
  } catch (err) {
    // Any failure before the per-report loop (login, opening the
    // dashboard) - capture what the page actually looked like at that
    // moment so it can be inspected after the fact, since headless runs
    // give no other way to see what's on screen.
    await page.screenshot({ path: '/tmp/error-screenshot.png', fullPage: true }).catch(() => {});
    fs.writeFileSync('/tmp/error-page.html', await page.content().catch(() => 'Could not read page content.'));
    throw err;
  } finally {
    await browser.close();
  }

  if (failures.length > 0) {
    console.error('Some reports failed:', JSON.stringify(failures, null, 2));
    process.exit(1); // makes the GitHub Actions run show as failed -> triggers email
  }
}

main();
