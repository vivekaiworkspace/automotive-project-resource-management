export function sendError(res, statusCode, code, message, details = null) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  const envelope = {
    error: {
      code,
      message,
      timestamp: new Date().toISOString(),
      ...(details ? { details } : {})
    }
  };
  res.end(JSON.stringify(envelope, null, 2));
}
