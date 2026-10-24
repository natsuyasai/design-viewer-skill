#!/usr/bin/env node
/*
design.json を部分的に読む・直す（全体を読み直さずに済ませるため。Node.js 標準機能のみ）。

  node edit.js <design.json> outline                 目次（id と名前を1行ずつ）
  node edit.js <design.json> find <語> [<語>...]     語を含む箇所の path を探す（場所が書かれていない依頼用）
  node edit.js <design.json> get <path> [<path>...]  指定した項目だけ表示
  node edit.js <design.json> set <path> <value>      値を置き換える（なければ作る）
  node edit.js <design.json> add <path> <value> [--at N]  配列に追加（N番目に挿入）
  node edit.js <design.json> rm <path>               削除
  node edit.js <design.json> rename <sec>/<id> <新id> id を変え、参照もすべて直す
  node edit.js <design.json> apply <ops.json | ->    複数の操作をまとめて実行（- は標準入力）

path  : セクション/キー/フィールド
        例 components/rate-limiter/summary  flows/login-fail/steps/3  overview/tldr  risks/r1
        キー = id（あれば）または 1 始まりの番号（画面の表示と同じ）
value : JSON として読めればその値、読めなければ文字列として扱う
ops   : [{"op":"set","path":"...","value":...}, {"op":"add","path":"...","value":...,"at":2},
         {"op":"rm","path":"..."}, {"op":"rename","path":"components/old","to":"new"}]
変更系の操作は、保存後に HTML を自動で再生成する（--no-build で抑止）。
1つでも失敗した操作があれば、何も保存しない。
*/
"use strict";
const fs = require("fs");
const { build, readJson } = require("./build.js");

class OpError extends Error {}
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const USAGE = fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^#!.*\n\/\*\n?/, "");

function segs(p) {
  const s = String(p == null ? "" : p).trim().replace(/^\/+|\/+$/g, "").split("/").filter((x) => x !== "");
  if (!s.length) throw new OpError("path が空です");
  return s;
}

function findIndex(lst, seg) {
  const i = lst.findIndex((x) => isObj(x) && x.id != null && String(x.id) === seg);
  if (i >= 0) return i;
  if (/^\d+$/.test(seg) && +seg >= 1 && +seg <= lst.length) return +seg - 1;
  const ids = lst.filter((x) => isObj(x) && x.id != null).map((x) => String(x.id));
  const hint = ids.length ? `（id: ${ids.slice(0, 12).join(", ")}）` : `（1〜${lst.length}）`;
  throw new OpError(`"${seg}" が見つかりません ${hint}`);
}

function child(node, seg, where, create = false) {
  if (Array.isArray(node)) return node[findIndex(node, seg)];
  if (isObj(node)) {
    if (!(seg in node)) {
      if (create) node[seg] = {};
      else throw new OpError(`${where}: "${seg}" がありません（キー: ${Object.keys(node).slice(0, 15).join(", ")}）`);
    }
    return node[seg];
  }
  throw new OpError(`${where} は配列でもオブジェクトでもありません`);
}

function walk(data, parts, create = false) {
  let node = data;
  const done = [];
  for (const p of parts) {
    node = child(node, p, done.join("/") || "(ルート)", create);
    done.push(p);
  }
  return node;
}

function parseValue(v) {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch (e) { return v; }
}

function opSet(data, p, value) {
  const s = segs(p);
  const parent = walk(data, s.slice(0, -1), true);
  const last = s[s.length - 1];
  if (Array.isArray(parent)) parent[findIndex(parent, last)] = value;
  else if (isObj(parent)) parent[last] = value;
  else throw new OpError(`${s.slice(0, -1).join("/")} には値を設定できません`);
}

function opAdd(data, p, value, at) {
  const s = segs(p);
  const parent = walk(data, s.slice(0, -1), true);
  const last = s[s.length - 1];
  if (isObj(parent) && !(last in parent)) parent[last] = [];
  const target = child(parent, last, s.slice(0, -1).join("/") || "(ルート)");
  if (!Array.isArray(target)) throw new OpError(`${p} は配列ではありません（値の変更は set）`);
  if (isObj(value) && value.id != null && target.some((x) => isObj(x) && x.id === value.id)) {
    throw new OpError(`${p}: id "${value.id}" は既にあります`);
  }
  if (at == null) target.push(value);
  else target.splice(Math.max(0, parseInt(at, 10) - 1), 0, value);
}

