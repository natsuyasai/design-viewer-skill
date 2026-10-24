#!/usr/bin/env node
/*
.feature（Gherkin）を読み、design.json の features に取り込む（手で写すと行が抜けるため。Node.js 標準機能のみ）。

  node import-gherkin.js <design.json> <file.feature | フォルダ> [...] [--dry] [--no-build]

- フォルダを渡すと、その下の *.feature をすべて読む。
- ステップ・表・DocString・タグは原文のまま取り込む（英語 / 日本語のキーワードに対応）。
- 同じ file（なければ同じ名前）の feature が既にあれば置き換える。
  そのとき id と、名前が同じシナリオの id・verifies・（説明がなければ）detail は引き継ぐ。
- タグが requirements の id と同じなら（例 @REQ-001）、そのシナリオの verifies に加える。
  Feature / Rule に付いたタグは、その下のシナリオすべてに効く。
--dry      : 保存せず、取り込み結果の要約だけ出す
--no-build : 保存後に HTML を再生成しない
1つでも構文エラーがあれば、何も保存しない。
*/
"use strict";
const fs = require("fs");
const path = require("path");
const { build, readJson } = require("./build.js");

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const USAGE = fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^#!.*\n\/\*\n?/, "");

// 見出しのキーワード（長いものを先に）。cucumber の gherkin-languages.json の en / ja より
const HEADS = [
  ["outline", ["Scenario Outline", "Scenario Template", "シナリオアウトライン", "シナリオテンプレート", "シナリオテンプレ", "テンプレ"]],
  ["feature", ["Feature", "Business Need", "Ability", "フィーチャ", "機能"]],
  ["background", ["Background", "背景"]],
  ["rule", ["Rule", "ルール"]],
  ["scenario", ["Scenario", "Example", "シナリオ"]],
  ["examples", ["Examples", "Scenarios", "サンプル", "例"]],
];
const HEAD_RE = HEADS.map(([kind, kws]) => [kind, new RegExp(`^(?:${kws.join("|")})\\s*[:：]\\s*(.*)$`)]);
const STEP_RE = /^(?:(?:Given|When|Then|And|But)\s|\*\s?|(?:前提|もし|ならば|且つ|かつ|然し|しかし|但し|ただし))/;

class ParseError extends Error {}

