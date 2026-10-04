import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Allow static files, assets, API routes, favicon, etc.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/logo') ||
    pathname.includes('.') ||
    pathname === '/icon.png' ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // 2. Check if auth_session cookie exists
  const sessionCookie = request.cookies.get('auth_session');
  const isLoggedIn = !!sessionCookie?.value;

  // 3. If not logged in and not already on /login, redirect to /login
  if (!isLoggedIn && pathname !== '/login') {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // 4. If logged in and attempting to visit /login, redirect to home /
  if (isLoggedIn && pathname === '/login') {
    const homeUrl = new URL('/', request.url);
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
