# design.json スキーマ

必須は `meta.title` だけ。それ以外はすべて省略可。
★ = 書くことを強く推奨。
配列の項目には基本的に id を付ける（修正時に `components/<id>/summary` のような path で指定するため）。

## meta
| キー | 型 | 説明 |
|---|---|---|
| title ★必須 | string | 設計のタイトル |
| summary ★ | string | 1行の説明（ヘッダーに出る） |
| status | `draft` / `review` / `approved` | 草案 / レビュー中 / 承認済 |
| updated | string | 更新日 `2026-10-24` |
| author | string | 作成者 |

## overview
| キー | 型 | 説明 |
|---|---|---|
| goal ★ | string | 目的を1文で |
| tldr ★ | string[] | 要点。3つまで |
| background | string | 背景（折りたたみ表示） |
| constraints | string[] | 前提・制約 |
| nonGoals | string[] | やらないこと |

## requirements — 要件（EARS 形式）
| キー | 型 | 説明 |
|---|---|---|
| id ★ | string | 元資料の要件 ID があればそのまま（`REQ-001` など）。なければ `req-lock` など |
| text ★ | string | EARS の文。**元資料の文を一字一句そのまま**（要約・言い換え・翻訳しない。長くてよい） |
| pattern | `ubiquitous` / `event` / `state` / `unwanted` / `optional` / `complex` | 常時（〜は…しなければならない）/ イベント（When / 〜とき）/ 状態（While / 〜の間）/ 異常系（If…then / 〜場合）/ オプション（Where / 〜がある場合）/ 複合 |
| status | `new` / `changed` / `existing` | |
| priority | string | `Must` `Should` `高` など。元資料の表記のまま |
| components | string[] | この要件を実現する component id |
| rationale | string | 理由・出典（1行） |
| detail | string | 補足（書式可） |

`When / While / Where / If / Then / shall` と「〜とき、」「〜の間、」「〜場合、」「しなければならない」が画面で強調される。

## features — テスト（Gherkin）
1 feature = 1 つの `.feature`（機能）。
| キー | 型 | 説明 |
|---|---|---|
| id ★ | string | `f-login` など |
| name ★ | string | `Feature:` / `機能:` の名前 |
| description | string | Feature 直下の説明文 |
| file | string | `.feature` ファイルのパス（あれば） |
| tags | string[] | `@` は付けても付けなくてもよい |
| background | step[] | `Background:` / `背景:` のステップ |
| scenarios ★ | scenario[] | |

scenario:
| キー | 型 | 説明 |
|---|---|---|
| id ★ | string | feature の中で一意。`s-lock` など |
| name ★ | string | `Scenario:` / `シナリオ:` の名前 |
| tags | string[] | |
| rule | string | `Rule:` / `ルール:` の下にある場合、その名前 |
| verifies | string[] | このシナリオが検証する requirement id |
| steps ★ | step[] | |
| examples | `{"name", "tags": [], "header": [], "rows": [[]]}`[] | `Scenario Outline` の `Examples:`。あればアウトラインとして表示 |
| detail | string | 補足 |

step: キーワードを含めた 1 行をそのまま文字列で書く。
- 英語: `"Given ..."` `"When ..."` `"Then ..."` `"And ..."` `"But ..."` `"* ..."`
- 日本語: `"前提 ..."` `"もし ..."` `"ならば ..."` `"かつ ..."` `"しかし ..."`（`且つ` `但し` `ただし` `然し` も可）
- データ表や DocString がある行はオブジェクトにする:
  `{"text": "And 次のユーザーがいる", "table": [["name", "role"], ["alice", "admin"]]}`
  `{"text": "Then 本文は次の通り", "doc": "{\"ok\": true}", "docType": "json"}`（`docType` は `"""json` の種類。省略可）
- `<placeholder>` はそのまま書く（画面で強調される）。

`.feature` ファイルがあるときは `scripts/import-gherkin.js` でこの形に変換できる（手で写さない）。

path の例: `requirements/REQ-001/text`、`features/f-login/scenarios/s-lock/steps/3`、`features/f-login/background/1`

## layers（任意）
`string[]`。構成図の段の順番（上から）。省略時は components に出てきた順。

