---
name: design-viewer
description: コーディング作業の設計（要件・構成図・処理フロー・データ・API・設計判断・テストシナリオ・リスク・実装手順）を、クリックで詳細を掘れる単一HTMLにまとめる。EARS 形式の要件や Gherkin のテストケースも取り込める。実装前の設計、設計レビュー、「設計をHTMLで見たい」「設計書を作って」「実装方針を整理して」と言われたときに使う。
---

# 設計ビューア

設計内容を **JSON に書く → スクリプトで HTML に変換** する。
HTML / CSS / JS は書かない。描画・折りたたみ・検索・図の生成はテンプレート（`assets/viewer.html`）がやる。
あなたの仕事は「正確で、短く、構造化された JSON」を書くことだけ。

## 手順

1. **調べる**: 対象のコードを読む（関係するファイル、既存の構成、呼び出し関係）。
   - わからないことは推測で埋めない → `questions` に入れる。
   - 元資料に EARS 形式の要件や Gherkin のテストケースがあれば、下の「要件・テストの取り込み」に従う。
2. **規模を決める**: 下の「規模別のセクション」から使うセクションを選ぶ。
3. **JSON を書く**: `docs/design/<slug>.design.json`（slug は英小文字とハイフン）。
   - フィールドは `references/schema.md` を見る。迷ったら `examples/login-rate-limit.design.json` を真似る。
4. **変換する**:
   ```
   node "<このスキルのフォルダ>/scripts/build.js" docs/design/<slug>.design.json
   ```
   → `docs/design/<slug>.html` ができる。Node.js 18 以上が必要（追加インストールは不要）。
5. **出力を確認する**:
   - `[ERROR]` があれば直して 4 をやり直す（HTML は作られていない）。
   - `[WARN]` もできるだけ直す（参照切れ・長すぎる要約など）。
6. **報告する**: HTML のパス、要点（tldr）、未決事項（questions）だけを短く伝える。
   初回だけ「直したい所は普通に文章で伝えても大丈夫です。画面で直したい文字を選択して『この箇所にメモ』→ 右上の『修正依頼』→『コピー』で貼り付けると、場所付きで正確に伝わります」と添える。

## 修正するとき（何度も繰り返すので、トークンを節約する）

ユーザーは HTML を見て修正を頼んでくる。毎回ファイル全体を読み書きしないこと。

**禁止**: JSON 全体を Read する／HTML を Read・スクリーンショットで確認する／JSON 全体を書き直す／設計全体の要約を報告し直す。

1. **場所を特定する**（ユーザーに場所の指定を求めない。自分で探す）
   - 画面からコピーされた依頼は次の形で届く。先頭がそのまま path、「」内が選択された文字。
     ```
     設計の修正依頼（docs/design/x.design.json）
     - components/rate-limiter/detail（RateLimiter）: 「30回失敗」→ 20回に
     - flows/login-fail/steps/3（ステップ 3）: ここで IP も確認する
     ```
   - 普通の文章の依頼（「閾値を10回にして」など）は、依頼の中の言葉で `find 閾値` を実行すると、その言葉を含む箇所の path が出る。
   - `find` で見つからないときだけ `outline`（目次）を見る。
   - 候補が複数あって決められないときだけ、候補の path を並べてユーザーに聞く。
2. **必要な所だけ読む**: `get <path>`（複数可）。
3. **直す**: 1つなら `set` / `add` / `rm` / `rename`、2つ以上なら `apply` で1回にまとめる。保存と HTML 再生成は自動。
4. **報告する**: 変えた内容を1〜3行で。HTML は同じパスに上書きされるので「ブラウザを再読み込みしてください」とだけ伝える。

```
E='node "<このスキルのフォルダ>/scripts/edit.js" docs/design/x.design.json'
$E find 閾値            # 言葉から場所を探す
$E outline              # 目次（find で見つからないとき）
$E get components/rate-limiter flows/login-fail/steps/3
$E set components/rate-limiter/summary "失敗回数を数え、10回でロックする"
$E apply - <<'EOF'
[
 {"op": "set", "path": "components/rate-limiter/detail", "value": "- アカウント: 10回失敗で15分ロック"},
 {"op": "add", "path": "flows/login-fail/steps", "at": 4, "value": {"from": "rate-limiter", "to": "redis", "label": "IP のロック確認"}},
 {"op": "add", "path": "tasks", "value": {"id": "t6", "title": "監視アラートを追加", "dependsOn": ["t5"]}},
 {"op": "rm", "path": "risks/r-redis-down"},
 {"op": "rename", "path": "components/rate-limiter", "to": "limiter"}
]
EOF
```

