// hebcal.js
// Hebcal API 연동 모듈

const HEBCAL_API_BASE = 'https://www.hebcal.com';

/**
 * 주어진 그레고리력 연도(또는 현재)의 1년치 유대력 달력 데이터를 가져옵니다.
 * @param {string} year 그레고리력 연도 (예: '2026' 또는 'now')
 */
async function fetchHebcalYearData(year = 'now') {
  // s=on: 파라샤(leyning 포함), maj=on: 주요 절기, min=on: 소절기
  const url = `${HEBCAL_API_BASE}/hebcal?v=1&cfg=json&year=${year}&s=on&maj=on&min=on&mod=on`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Network response was not ok');
    const data = await res.json();
    return data.items;
  } catch (err) {
    console.error('Hebcal API Fetch Error:', err);
    return [];
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
