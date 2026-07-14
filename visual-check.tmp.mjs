import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.CHECK_URL ?? "http://127.0.0.1:5173";
const OUT = process.env.CHECK_OUT ?? "/workspace/artifacts/lifecycle-visual";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function audit(theme, width, height, prefix) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    colorScheme: theme,
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, theme);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${prefix}-home.png` });

  // Expand the unsigned-law row (HR 1 locally / HR 6644 in prod)
  const lawRow = page.locator("text=/law.*unsigned|unsigned/i").first();
  if ((await lawRow.count()) > 0) {
    await lawRow.scrollIntoViewIfNeeded();
    await lawRow.click();
    await page.waitForTimeout(1200);
    await lawRow.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${prefix}-law-unsigned-expanded.png` });
    await page.mouse.wheel(0, 350);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${prefix}-law-unsigned-scrolled.png` });
    // collapse
    await lawRow.click();
    await page.waitForTimeout(600);
  } else {
    console.log(prefix, ": no unsigned-law row found");
  }

  // Pending-signature row
  const pending = page.locator("text=/President's desk/i").first();
  if ((await pending.count()) > 0) {
    await pending.scrollIntoViewIfNeeded();
    await pending.click();
    await page.waitForTimeout(1200);
    await pending.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${prefix}-pending-expanded.png` });
  } else {
    console.log(prefix, ": no pending row found");
  }
  await ctx.close();
  console.log(prefix, "done");
}

await audit("light", 1440, 1000, "desktop-light");
await audit("dark", 1440, 1000, "desktop-dark");
await audit("light", 320, 800, "iphone-se-light");
await audit("dark", 390, 844, "iphone14-dark");

await browser.close();
console.log("DONE");
