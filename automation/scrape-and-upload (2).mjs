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

async function clickLoginButton(page) {
  // Some portals briefly show a transient overlay (here, a div with id
  // "outOfSync" - likely a client-side time/session sync check) right
  // after credentials are filled in, which physically sits on top of the
  // login button and blocks a normal click. Wait for it to clear on its
  // own first; if it's still there after a reasonable wait, force the
  // click through anyway rather than failing outright.
  const overlay = page.locator('#outOfSync');
  await overlay.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});

  const loginButton = page.getByRole('button', { name: 'Log in' });
  try {
    await loginButton.click({ timeout: 10000 });
  } catch {
    await loginButton.click({ force: true });
  }
}

async function login(page) {
  await page.goto(LOGIN_URL);
  await page.getByRole('textbox', { name: 'your username' }).fill(PORTAL_USERNAME);
  await page.getByRole('textbox', { name: '**********' }).fill(PORTAL_PASSWORD);
  await clickLoginButton(page);

  // Confirms a forced login if the portal reports a session already active
  // elsewhere; skipped automatically when that prompt doesn't appear.
  const promptAppeared = await elementAppears(page.getByText('User is already logged in'), 5000);
  if (promptAppeared) {
    await clickLoginButton(page);
  }
}

async function openDashboard(page) {
  // Fragile, position-based click ("4th span on the page") recorded by
  // codegen - re-record this specific step first if the portal changes.
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
    throw new Error(`No recorded steps yet for "${sheetType}" - record it with codegen and fill in REPORT_LINK_TEXT.`);
  }

  await popup.getByText(linkText).click();
  const [download] = await Promise.all([
    popup.waitForEvent('download'),
    popup.getByText('Excel').click(),
  ]);

  const savePath = path.join('/tmp', download.suggestedFilename());
  await download.saveAs(savePath);
  await popup.getByRole('button', { name: 'Close' }).click().catch(() => {});
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
  const page = await browser.newPage();
  const failures = [];

  try {
    await login(page);
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
  } finally {
    await browser.close();
  }

  if (failures.length > 0) {
    console.error('Some reports failed:', JSON.stringify(failures, null, 2));
    process.exit(1); // makes the GitHub Actions run show as failed -> triggers email
  }
}

main();
