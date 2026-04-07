const { chromium } = require('playwright');
const fs = require('fs');

const LOGIN_URL = process.env.AKOD_LOGIN_URL;
if (!LOGIN_URL) {
  throw new Error('AKOD_LOGIN_URL saknas');
}

const NAV_TIMEOUT = 90000;
const ACTION_TIMEOUT = 15000;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 5000;

// ===== CLEAN =====
function cleanTank(input) {
  return String(input || '').replace(/[^a-zA-Z0-9]/g, '');
}

function cleanRef(input) {
  return String(input || '').replace(/[^0-9/]/g, '');
}

function loadQueue() {
  const queueFromEnv = process.env.QUEUE_JSON;
  if (queueFromEnv) {
    return JSON.parse(queueFromEnv);
  }

  const filePath = process.env.QUEUE_FILE || './queue.json';
  if (!fs.existsSync(filePath)) {
    throw new Error(`Köfil saknas: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function gotoWithRetry(page, url, label = 'goto') {
  let lastError;

  for (let i = 1; i <= RETRY_ATTEMPTS; i++) {
    try {
      console.log(`${label} försök ${i}/${RETRY_ATTEMPTS}`);
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: NAV_TIMEOUT,
      });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      return;
    } catch (err) {
      lastError = err;
      console.warn(`${label} misslyckades (${i}/${RETRY_ATTEMPTS}): ${err.message}`);

      if (i < RETRY_ATTEMPTS) {
        await wait(RETRY_DELAY);
      }
    }
  }

  throw lastError;
}

async function clickWithRetry(locator, label = 'click') {
  let lastError;

  for (let i = 1; i <= RETRY_ATTEMPTS; i++) {
    try {
      console.log(`${label} försök ${i}/${RETRY_ATTEMPTS}`);
      await locator.click({ timeout: ACTION_TIMEOUT });
      return;
    } catch (err) {
      lastError = err;
      console.warn(`${label} misslyckades (${i}/${RETRY_ATTEMPTS}): ${err.message}`);

      if (i < RETRY_ATTEMPTS) {
        await wait(RETRY_DELAY);
      }
    }
  }

  throw lastError;
}

async function fillForm(page, tank, ref) {
  await page.fill('#MainContent_txtUnitID', '');
  await page.fill('#MainContent_txtReleaseNo', '');
  await page.fill('#MainContent_txtUnitID', tank);
  await page.fill('#MainContent_txtReleaseNo', ref);
}

function makeResult(item, overrides = {}) {
  return {
    id: item?.input?.id ?? item?.id ?? null,
    tank: item?.input?.tank ?? item?.tank ?? null,
    ref: item?.input?.ref ?? item?.ref ?? null,
    success: false,
    status: 'Okänt fel',
    aKod: null,
    message: '',
    ...overrides,
  };
}

async function waitForForm(page) {
  const unitInput = page.locator('#MainContent_txtUnitID');
  const refInput = page.locator('#MainContent_txtReleaseNo');

  await unitInput.waitFor({ state: 'visible', timeout: ACTION_TIMEOUT });
  await refInput.waitFor({ state: 'visible', timeout: ACTION_TIMEOUT });

  return { unitInput, refInput };
}

async function closeBlockingPopup(page) {
  const overlay = page.locator('#MainContent_ErrorModalPopupExtender_backgroundElement');
  const okButton = page.getByRole('button', { name: 'OK' });
  const errorPanel = page.locator('#MainContent_PanelErrorMessage1');

  const overlayVisible = await overlay.isVisible().catch(() => false);
  if (!overlayVisible) return;

  if (await okButton.isVisible().catch(() => false)) {
    await clickWithRetry(okButton, 'Popup OK').catch(() => {});
  }

  await overlay.waitFor({ state: 'hidden', timeout: 7000 }).catch(() => {});
  await errorPanel.waitFor({ state: 'hidden', timeout: 7000 }).catch(() => {});
  await page.waitForTimeout(300);
}

async function readPopupMessage(page) {
  const overlay = page.locator('#MainContent_ErrorModalPopupExtender_backgroundElement');
  const overlayVisible = await overlay.isVisible().catch(() => false);
  if (!overlayVisible) return null;

  const warningTable = page.getByRole('table').filter({ hasText: 'Warning!' });
  if (await warningTable.isVisible().catch(() => false)) {
    const text = (await warningTable.innerText().catch(() => '')).trim();
    if (text) return text;
  }

  const errorPanel = page.locator('#MainContent_PanelErrorMessage1');
  const panelText = (await errorPanel.innerText().catch(() => '')).trim();
  if (panelText) return panelText;

  return 'Warning-popup visades';
}

async function ensureAuthorisationForm(page, username, password) {
  const unitInput = page.locator('#MainContent_txtUnitID');
  const refInput = page.locator('#MainContent_txtReleaseNo');

  await closeBlockingPopup(page);

  if (
    await unitInput.isVisible().catch(() => false) &&
    await refInput.isVisible().catch(() => false)
  ) {
    return;
  }

  await gotoWithRetry(page, LOGIN_URL, 'Öppnar login-sida');

  const usernameInput = page.locator('#MainContent_txtUserName');
  const passwordInput = page.locator('#MainContent_txtPassword');

  if (await usernameInput.isVisible().catch(() => false)) {
    await usernameInput.fill(username);
    await passwordInput.fill(password);

    await clickWithRetry(
      page.getByRole('button', { name: 'Login' }),
      'Login click'
    );

    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  }

  await closeBlockingPopup(page);

  const addNewButton = page.getByRole('button', { name: 'AddNew' });
  if (await addNewButton.isVisible().catch(() => false)) {
    await clickWithRetry(addNewButton, 'AddNew click').catch(() => {});
  }

  await waitForForm(page);
  await closeBlockingPopup(page);
}

async function clickAuthorise(page) {
  const button = page.locator('#MainContent_btnAuthorise');

  await closeBlockingPopup(page);
  await button.waitFor({ state: 'visible', timeout: ACTION_TIMEOUT });
  await clickWithRetry(button, 'Authorise Service click');
  await page.waitForTimeout(1500);
}

(async () => {
  const USERNAME = process.env.USERNAME;
  const PASSWORD = process.env.PASSWORD;
  const HEADLESS = process.env.HEADLESS !== 'false';

  if (!USERNAME || !PASSWORD) {
    throw new Error('USERNAME eller PASSWORD saknas');
  }

  const rawQueue = loadQueue();
  if (!Array.isArray(rawQueue) || rawQueue.length === 0) {
    throw new Error('Kön är tom eller ogiltig');
  }

  const queue = rawQueue.map((item, index) => {
    const tank = cleanTank(item.tank);
    const ref = cleanRef(item.ref);

    if (!tank || !ref) {
      return {
        index,
        input: item,
        id: item?.id ?? null,
        valid: false,
        result: {
          success: false,
          status: 'Ogiltig input',
          aKod: null,
          message: 'Tank eller Ref blev tom efter rensning',
        },
      };
    }

    return {
      index,
      input: item,
      id: item?.id ?? null,
      valid: true,
      tank,
      ref,
    };
  });

  const results = [];

  for (const item of queue) {
    if (!item.valid) {
      results.push(
        makeResult(item, {
          success: item.result.success,
          status: item.result.status,
          aKod: item.result.aKod,
          message: item.result.message,
        })
      );
    }
  }

  const validQueue = queue.filter((x) => x.valid);

  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage();

  page.setDefaultTimeout(ACTION_TIMEOUT);
  page.setDefaultNavigationTimeout(NAV_TIMEOUT);

  try {
    await ensureAuthorisationForm(page, USERNAME, PASSWORD);

    for (const item of validQueue) {
      const TANK = item.tank;
      const REF = item.ref;

      console.log('\n--- NY RAD ---');
      console.log({ id: item.id, TANK, REF });

      try {
        await ensureAuthorisationForm(page, USERNAME, PASSWORD);

        const { unitInput, refInput } = await waitForForm(page);

        await fillForm(page, TANK, REF);
        await clickAuthorise(page);

        const popupMessage = await readPopupMessage(page);
        if (popupMessage) {
          const result = makeResult(item, {
            success: false,
            status: 'Popup/fel',
            aKod: null,
            message: popupMessage,
          });

          console.log(result);
          results.push(result);

          await closeBlockingPopup(page);
          await ensureAuthorisationForm(page, USERNAME, PASSWORD);
          continue;
        }

        const bodyText = await page.locator('body').innerText().catch(() => '');
        const authMatch = bodyText.match(/Authorisation\s*:\s*(\d+)/i);

        if (authMatch) {
          const aKod = authMatch[1];

          const result = makeResult(item, {
            success: true,
            status: 'Klar',
            aKod,
            message: 'A-kod hittad',
          });

          console.log(result);
          results.push(result);

          const continueButton = page.locator('#MainContent_btnAddNewAuthorisation');
          if (await continueButton.isVisible().catch(() => false)) {
            await clickWithRetry(continueButton, 'Continue click').catch(() => {});
            await unitInput.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
            await refInput.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
          } else {
            console.warn('Continue-knappen hittades inte efter success. Återställer formuläret manuellt.');
            await ensureAuthorisationForm(page, USERNAME, PASSWORD);
          }

          await closeBlockingPopup(page);
          continue;
        }

        if (/Object reference not set to an instance of an object/i.test(bodyText)) {
          const result = makeResult(item, {
            success: false,
            status: 'Tekniskt fel',
            aKod: null,
            message: 'Object reference not set to an instance of an object',
          });

          console.log(result);
          results.push(result);

          await closeBlockingPopup(page);
          await ensureAuthorisationForm(page, USERNAME, PASSWORD);
          continue;
        }

        const result = makeResult(item, {
          success: false,
          status: 'Okänt eller vänteläge',
          aKod: null,
          message: 'Ingen A-kod, popup eller känt tekniskt fel upptäcktes',
        });

        console.log(result);
        results.push(result);

        await closeBlockingPopup(page);
        await ensureAuthorisationForm(page, USERNAME, PASSWORD);
      } catch (rowErr) {
        const result = makeResult(item, {
          success: false,
          status: 'Scriptfel',
          aKod: null,
          message: String(rowErr?.message || rowErr),
        });

        console.log(result);
        results.push(result);

        await closeBlockingPopup(page);
        await ensureAuthorisationForm(page, USERNAME, PASSWORD);
        continue;
      }
    }

    const outputPath = process.env.RESULT_FILE || './results.json';
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');

    console.log('\n=== KLART ===');
    console.log(`Skrev resultat till ${outputPath}`);

    const summary = {
      total: results.length,
      success: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    };

    console.log(summary);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
