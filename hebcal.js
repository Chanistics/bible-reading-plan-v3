// hebcal.js
// Hebcal API 연동 모듈

const HEBCAL_API_BASE = 'https://www.hebcal.com';

/**
 * 주어진 그레고리력 연도(또는 현재)의 1년치 유대력 달력 데이터를 가져옵니다.
 * @param {string} year 그레고리력 연도 (예: '2026' 또는 'now')
 */
async function fetchHebcalYearData(year = 'now') {
  const bundledYears = window.BUNDLED_HEBCAL_DATA && window.BUNDLED_HEBCAL_DATA.years;
  const bundledItems = bundledYears && bundledYears[String(year)];
  if (Array.isArray(bundledItems) && bundledItems.length) {
    return bundledItems;
  }

  // i=on: 이스라엘 절기/토라 주기, s=on: 파라샤(leyning 포함)
  const url = `${HEBCAL_API_BASE}/hebcal?v=1&cfg=json&year=${year}&i=on&s=on&maj=on&min=on&mod=on`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Network response was not ok');
    const data = await res.json();
    return data.items;
  } catch (err) {
    console.error('Hebcal API Fetch Error:', err);
    throw err;
  }
}

/**
 * 특정 그레고리력 날짜를 유대력 날짜로 변환합니다.
 * @param {string} date 'YYYY-MM-DD'
 */
async function convertToHebrewDate(date) {
  const url = `${HEBCAL_API_BASE}/converter?cfg=json&date=${date}&g2h=1&strict=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Hebcal converter returned status ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('Hebcal Converter Error:', err);
    return null;
  }
}

window.HebcalAPI = {
  fetchHebcalYearData,
  convertToHebrewDate
};
