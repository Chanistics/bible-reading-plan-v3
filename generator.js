// generator.js
// 연간 리딩플랜 자동 생성기 (유대력 절기/토라포션/메길롯/구약/신약 통합)

/**
 * 유대력 독서 주기에 맞춘 통독 플랜을 생성합니다.
 * @param {Array} hebcalItems - Hebcal API에서 가져온 달력 아이템 배열
 * @param {string} startDateStr - 시작일 (YYYY-MM-DD)
 */
function generateHebrewYearPlan(hebcalItems, startDateStr, totalDays = 365) {
  const plan = {};
  const datesList = [];
  
  // 1. 날짜별 기본 뼈대 생성 (타임존 영향 없는 UTC 기준 계산)
  const parts = startDateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // 0-indexed
  const day = parseInt(parts[2], 10);

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(Date.UTC(year, month, day + i));
    const dateStr = d.toISOString().split('T')[0];
    datesList.push(dateStr);
    plan[dateStr] = {
      date: dateStr,
      dayOfWeek: d.getUTCDay(), // 0: Sun, 6: Sat
      holidays: [],
      parasha: null,
      torah: null,
      megillah: null,
      ot: [],
      nt: []
    };
  }

  // 2. Hebcal 데이터 매핑 (절기, 파라샤)
  const parashotMap = {};
  
  hebcalItems.forEach(item => {
    if (!plan[item.date]) return; // 대상 기간 밖의 데이터 무시

    if (item.category === 'holiday') {
      plan[item.date].holidays.push({
        name: item.title,
        hebrew: item.hebrew,
        memo: item.memo
      });
    }

    if (item.category === 'parashat') {
      parashotMap[item.date] = item;
    }
  });

  // 3. 각 주간별로 파라샤 알리야 7등분 분배 (일~토)
  datesList.forEach((dateStr) => {
    const dayData = plan[dateStr];
    
    // 5786 -> 5787 베레시트 전환기 샬롬 주간 대응 (2026-10-04 ~ 2026-10-09)
    if (dateStr >= "2026-10-04" && dateStr <= "2026-10-09") {
      dayData.parasha = "샬롬 (Shalom)";
      dayData.torah = null;
      return;
    }

    // 이 날짜가 속한 주의 토요일 날짜 찾기
    const dParts = dateStr.split('-');
    const dYear = parseInt(dParts[0], 10);
    const dMonth = parseInt(dParts[1], 10) - 1;
    const dDay = parseInt(dParts[2], 10);

    const d = new Date(Date.UTC(dYear, dMonth, dDay));
    const dayOfWeek = d.getUTCDay();
    const daysToSaturday = 6 - dayOfWeek;
    
    const saturdayD = new Date(Date.UTC(dYear, dMonth, dDay + daysToSaturday));
    const satStr = saturdayD.toISOString().split('T')[0];

    const upcomingParasha = parashotMap[satStr];
    
    if (upcomingParasha && upcomingParasha.leyning) {
      dayData.parasha = upcomingParasha.title.replace(/^Parashat\s+|^Parashas\s+/i, '');
      // 알리야 1~7을 일(0) ~ 토(6)에 배정 (UTC 요일 기준)
      const aliyahNum = dayOfWeek + 1;
      dayData.torah = upcomingParasha.leyning[aliyahNum.toString()] || null;
    }
  });

  // 4. 메길롯 배분 (절기가 포함된 주간에 수록)
  const weeks = {}; // SundayDateStr -> [dateStr, ...]
  datesList.forEach(dateStr => {
    const dParts = dateStr.split('-');
    const dYear = parseInt(dParts[0], 10);
    const dMonth = parseInt(dParts[1], 10) - 1;
    const dDay = parseInt(dParts[2], 10);

    const d = new Date(Date.UTC(dYear, dMonth, dDay));
    const dayOfWeek = d.getUTCDay();
    
    const sunday = new Date(Date.UTC(dYear, dMonth, dDay - dayOfWeek));
    const sunStr = sunday.toISOString().split('T')[0];
    if (!weeks[sunStr]) {
      weeks[sunStr] = [];
    }
    weeks[sunStr].push(dateStr);
  });

  // 5대 메길롯 주간별 성경 챕터 수록 정의
  const MEGILLOT_DIST = {
    'Song': ['아가 1장', '아가 2장', '아가 3장', '아가 4장', '아가 5장', '아가 6장', '아가 7-8장'],
    'Ruth': ['룻기 1장', '룻기 2장', '룻기 3장', '룻기 4장', null, null, null],
    'Lam': ['예레미야 애가 1장', '예레미야 애가 2장', '예레미야 애가 3장', '예레미야 애가 4장', '예레미야 애가 5장', null, null],
    'Eccl': ['전도서 1-2장', '전도서 3-4장', '전도서 5-6장', '전도서 7-8장', '전도서 9-10장', '전도서 11장', '전도서 12장'],
    'Esth': ['에스더 1-2장', '에스더 3-4장', '에스더 5-6장', '에스더 7장', '에스더 8장', '에스더 9장', '에스더 10장']
  };

  Object.keys(weeks).forEach(sunStr => {
    const weekDates = weeks[sunStr];
    let megillahType = null;

    // 해당 주간에 주요 절기가 있는지 스캔
    for (const dStr of weekDates) {
      const dayData = plan[dStr];
      if (dayData.holidays) {
        for (const h of dayData.holidays) {
          const name = h.name.toLowerCase();
          if (name.includes('pesach') || name.includes('passover')) {
            megillahType = 'Song';
            break;
          }
          if (name.includes('shavuot')) {
            megillahType = 'Ruth';
            break;
          }
          if (name.includes('tisha b\'av')) {
            megillahType = 'Lam';
            break;
          }
          if (name.includes('sukkot') || name.includes('shmini atzeret') || name.includes('simchat torah')) {
            megillahType = 'Eccl';
            break;
          }
          if (name.includes('purim')) {
            megillahType = 'Esth';
            break;
          }
        }
      }
      if (megillahType) break;
    }

    // 절기 주간인 경우 메길롯 일정 하루씩 배분
    if (megillahType) {
      const readings = MEGILLOT_DIST[megillahType];
      weekDates.forEach(dateStr => {
        const dParts = dateStr.split('-');
        const d = new Date(Date.UTC(parseInt(dParts[0], 10), parseInt(dParts[1], 10)-1, parseInt(dParts[2], 10)));
        const dayOfWeek = d.getUTCDay();
        const reading = readings[dayOfWeek];
        if (reading) {
          plan[dateStr].megillah = reading;
        }
      });
    }
  });

  // 5. 구약/신약 순차 배분 (구약이 완료된 후 신약을 읽도록 변경)
  const otFlat = window.BIBLE_DATA.flattenBooks(window.BIBLE_DATA.OT_OTHER_BOOKS);
  const ntFlat = window.BIBLE_DATA.flattenBooks(window.BIBLE_DATA.NT_BOOKS);
  
  // 전체 일수(totalDays) 중 구약과 신약에 배분할 비율을 기존 266:99 비율로 유지
  const otRatio = 266 / 365;
  const otDays = Math.round(totalDays * otRatio);
  const ntDays = totalDays - otDays;

  const otPerDay = otFlat.length / otDays;
  const ntPerDay = ntFlat.length / ntDays;

  let otIndex = 0;
  let ntIndex = 0;

  let otAccumulator = 0;
  let ntAccumulator = 0;

  datesList.forEach((dateStr, index) => {
    const dayData = plan[dateStr];
    const dayNum = index + 1; // 1-based day number

    if (dayNum <= otDays) {
      // 구약 배분
      otAccumulator += otPerDay;
      const otCount = Math.floor(otAccumulator);
      otAccumulator -= otCount;
      for (let i = 0; i < otCount; i++) {
        if (otIndex < otFlat.length) {
          dayData.ot.push(otFlat[otIndex]);
          otIndex++;
        }
      }
    } else {
      // 신약 배분
      ntAccumulator += ntPerDay;
      const ntCount = Math.floor(ntAccumulator);
      ntAccumulator -= ntCount;
      for (let i = 0; i < ntCount; i++) {
        if (ntIndex < ntFlat.length) {
          dayData.nt.push(ntFlat[ntIndex]);
          ntIndex++;
        }
      }
    }
  });

  // 반올림 누락 잔여 장수 마지막 날에 전부 할당 (재검증용 안전망)
  const otLastDate = datesList[otDays - 1];
  while (otIndex < otFlat.length) {
    plan[otLastDate].ot.push(otFlat[otIndex]);
    otIndex++;
  }
  const ntLastDate = datesList[datesList.length - 1];
  while (ntIndex < ntFlat.length) {
    plan[ntLastDate].nt.push(ntFlat[ntIndex]);
    ntIndex++;
  }

  return plan;
}

window.Generator = {
  generateHebrewYearPlan
};
