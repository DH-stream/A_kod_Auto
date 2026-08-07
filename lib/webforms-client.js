const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1000;

const HIDDEN_FIELD_NAMES = [
  '__VIEWSTATE',
  '__VIEWSTATEGENERATOR',
  '__VIEWSTATEENCRYPTED',
  '__EVENTVALIDATION',
];

function decodeHtml(value) {
  return String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function readAttribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(tag).match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return match ? decodeHtml(match[2]) : null;
}

function extractHiddenFields(html) {
  const result = {};
  const inputTags = String(html || '').match(/<input\b[^>]*>/gi) || [];

  for (const tag of inputTags) {
    const name = readAttribute(tag, 'name');
    if (!name || !HIDDEN_FIELD_NAMES.includes(name)) continue;
    result[name] = readAttribute(tag, 'value') ?? '';
  }

  return result;
}

function extractAuthorisationId(html) {
  const match = String(html || '').match(
    /<([a-z0-9]+)\b[^>]*\bid=["']MainContent_lblAuthorisationID["'][^>]*>([\s\S]*?)<\/\1>/i
  );
  if (!match) return null;

  const value = stripTags(match[2]).trim();
  const codeMatch = value.match(/\d+/);
  return codeMatch ? codeMatch[0] : null;
}

function extractErrorMessage(html) {
  const source = String(html || '');
  const candidates = [];
  const elementPattern = /<([a-z0-9]+)\b[^>]*\bid=["'][^"']*(?:PanelErrorMessage|lblErrorMessage)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi;

  let match;
  while ((match = elementPattern.exec(source))) {
    let text = stripTags(match[2]).replace(/\s+/g, ' ').trim();
    text = text.replace(/Warning!/gi, '').replace(/\bOK\b/gi, '').replace(/\s+/g, ' ').trim();
    if (text) candidates.push(text);
  }

  return candidates[0] || null;
}

function stripTags(value) {
  return decodeHtml(String(value || '').replace(/<[^>]*>/g, ' '));
}

function isLoginPage(html) {
  return /\bid=["']MainContent_txtUserName["']/i.test(String(html || ''));
}

function hasAuthorisationForm(html) {
  const source = String(html || '');
  return (
    /\bid=["']MainContent_txtUnitID["']/i.test(source) &&
    /\bid=["']MainContent_txtReleaseNo["']/i.test(source)
  );
}

function hasContinueButton(html) {
  return /(?:id|name)=["'][^"']*btnAddNewAuthorisation["']/i.test(String(html || ''));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class WebFormsClient {
  constructor({
    loginUrl,
    username,
    password,
    fetchImpl = global.fetch,
    retries = DEFAULT_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  }) {
    if (!loginUrl) throw new Error('loginUrl saknas');
    if (!username || !password) throw new Error('username eller password saknas');
    if (typeof fetchImpl !== 'function') throw new Error('fetch saknas');

    this.loginUrl = new URL(loginUrl).toString();
    this.serviceUrl = new URL('/ServiceBooking.aspx', this.loginUrl).toString();
    this.username = username;
    this.password = password;
    this.fetchImpl = fetchImpl;
    this.retries = retries;
    this.retryDelayMs = retryDelayMs;
    this.cookies = new Map();
  }

  async login() {
    const loginPage = await this.get(this.loginUrl);
    const hidden = extractHiddenFields(loginPage.html);
    this.assertRequiredState(hidden, 'login');

    const body = new URLSearchParams({
      __EVENTTARGET: '',
      __EVENTARGUMENT: '',
      ...hidden,
      'ctl00$MainContent$txtUserName': this.username,
      'ctl00$MainContent$txtPassword': this.password,
      'ctl00$MainContent$btnLogin': 'Login',
    });

    await this.post(this.loginUrl, body, this.loginUrl);

    const servicePage = await this.get(this.serviceUrl);
    if (isLoginPage(servicePage.html) || !hasAuthorisationForm(servicePage.html)) {
      throw new Error('HTTP-login misslyckades: ServiceBooking-formuläret kunde inte öppnas');
    }

    return servicePage.html;
  }

  async authorise(tank, ref, allowRelogin = true) {
    let formHtml = await this.getAuthorisationForm();

    if (isLoginPage(formHtml) && allowRelogin) {
      await this.login();
      return this.authorise(tank, ref, false);
    }

    const hidden = extractHiddenFields(formHtml);
    this.assertRequiredState(hidden, 'ServiceBooking');

    const body = new URLSearchParams({
      __EVENTTARGET: '',
      __EVENTARGUMENT: '',
      ...hidden,
      'ctl00$MainContent$txtUnitID': tank,
      'ctl00$MainContent$txtReleaseNo': ref,
      'ctl00$MainContent$txtNewNotification': '',
      'ctl00$MainContent$btnAuthorise': 'Authorise Service',
      'ctl00$MainContent$txtDepotUnitID': '',
      'ctl00$MainContent$ddlDepartTransportMode': 'EMPTY',
      'ctl00$MainContent$ddlUnitType': 'EMPTY',
    });

    const response = await this.post(this.serviceUrl, body, this.serviceUrl);

    if (isLoginPage(response.html)) {
      if (!allowRelogin) {
        throw new Error('Sessionen gick ut direkt efter nytt login');
      }
      await this.login();
      return this.authorise(tank, ref, false);
    }

    const aKod = extractAuthorisationId(response.html);
    if (aKod) {
      return {
        success: true,
        status: 'Klar',
        aKod,
        message: 'A-kod hittad',
      };
    }

    if (/Object reference not set to an instance of an object/i.test(response.html)) {
      return {
        success: false,
        status: 'Tekniskt fel',
        aKod: null,
        message: 'Object reference not set to an instance of an object',
      };
    }

    const errorMessage = extractErrorMessage(response.html);
    if (errorMessage) {
      return {
        success: false,
        status: 'Popup/fel',
        aKod: null,
        message: errorMessage,
      };
    }

    return {
      success: false,
      status: 'Okänt eller vänteläge',
      aKod: null,
      message: 'Ingen A-kod eller känt fel upptäcktes',
    };
  }

  async getAuthorisationForm() {
    let page = await this.get(this.serviceUrl);
    if (isLoginPage(page.html)) return page.html;
    if (hasAuthorisationForm(page.html)) return page.html;

    if (hasContinueButton(page.html)) {
      const hidden = extractHiddenFields(page.html);
      this.assertRequiredState(hidden, 'Continue');
      const body = new URLSearchParams({
        __EVENTTARGET: '',
        __EVENTARGUMENT: '',
        ...hidden,
        'ctl00$MainContent$btnAddNewAuthorisation': 'Continue',
        'ctl00$MainContent$txtDepotUnitID': '',
        'ctl00$MainContent$ddlDepartTransportMode': 'EMPTY',
        'ctl00$MainContent$ddlUnitType': 'EMPTY',
      });
      page = await this.post(this.serviceUrl, body, this.serviceUrl);
      if (hasAuthorisationForm(page.html)) return page.html;
    }

    throw new Error('ServiceBooking-formuläret hittades inte');
  }

  assertRequiredState(hidden, label) {
    if (!hidden.__VIEWSTATE || !hidden.__EVENTVALIDATION) {
      throw new Error(`${label}: VIEWSTATE eller EVENTVALIDATION saknas`);
    }
  }

  async get(url) {
    return this.request(url, { method: 'GET' });
  }

  async post(url, body, referer) {
    return this.request(url, {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: new URL(url).origin,
        Referer: referer,
      },
    });
  }

  async request(url, options) {
    let lastError;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const headers = {
          'User-Agent': 'Mozilla/5.0 (GitHub Actions A-kod automation)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...(options.headers || {}),
        };

        const cookie = this.cookieHeader();
        if (cookie) headers.Cookie = cookie;

        const response = await this.fetchImpl(url, {
          ...options,
          headers,
          redirect: 'follow',
        });

        this.captureCookies(response.headers);

        const html = await response.text();
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status} från ${url}`);
          if (response.status < 500 || attempt === this.retries) throw error;
          lastError = error;
        } else {
          return { html, status: response.status, url: response.url || String(url) };
        }
      } catch (error) {
        lastError = error;
        if (attempt === this.retries) throw error;
      }

      if (this.retryDelayMs > 0) await wait(this.retryDelayMs * (attempt + 1));
    }

    throw lastError || new Error('HTTP-request misslyckades');
  }

  captureCookies(headers) {
    if (!headers) return;
    let values = [];

    if (typeof headers.getSetCookie === 'function') {
      values = headers.getSetCookie();
    } else if (typeof headers.get === 'function') {
      const value = headers.get('set-cookie');
      if (value) values = [value];
    }

    for (const setCookie of values || []) {
      const first = String(setCookie).split(';', 1)[0];
      const index = first.indexOf('=');
      if (index <= 0) continue;
      const name = first.slice(0, index).trim();
      const value = first.slice(index + 1).trim();
      if (name) this.cookies.set(name, value);
    }
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

module.exports = {
  WebFormsClient,
  decodeHtml,
  extractHiddenFields,
  extractAuthorisationId,
  extractErrorMessage,
  isLoginPage,
  hasAuthorisationForm,
};
