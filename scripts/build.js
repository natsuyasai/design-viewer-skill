#!/usr/bin/env node
/*
設計 JSON を検証し、ビューア HTML に埋め込んで出力する（Node.js 標準機能のみ）。

使い方:
    node build.js <design.json> [出力.html] [-q]

出力先を省略すると <design.json と同じ場所>/<名前から .design を除いたもの>.html
-q: 成功時は1行だけ出す（件数を省略）
終了コード: 0 = 成功（WARN があっても成功）、1 = ERROR
*/
"use strict";
const fs = require("fs");
const path = require("path");

const TEMPLATE = path.join(__dirname, "..", "assets", "viewer.html");
const LIST_KEYS = ["actors", "components", "edges", "flows", "entities", "relations",
  "apis", "decisions", "risks", "questions", "tasks", "layers"];
const ENUMS = [
  ["meta", "status", ["draft", "review", "approved"]],
  ["components", "status", ["new", "changed", "existing"]],
  ["entities", "status", ["new", "changed", "existing"]],
  ["risks", "level", ["high", "mid", "low"]],
  ["decisions", "status", ["decided", "proposed"]],
];

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const asList = (v) => (v == null || v === "" ? [] : Array.isArray(v) ? v : [v]);
const list = (d, k) => (Array.isArray(d[k]) ? d[k] : []);

function validate(d) {
  const errors = [], warns = [];
  if (!isObj(d)) return [["トップレベルはオブジェクト {...} にしてください"], warns];
  const meta = isObj(d.meta) ? d.meta : {};
  if (!meta.title) errors.push("meta.title は必須です");
  for (const k of LIST_KEYS) {
    if (k in d && !Array.isArray(d[k])) errors.push(`${k} は配列 [...] にしてください`);
  }
  if (errors.length) return [errors, warns];

  const ids = (key, required = true) => {
    const seen = new Set();
    list(d, key).forEach((x, i) => {
      if (!isObj(x)) { errors.push(`${key}[${i}] はオブジェクトにしてください`); return; }
      if (x.id == null) { if (required) errors.push(`${key}[${i}] に id がありません`); return; }
      if (seen.has(x.id)) errors.push(`${key}: id "${x.id}" が重複しています`);
      seen.add(x.id);
    });
    return seen;
  };
  const comp = ids("components"), ent = ids("entities"), task = ids("tasks");
  ids("flows", false);
  const chk = (cond, msg) => { if (!cond) warns.push(msg); };
  const items = (k) => list(d, k).filter(isObj);

  for (const e of items("edges")) {
    chk(comp.has(e.from), `edges: from "${e.from}" が components にありません`);
    chk(comp.has(e.to), `edges: to "${e.to}" が components にありません`);
  }
  for (const r of items("relations")) {
    chk(ent.has(r.from), `relations: from "${r.from}" が entities にありません`);
    chk(ent.has(r.to), `relations: to "${r.to}" が entities にありません`);
  }
  for (const a of items("apis")) {
    if (a.component) chk(comp.has(a.component), `apis: component "${a.component}" が components にありません`);
  }
  for (const t of items("tasks")) {
    for (const x of asList(t.dependsOn)) chk(task.has(x), `tasks "${t.id}": dependsOn "${x}" が tasks にありません`);
    for (const x of asList(t.components)) chk(comp.has(x), `tasks "${t.id}": components "${x}" が components にありません`);
  }
  for (const f of items("flows")) {
    const steps = asList(f.steps);
    chk(steps.length, `flows "${f.id || f.name}": steps が空です`);
    steps.forEach((s, i) => chk(s && s.from && s.to, `flows "${f.id}": steps[${i}] に from / to がありません`));
  }
  for (const [key, field, allowed] of ENUMS) {
    const xs = key === "meta" ? [meta] : items(key);
    for (const x of xs) {
      const v = x[field];
      if (v != null && !allowed.includes(v)) warns.push(`${key}.${field}: "${v}" は ${allowed.join(" / ")} のいずれかにしてください`);
    }
  }

  // 認知負荷の目安
  const ov = isObj(d.overview) ? d.overview : {};
  chk(ov.goal, "overview.goal（目的の1文）を書いてください");
  chk(asList(ov.tldr).length <= 3, "overview.tldr は3つまでにしてください");
  const rows = {};
  for (const c of items("components")) {
    chk(c.summary, `components "${c.id}": summary（1行要約）がありません`);
    chk(String(c.summary || "").length <= 60, `components "${c.id}": summary が長すぎます（60字以内、詳細は detail へ）`);
    const l = c.layer || "その他";
    rows[l] = (rows[l] || 0) + 1;
  }
  for (const [l, n] of Object.entries(rows)) {
    chk(n <= 6, `layer "${l}" に ${n} 個あります（6個以内推奨。layer を分けると図が読みやすい）`);
  }
  for (const f of items("flows")) {
    chk(asList(f.steps).length <= 12, `flows "${f.id}": ステップが多すぎます（12以内推奨、フローを分割）`);
  }
  for (const k of ["components", "tasks"]) {
    chk(list(d, k).length <= 20, `${k} が ${list(d, k).length} 件あります（多すぎる場合はまとめてください）`);
  }
  for (const k of ["flows", "apis", "decisions", "risks", "questions"]) {
    const n = items(k).filter((x) => x.id == null).length;
    chk(n === 0, `${k}: id のない項目が ${n} 件（id があると修正時にパスで指定しやすい）`);
  }
  return [errors, warns];
}

