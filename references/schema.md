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