- path は `セクション/キー/フィールド`。キーは id、id がなければ 1 始まりの番号（画面の表示と同じ）。
  テストのステップは `features/f-login/scenarios/s-lock/steps/3`、要件は `requirements/REQ-001/text`。
- value は JSON として読めれば JSON、読めなければ文字列。数字を文字列にしたいときは `'"5"'`。
- id を変えるときは必ず `rename`（edges や tasks、verifies などの参照も一緒に直る）。シナリオは `rename features/<id>/scenarios/<id> <新id>`。
- 1つでも失敗すると何も保存されない。エラーに候補の id が出るので、それを見て直す。
- `<<'EOF'` が使えないシェル（PowerShell）では、ops を小さな JSON ファイルに書いて `apply ops.json`。
- 構成をほぼ作り直すような大きな変更のときだけ、JSON を Write で書き直してよい。

**HTML を直接編集しない。** 変更はすべて JSON に対して行う。

## 規模別のセクション

| 規模 | 例 | 使うセクション |
|---|---|---|
| 小 | バグ修正、1〜3ファイルの変更 | meta, overview, components, tasks |
| 中 | 機能追加、APIの追加 | 小 + edges, flows, apis, risks, questions |
| 大 | 新サービス、DB設計を含む | 中 + layers, entities, relations, decisions |

規模に関係なく、元資料に要件（EARS）があれば `requirements`、テストケース（Gherkin）があれば `features` を足す。

使わないセクションはキーごと省く（空配列も書かない）。ナビから自動で消える。

## 要件・テストの取り込み（EARS / Gherkin）

要件とテストケースは「設計の要約」ではなく「仕様の原文」として扱う。下のルールは「書き方ルール」の 1・3・8（短くする・数を絞る・ユーザーの言語で書く）より優先する。

1. **原文のまま写す**: `requirements[].text` と Gherkin の各ステップは、元資料の文を一字一句そのまま書く。要約・言い換え・翻訳・統合・分割をしない。件数も減らさない（build.js は長さ・件数の警告を出さない）。
2. **ID は元資料のまま**: `REQ-001` のような ID があれば、そのまま `id` にする（英小文字に直さない）。ID がない場合だけ自分で付ける。
3. **EARS の pattern を付ける**: 文の形から `ubiquitous`（常時）/ `event`（When・〜とき）/ `state`（While・〜の間）/ `unwanted`（If…then・〜場合）/ `optional`（Where）/ `complex`（複数の組み合わせ）を選ぶ。
4. **`.feature` ファイルがあるときは手で写さない**: 先に design.json（meta と requirements）を書いてから、スクリプトで取り込む。
   ```
   node "<このスキルのフォルダ>/scripts/import-gherkin.js" docs/design/<slug>.design.json tests/features
   ```
   - ファイルかフォルダを渡す（複数可）。保存と HTML 再生成は自動。`--dry` で保存せずに確認できる。
   - `@REQ-001` のように requirements の id と同じタグは、自動で `verifies` になる。それ以外の対応は `edit.js` の `set .../verifies` で足す。
   - `.feature` を直したら同じコマンドを再実行する。id と手で足した `verifies` は、シナリオ名が同じなら引き継がれる。「ファイルから消えたシナリオ」と出たら、名前が変わったシナリオの `verifies` を付け直す。
   - `[ERROR]` は元ファイルの構文の問題。元ファイルは勝手に直さず、ユーザーに行番号を伝える。
