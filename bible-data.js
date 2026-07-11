// bible-data.js

// 1. 토라 (모세오경) - Hebcal API에서 Parasha 데이터로 처리하지만, 참고용
const TORAH_BOOKS = [
  { id: 'Gen', name: '창세기', chapters: 50 },
  { id: 'Exod', name: '출애굽기', chapters: 40 },
  { id: 'Lev', name: '레위기', chapters: 27 },
  { id: 'Num', name: '민수기', chapters: 36 },
  { id: 'Deut', name: '신명기', chapters: 34 }
]; // 총 187장

// 2. 메길롯 (5권) - 절기 매핑용
const MEGILLOT_BOOKS = [
  { id: 'Song', name: '아가', chapters: 8, holiday: 'Pesach' }, // 유월절
  { id: 'Ruth', name: '룻기', chapters: 4, holiday: 'Shavuot' }, // 칠칠절(오순절)
  { id: 'Lam', name: '예레미야 애가', chapters: 5, holiday: 'Tisha B\'Av' }, // 티샤 베아브
  { id: 'Eccl', name: '전도서', chapters: 12, holiday: 'Sukkot' }, // 초막절
  { id: 'Esth', name: '에스더', chapters: 10, holiday: 'Purim' } // 부림절
]; // 총 39장

// 3. 나머지 구약 성경 (표준 목차 순, 토라/메길롯 제외) - 703장
const OT_OTHER_BOOKS = [
  { id: 'Josh', name: '여호수아', chapters: 24 },
  { id: 'Judg', name: '사사기', chapters: 21 },
  { id: '1Sam', name: '사무엘상', chapters: 31 },
  { id: '2Sam', name: '사무엘하', chapters: 24 },
  { id: '1Kgs', name: '열왕기상', chapters: 22 },
  { id: '2Kgs', name: '열왕기하', chapters: 25 },
  { id: '1Chr', name: '역대상', chapters: 29 },
  { id: '2Chr', name: '역대하', chapters: 36 },
  { id: 'Ezra', name: '에스라', chapters: 10 },
  { id: 'Neh', name: '느헤미야', chapters: 13 },
  { id: 'Job', name: '욥기', chapters: 42 },
  { id: 'Ps', name: '시편', chapters: 150 },
  { id: 'Prov', name: '잠언', chapters: 31 },
  { id: 'Isa', name: '이사야', chapters: 66 },
  { id: 'Jer', name: '예레미야', chapters: 52 },
  { id: 'Ezek', name: '에스겔', chapters: 48 },
  { id: 'Dan', name: '다니엘', chapters: 12 },
  { id: 'Hos', name: '호세아', chapters: 14 },
  { id: 'Joel', name: '요엘', chapters: 3 },
  { id: 'Amos', name: '아모스', chapters: 9 },
  { id: 'Obad', name: '오바댜', chapters: 1 },
  { id: 'Jonah', name: '요나', chapters: 4 },
  { id: 'Mic', name: '미가', chapters: 7 },
  { id: 'Nah', name: '나훔', chapters: 3 },
  { id: 'Hab', name: '하박국', chapters: 3 },
  { id: 'Zeph', name: '스바냐', chapters: 3 },
  { id: 'Hag', name: '학개', chapters: 2 },
  { id: 'Zech', name: '스가랴', chapters: 14 },
  { id: 'Mal', name: '말라기', chapters: 4 }
];

// 4. 신약 성경 (표준 목차 순) - 260장
const NT_BOOKS = [
  { id: 'Matt', name: '마태복음', chapters: 28 },
  { id: 'Mark', name: '마가복음', chapters: 16 },
  { id: 'Luke', name: '누가복음', chapters: 24 },
  { id: 'John', name: '요한복음', chapters: 21 },
  { id: 'Acts', name: '사도행전', chapters: 28 },
  { id: 'Rom', name: '로마서', chapters: 16 },
  { id: '1Cor', name: '고린도전서', chapters: 16 },
  { id: '2Cor', name: '고린도후서', chapters: 13 },
  { id: 'Gal', name: '갈라디아서', chapters: 6 },
  { id: 'Eph', name: '에베소서', chapters: 6 },
  { id: 'Phil', name: '빌립보서', chapters: 4 },
  { id: 'Col', name: '골로새서', chapters: 4 },
  { id: '1Thess', name: '데살로니가전서', chapters: 5 },
  { id: '2Thess', name: '데살로니가후서', chapters: 3 },
  { id: '1Tim', name: '디모데전서', chapters: 6 },
  { id: '2Tim', name: '디모데후서', chapters: 4 },
  { id: 'Titus', name: '디도서', chapters: 3 },
  { id: 'Phlm', name: '빌레몬서', chapters: 1 },
  { id: 'Heb', name: '히브리서', chapters: 13 },
  { id: 'Jas', name: '야고보서', chapters: 5 },
  { id: '1Pet', name: '베드로전서', chapters: 5 },
  { id: '2Pet', name: '베드로후서', chapters: 3 },
  { id: '1John', name: '요한1서', chapters: 5 },
  { id: '2John', name: '요한2서', chapters: 1 },
  { id: '3John', name: '요한3서', chapters: 1 },
  { id: 'Jude', name: '유다서', chapters: 1 },
  { id: 'Rev', name: '요한계시록', chapters: 22 }
];

// 총 장수 계산 헬퍼 (플랜 분배 시 사용)
const getTotalChapters = (books) => books.reduce((acc, book) => acc + book.chapters, 0);

// 장 단위 리스트 평탄화 (예: [{book: '창세기', chapter: 1}, {book: '창세기', chapter: 2}, ...])
const flattenBooks = (books) => {
  const flatList = [];
  books.forEach(book => {
    for (let i = 1; i <= book.chapters; i++) {
      flatList.push({ book: book.name, chapter: i });
    }
  });
  return flatList;
};

const TORAH_MAP = {
  'Genesis': '창세기',
  'Exodus': '출애굽기',
  'Leviticus': '레위기',
  'Numbers': '민수기',
  'Deuteronomy': '신명기'
};

const translateTorahReading = (str) => {
  if (!str) return '';
  let result = str;
  for (const [eng, kor] of Object.entries(TORAH_MAP)) {
    const regex = new RegExp(eng, 'gi');
    result = result.replace(regex, kor);
  }
  return result;
};

// 전역 사용을 위해 window 객체에 바인딩
window.BIBLE_DATA = {
  TORAH_BOOKS,
  MEGILLOT_BOOKS,
  OT_OTHER_BOOKS,
  NT_BOOKS,
  getTotalChapters,
  flattenBooks,
  translateTorahReading,
  TOTAL_OT_CHAPS: getTotalChapters(OT_OTHER_BOOKS),
  TOTAL_NT_CHAPS: getTotalChapters(NT_BOOKS)
};
