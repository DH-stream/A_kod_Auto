const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractHiddenFields,
  extractAuthorisationId,
  extractErrorMessage,
  isLoginPage,
  hasAuthorisationForm,
  WebFormsClient,
} = require('../lib/webforms-client');

test('extractHiddenFields decodes values and ignores attribute order', () => {
  const html = `
    <input value="abc&amp;123" type="hidden" name="__VIEWSTATE" />
    <input name='__VIEWSTATEGENERATOR' value='44B8B5D3'>
    <input value="" name="__VIEWSTATEENCRYPTED">
    <input name="__EVENTVALIDATION" value="xyz&#43;789" />
  `;

  assert.deepEqual(extractHiddenFields(html), {
    __VIEWSTATE: 'abc&123',
    __VIEWSTATEGENERATOR: '44B8B5D3',
    __VIEWSTATEENCRYPTED: '',
    __EVENTVALIDATION: 'xyz+789',
  });
});

test('extractAuthorisationId reads the dedicated A-code element', () => {
  assert.equal(
    extractAuthorisationId('<span id="MainContent_lblAuthorisationID"> 158726 </span>'),
    '158726'
  );
});

test('extractErrorMessage ignores static warning chrome and keeps the actual message', () => {
  const html = '<div id="MainContent_PanelErrorMessage1"><strong>Warning!</strong><span>Unit is not ready yet</span><button>OK</button></div>';
  assert.equal(extractErrorMessage(html), 'Unit is not ready yet');
  assert.equal(extractErrorMessage('<div id="MainContent_PanelErrorMessage1">Warning! OK</div>'), null);
});

test('page detectors distinguish login and service forms', () => {
  assert.equal(isLoginPage('<input id="MainContent_txtUserName">'), true);
  assert.equal(isLoginPage('<input id="MainContent_txtUnitID">'), false);
  assert.equal(
    hasAuthorisationForm('<input id="MainContent_txtUnitID"><input id="MainContent_txtReleaseNo">'),
    true
  );
});

test('WebFormsClient logs in, reuses session cookie, and posts Authorise Service', async () => {
  const calls = [];
  const responses = [
    fakeResponse(loginHtml('login-vs', 'login-ev'), {
      'set-cookie': ['ASP.NET_SessionId=abc123; path=/; HttpOnly'],
    }),
    fakeResponse('<html>logged in</html>'),
    fakeResponse(serviceHtml('service-vs-1', 'service-ev-1')),
    fakeResponse(serviceHtml('service-vs-2', 'service-ev-2')),
    fakeResponse('<span id="MainContent_lblAuthorisationID">158726</span>'),
  ];

  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const response = responses.shift();
    if (!response) throw new Error('Unexpected fetch');
    return response;
  };

  const client = new WebFormsClient({
    loginUrl: 'https://eservices.alvsborgroro.com/Login.aspx',
    username: 'user1',
    password: 'secret1',
    fetchImpl,
    retries: 0,
  });

  await client.login();
  const result = await client.authorise('DHIU2045721', '75564067/0');

  assert.deepEqual(result, {
    success: true,
    status: 'Klar',
    aKod: '158726',
    message: 'A-kod hittad',
  });

  const loginPost = calls[1];
  assert.equal(loginPost.options.method, 'POST');
  assert.match(loginPost.options.body.toString(), /ctl00%24MainContent%24txtUserName=user1/);
  assert.match(loginPost.options.body.toString(), /ctl00%24MainContent%24txtPassword=secret1/);
  assert.match(loginPost.options.body.toString(), /ctl00%24MainContent%24btnLogin=Login/);
  assert.equal(loginPost.options.headers.Cookie, 'ASP.NET_SessionId=abc123');

  const authorisePost = calls[4];
  const posted = authorisePost.options.body.toString();
  assert.match(posted, /__VIEWSTATE=service-vs-2/);
  assert.match(posted, /__EVENTVALIDATION=service-ev-2/);
  assert.match(posted, /ctl00%24MainContent%24txtUnitID=DHIU2045721/);
  assert.match(posted, /ctl00%24MainContent%24txtReleaseNo=75564067%2F0/);
  assert.match(posted, /ctl00%24MainContent%24btnAuthorise=Authorise\+Service/);
  assert.equal(authorisePost.options.headers.Cookie, 'ASP.NET_SessionId=abc123');
});

function loginHtml(viewState, eventValidation) {
  return `
    <input name="__VIEWSTATE" value="${viewState}">
    <input name="__VIEWSTATEGENERATOR" value="44B8B5D3">
    <input name="__VIEWSTATEENCRYPTED" value="">
    <input name="__EVENTVALIDATION" value="${eventValidation}">
    <input id="MainContent_txtUserName">
  `;
}

function serviceHtml(viewState, eventValidation) {
  return `
    <input name="__VIEWSTATE" value="${viewState}">
    <input name="__VIEWSTATEGENERATOR" value="44B8B5D3">
    <input name="__VIEWSTATEENCRYPTED" value="">
    <input name="__EVENTVALIDATION" value="${eventValidation}">
    <input id="MainContent_txtUnitID">
    <input id="MainContent_txtReleaseNo">
  `;
}

function fakeResponse(body, headers = {}) {
  const normalized = new Map();
  for (const [key, value] of Object.entries(headers)) normalized.set(key.toLowerCase(), value);

  return {
    ok: true,
    status: 200,
    url: 'https://eservices.alvsborgroro.com/ServiceBooking.aspx',
    headers: {
      get(name) {
        const value = normalized.get(String(name).toLowerCase());
        return Array.isArray(value) ? value.join(', ') : value ?? null;
      },
      getSetCookie() {
        const value = normalized.get('set-cookie');
        return Array.isArray(value) ? value : value ? [value] : [];
      },
    },
    async text() {
      return body;
    },
  };
}