function readJson(src) {
  const text = fs.readFileSync(src, "utf8").replace(/^﻿/, "");
  try {
    return JSON.parse(text);
  } catch (e) {
    let line = 0, col = 0;
    const lc = /line (\d+) column (\d+)/.exec(e.message);
    const pos = /position (\d+)/.exec(e.message);
    if (lc) { line = +lc[1]; col = +lc[2]; }
    else if (pos) {
      const before = text.slice(0, +pos[1]).split("\n");
      line = before.length; col = before[before.length - 1].length + 1;
    }
    const err = new Error(`JSON 構文エラー${line ? ` ${line}行 ${col}列` : ""}: ${e.message.replace(/\s*\(line.*$/, "")}`);
    err.lineText = line ? (text.split("\n")[line - 1] || "").trim().slice(0, 120) : "";
    err.isSyntax = true;
    throw err;
  }
}

function defaultOut(src) {
  const p = path.parse(src);
  return path.join(p.dir, p.name.replace(/\.design$/, "") + ".html");
}

/** src の JSON を検証して HTML を書き出す。戻り値は終了コード。 */
function build(src, out, quiet = false) {
  out = out || defaultOut(src);
  let data;
  try {
    data = readJson(src);
  } catch (e) {
    if (e.isSyntax) {
      console.log(`[ERROR] ${e.message}`);
      if (e.lineText) console.log(`        > ${e.lineText}`);
      console.log("        (よくある原因: 末尾のカンマ / 文字列内の改行は \\n / ダブルクォート)");
    } else {
      console.log(`[ERROR] 読み込めません: ${e.message}`);
    }
    return 1;
  }
  const [errors, warns] = validate(data);
  for (const w of warns) console.log(`[WARN]  ${w}`);
  for (const e of errors) console.log(`[ERROR] ${e}`);
  if (errors.length) {
    console.log(`失敗: ERROR ${errors.length} 件。修正して再実行してください。`);
    return 1;
  }

  const tpl = fs.readFileSync(TEMPLATE, "utf8");
  const embed = Object.assign({}, data, { _source: String(src).replace(/\\/g, "/") });
  const payload = JSON.stringify(embed, null, 1).replace(/<\//g, "<\\/");
  const pat = /(<script type="application\/json" id="design-data">)([\s\S]*?)(<\/script>)/;
  if (!pat.test(tpl)) {
    console.log("[ERROR] テンプレートにデータ埋め込み位置が見つかりません");
    return 1;
  }
  const html = tpl.replace(pat, (m, a, b, c) => `${a}\n${payload}\n${c}`);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, html, "utf8");

  console.log(`[OK] ${out}` + (warns.length ? `（WARN ${warns.length} 件）` : ""));
  if (!quiet) {
    const counts = LIST_KEYS.filter((k) => k !== "layers" && Array.isArray(data[k]) && data[k].length)
      .map((k) => `${k} ${data[k].length}`).join(", ");
    console.log(`     ${counts}`);
  }
  return 0;
}

module.exports = { build, validate, readJson };

if (require.main === module) {
  const args = process.argv.slice(2).filter((a) => a !== "-q");
  if (!args.length) {
    console.log("使い方: node build.js <design.json> [出力.html] [-q]");
    process.exit(1);
  }
  process.exit(build(args[0], args[1], process.argv.includes("-q")));
}