function opRm(data, p) {
  const s = segs(p);
  const parent = walk(data, s.slice(0, -1));
  const last = s[s.length - 1];
  if (Array.isArray(parent)) parent.splice(findIndex(parent, last), 1);
  else if (isObj(parent)) {
    if (!(last in parent)) throw new OpError(`"${last}" がありません`);
    delete parent[last];
  }
}

function opRename(data, p, to) {
  const s = segs(p);
  if (s.length !== 2) throw new OpError("rename の path は <セクション>/<id> の形にしてください");
  if (to == null || to === "") throw new OpError("新しい id を指定してください");
  const [sec] = s;
  const lst = data[sec];
  if (!Array.isArray(lst)) throw new OpError(`${sec} がありません`);
  const item = lst[findIndex(lst, s[1])];
  const old = item.id;
  if (lst.some((x) => isObj(x) && x.id === to)) throw new OpError(`id "${to}" は既にあります`);
  item.id = to;
  let n = 0;
  const fix = (obj, key) => {
    if (!isObj(obj)) return;
    const v = obj[key];
    if (v === old) { obj[key] = to; n++; }
    else if (Array.isArray(v) && v.includes(old)) { obj[key] = v.map((x) => (x === old ? to : x)); n++; }
  };
  const L = (k) => (Array.isArray(data[k]) ? data[k] : []);
  if (sec === "components" || sec === "actors") {
    for (const e of L("edges")) { fix(e, "from"); fix(e, "to"); }
    for (const f of L("flows")) {
      fix(f, "participants");
      for (const st of (isObj(f) && Array.isArray(f.steps) ? f.steps : [])) { fix(st, "from"); fix(st, "to"); }
    }
    for (const t of L("tasks")) fix(t, "components");
    for (const a of L("apis")) fix(a, "component");
  } else if (sec === "entities") {
    for (const r of L("relations")) { fix(r, "from"); fix(r, "to"); }
  } else if (sec === "tasks") {
    for (const t of L("tasks")) fix(t, "dependsOn");
  }
  return n;
}

function runOp(data, op) {
  if (!isObj(op)) throw new OpError("操作は {\"op\": ..., \"path\": ...} の形にしてください");
  const { op: kind, path: p } = op;
  if (kind === "set") opSet(data, p, op.value);
  else if (kind === "add") opAdd(data, p, op.value, op.at);
  else if (kind === "rm") opRm(data, p);
  else if (kind === "rename") return `rename ${p} → ${op.to}（参照 ${opRename(data, p, op.to)} 箇所も更新）`;
  else throw new OpError(`op "${kind}" は使えません（set / add / rm / rename）`);
  return `${kind} ${p}`;
}

function label(x) {
  if (!isObj(x)) return String(x).slice(0, 50);
  for (const k of ["name", "title", "q", "label", "path", "signature"]) if (x[k]) return String(x[k]).slice(0, 50);
  return "";
}

function find(data, words, limit = 15) {
  words = words.map((w) => w.toLowerCase()).filter((w) => w.trim());
  const leaves = [];
  (function rec(v, p) {
    if (Array.isArray(v)) v.forEach((x, i) => rec(x, `${p}/${isObj(x) && x.id != null ? x.id : i + 1}`));
    else if (isObj(v)) for (const [k, x] of Object.entries(v)) rec(x, p ? `${p}/${k}` : k);
    else if (typeof v === "string" || typeof v === "number") leaves.push([p, String(v)]);
  })(data, "");
  const has = (p, t, w) => t.toLowerCase().includes(w) || p.toLowerCase().includes(w);
  let hits = leaves.filter(([p, t]) => words.every((w) => has(p, t, w)));
  if (!hits.length) hits = leaves.filter(([p, t]) => words.some((w) => has(p, t, w)));
  const out = hits.slice(0, limit).map(([p, t]) => {
    const tl = t.toLowerCase();
    const ps = words.map((w) => tl.indexOf(w)).filter((i) => i >= 0);
    const start = Math.max(0, (ps.length ? Math.min(...ps) : 0) - 20);
    const snip = t.slice(start, start + 60).replace(/\n/g, " ");
    return `${p}  ${start ? "…" : ""}${snip}${start + 60 < t.length ? "…" : ""}`;
  });
  if (hits.length > limit) out.push(`…ほか ${hits.length - limit} 件（語を増やして絞る）`);
  return out.join("\n") || "見つかりません（outline で目次を確認）";
}