function cells(line) {
  const s = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const out = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    // Gherkin のエスケープは \| \\ \n だけ。それ以外の \ はそのまま残す
    if (c === "\\" && /[|\\n]/.test(s[i + 1] || "")) {
      const n = s[++i];
      cur += n === "n" ? "\n" : n;
    } else if (c === "|") { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** .feature の本文を features の1項目に変換する */
function parse(text, file) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const warns = [];
  const err = (i, msg) => new ParseError(`${file}:${i + 1}: ${msg}\n        > ${lines[i].trim().slice(0, 100)}`);
  let feature = null, cur = null, rule = null, tags = [], ruleTags = [];
  let steps = null, lastStep = null, ex = null, desc = null;
  let i = 0;
  const ruleDescs = [];
  for (; i < lines.length; i++) {
    const raw = lines[i], line = raw.trim();
    if (!line) { if (desc) desc.push(""); continue; }
    if (line.startsWith("#")) continue;

    // DocString
    const fence = /^("""|```)\s*(\S*)/.exec(line);
    if (fence) {
      if (!lastStep) throw err(i, "DocString の前にステップがありません");
      const indent = raw.length - raw.trimStart().length, body = [];
      for (i++; i < lines.length && lines[i].trim() !== fence[1]; i++) {
        const l = lines[i];
        body.push(l.slice(Math.min(indent, l.length - l.trimStart().length)).replace(/\\"\\"\\"/g, '"""'));
      }
      if (i >= lines.length) throw err(i - 1, `DocString の閉じ ${fence[1]} がありません`);
      steps[steps.length - 1] = { text: lastStep, ...(isObj(steps[steps.length - 1]) ? steps[steps.length - 1] : {}), doc: body.join("\n"), ...(fence[2] ? { docType: fence[2] } : {}) };
      continue;
    }

    // 表（ステップの表 / Examples）
    if (line.startsWith("|")) {
      if (ex) {
        if (!ex.header) ex.header = cells(line); else ex.rows.push(cells(line));
      } else if (lastStep) {
        const prev = isObj(steps[steps.length - 1]) ? steps[steps.length - 1] : { text: lastStep };
        prev.table = (prev.table || []).concat([cells(line)]);
        steps[steps.length - 1] = prev;
      } else throw err(i, "表の前にステップか Examples がありません");
      continue;
    }

    if (line.startsWith("@")) {
      tags.push(...line.split(/\s+(?=@)/).map((t) => t.replace(/\s+#.*$/, "").trim().replace(/^@/, "")).filter(Boolean));
      continue;
    }

    const head = HEAD_RE.map(([k, re]) => [k, re.exec(line)]).find(([, m]) => m);
    if (head) {
      const [kind, m] = head;
      const name = m[1].trim();
      lastStep = null; ex = null; desc = null;
      if (kind === "feature") {
        if (feature) throw err(i, "1つのファイルに Feature が2つあります");
        feature = { name, tags, scenarios: [] };
        desc = feature._desc = [];
      } else if (!feature) {
        throw err(i, "Feature より前に書かれています");
      } else if (kind === "background") {
        if (rule) {
          warns.push(`${file}:${i + 1}: Rule の中の Background は取り込めません（そのステップは取り込まれません）。必要なら各シナリオに書き足してください`);
          steps = [];
        } else { steps = feature.background = []; }
        cur = null;
      } else if (kind === "rule") {
        rule = name; ruleTags = tags; cur = null; steps = null;
        if (tags.length) warns.push(`${file}:${i + 1}: Rule のタグ ${tags.map((t) => "@" + t).join(" ")} は、requirements の id と同じものが verifies になるだけで、タグとしては残りません`);
        desc = []; ruleDescs.push([i, desc]);
      } else if (kind === "scenario" || kind === "outline") {
        cur = { name, tags, _inherit: [...feature.tags, ...ruleTags], steps: [] };
        if (rule) cur.rule = rule;
        feature.scenarios.push(cur);
        steps = cur.steps;
        desc = cur._desc = [];
      } else if (kind === "examples") {
        if (!cur) throw err(i, "Examples の前に Scenario Outline がありません");
        ex = { header: null, rows: [] };
        if (name) ex.name = name;
        if (tags.length) ex.tags = tags;
        (cur.examples = cur.examples || []).push(ex);
      }
      tags = [];
      continue;
    }

    if (steps && STEP_RE.test(line)) {
      desc = null;
      steps.push(line);
      lastStep = line;
      continue;
    }
    if (desc) { desc.push(line); continue; }
    throw err(i, "解釈できない行です（ステップは Given / When / Then / And / But か 前提 / もし / ならば / かつ / しかし で始める）");
  }
  if (!feature) throw new ParseError(`${file}: Feature がありません`);
  for (const [at, d] of ruleDescs) if (d.some((x) => x)) warns.push(`${file}:${at + 1}: Rule の説明文は取り込まれません`);

  const text2 = (a) => (a || []).join("\n").trim();
  feature.description = text2(feature._desc);
  for (const sc of feature.scenarios) {
    sc.detail = text2(sc._desc);
    for (const e of sc.examples || []) if (!e.header) e.header = [];
  }
  return { feature, warns };
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const tagName = (t) => String(t).replace(/^@/, "");

/** 解析結果を design.json の形に整え、既存の feature があれば id などを引き継ぐ */
function toFeature(parsed, file, data, old) {
  const reqIds = new Set((Array.isArray(data.requirements) ? data.requirements : []).filter(isObj).map((r) => String(r.id)));
  const oldSc = old && Array.isArray(old.scenarios) ? old.scenarios.filter(isObj) : [];
  const f = { id: old ? old.id : null, name: parsed.name };
  if (parsed.description) f.description = parsed.description;
  f.file = file;
  if (parsed.tags.length) f.tags = parsed.tags;
  if (parsed.background && parsed.background.length) f.background = parsed.background;
  // 1回目: 名前が同じ既存シナリオを先にすべて対応づける（新しいシナリオが既存の id を奪わないように）
  const claimed = new Set();
  const prevs = parsed.scenarios.map((p) => {
    const o = oldSc.find((x) => x.name === p.name && !claimed.has(x));
    if (o) claimed.add(o);
    return o || null;
  });
  const reserved = new Set(oldSc.map((o) => String(o.id)));
  const used = new Set();
  const tagReqs = (tags) => new Set((tags || []).map(tagName).filter((n) => reqIds.has(n)));
  const oldFeatTags = old && Array.isArray(old.tags) ? old.tags : [];
  // 2回目: id を決める。対応のないシナリオには、既存のどの id とも重ならない id を付ける
  f.scenarios = parsed.scenarios.map((p, idx) => {
    const prev = prevs[idx];
    let id;
    if (prev && prev.id != null && !used.has(String(prev.id))) id = String(prev.id);
    else {
      const taken = (x) => used.has(x) || reserved.has(x);
      id = slug(p.name);
      if (!id || id.length > 40) {
        let n = idx + 1;
        while (taken(`s${n}`)) n++;
        id = `s${n}`;
      }
      while (taken(id)) id += "-2";
    }
    used.add(id);
    const sc = { id, name: p.name };
    if (p.tags.length) sc.tags = p.tags;
    if (p.rule) sc.rule = p.rule;
    // 手で足した verifies は残す。タグ由来のものは、タグが消えたら外す
    const nowTag = tagReqs([...p._inherit, ...p.tags]);
    const wasTag = prev ? tagReqs([...oldFeatTags, ...(Array.isArray(prev.tags) ? prev.tags : [])]) : new Set();
    const verifies = (prev && Array.isArray(prev.verifies) ? prev.verifies : []).filter((v) => !(wasTag.has(v) && !nowTag.has(v)));
    for (const n of nowTag) if (!verifies.includes(n)) verifies.push(n);
    if (verifies.length) sc.verifies = verifies;
    sc.steps = p.steps;
    if (p.examples) sc.examples = p.examples;
    const detail = p.detail || (prev && prev.detail);
    if (detail) sc.detail = detail;
    return sc;
  });
  const dropped = oldSc.filter((o) => !claimed.has(o)).map((o) => o.name || o.id);
  return { f, dropped };
}

function collect(args) {
  const out = [];
  const walk = (p) => {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      for (const n of fs.readdirSync(p).sort()) if (n !== "node_modules" && !n.startsWith(".")) walk(path.join(p, n));
    } else if (p.endsWith(".feature")) out.push(p);
  };
  for (const a of args) {
    if (!fs.existsSync(a)) throw new ParseError(`${a} がありません`);
    if (fs.statSync(a).isFile()) out.push(a); else walk(a);
  }
  return out;
}

function main() {
  let argv = process.argv.slice(2);
  const dry = argv.includes("--dry"), noBuild = argv.includes("--no-build");
  argv = argv.filter((a) => a !== "--dry" && a !== "--no-build");
  if (argv.length < 2) { console.log(USAGE); return 1; }
  const [src, ...inputs] = argv;

  let data;
  try {
    data = fs.existsSync(src) ? readJson(src) : null;
  } catch (e) {
    console.log(`[ERROR] ${src} を読めません: ${e.message}`);
    return 1;
  }
  if (!isObj(data)) { console.log(`[ERROR] ${src} がありません（先に design.json を作ってください）`); return 1; }

  let files;
  const results = [];
  try {
    files = collect(inputs);
    if (!files.length) throw new ParseError(".feature ファイルが見つかりません");
    for (const file of files) {
      const rel = path.relative(process.cwd(), path.resolve(file)).replace(/\\/g, "/");
      results.push({ rel, ...parse(fs.readFileSync(file, "utf8"), rel) });
    }
  } catch (e) {
    if (!(e instanceof ParseError)) throw e;
    console.log(`[ERROR] ${e.message}`);
    console.log("        何も保存していません。直して再実行してください。");
    return 1;
  }

  const feats = Array.isArray(data.features) ? data.features : (data.features = []);
  const taken = new Set(feats.filter(isObj).map((f) => String(f.id)));
  for (const { rel, feature, warns } of results) {
    for (const w of warns) console.log(`[WARN]  ${w}`);
    const at = feats.findIndex((f) => isObj(f) && f.file === rel);
    const i = at >= 0 ? at : feats.findIndex((f) => isObj(f) && !f.file && f.name === feature.name);
    const { f, dropped } = toFeature(feature, rel, data, i >= 0 ? feats[i] : null);
    if (!f.id) {
      const base = slug(path.basename(rel, ".feature")) || String(feats.length + 1);
      let id = base.startsWith("f-") ? base : "f-" + base;
      while (taken.has(id)) id += "-2";
      f.id = id;
    }
    taken.add(f.id);
    if (i >= 0) feats[i] = f; else feats.push(f);
    const nv = f.scenarios.filter((s) => s.verifies).length;
    console.log(`[${i >= 0 ? "更新" : "追加"}] features/${f.id}  ${rel}  シナリオ ${f.scenarios.length}（verifies あり ${nv}）`);
    if (dropped.length) console.log(`        ファイルから消えたシナリオ: ${dropped.join(", ")}`);
  }
  if (dry) { console.log("--dry のため保存していません"); return 0; }
  fs.writeFileSync(src, JSON.stringify(data, null, 2) + "\n", "utf8");
  if (noBuild) return 0;
  return build(src, null, true);
}

module.exports = { parse };

if (require.main === module) process.exitCode = main();
