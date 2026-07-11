#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build compact book-level original-language JSON files from STEPBible data."""

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXEGETE = Path("/private/tmp/exegete-inspect")
ABBR = EXEGETE / "src/data/book_abbrev.json"
GREEK_DIR = EXEGETE / "src/data/original/greek"
HEBREW_DIR = EXEGETE / "src/data/original/hebrew"
OUT = ROOT / "original-data"


GLOSS_KO = {
    "god": "하나님",
    "lord": "주",
    "jesus": "예수",
    "christ": "그리스도",
    "son": "아들",
    "father": "아버지",
    "spirit": "영",
    "holy": "거룩한",
    "love": "사랑",
    "loved": "사랑했다",
    "life": "생명",
    "eternal": "영원한",
    "world": "세상",
    "gave": "주었다",
    "give": "주다",
    "believe": "믿다",
    "believing": "믿는",
    "faith": "믿음",
    "grace": "은혜",
    "peace": "평안",
    "truth": "진리",
    "word": "말씀",
    "beginning": "시작, 태초",
    "created": "창조했다",
    "create": "창조하다",
    "heaven": "하늘",
    "heavens": "하늘",
    "earth": "땅",
    "king": "왕",
    "kingdom": "나라, 왕국",
    "people": "백성",
    "israel": "이스라엘",
    "jerusalem": "예루살렘",
    "sin": "죄",
    "righteousness": "의",
    "death": "죽음",
    "dead": "죽은",
    "resurrection": "부활",
    "save": "구원하다",
    "saved": "구원받은",
    "not": "아니다, 하지 않다",
    "and": "그리고",
    "for": "왜냐하면, ~을 위하여",
    "in": "~안에",
    "to": "~에게, ~로",
    "from": "~로부터",
    "with": "~와 함께",
    "the": "정관사",
    "<the>": "정관사",
    "<obj.>": "목적격 표지",
    "that": "그것, ~하도록",
    "so that": "~하도록",
    "all": "모든",
    "everyone": "모든 사람",
}


POS_GREEK = {
    "N": "명사",
    "V": "동사",
    "A": "형용사",
    "T": "관사",
    "P": "대명사",
    "R": "관계대명사",
    "D": "부사",
    "ADV": "부사",
    "CONJ": "접속사",
    "PREP": "전치사",
    "PRT": "불변화사",
    "I": "감탄사",
}
G_CASE = {"N": "주격", "G": "소유격", "D": "여격", "A": "목적격", "V": "호격"}
G_NUM = {"S": "단수", "P": "복수"}
G_GEN = {"M": "남성", "F": "여성", "N": "중성"}
G_TENSE = {"P": "현재", "I": "미완료", "F": "미래", "A": "부정과거", "R": "완료", "L": "과거완료", "2": "제2부정과거"}
G_VOICE = {"A": "능동태", "M": "중간태", "P": "수동태", "E": "중간/수동태", "D": "디포넌트"}
G_MOOD = {"I": "직설법", "S": "가정법", "O": "희구법", "M": "명령법", "N": "부정사", "P": "분사"}
G_PERSON = {"1": "1인칭", "2": "2인칭", "3": "3인칭"}

H_POS = {
    "V": "동사",
    "N": "명사",
    "A": "형용사",
    "R": "전치사",
    "C": "접속사",
    "T": "표지/관사",
    "D": "부사",
    "S": "대명사 접미사",
    "P": "대명사",
}
H_STEM = {"q": "칼", "N": "니팔", "p": "피엘", "P": "푸알", "h": "히필", "H": "호팔", "t": "히트파엘", "o": "폴렐"}
H_FORM = {"p": "완료", "q": "미완료", "w": "바브연속", "i": "명령", "j": "청유/명령", "r": "분사", "c": "부정사", "a": "절대부정사"}
H_GENDER = {"m": "남성", "f": "여성", "c": "공성"}
H_NUMBER = {"s": "단수", "p": "복수", "d": "쌍수"}
H_STATE = {"a": "절대형", "c": "연계형", "d": "한정형"}


