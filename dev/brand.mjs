// Rendert dev/brand/icon.svg als PNG nach custom_components/strom_tarife/brand/
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';

const svg = await readFile(new URL('./brand/icon.svg', import.meta.url), 'utf8');
const out = new URL('../custom_components/strom_tarife/brand/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
for (const [name, size] of [['icon.png', 256], ['icon@2x.png', 512]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: new URL(name, out).pathname, omitBackground: true });
  await page.close();
}
await browser.close();
console.log('brand ok');
