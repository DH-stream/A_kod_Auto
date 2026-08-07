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
