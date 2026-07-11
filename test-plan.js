// test-plan.js
// Node.js script to simulate generator and test the results

const fs = require('fs');
const path = require('path');

// Mock window object
global.window = {};

// Load bible-data.js
const bibleDataCode = fs.readFileSync(path.join(__dirname, 'bible-data.js'), 'utf8');
eval(bibleDataCode);

// Load parasha-data.js
const parashaDataCode = fs.readFileSync(path.join(__dirname, 'parasha-data.js'), 'utf8');
eval(parashaDataCode);

// Load generator.js
const generatorCode = fs.readFileSync(path.join(__dirname, 'generator.js'), 'utf8');
eval(generatorCode);

async function runTest() {
  const hYear = "5786";
  const gYear = Number(hYear) - 3761; // 2025
  
  console.log(`Fetching hebcal data for ${gYear} and ${gYear + 1}...`);
  
  const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
  
  async function fetchHebcalYearData(year) {
    const url = `https://www.hebcal.com/hebcal?v=1&cfg=json&year=${year}&s=on&maj=on&min=on&mod=on`;
    const res = await fetch(url);
    const data = await res.json();
    return data.items;
  }
  
  const items1 = await fetchHebcalYearData(gYear.toString());
  const items2 = await fetchHebcalYearData((gYear + 1).toString());
  const hebcalItems = [...items1, ...items2];
  
  // Find Bereshit Sunday
  const bereshitItem = hebcalItems.find(item => item.category === 'parashat' && item.title === 'Parashat Bereshit');
  let startDateStr = "2025-10-12";
  if (bereshitItem) {
    const satParts = bereshitItem.date.split('-');
    const satDate = new Date(Date.UTC(parseInt(satParts[0]), parseInt(satParts[1])-1, parseInt(satParts[2])));
    const sunDate = new Date(satDate);
    sunDate.setUTCDate(satDate.getUTCDate() - 6);
    startDateStr = sunDate.toISOString().split('T')[0];
  }
  
  console.log(`Start date: ${startDateStr}`);
  
  const plan = window.Generator.generateHebrewYearPlan(hebcalItems, startDateStr);
  const dates = Object.keys(plan).sort();
  
  // Group by parasha
  const groups = {};
  dates.forEach(dateStr => {
    const data = plan[dateStr];
    const rawPName = data.parasha || "Special Week";
    const pName = rawPName.replace(/^Parashat\s+|^Parashas\s+/i, '');
    if (!groups[pName]) {
      groups[pName] = [];
    }
    groups[pName].push(dateStr);
  });
  
  console.log("\n--- Parasha Days Counts ---");
  Object.keys(groups).forEach(pName => {
    console.log(`${pName}: ${groups[pName].length} days (${groups[pName][0]} to ${groups[pName][groups[pName].length - 1]})`);
  });
}

runTest().catch(err => console.error(err));
