# Korean Bible 1961 KRV source

The bundled Korean text is generated from
[`bluesaurel/Korean-Bible-1961-KRV`](https://github.com/bluesaurel/Korean-Bible-1961-KRV),
commit `65cdce887b141581b45097163b4b224de4a332fa`.

The source contains the 1961 Korean Revised Version as 66 books, 1,189 chapters,
and 31,102 verses. The Korean Bible Society states that the property-right term
for the Korean Revised Version has expired, while attribution and textual
integrity rights must still be observed. The generated index therefore retains
the attribution `대한성서공회 성경전서 개역한글판`.

Rebuild from the pinned source URL:

```sh
node tools/build-korean-bible-data.js
```

Or rebuild from a checked-out source file:

```sh
node tools/build-korean-bible-data.js /path/to/bible_1961_krv.json
```
