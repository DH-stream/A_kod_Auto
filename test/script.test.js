const test = require('node:test');
const assert = require('node:assert/strict');

const { cleanTank, cleanRef, runQueue } = require('../script');

test('normalizes tank and release reference exactly as the current contract expects', () => {
  assert.equal(cleanTank('DHIU 184551-9'), 'DHIU1845519');
  assert.equal(cleanRef('75538510/4'), '75538510/4');
});

test('invalid input becomes a row result without calling authorise', async () => {
  let authoriseCalls = 0;
  const client = {
    async login() {},
    async authorise() {
      authoriseCalls++;
      throw new Error('should not be called');
    },
  };

  const results = await runQueue({
    rawQueue: [{ id: 1, tank: '---', ref: '75538510/4' }],
    client,
  });

  assert.equal(authoriseCalls, 0);
  assert.deepEqual(results, [
    {
      id: 1,
      tank: '---',
      ref: '75538510/4',
      success: false,
      status: 'Ogiltig input',
      aKod: null,
      message: 'Tank eller Ref blev tom efter rensning',
    },
  ]);
});

test('one row error does not stop pending and successful rows that follow', async () => {
  const responses = [
    new Error('temporary row failure'),
    {
      success: false,
      status: 'Okänt eller vänteläge',
      aKod: null,
      message: 'Ingen A-kod eller känt fel upptäcktes',
    },
    {
      success: true,
      status: 'Klar',
      aKod: '158726',
      message: 'A-kod hittad',
    },
  ];
  let loginCalls = 0;
  const calls = [];
  const client = {
    async login() {
      loginCalls++;
    },
    async authorise(tank, ref) {
      calls.push([tank, ref]);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };

  const rawQueue = [
    { id: 59, tank: 'DHBU3247450', ref: '78724817' },
    { id: 62, tank: 'DHIU 184551-9', ref: '75538510/4' },
    { id: 65, tank: 'DHDU 208902-2', ref: '75536769/8' },
  ];

  const results = await runQueue({ rawQueue, client });

  assert.equal(loginCalls, 1);
  assert.deepEqual(calls, [
    ['DHBU3247450', '78724817'],
    ['DHIU1845519', '75538510/4'],
    ['DHDU2089022', '75536769/8'],
  ]);
  assert.equal(results.length, 3);
  assert.equal(results[0].status, 'Scriptfel');
  assert.match(results[0].message, /temporary row failure/);
  assert.equal(results[1].status, 'Okänt eller vänteläge');
  assert.equal(results[2].aKod, '158726');
});

test('global login failure aborts before processing rows', async () => {
  let authoriseCalls = 0;
  const client = {
    async login() {
      throw new Error('bad credentials');
    },
    async authorise() {
      authoriseCalls++;
    },
  };

  await assert.rejects(
    () => runQueue({ rawQueue: [{ id: 1, tank: 'DHIU123', ref: '1' }], client }),
    /bad credentials/
  );
  assert.equal(authoriseCalls, 0);
});

const OBJECT_REFERENCE_ERROR = 'Object reference not set to an instance of an object';

function objectReferenceOutcome() {
  return {
    success: false,
    status: 'Tekniskt fel',
    aKod: null,
    message: OBJECT_REFERENCE_ERROR,
  };
}

test('counts the object-reference failure at most once per calendar day', async () => {
  const failureTracker = {};
  const client = {
    async login() {},
    async authorise() {
      return objectReferenceOutcome();
    },
  };
  const rawQueue = [{ id: 66, tank: 'DHDU235511/7', ref: '75487440/9' }];

  await runQueue({ rawQueue, client, failureTracker, today: '2026-08-14' });
  await runQueue({ rawQueue, client, failureTracker, today: '2026-08-14' });

  assert.deepEqual(failureTracker['DHDU2355117__75487440/9']?.dates, ['2026-08-14']);
});

test('marks a combination Skipped on its third distinct object-reference failure day', async () => {
  const failureTracker = {
    'DHDU2355117__75487440/9': {
      error: OBJECT_REFERENCE_ERROR,
      dates: ['2026-08-12', '2026-08-13'],
      skipped: false,
    },
  };
  const client = {
    async login() {},
    async authorise() {
      return objectReferenceOutcome();
    },
  };

  const results = await runQueue({
    rawQueue: [{ id: 66, tank: 'DHDU235511/7', ref: '75487440/9' }],
    client,
    failureTracker,
    today: '2026-08-14',
  });

  assert.equal(results[0].status, 'Skipped');
  assert.equal(results[0].message, `${OBJECT_REFERENCE_ERROR} - skipped after 3 days`);
  assert.equal(failureTracker['DHDU2355117__75487440/9'].skipped, true);
  assert.deepEqual(failureTracker['DHDU2355117__75487440/9'].dates, [
    '2026-08-12',
    '2026-08-13',
    '2026-08-14',
  ]);
});

test('already skipped combinations bypass RoRo authorise', async () => {
  let authoriseCalls = 0;
  const failureTracker = {
    'DHDU2355117__75487440/9': {
      error: OBJECT_REFERENCE_ERROR,
      dates: ['2026-08-12', '2026-08-13', '2026-08-14'],
      skipped: true,
    },
  };
  const client = {
    async login() {},
    async authorise() {
      authoriseCalls++;
      return objectReferenceOutcome();
    },
  };

  const results = await runQueue({
    rawQueue: [{ id: 66, tank: 'DHDU235511/7', ref: '75487440/9' }],
    client,
    failureTracker,
    today: '2026-08-15',
  });

  assert.equal(authoriseCalls, 0);
  assert.equal(results[0].status, 'Skipped');
});

test('a new ref for the same tank starts a separate failure history', async () => {
  const failureTracker = {
    'DHDU2355117__75487440/9': {
      error: OBJECT_REFERENCE_ERROR,
      dates: ['2026-08-12', '2026-08-13'],
      skipped: false,
    },
  };
  const client = {
    async login() {},
    async authorise() {
      return objectReferenceOutcome();
    },
  };

  const results = await runQueue({
    rawQueue: [{ id: 99, tank: 'DHDU235511/7', ref: '75445501/1' }],
    client,
    failureTracker,
    today: '2026-08-14',
  });

  assert.equal(results[0].status, 'Tekniskt fel');
  assert.deepEqual(failureTracker['DHDU2355117__75445501/1'].dates, ['2026-08-14']);
  assert.deepEqual(failureTracker['DHDU2355117__75487440/9'].dates, ['2026-08-12', '2026-08-13']);
});

test('a non-matching outcome clears failure history for that tank and ref', async () => {
  const failureTracker = {
    'DHDU2355117__75487440/9': {
      error: OBJECT_REFERENCE_ERROR,
      dates: ['2026-08-12', '2026-08-13'],
      skipped: false,
    },
  };
  const client = {
    async login() {},
    async authorise() {
      return {
        success: false,
        status: 'Väntar',
        aKod: null,
        message: 'Unit is not yet ready for pick-up',
      };
    },
  };

  const results = await runQueue({
    rawQueue: [{ id: 66, tank: 'DHDU235511/7', ref: '75487440/9' }],
    client,
    failureTracker,
    today: '2026-08-14',
  });

  assert.equal(results[0].status, 'Väntar');
  assert.equal(failureTracker['DHDU2355117__75487440/9'], undefined);
});
