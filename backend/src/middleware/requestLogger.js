export function logRequest(req, res, durationMs) {
  const method = req.method;
  const url = req.url;
  const status = res.statusCode;
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${method} ${url} -> ${status} (${durationMs}ms)`);
}
