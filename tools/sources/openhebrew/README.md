# OpenHebrewBible source

The Old Testament word data is generated from the following files in
[`eliranwong/OpenHebrewBible`](https://github.com/eliranwong/OpenHebrewBible):

- `007-BHS-8-layer-interlinear/BHSA-8-layer-interlinear.csv.zip`
- `008-BHS-mapping-KJV/KJV-OT-mapped-to-BHS.csv`
- `001-aligning-BHS-WLC/supporting-files/BHSA_versification_KJV_23145.csv`

The source revision used for the current generated files is
`28ae9b2bd340eed4c483482852f2ed3b2bd07919`.

The source mapping explicitly lists KJV Nehemiah 7:68 as not found in BHSA.
The generated dataset therefore contains 23,144 mapped Old Testament verses
and records this one known source-level exception in `original-data/index.js`.

OpenHebrewBible's mapping work is licensed under CC BY-NC 4.0. The repository
README also documents the licenses of the underlying BHSA, OpenScriptures,
Berean, and KJV sources. This application must remain within those terms.

To rebuild:

```sh
git clone --depth 1 https://github.com/eliranwong/OpenHebrewBible.git /tmp/OpenHebrewBible
node tools/build-openhebrew-kjv-data.js /tmp/OpenHebrewBible
```
