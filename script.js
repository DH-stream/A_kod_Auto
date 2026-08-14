const fs = require('fs');
const { WebFormsClient } = require('./lib/webforms-client');

const OBJECT_REFERENCE_ERROR = 'Object reference not set to an instance of an object';
const SKIPPED_MESSAGE = `${OBJECT_REFERENCE_ERROR} - skipped after 3 days`;

function cleanTank(input) {
  return String(input || '').replace(/[^a-zA-Z0-9]/g, '');
}

function cleanRef(input) {
  return String(input || '').replace(/[^0-9/]/g, '');
}

function failureTrackerKey(tank, ref) {
  return `${cleanTank(tank).toUpperCase()}__${cleanRef(ref)}`;
}

function loadFailureTracker(filePath = process.env.FAILURE_TRACKER_FILE || './failure_tracker.json') {
  if (!fs.existsSync(filePath)) return {};
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed;
}

function saveFailureTracker(tracker, filePath = process.env.FAILURE_TRACKER_FILE || './failure_tracker.json') {
  fs.writeFileSync(filePath, JSON.stringify(tracker, null, 2), 'utf8');
}

function runDate() {
  return process.env.RUN_DATE || new Date().toISOString().slice(0, 10);
}

function loadQueue() {
  const queueFromEnv = process.env.QUEUE_JSON;
  if (queueFromEnv) return JSON.parse(queueFromEnv);

  const filePath = process.env.QUEUE_FILE || './queue.json';
  if (!fs.existsSync(filePath)) throw new Error(`Köfil saknas: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function makeResult(item, overrides = {}) {
  return {
    id: item?.id ?? null,
    tank: item?.tank ?? null,
    ref: item?.ref ?? null,
    success: false,
    status: 'Okänt fel',
    aKod: null,
    message: '',
    ...overrides,
  };
}

async function runQueue({ rawQueue, client, failureTracker = {}, today = runDate() }) {
  if (!Array.isArray(rawQueue) || rawQueue.length === 0) {
    throw new Error('Kön är tom eller ogiltig');
  }

  await client.login();
  const results = [];

  for (const item of rawQueue) {
    const tank = cleanTank(item?.tank);
    const ref = cleanRef(item?.ref);

    console.log('\n--- NY RAD ---');
    console.log({ id: item?.id ?? null, TANK: tank, REF: ref });

    if (!tank || !ref) {
      const result = makeResult(item, {
        success: false,
        status: 'Ogiltig input',
        aKod: null,
        message: 'Tank eller Ref blev tom efter rensning',
      });
      console.log(result);
      results.push(result);
      continue;
    }

    const trackerKey = failureTrackerKey(tank, ref);
    const tracked = failureTracker[trackerKey];

    if (tracked?.skipped === true) {
      const result = makeResult(item, {
        success: false,
        status: 'Skipped',
        aKod: null,
        message: SKIPPED_MESSAGE,
      });
      console.log(result);
      results.push(result);
      continue;
    }

    try {
      const outcome = await client.authorise(tank, ref);

      if (outcome?.message === OBJECT_REFERENCE_ERROR) {
        const existingDates = Array.isArray(tracked?.dates) ? tracked.dates : [];
        const dates = [...new Set(existingDates.filter(Boolean))];
        if (!dates.includes(today)) dates.push(today);

        const skipped = dates.length >= 3;
        failureTracker[trackerKey] = {
          error: OBJECT_REFERENCE_ERROR,
          dates,
          skipped,
        };

        const result = makeResult(
          item,
          skipped
            ? {
                success: false,
                status: 'Skipped',
                aKod: null,
                message: SKIPPED_MESSAGE,
              }
            : outcome
        );
        console.log(result);
        results.push(result);
        continue;
      }

      delete failureTracker[trackerKey];
      const result = makeResult(item, outcome);
      console.log(result);
      results.push(result);
    } catch (error) {
      delete failureTracker[trackerKey];
      const result = makeResult(item, {
        success: false,
        status: 'Scriptfel',
        aKod: null,
        message: String(error?.message || error),
      });
      console.log(result);
      results.push(result);
    }
  }

  return results;
}

async function main() {
  const username = process.env.USERNAME;
  const password = process.env.PASSWORD;
  const loginUrl = process.env.AKOD_LOGIN_URL;

  if (!username || !password) throw new Error('USERNAME eller PASSWORD saknas');
  if (!loginUrl) throw new Error('AKOD_LOGIN_URL saknas');

  const rawQueue = loadQueue();
  const failureTracker = loadFailureTracker();
  const client = new WebFormsClient({
    loginUrl,
    username,
    password,
  });

  const results = await runQueue({ rawQueue, client, failureTracker });
  saveFailureTracker(failureTracker);
  const outputPath = process.env.RESULT_FILE || './results.json';
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');

  console.log('\n=== KLART ===');
  console.log(`Skrev resultat till ${outputPath}`);
  console.log({
    total: results.length,
    success: results.filter((row) => row.success).length,
    failed: results.filter((row) => !row.success).length,
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error('ERROR:', error?.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  cleanTank,
  cleanRef,
  failureTrackerKey,
  loadFailureTracker,
  saveFailureTracker,
  runDate,
  loadQueue,
  makeResult,
  runQueue,
  main,
};