5. **Gherkin は構造に分けるだけ**（`.feature` ファイルがなく、文章の中に Gherkin があるとき）: Feature → `features`、Background → `background`、Scenario / Scenario Outline → `scenarios`、Examples → `examples`、Rule → `scenario.rule`。ステップは `前提` / `Given` などのキーワードを含めた 1 行をそのまま文字列にする。データ表と DocString はステップをオブジェクトにして `table` / `doc` に入れる。言語（日本語 / 英語）は元のまま。
6. **つなぐ**: シナリオがどの要件を確かめるかを `scenarios[].verifies` に、要件を実現するコンポーネントを `requirements[].components` に書く。元資料に対応が書かれていなければ、内容から判断して付け、判断に自信がないものは `questions` に入れる。
7. **元資料にないものを足さない**: テストケースが足りないと思ったら、シナリオを勝手に追加せず `risks` か `questions` に書く（ユーザーに頼まれたら追加してよい）。
8. **検証されていない要件の WARN** は、対応するシナリオが本当にないなら無視してよい。報告時に「シナリオのない要件: REQ-xxx」と一言添える。

画面では「要件」タブ（検証率・検証シナリオへのリンク）と「テスト」タブ（Given/When/Then の色分け、`.feature` 用テキストの出力）に表示される。

## 書き方ルール（読む人の負担を減らす）

1. **要約と詳細を分ける**: 各項目は `summary`（1行・40字目安）を必ず書く。説明が長くなるなら `detail` へ。`detail` は折りたたまれて表示される。
2. **最初に結論**: `overview.goal` は1文。`overview.tldr` は3つまで。
3. **数を絞る**: 1つの layer に 6 個まで。1つのフローは 12 ステップまで。超えるなら layer やフローを分ける。
4. **新旧を区別**: `components[].status` は `new`（新規）/ `changed`（変更）/ `existing`（既存・変更なし）。変更範囲が図の色で一目でわかる。
5. **id で参照**: id は英小文字とハイフン（`rate-limiter`。元資料の要件 ID は例外でそのまま）。`edges` / `tasks.components` / `tasks.dependsOn` / `apis.component` / `relations` / `requirements.components` / `scenarios.verifies` は必ず定義済みの id を使う。flows / apis / decisions / risks / questions にも id を付ける（修正時に path で指定できる）。
6. **実在の名前を使う**: コンポーネント名・ファイルパスはコード上の名前に合わせる。新規ファイルは作成予定のパスを書く。
7. **タスクは実装順**: `tasks` は上から実装する順に並べ、各タスクに `done_when`（完了条件）を書くとよい。
8. **ユーザーの言語で書く**: 中身はユーザーとの会話の言語で書く。

## detail などで使える書式

- 改行は `\n`。`- ` で始まる行は箇条書き。
- `` `code` `` はインラインコード、`**太字**`。
- コードブロックは ```` ``` ```` で囲む（JSON 文字列内なので改行は `\n`）。

## 最小の例

```json
{
  "meta": {"title": "CSVエクスポートの文字化け修正", "summary": "Excel で開くと文字化けする問題を BOM 付与で直す", "status": "draft"},
  "overview": {
    "goal": "Excel でそのまま開ける CSV を出力する",
    "tldr": ["出力時に UTF-8 BOM を付ける", "既存の API 形式は変えない"]
  },
  "components": [
    {"id": "export-service", "name": "ExportService", "layer": "ドメイン", "status": "changed",
     "summary": "CSV 生成時に BOM を先頭に付ける", "files": ["src/export/service.ts"]},
    {"id": "csv-writer", "name": "CsvWriter", "layer": "ドメイン", "status": "existing",
     "summary": "行の書き出し（変更なし）"}
  ],
  "edges": [{"from": "export-service", "to": "csv-writer", "label": "write()"}],
  "tasks": [
    {"id": "t1", "title": "BOM を付与する", "components": ["export-service"], "done_when": "Excel で開いて文字化けしない"},
    {"id": "t2", "title": "テスト追加", "dependsOn": ["t1"], "files": ["src/export/service.test.ts"]}
  ]
}
```

## よくある失敗

- JSON の末尾カンマ、文字列中の生の改行 → build.js が行番号つきで教えてくれる。
- `edges` にコンポーネントでない id（`user` など）を書く → 人やシステム外の登場人物は `actors` に定義し、`flows` の中でだけ使う。
- `summary` に長文 → 1行にして残りは `detail` へ。

node が使えない環境では: `assets/viewer.html` をコピーし、`<script type="application/json" id="design-data">` の中身を JSON に置き換える（JSON 中の `</` は `<\/` に置換）。