function outline(data) {
  const out = [];
  const m = isObj(data.meta) ? data.meta : {};
  out.push(`meta: ${m.title || ""} [${m.status || "-"}]`);
  const ov = isObj(data.overview) ? data.overview : {};
  if (Object.keys(ov).length) {
    out.push("overview: " + Object.entries(ov).map(([k, v]) => (Array.isArray(v) ? `${k} ${v.length}` : `${k} ✓`)).join(" / "));
  }
  if (Array.isArray(data.layers) && data.layers.length) out.push("layers: " + data.layers.join(" > "));
  for (const sec of ["actors", "components", "edges", "flows", "entities", "relations",
    "apis", "decisions", "risks", "questions", "tasks"]) {
    const lst = data[sec];
    if (!Array.isArray(lst) || !lst.length) continue;
    out.push(`${sec} (${lst.length})`);
    lst.forEach((x, i) => {
      if (!isObj(x)) return;
      let key = x.id != null ? x.id : i + 1, extra = "", name;
      if (sec === "components") extra = "  " + [x.layer, x.status].filter(Boolean).join("/");
      else if (sec === "edges" || sec === "relations") { key = i + 1; extra = `  ${x.from} → ${x.to}`; }
      else if (sec === "flows") extra = `  ${(x.steps || []).length} steps`;
      else if (sec === "entities") extra = `  ${(x.fields || []).length} fields`;
      else if (sec === "apis") extra = "  " + String(x.summary || "").slice(0, 40);
      else if (sec === "risks") extra = `  [${x.level || "-"}]`;
      else if (sec === "tasks" && Array.isArray(x.dependsOn) && x.dependsOn.length) extra = "  ← " + x.dependsOn.join(",");
      if (sec === "edges" || sec === "relations") name = x.label || x.type || "";
      else if (sec === "apis") name = [x.method, x.path || x.signature].filter(Boolean).join(" ").slice(0, 60);
      else name = label(x);
      out.push(`  ${key}  ${name}${extra}`);
    });
  }
  return out.join("\n");
}

function main() {
  let argv = process.argv.slice(2);
  const noBuild = argv.includes("--no-build");
  argv = argv.filter((a) => a !== "--no-build");
  let at = null;
  const ai = argv.indexOf("--at");
  if (ai >= 0) { at = argv[ai + 1]; argv.splice(ai, 2); }
  if (argv.length < 2) { console.log(USAGE); return 1; }
  const [src, cmd, ...rest] = argv;
  let data;
  try {
    data = readJson(src);
  } catch (e) {
    console.log(`[ERROR] ${src} を読めません: ${e.message}`);
    if (e.lineText) console.log(`        > ${e.lineText}`);
    return 1;
  }

  let ops;
  try {
    if (cmd === "outline") { console.log(outline(data)); return 0; }
    if (cmd === "find") {
      if (!rest.length) throw new OpError("find <語> を指定してください");
      console.log(find(data, rest));
      return 0;
    }
    if (cmd === "get") {
      if (!rest.length) throw new OpError("get <path> を指定してください");
      for (const p of rest) {
        console.log(`# ${p}`);
        console.log(JSON.stringify(walk(data, segs(p)), null, 1));
      }
      return 0;
    }
    if (cmd === "set" && rest.length === 2) ops = [{ op: "set", path: rest[0], value: parseValue(rest[1]) }];
    else if (cmd === "add" && rest.length === 2) ops = [{ op: "add", path: rest[0], value: parseValue(rest[1]), at }];
    else if (cmd === "rm" && rest.length === 1) ops = [{ op: "rm", path: rest[0] }];
    else if (cmd === "rename" && rest.length === 2) ops = [{ op: "rename", path: rest[0], to: rest[1] }];
    else if (cmd === "apply" && rest.length === 1) {
      const raw = (rest[0] === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(rest[0], "utf8")).replace(/^﻿/, "");
      try { ops = JSON.parse(raw); } catch (e) { throw new OpError(`ops の JSON が読めません: ${e.message}`); }
      if (!Array.isArray(ops)) ops = [ops];
    } else { console.log(USAGE); return 1; }
  } catch (e) {
    if (!(e instanceof OpError)) throw e;
    console.log(`[ERROR] ${e.message}`);
    return 1;
  }

  const msgs = [];
  for (let i = 0; i < ops.length; i++) {
    try {
      msgs.push(runOp(data, ops[i]));
    } catch (e) {
      if (!(e instanceof OpError)) throw e;
      const op = ops[i] || {};
      console.log(`[ERROR] 操作 ${i + 1}（${op.op} ${op.path}）: ${e.message}`);
      console.log("        何も保存していません。直して再実行してください。");
      return 1;
    }
  }
  fs.writeFileSync(src, JSON.stringify(data, null, 2) + "\n", "utf8");
  for (const m of msgs) console.log(`[変更] ${m}`);
  if (noBuild) return 0;
  return build(src, null, true);
}

process.exitCode = main();