def clean_text(value):
    value = (value or "").replace("\ufeff", "").strip()
    value = re.sub(r"[\u0591-\u05AF]", "", value)
    value = value.replace("\\׃", "").replace("׃", "").replace("\\־", "").replace("־", "")
    return value.strip(" ,.;·")


def ko_gloss(gloss):
    raw = clean_text(gloss).strip()
    key = raw.lower().strip("[]()<>.,;:!?")
    key = re.sub(r"^(he|she|it|they|i|you|we)\s+", "", key)
    if "/" in key:
        parts = [part.strip(" []()<>.,;:!?") for part in key.split("/") if part.strip()]
        translated = [GLOSS_KO.get(part, part) for part in parts[:3]]
        return " / ".join(translated)
    if key in GLOSS_KO:
        return GLOSS_KO[key]
    for sep in ("/", ";", ","):
        first = key.split(sep)[0].strip()
        if first in GLOSS_KO:
            return GLOSS_KO[first]
    return raw


def parse_greek_morph(code):
    if not code:
        return ""
    parts = code.split("-")
    pos = parts[0]
    if pos == "V" and len(parts) >= 2:
        vcode = parts[1]
        tense = G_TENSE.get(vcode[0], vcode[0]) if vcode else ""
        voice = G_VOICE.get(vcode[1], vcode[1]) if len(vcode) > 1 else ""
        mood = G_MOOD.get(vcode[2], vcode[2]) if len(vcode) > 2 else ""
        rest = parts[2] if len(parts) > 2 else ""
        detail = [x for x in (tense, voice, mood) if x]
        if len(rest) >= 2:
            detail.append(G_PERSON.get(rest[0], rest[0]))
            detail.append(G_NUM.get(rest[1], rest[1]))
        if len(rest) >= 3:
            detail.append(G_GEN.get(rest[2], rest[2]))
        return "동사, " + ", ".join(detail)
    if pos in ("N", "A", "T", "P", "R") and len(parts) >= 2:
        gram = parts[1]
        detail = [POS_GREEK.get(pos, pos)]
        if len(gram) >= 1:
            detail.append(G_CASE.get(gram[0], gram[0]))
        if len(gram) >= 2:
            detail.append(G_NUM.get(gram[1], gram[1]))
        if len(gram) >= 3:
            detail.append(G_GEN.get(gram[2], gram[2]))
        return ", ".join(detail)
    return POS_GREEK.get(code, POS_GREEK.get(pos, code))


def parse_hebrew_part(part):
    if part and not part.startswith("H") and part[0] in H_POS:
        part = "H" + part
    if not part.startswith("H") or len(part) < 2:
        return part
    pos = part[1]
    if pos == "V" and len(part) >= 5:
        stem = H_STEM.get(part[2], part[2])
        form = H_FORM.get(part[3], part[3])
        details = ["동사", stem, form]
        rest = part[4:]
        if rest and rest[0].isdigit():
            details.append(f"{rest[0]}인칭")
            rest = rest[1:]
        if rest:
            details.extend(H_GENDER.get(ch, ch) for ch in rest if ch in H_GENDER)
            details.extend(H_NUMBER.get(ch, ch) for ch in rest if ch in H_NUMBER)
        return ", ".join(details)
    if pos in H_POS:
        details = [H_POS[pos]]
        rest = part[2:]
        for ch in rest:
            if ch in H_GENDER:
                details.append(H_GENDER[ch])
            elif ch in H_NUMBER:
                details.append(H_NUMBER[ch])
            elif ch in H_STATE:
                details.append(H_STATE[ch])
        return ", ".join(dict.fromkeys(details))
    return part


def parse_hebrew_morph(code):
    if not code:
        return ""
    return "/".join(parse_hebrew_part(part) for part in code.split("/"))


def load_books():
    data = json.loads(ABBR.read_text(encoding="utf-8"))
    books = {}
    for book in data["books"]:
        step = book["step"]
        books[step] = {
            "name": book["name"],
            "abbr": book["abbr"],
            "testament": book["testament"],
            "language": "hebrew" if book["testament"] == "OT" else "greek",
            "languageLabel": "히브리어" if book["testament"] == "OT" else "헬라어",
        }
    return books


