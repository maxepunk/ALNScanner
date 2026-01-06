/**
 * Diagnostic test to identify the timeout issue
 */

const { test, expect } = require('@playwright/test');
const { GMScannerPage } = require('../page-objects/GMScannerPage');

test.describe('Diagnostic - Step by step', () => {
  test('step 1: can we load the page?', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#gameModeScreen', { timeout: 10000 });
    console.log('✓ Page loaded');
  });

  test('step 2: can we click standalone mode?', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#gameModeScreen', { timeout: 10000 });

    const standaloneBtn = page.locator('button[data-action="app.selectGameMode"][data-arg="standalone"]');
    await standaloneBtn.click();

    await page.waitForSelector('#teamEntryScreen.active', { timeout: 5000 });
    console.log('✓ Standalone mode selected');
  });

  test('step 3: can we enter team and confirm?', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#gameModeScreen', { timeout: 10000 });

    const standaloneBtn = page.locator('button[data-action="app.selectGameMode"][data-arg="standalone"]');
    await standaloneBtn.click();
    await page.waitForSelector('#teamEntryScreen.active', { timeout: 5000 });

    // Enter team (unified text input)
    await page.locator('#teamNameInput').fill('123');

    const teamDisplay = await page.locator('#teamNameInput').inputValue();
    console.log(`Team display: "${teamDisplay}"`);

    // Confirm
    await page.click('button[data-action="app.confirmTeamId"]');
    await page.waitForSelector('#scanScreen.active', { timeout: 5000 });
    console.log('✓ Team confirmed, scan screen visible');
  });

  test('step 4: can we handle the dialog?', async ({ page }) => {
    // Capture console errors
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`[BROWSER ERROR] ${msg.text()}`);
        errors.push(msg.text());
      }
    });
    page.on('pageerror', err => {
      console.log(`[PAGE ERROR] ${err.message}`);
      errors.push(err.message);
    });

    await page.goto('/');
    await page.waitForSelector('#gameModeScreen', { timeout: 10000 });

    const standaloneBtn = page.locator('button[data-action="app.selectGameMode"][data-arg="standalone"]');
    await standaloneBtn.click();
    await page.waitForSelector('#teamEntryScreen.active', { timeout: 5000 });

    // Enter team (unified text input)
    await page.locator('#teamNameInput').fill('123');
    await page.click('button[data-action="app.confirmTeamId"]');
    await page.waitForSelector('#scanScreen.active', { timeout: 5000 });

    console.log('About to set up dialog handler...');

    // Setup dialog handler
    page.once('dialog', async dialog => {
      console.log(`Dialog appeared: ${dialog.type()}`);
      console.log(`Dialog message: ${dialog.message()}`);
      await dialog.accept('alr001'); // Use real token ID!
      console.log('Dialog accepted with alr001');
    });

    console.log('About to click manual entry button...');

    // Inject logging into processNFCRead
    await page.evaluate(() => {
      const originalLog = console.log;
      window.debugLogs = [];
      console.log = (...args) => {
        window.debugLogs.push(args.join(' '));
        originalLog.apply(console, args);
      };
    });

    // Click manual entry
    await page.click('button[data-action="app.manualEntry"]');

    console.log('Clicked manual entry, waiting for result screen...');

    // Give it a moment for processing
    await page.waitForTimeout(1000);

    // Get browser debug logs
    const browserLogs = await page.evaluate(() => window.debugLogs || []);
    console.log('Browser logs:', browserLogs.filter(log => log.includes('Processing') || log.includes('token') || log.includes('Team')));

    // Check what screens are visible
    const screens = await page.evaluate(() => {
      const activeScreens = Array.from(document.querySelectorAll('.screen.active'));
      return activeScreens.map(s => s.id);
    });
    console.log(`Active screens: ${JSON.stringify(screens)}`);

    // Check if result screen elements exist
    const elementCheck = await page.evaluate(() => {
      return {
        resultStatus: !!document.getElementById('resultStatus'),
        resultRfid: !!document.getElementById('resultRfid'),
        resultType: !!document.getElementById('resultType'),
        resultGroup: !!document.getElementById('resultGroup'),
        resultValue: !!document.getElementById('resultValue'),
        resultScreen: !!document.getElementById('resultScreen')
      };
    });
    console.log('Result screen elements:', elementCheck);

    // Check if there were errors
    console.log(`Errors captured: ${errors.length}`);
    if (errors.length > 0) {
      console.log('Errors:', errors);
    }

    // Wait for result screen
    await page.waitForSelector('#resultScreen.active', { timeout: 10000 });
    console.log('✓ Result screen appeared!');

    const resultStatus = await page.locator('#resultStatus').textContent();
    console.log(`Result status: "${resultStatus}"`);
  });
});
