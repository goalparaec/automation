import { NextResponse } from 'next/server';

// Username/password protection for the whole app (HTTP Basic Auth).
// Override on Vercel with AUTH_USERNAME / AUTH_PASSWORD environment variables.
const USERNAME = process.env.AUTH_USERNAME || 'goalpara_ec';
const PASSWORD = process.env.AUTH_PASSWORD || 'itreports@123';

function challenge() {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Goalpara EC Reports", charset="UTF-8"' },
  });
}

export function middleware(request) {
  // GitHub Actions scrapers post to /api/upload with their own secret header;
  // that route validates the secret itself, so let those requests through.
  if (
    request.nextUrl.pathname === '/api/upload' &&
    request.headers.get('x-upload-secret')
  ) {
    return NextResponse.next();
  }

  const header = request.headers.get('authorization') || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) return challenge();

  let user = '';
  let pass = '';
  try {
    const decoded = atob(encoded);
    const i = decoded.indexOf(':');
    user = decoded.slice(0, i);
    pass = decoded.slice(i + 1);
  } catch {
    return challenge();
  }

  if (user !== USERNAME || pass !== PASSWORD) return challenge();
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
