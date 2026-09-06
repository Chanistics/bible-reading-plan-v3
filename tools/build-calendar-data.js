#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'calendar-data.js');
const YEARS = process.argv.slice(2).length
  ? process.argv.slice(2).map(Number)
  : [2025, 2026, 2027, 2028, 2029];

function downloadJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, response => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Hebcal returned status ${response.statusCode}`));
        return;
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

function compactItem(item) {
  const compact = {
    date: item.date,
    title: item.title,
    category: item.category
  };
  for (const field of ['hebrew', 'memo', 'leyning']) {
    if (item[field] !== undefined) compact[field] = item[field];
  }
  return compact;
}

async function main() {
  const years = {};
  for (const year of YEARS) {
    const url = `https://www.hebcal.com/hebcal?v=1&cfg=json&year=${year}&s=on&maj=on&min=on&mod=on`;
    const data = await downloadJson(url);
    years[String(year)] = (data.items || [])
      .filter(item => item.category === 'parashat' || item.category === 'holiday')
      .map(compactItem);
  }

  const payload = {
    source: 'Hebcal Jewish Calendar API',
    sourceUrl: 'https://www.hebcal.com/home/developer-apis',
    years
  };
  fs.writeFileSync(OUTPUT, `window.BUNDLED_HEBCAL_DATA = ${JSON.stringify(payload)};\n`, 'utf8');
  console.log(JSON.stringify(Object.fromEntries(Object.entries(years).map(([year, items]) => [year, items.length])), null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
