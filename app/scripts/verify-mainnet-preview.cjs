// Run with Node 22+ and Playwright installed: node scripts/verify-mainnet-preview.cjs <mainnet-preview-url>
// Checks the published build in a browser without a wallet or a transaction.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function checkPreview(origin) {
  const response = await fetch(new URL('/plugins/proposals/', origin));
  assert(response.ok, 'The proposals route did not load');
  assert((await response.text()).includes('id="__NEXT_DATA__"'), 'The URL returned a hosting page instead of Governance');

  const rpc = await fetch(new URL('/api/rpc/', origin), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
  });
  assert.equal((await rpc.json()).result, '0x1', 'This check expects the Ethereum mainnet relay');
  const browser = await chromium.launch(process.env.CHROME_CHANNEL ? { channel: process.env.CHROME_CHANNEL } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 835 }, reducedMotion: 'reduce' });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    const power = page.getByRole('link', { name: 'Voting power', exact: true }).first();
    assert.match(await power.getAttribute('href'), /^\/plugins\/lock\//, 'The menu points to the legacy page');
    await power.click();
    const title = page.locator('#power-page-title');
    await title.waitFor();
    assert.equal(await title.evaluate(el => getComputedStyle(el).textAlign), 'center');
    await page.locator('.power-connect button').waitFor();
    console.log('PASS  Menu → designed Voting power page and in-page wallet action');

    await page.getByRole('link', { name: 'Proposals', exact: true }).first().click();
    const firstTitle = page.locator('article.proposal-item a.proposal-title-link').first();
    await firstTitle.waitFor({ timeout: 60000 });
    await page.waitForFunction(() => document.querySelector('article.proposal-item a.proposal-title-link')?.textContent.trim(), undefined, { timeout: 60000 });
    const expectedTitle = (await firstTitle.innerText()).trim();
    await firstTitle.click();
    await page.waitForFunction(title => Array.from(document.querySelectorAll('.proposal-reading-header h1')).some(
      el => el.getClientRects().length && el.textContent.trim() === title
    ), expectedTitle, { timeout: 60000 });
    console.log('PASS  Proposals → open the same proposal shown in the index');

    await page.goto(new URL('/plugins/proposals/#/new', origin).href, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'New proposal', exact: true }).waitFor();
    for (const method of ['Transparent fallback', 'Secret ballot']) {
      await page.locator('label.composer-method').filter({ hasText: method }).click();
      assert(await page.getByLabel(method, { exact: true }).isChecked());
    }
    await page.locator('.composer-fee').getByText(/\d[\d.,]* USDS/).first().waitFor({ timeout: 45000 });
    console.log('PASS  Public/private method selection and live mainnet fee quote in USDS');
  } finally {
    await browser.close();
  }
}
checkPreview(new URL(process.argv[2]).origin).catch(error => { console.error(error.message); process.exitCode = 1; });
