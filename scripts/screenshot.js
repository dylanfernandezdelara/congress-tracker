#!/usr/bin/env node

const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1024 });

  console.log('Navigating to http://127.0.0.1:5173/...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded', timeout: 10000 });

  // Wait for React to render
  console.log('Waiting for page to render...');
  await page.waitForSelector('.dashHeader', { timeout: 10000 });

  console.log('\n=== Screenshot 1: Top of page ===');
  await page.screenshot({ path: '/tmp/senate-page-top.png', fullPage: false });
  console.log('Saved to /tmp/senate-page-top.png');

  console.log('\n=== Screenshot 2: Full page ===');
  await page.screenshot({ path: '/tmp/senate-page-full.png', fullPage: true });
  console.log('Saved to /tmp/senate-page-full.png');

  // Get visible text content
  const topContent = await page.evaluate(() => {
    const header = document.querySelector('.dashHeader');
    const sections = document.querySelectorAll('.vizSection');
    return {
      header: header ? header.innerText : 'NOT FOUND',
      sectionCount: sections.length,
      sectionTitles: Array.from(sections).map(s => s.querySelector('.vizSection__title')?.innerText || 'No title'),
    };
  });

  console.log('\nTop of page content:');
  console.log('Header:', topContent.header);
  console.log('Section count:', topContent.sectionCount);
  console.log('Section titles:', topContent.sectionTitles);

  // Scroll down
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n=== Screenshot 2: After scrolling ===');
  await page.screenshot({ path: '/tmp/senate-page-bottom.png', fullPage: false });
  console.log('Saved to /tmp/senate-page-bottom.png');

  // Get SVG element counts
  const svgStats = await page.evaluate(() => {
    const stats = {};
    document.querySelectorAll('.vizSection').forEach((section) => {
      const title = section.querySelector('.vizSection__title')?.innerText || 'Unknown';
      const svg = section.querySelector('svg');
      if (svg) {
        const circles = svg.querySelectorAll('circle').length;
        const rects = svg.querySelectorAll('rect').length;
        const paths = svg.querySelectorAll('path').length;
        stats[title] = { circles, rects, paths, hasSvg: true };
      } else {
        stats[title] = { hasSvg: false };
      }
    });
    return stats;
  });

  console.log('\nSVG element counts per section:');
  console.log(JSON.stringify(svgStats, null, 2));

  await browser.close();
  console.log('\nDone! Check /tmp/senate-page-*.png for screenshots');
})();
