const PARASHA_META = {
  "샬롬 (Shalom)": { ko: "샬롬", he: "שָׁלוֹם", meaning: "평강, 온전함 (성경 읽기 완료 및 신년 대기 주간)" },
  "Shalom": { ko: "샬롬", he: "שָׁלוֹם", meaning: "평강, 온전함 (성경 읽기 완료 및 신년 대기 주간)" },
  "Bereshit": { ko: "베레시트", he: "בְּרֵאשִׁית", meaning: "태초에" },
  "Noach": { ko: "노아", he: "נֹחַ", meaning: "휴식, 안위" },
  "Lech-Lecha": { ko: "레크 레카", he: "לֶךְ-לְךָ", meaning: "너는 가라" },
  "Vayera": { ko: "바예라", he: "וַיֵּרָא", meaning: "그리고 그가 나타나셨다" },
  "Chayei Sara": { ko: "하예이 사라", he: "חַיֵּי שָׂרָה", meaning: "사라의 일생" },
  "Toldot": { ko: "톨도트", he: "תּוֹלְדֹת", meaning: "족보, 내력" },
  "Vayetzei": { ko: "바예쩨", he: "וַיֵּצֵא", meaning: "그리고 그가 나갔다" },
  "Vayishlach": { ko: "바이트쉴라흐", he: "וַיִּשְׁלַח", meaning: "그리고 그가 보냈다" },
  "Vayeshev": { ko: "바예쉐브", he: "וַיֵּשֶׁב", meaning: "그리고 그가 거주했다" },
  "Miketz": { ko: "미케츠", he: "מִקֵּץ", meaning: "끝에" },
  "Vayigash": { ko: "바이가쉬", he: "וַיִּגַּשׁ", meaning: "그리고 그가 다가갔다" },
  "Vayechi": { ko: "바예히", he: "וַיְחִי", meaning: "그리고 그가 살았다" },
  "Shemot": { ko: "쉐모트", he: "שְׁמוֹת", meaning: "이름들" },
  "Vaera": { ko: "바에라", he: "וָאֵרָא", meaning: "내가 나타났다" },
  "Bo": { ko: "보", he: "בֹּא", meaning: "들어가라" },
  "Beshalach": { ko: "베샬라흐", he: "בְּשַׁלַּח", meaning: "그가 보냈을 때" },
  "Yitro": { ko: "이트로", he: "יִתְרוֹ", meaning: "이드로 (그의 탁월함)" },
  "Mishpatim": { ko: "미쉬파팀", he: "מִּשְׁפָּטִים", meaning: "법규들" },
  "Terumah": { ko: "테루마", he: "תְּרוּמָה", meaning: "예물" },
  "Tetzaveh": { ko: "테짜베", he: "תְּצַוֶּה", meaning: "너는 명령하라" },
  "Ki Tisa": { ko: "키 티사", he: "כִּי תִשָּׂא", meaning: "네가 조사할 때" },
  "Vayakhel": { ko: "바야크헬", he: "וַיַּקְהֵל", meaning: "그리고 그가 모았다" },
  "Pekudei": { ko: "페쿠데이", he: "פְקוּדֵי", meaning: "기록, 셈" },
  "Vayikra": { ko: "바이크라", he: "וַיִּקְרָא", meaning: "그리고 그가 부르셨다" },
  "Tzav": { ko: "짜브", he: "צַו", meaning: "명령하라" },
  "Shmini": { ko: "쉬미니", he: "שְּׁמִינִי", meaning: "여덟 번째" },
  "Tazria": { ko: "타즈리아", he: "תַזְרִיעַ", meaning: "그녀가 임신할 때" },
  "Metzora": { ko: "메쪼라", he: "מְּצֹרָע", meaning: "나병 환자" },
  "Achrei Mot": { ko: "아하레이 모트", he: "אַחֲרֵי מוֹת", meaning: "죽은 후에" },
  "Kedoshim": { ko: "케도쉼", he: "קְדֹשִׁים", meaning: "거룩한" },
  "Emor": { ko: "에모르", he: "אֱמֹר", meaning: "말하라" },
  "Behar": { ko: "베하르", he: "בְּהַר", meaning: "산에서" },
  "Bechukotai": { ko: "베후코타이", he: "בְּחֻקֹּתַי", meaning: "나의 규례대로" },
  "Bamidbar": { ko: "바미드바르", he: "בְּמִדְבַּר", meaning: "광야에서" },
  "Nasso": { ko: "나쏘", he: "נָשֹׂא", meaning: "들어 올리라" },
  "Behaalotcha": { ko: "베하알로트카", he: "בְּהַעֲלֹתְךָ", meaning: "네가 올릴 때" },
  "Sh'lach": { ko: "쉴라흐", he: "שְׁלַח-לְךָ", meaning: "너는 보내라" },
  "Shelach": { ko: "쉴라흐", he: "שְׁלַח-לְךָ", meaning: "너는 보내라" },
  "Korach": { ko: "코라흐", he: "קֹרַח", meaning: "고라" },
  "Chukat": { ko: "후카트", he: "חֻקַּת", meaning: "규례" },
  "Balak": { ko: "발락", he: "בָּלָק", meaning: "발락 (파괴자)" },
  "Pinchas": { ko: "핀하스", he: "פִּינְחָס", meaning: "비느하스" },
  "Matot": { ko: "마토트", he: "מַּטּוֹת", meaning: "지파들" },
  "Masei": { ko: "마세이", he: "מַסְעֵי", meaning: "여정" },
  "Devarim": { ko: "데바림", he: "דְּבָרִים", meaning: "말씀들" },
  "Vaetchanan": { ko: "바에트하난", he: "וָאֶתְחַנַּן", meaning: "그리고 내가 간구했다" },
  "Eikev": { ko: "에이케브", he: "עֵקֶב", meaning: "결과적으로, 보상으로" },
  "Re'eh": { ko: "레에", he: "רְאֵה", meaning: "보라" },
  "Shoftim": { ko: "쇼프팀", he: "שֹׁפְטִים", meaning: "재판관들" },
  "Ki Teitzei": { ko: "키 테이쩨", he: "כִּי-תֵצֵא", meaning: "네가 나갈 때" },
  "Ki Tavo": { ko: "키 타보", he: "כִּי-תָבוֹא", meaning: "네가 들어갈 때" },
  "Nitzavim": { ko: "니짜빔", he: "נִצָּבִים", meaning: "너희가 서 있다" },
  "Vayeilech": { ko: "바예일레흐", he: "וַיֵּלֶךְ", meaning: "그리고 그가 갔다" },
  "Ha'Azinu": { ko: "하아지누", he: "הַאֲזִינוּ", meaning: "귀를 기울이라" },
  "V'Zot HaBerachah": { ko: "베조트 하브라하", he: "וְזֹאת הַבְּרָכָה", meaning: "이것이 축복이다" },
  "Vezot Haberakhah": { ko: "베조트 하브라하", he: "וְזֹאת הַבְּרָכָה", meaning: "이것이 축복이다" }
};

window.getParashaMeta = function(name) {
  if (!name) return { ko: "파라샤 없음", he: "", meaning: "의미 없음" };
  
  const cleanName = name.replace(/^Parashat\s+|^Parashas\s+/i, '').trim();
  if (PARASHA_META[cleanName]) return PARASHA_META[cleanName];
  
  // Handle double portions (e.g. Tazria-Metzora)
  if (cleanName.includes('-')) {
    const parts = cleanName.split('-');
    const p1 = parts[0].trim().replace(/^Parashat\s+|^Parashas\s+/i, '');
    const p2 = parts[1].trim().replace(/^Parashat\s+|^Parashas\s+/i, '');
    const m1 = PARASHA_META[p1];
    const m2 = PARASHA_META[p2];
    if (m1 && m2) {
      return {
        ko: `${m1.ko}-${m2.ko}`,
        he: `${m1.he}-${m2.he}`,
        meaning: `${m1.meaning} / ${m2.meaning}`
      };
    }
  }
  return { ko: cleanName, he: "", meaning: "의미 정보 없음" };
};
