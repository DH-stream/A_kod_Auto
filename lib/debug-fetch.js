const fs = require('fs');
const path = require('path');

const originalFetch = global.fetch;
const debugDir = process.env.AKOD_DEBUG_DIR || './debug';

if (typeof originalFetch !== 'function') {
  throw new Error('debug-fetch: global.fetch saknas');
}

function safeName(value) {
  return String(value || 'response')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'response';
}

function shouldCapture(url) {
  return /\/ServiceBooking\.aspx(?:[?#]|$)/i.test(String(url || ''));
}

async function captureResponse(response, url) {
  if (!shouldCapture(url)) return;

  try {
    fs.mkdirSync(debugDir, { recursive: true });

    const clone = response.clone();
    const html = await clone.text();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = path.join(debugDir, `${stamp}-${safeName(response.url || url)}`);

    fs.writeFileSync(`${base}.html`, html, 'utf8');
    fs.writeFileSync(
      `${base}.json`,
      JSON.stringify(
        {
          requestedUrl: String(url),
          finalUrl: response.url || String(url),
          status: response.status,
          ok: response.ok,
          contentType: response.headers?.get?.('content-type') || null,
          contentLength: html.length,
          capturedAt: new Date().toISOString(),
        },
        null,
        2
      ),
      'utf8'
    );
  } catch (error) {
    console.error('debug-fetch: kunde inte spara ServiceBooking-svar:', error?.message || error);
  }
}

global.fetch = async (...args) => {
  const response = await originalFetch(...args);
  const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
  await captureResponse(response, url);
  return response;
};
