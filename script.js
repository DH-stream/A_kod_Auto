const { chromium } = require('playwright');
const fs = require('fs');

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
    ...overrides
  };
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
          message: 'Tank eller Ref blev tom efter rensning'
        }
      };
    }

    return {
      index,
      input: item,
      id: item?.id ?? null,
      valid: true,
      tank,
      ref
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
          message: item.result.message
        })
      );
    }
  }

  const validQueue = queue.filter(x => x.valid);

  const browser = await chromium.launch({
    headless: HEADLESS
  });

  const page = await browser.newPage();

  try {
    await page.goto('https://eservices.alvsborgroro.com/Login.aspx');
    await page.fill('#MainContent_txtUserName', USERNAME);
    await page.fill('#MainContent_txtPassword', PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();

    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'AddNew' }).click();

    for (const item of validQueue) {
      const TANK = item.tank;
      const REF = item.ref;

      console.log('\n--- NY RAD ---');
      console.log({
        id: item.id,
        TANK,
        REF
      });

      await page.locator('#MainContent_txtUnitID').waitFor({ state: 'visible' });
      await page.locator('#MainContent_txtReleaseNo').waitFor({ state: 'visible' });

      await fillForm(page, TANK, REF);

      await page.getByRole('button', { name: 'Authorise Service' }).click();
      await page.waitForTimeout(1500);

      const bodyText = await page.locator('body').innerText();

      const authMatch = bodyText.match(/Authorisation\s*:\s*(\d+)/i);
      if (authMatch) {
        const aKod = authMatch[1];

        const result = makeResult(item, {
          success: true,
          status: 'Klar',
          aKod,
          message: 'A-kod hittad'
        });

        console.log(result);
        results.push(result);

        const continueButton = page.locator('#MainContent_btnAddNewAuthorisation');
        if (await continueButton.isVisible().catch(() => false)) {
          await continueButton.click();
          await page.locator('#MainContent_txtUnitID').waitFor({ state: 'visible' });
        } else {
          throw new Error('A-kod hittades men Continue-knappen hittades inte');
        }

        continue;
      }

      const okButton = page.getByRole('button', { name: 'OK' });

      if (await okButton.isVisible().catch(() => false)) {
        let warningText = '';

        const warningTable = page.getByRole('table').filter({
          hasText: 'Warning!'
        });

        if (await warningTable.isVisible().catch(() => false)) {
          warningText = (await warningTable.innerText().catch(() => '')).trim();
        }

        await okButton.click();

        const result = makeResult(item, {
          success: false,
          status: 'Popup/fel',
          aKod: null,
          message: warningText || 'Warning-popup visades'
        });

        console.log(result);
        results.push(result);
        continue;
      }

      if (/Object reference not set to an instance of an object/i.test(bodyText)) {
        const result = makeResult(item, {
          success: false,
          status: 'Tekniskt fel',
          aKod: null,
          message: 'Object reference not set to an instance of an object'
        });

        console.log(result);
        results.push(result);
        continue;
      }

      const result = makeResult(item, {
        success: false,
        status: 'Okänt eller vänteläge',
        aKod: null,
        message: 'Ingen A-kod, popup eller känt tekniskt fel upptäcktes'
      });

      console.log(result);
      results.push(result);
    }

    const outputPath = process.env.RESULT_FILE || './results.json';
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');

    console.log('\n=== KLART ===');
    console.log(`Skrev resultat till ${outputPath}`);

    const summary = {
      total: results.length,
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    };

    console.log(summary);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
