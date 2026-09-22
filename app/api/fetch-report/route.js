// Triggers the matching GitHub Actions workflow remotely instead of
// running a browser inside Vercel - Vercel's serverless environment
// proved unreliable for full Chromium automation (missing shared
// libraries), while GitHub Actions runs on a full VM and already works.
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

const WORKFLOW_FILES = {
  '360_Daily': 'fetch-360-daily.yml',
  '360_Cum': 'fetch-360-cum.yml',
  Converted: 'fetch-converted.yml',
  Prepaid_Bill: 'fetch-prepaid-bill.yml',
  IRCA_Bill: 'fetch-irca-bill.yml',
};

const GITHUB_OWNER = process.env.GITHUB_OWNER || 'goalparaec';
const GITHUB_REPO = process.env.GITHUB_REPO || 'automation';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

export async function POST(request) {
  const { sheetType, fromDate, toDate } = await request.json();

  const workflowFile = WORKFLOW_FILES[sheetType];
  if (!workflowFile) {
    return NextResponse.json({ error: `Unknown report type "${sheetType}".` }, { status: 400 });
  }
  if (!process.env.GITHUB_TOKEN) {
    return NextResponse.json(
      { error: 'GITHUB_TOKEN is not configured on the server.' },
      { status: 500 }
    );
  }

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: GITHUB_BRANCH,
        inputs: {
          from_date: fromDate || '',
          to_date: toDate || '',
        },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return NextResponse.json(
      { error: `GitHub rejected the trigger (${res.status}): ${text}` },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: `Triggered on GitHub Actions - runs in the background. Check the Actions tab, or refresh this report page in a minute or two.`,
  });
}