## actors（任意）
フローに登場する、コンポーネント以外の存在（ユーザー、外部の人など）。
`{"id": "user", "name": "ユーザー"}`

## components ★ — 構成図の箱
| キー | 型 | 説明 |
|---|---|---|
| id ★ | string | 英小文字・ハイフン |
| name ★ | string | 表示名（コード上の名前） |
| summary ★ | string | 1行（60字以内） |
| layer | string | 段（例: `画面` `API` `ドメイン` `データ`） |
| kind | string | `service` `module` `ui` `screen` `db` `cache` `queue` `external` `job` `lib` `class` `function` `file` `script` など |
| status ★ | `new` / `changed` / `existing` | 新規 / 変更 / 既存 |
| files | string[] | 関係するファイルパス |
| responsibilities | string[] | 責務 |
| detail | string | 詳細（書式可） |

`kind: "external"` は点線の枠で表示される。

## edges — 構成図の矢印
`{"from": "<component id>", "to": "<component id>", "label": "呼び出し内容（短く）"}`
「from が to を呼ぶ / 依存する」の向き。

## flows — 処理フロー（シーケンス図）
| キー | 型 | 説明 |
|---|---|---|
| id ★ | string | |
| name ★ | string | フロー名（例: `ログイン成功`） |
| summary | string | 1行 |
| participants | string[] | 列の順番を固定したいときだけ |
| steps ★ | step[] | 12個まで |
| detail | string | 補足 |

step: `{"from": "<id>", "to": "<id>", "label": "短い説明", "detail": "詳しい説明", "reply": true}`
- from / to は component id か actor id。
- `reply: true` は戻り値・応答（点線）。
- from と to が同じなら自己呼び出し。

## entities — データ
| キー | 型 | 説明 |
|---|---|---|
| id ★ | string | |
| name ★ | string | テーブル名・型名 |
| summary | string | |
| status | `new` / `changed` / `existing` | |
| fields | field[] | `{"name", "type", "key": true, "note", "status"}` |
| detail | string | |

主キーや新規・変更フィールドがカードに優先表示される。

## relations
`{"from": "<entity id>", "to": "<entity id>", "type": "1:N", "label": "説明"}`

## apis — API・インターフェース
| キー | 型 | 説明 |
|---|---|---|
| id ★ | string | |
| method | string | `GET` `POST` `PUT` `PATCH` `DELETE`（関数なら省略） |
| path / signature | string | HTTP なら path、関数・メソッドなら signature |
| summary ★ | string | |
| component | string | 担当する component id |
| status | `new` / `changed` / `existing` | |
| request / response | string | 例やスキーマ（そのまま等幅表示） |
| errors | string[] | |
| detail | string | |

## decisions — 設計判断
| キー | 型 | 説明 |
|---|---|---|
| id ★ | string | `d-store` など |
| title ★ | string | 何を決めるか |
| status | `decided` / `proposed` | 決定 / 提案中 |
| chosen ★ | string | 採用した案 |
| reason ★ | string | 理由 |
| alternatives | `{"name", "pros": [], "cons": []}`[] | 検討した案（採用案も含めてよい） |

## risks
`{"id": "r-xxx", "title": "...", "level": "high|mid|low", "mitigation": "対策", "detail": "..."}`

## questions — 未決事項（画面でチェックすると解決済みになる）
`{"id": "q-xxx", "q": "質問", "context": "背景", "owner": "確認先", "options": ["案A", "案B"]}`

## tasks ★ — 実装手順（画面でチェックすると完了になる）
| キー | 型 | 説明 |
|---|---|---|
| id ★ | string | `t1` など |
| title ★ | string | 動詞で終える（`〜を実装`） |
| summary | string | |
| size | `S` / `M` / `L` | 目安の大きさ |
| components | string[] | 対象の component id |
| dependsOn | string[] | 先に終わっている必要がある task id |
| files | string[] | |
| detail | string | |
| done_when | string | 完了条件 |

## 書式（summary / detail / tldr などの文字列）
- `` `code` ``、`**太字**`
- `\n` で改行、`- ` 始まりの行は箇条書き
- ```` ``` ```` で囲むとコードブロック（detail のみ推奨）
