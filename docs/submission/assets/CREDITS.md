# 写真素材クレジット（すべて Wikimedia Commons／商用利用可・帰属表示必要）

更新 2026-08-28: クレジットの「表示」を全成果物に埋め込み済み（下記「表示箇所」参照）。

## 提出資産 `docs/submission/assets/`（スライド・動画用）

| ファイル | 元ファイル | 作者 | ライセンス | 使用箇所 |
|---|---|---|---|---|
| jetfoil_okada.jpg | High-Speed Jet Ferry @ Okata Port @ Oshima (9609632961).jpg | Guilhem Vellut | CC BY 2.0 | スライド1（表紙）・アプリhero・2分動画 |
| oshima_bus.jpg | Oshima Bus RM.jpg | Cassiopeia sweet | CC BY-SA 3.0 | 2分動画・アプリgallery |
| port_arrival.jpg | 元町港に到着.jpg | Yoshi Canopus | CC BY-SA 4.0 | 2分動画 |
| mihara_trail.jpg | Godzilla Rock on Mount Mihara, Japan.jpg | Yoshi Canopus | CC BY-SA 4.0 | 2分動画・アプリgallery/スポット |
| mihara.jpg | Mount Mihara on Izu Oshima in Japan - 2016-03-26 A.jpg | Kentaro Ohno | CC BY 2.0 | 2分動画・アプリgallery/スポット |
| motomachi_port.jpg | Motomachi Port @ Oshima (9609627885).jpg | Guilhem Vellut | CC BY 2.0 | アプリgallery/スポット |
| mihara_crater.jpg | 三原山火口-Mt.Mihara Voｌcano - panoramio.jpg | yano@mama.akari.ne.japan | CC BY-SA 3.0 | アプリgallery |

## アプリ内画像 `app/public/img/`（上記と同一素材はリサイズ版）

| ファイル | 作者 | ライセンス | 表示箇所（アプリ内） |
|---|---|---|---|
| hero-jetfoil.jpg | Guilhem Vellut | CC BY 2.0 | ヘッダー背景（右下にクレジット表示） |
| mihara.jpg | Kentaro Ohno | CC BY 2.0 | gallery・スポット詳細 |
| mihara-crater.jpg | yano | CC BY-SA 3.0 | gallery |
| mihara-trail.jpg | Yoshi Canopus | CC BY-SA 4.0 | gallery・スポット詳細 |
| camellia.jpg | (WT-shared) Shoestring | CC BY-SA 4.0 | gallery・スポット詳細 |
| ashitaba.jpg | lienyuan lee | CC BY 3.0 | gallery |
| motomachi.jpg | Guilhem Vellut | CC BY 2.0 | gallery・スポット詳細 |
| oshima-bus.jpg | Cassiopeia sweet | CC BY-SA 3.0 | gallery |
| habu.jpg | alonfloc | CC BY 3.0 | gallery・スポット詳細 |
| oshima-park.jpg | Tsuyoshi chiba | CC BY-SA 4.0 | gallery・スポット詳細 |

※ 後半4件（camellia/ashitaba/habu/oshima-park ほか）の元ファイル名は導入時記録が
`app/public/index.html` フッターの一覧のみ。Commonsで作者名+被写体で検索すれば特定可能。

## クレジットの表示箇所（埋め込み済み）

| 成果物 | 表示 |
|---|---|
| スライド pptx/PDF | スライド1（表紙）・6・7に「画面内写真」行、スライド10に全クレジット一覧（`add_photo_credits.py` で再付与可） |
| アプリ | hero右下オーバーレイ／gallery各キャプション／スポット詳細モーダル写真下／旅程サムネイルtitle属性／フッター一覧 |
| 2分紹介動画 promo-2min.mp4 | 各写真シーンに個別クレジット＋エンドカードに一覧（`promo.html` 内） |
| 60秒操作動画 demo-60s.mp4 | 末尾8秒（24秒以降）に画面下部の字幕でクレジット表示（ffmpeg drawtextで焼き込み） |

- 各画像のCommonsページ：https://commons.wikimedia.org/wiki/ + 「元ファイル」名（`File:` を付ける）
- CC BY：作者名・ライセンス表示。CC BY-SA：同左＋改変物を同ライセンスで共有する条件（トリミング程度の使用。スライド・動画は編集著作物として扱い、各頁に帰属を明記）
- 地図：© OpenStreetMap contributors（アプリ地図・スライド7・動画キャプチャ内）
- 提出フォーム7の「ライセンス違反がないこと」の根拠として本表を保管