def parse_original_and_translit(text):
    text = clean_text(text)
    match = re.match(r"^(.*?)\s*\((.*?)\)$", text)
    if match:
        return clean_text(match.group(1)), clean_text(match.group(2))
    return text, ""


def parse_lemma(field):
    field = clean_text(field)
    if "=" in field:
        return clean_text(field.split("=", 1)[0])
    return field


def parse_hebrew_lemma(fields):
    for field in fields:
        match = re.search(r"\{H\d+[A-Z]?=([^=}\u00bb]+)=?", field)
        if match:
            return clean_text(match.group(1))
    return ""


def add_word(out_books, books, step, chapter, verse, word):
    if step not in books:
        return
    meta = books[step]
    if step not in out_books:
        out_books[step] = {
            "book": meta["name"],
            "abbr": meta["abbr"],
            "step": step,
            "language": meta["language"],
            "languageLabel": meta["languageLabel"],
            "sourceNote": "STEPBible TAGNT/TAHOT morphology data © Tyndale House, CC BY 4.0. 한국어 문법 설명은 앱에서 표시용으로 변환했습니다.",
            "verses": {},
        }
    key = f"{int(chapter)}:{int(verse)}"
    out_books[step]["verses"].setdefault(key, []).append(word)


def build_greek(out_books, books):
    for file in sorted(GREEK_DIR.glob("*.txt")):
        for line in file.read_text(encoding="utf-8").splitlines():
            match = re.match(r"^([0-9A-Za-z]+)\.(\d+)\.(\d+)#(\d+)\S*\t(.*)$", line)
            if not match:
                continue
            step, chapter, verse, _, rest = match.groups()
            fields = rest.split("\t")
            if len(fields) < 4:
                continue
            original, translit = parse_original_and_translit(fields[0])
            gloss = clean_text(fields[1])
            strong_parse = clean_text(fields[2])
            strong, morph = (strong_parse.split("=", 1) + [""])[:2] if "=" in strong_parse else (strong_parse, "")
            lemma = parse_lemma(fields[3])
            word = [original, translit, ko_gloss(gloss), clean_text(strong), lemma, morph, parse_greek_morph(morph)]
            add_word(out_books, books, step, chapter, verse, word)


def build_hebrew(out_books, books):
    for file in sorted(HEBREW_DIR.glob("*.txt")):
        for line in file.read_text(encoding="utf-8").splitlines():
            match = re.match(r"^([0-9A-Za-z]+)\.(\d+)\.(\d+)#(\d+)\S*\t(.*)$", line)
            if not match:
                continue
            step, chapter, verse, _, rest = match.groups()
            fields = rest.split("\t")
            if len(fields) < 5:
                continue
            original = clean_text(fields[0])
            translit = clean_text(fields[1])
            gloss = clean_text(fields[2])
            strong = clean_text(fields[3]).replace("{", "").replace("}", "")
            morph = clean_text(fields[4])
            lemma = parse_hebrew_lemma(fields[5:])
            word = [original, translit, ko_gloss(gloss), strong, lemma, morph, parse_hebrew_morph(morph)]
            add_word(out_books, books, step, chapter, verse, word)


def main():
    books = load_books()
    out_books = {}
    OUT.mkdir(parents=True, exist_ok=True)

    build_greek(out_books, books)
    build_hebrew(out_books, books)

    index = {
        "version": "stepbible-cc-by-4.0-v1",
        "format": "compact-word-arrays-v1",
        "wordFields": ["original", "transliteration", "meaningKo", "strong", "lemma", "morph", "morphKo"],
        "books": {},
    }

    for step in sorted(out_books.keys(), key=lambda s: list(books.keys()).index(s)):
        book = out_books[step]
        filename = f"{step}.json"
        (OUT / filename).write_text(
            json.dumps(book, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        index["books"][book["book"]] = {
            "file": filename,
            "step": step,
            "abbr": book["abbr"],
            "language": book["language"],
            "languageLabel": book["languageLabel"],
            "verseCount": len(book["verses"]),
        }

    (OUT / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Built {len(out_books)} book files in {OUT}")


if __name__ == "__main__":
    main()
