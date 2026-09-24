import assert from "node:assert/strict";
import { parsePhrases, stripMarkdown } from "../src/parser.ts";

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log("parser tests");

test("去掉 frontmatter", () => {
  const input = "---\ncardwall: true\ncreated: 2026-01-01\n---\n你好世界\n";
  assert.deepEqual(parsePhrases(input), ["你好世界"]);
});

test("忽略标题与分隔线", () => {
  const input = "# 标题\n\n## 小标题\n\n第一条\n\n---\n\n第二条\n";
  assert.deepEqual(parsePhrases(input), ["第一条", "第二条"]);
});

test("去掉列表符号与加粗/链接", () => {
  const input = "- **重要**的事\n1. [链接](https://x.com)文字\n> 引用一句\n";
  assert.deepEqual(parsePhrases(input), ["重要的事", "链接文字", "引用一句"]);
});

test("忽略空行与多余空白", () => {
  const input = "\n\n  第一行  \n\n\n第二行\n\n";
  assert.deepEqual(parsePhrases(input), ["第一行", "第二行"]);
});

test("忽略围栏代码块", () => {
  const input = "保留这句\n\n```js\nconst a = 1;\nconsole.log(a);\n```\n\n还有这句\n";
  assert.deepEqual(parsePhrases(input), ["保留这句", "还有这句"]);
});

test("最短/最长长度过滤", () => {
  const input = "一\n正常长度的一句\n这是一句特别特别长的句子用来测试最长长度过滤功能是否生效\n";
  assert.deepEqual(parsePhrases(input, { minLength: 2, maxLength: 10 }), ["正常长度的一句"]);
});

test("去重", () => {
  const input = "重复\n重复\n唯一\n";
  assert.deepEqual(parsePhrases(input, { dedupe: true }), ["重复", "唯一"]);
});

test("保留 Markdown 标记模式", () => {
  const input = "- **重要**的事\n";
  assert.deepEqual(parsePhrases(input, { stripMarkdown: false }), ["- **重要**的事"]);
});

test("stripMarkdown 单项", () => {
  assert.equal(stripMarkdown("- **A** [[target|B]] `code`"), "A B code");
});

console.log(`\n${passed} passed`);
