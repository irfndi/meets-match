#!/usr/bin/env node
// Extract anti-slop findings grouped by file with rule, line, col, and context.
import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2];
const out = process.argv[3];
const txt = readFileSync(input, "utf8");
const lines = txt.split("\n");

const findings = [];
let curFile = null;
let curRule = null;
let curLine = null;
let curMsg = null;

for (const line of lines) {
  const fileMatch = line.match(/,-\[([^:]+):(\d+):(\d+)/);
  if (fileMatch) {
    curFile = fileMatch[1].trim();
    curLine = { line: Number(fileMatch[2]), col: Number(fileMatch[3]) };
    continue;
  }
  const ruleMatch = line.match(/anti-slop\(([a-z-]+)\):\s*(.*)/);
  if (ruleMatch) {
    curRule = ruleMatch[1];
    curMsg = ruleMatch[2].trim();
    if (curFile && curLine) {
      findings.push({ file: curFile, rule: curRule, ...curLine, msg: curMsg });
    }
    continue;
  }
}

// group by file
const byFile = new Map();
for (const f of findings) {
  if (!byFile.has(f.file)) byFile.set(f.file, []);
  byFile.get(f.file).push(f);
}

const outLines = [];
for (const [file, list] of [...byFile.entries()].sort(
  (a, b) => b[1].length - a[1].length,
)) {
  outLines.push(`## ${file} (${list.length})`);
  for (const f of list) {
    outLines.push(`  ${f.rule} @ ${f.line}:${f.col} -- ${f.msg.slice(0, 120)}`);
  }
  outLines.push("");
}

const result = outLines.join("\n");
if (out) writeFileSync(out, result);
console.log(`Total findings: ${findings.length}`);
console.log(result.slice(0, 4000));