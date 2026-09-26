// Same pattern as the daily report's fetch-report route: triggers a
// GitHub Actions workflow remotely rather than running a browser inside
// Vercel. The workflow file itself (fetch-consumer-indexing.yml) doesn't
// exist yet - this needs a codegen recording of the portal's Consumer
// Indexing Report download flow first (same process as the other 5
// reports). Until then this returns a clear error and the person falls
// back to manual upload, which is fully working today.
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

const WORKFLOW_FILE = 'fetch-consumer-indexing.yml';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'goalparaec';
const GITHUB_REPO = process.env.GITHUB_REPO || 'automation';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

export async function POST(request) {
  const { reportDate } = await request.json();

  if (!process.env.GITHUB_TOKEN) {
    return NextResponse.json(
      { error: 'GITHUB_TOKEN is not configured on the server.' },
      { status: 500 }
    );
  }

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: GITHUB_BRANCH, inputs: { report_date: reportDate || '' } }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const notConfigured = res.status === 404;
    return NextResponse.json(
      {
        error: notConfigured
          ? 'Portal fetch for Consumer Indexing isn\'t set up yet - this needs a codegen recording first. Please upload the files manually below.'
          : `GitHub rejected the trigger (${res.status}): ${text}`,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: 'Triggered on GitHub Actions - check the Actions tab, or refresh this page in a minute or two.',
  });
}
