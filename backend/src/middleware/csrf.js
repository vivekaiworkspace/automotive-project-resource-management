import crypto from 'node:crypto';
import { sendError } from './errorHandler.js';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Helper to safely extract cookies from request headers
 */
export function parseCookies(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return {};
  const cookies = {};
  cookieHeader.split(';').forEach(c => {
    const [name, ...valParts] = c.trim().split('=');
    if (name) {
      cookies[name] = decodeURIComponent(valParts.join('='));
    }
  });
  return cookies;
}

/**
 * CSRF Protection Middleware
 * Verifies X-CSRF-Token header on state-changing requests.
 */
export function verifyCsrf(req, res) {
  if (!STATE_CHANGING_METHODS.has(req.method)) {
    return true; // Safe methods pass through
  }

  const cookies = parseCookies(req);
  const submittedCsrfToken = req.headers['x-csrf-token'] || req.headers['x-xsrf-token'];

  // 1. If user is in an authenticated session
  if (req.session && req.session.csrfSecret) {
    if (!submittedCsrfToken) {
      sendError(res, 403, 'CSRF_MISSING', 'CSRF token is required for state-changing operations');
      return false;
    }

    const expectedBuffer = Buffer.from(req.session.csrfSecret);
    const submittedBuffer = Buffer.from(submittedCsrfToken);

    if (expectedBuffer.length !== submittedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, submittedBuffer)) {
      sendError(res, 403, 'CSRF_INVALID', 'Invalid CSRF token');
      return false;
    }
    return true;
  }

  // 2. If client has an unauthenticated csrf_token cookie (e.g. from visiting login page)
  if (cookies.csrf_token) {
    if (!submittedCsrfToken) {
      sendError(res, 403, 'CSRF_MISSING', 'CSRF token is required for state-changing operations');
      return false;
    }

    const expectedBuffer = Buffer.from(cookies.csrf_token);
    const submittedBuffer = Buffer.from(submittedCsrfToken);

    if (expectedBuffer.length !== submittedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, submittedBuffer)) {
      sendError(res, 403, 'CSRF_INVALID', 'Invalid CSRF token');
      return false;
    }
    return true;
  }

  // If no session and no csrf_token cookie (e.g. initial login before any session/cookie is established)
  return true;
}
