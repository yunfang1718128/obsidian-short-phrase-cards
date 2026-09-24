export type SplitMode = "smart" | "line";

export interface ParseOptions {
  /** "smart": 忽略空行/标题/分隔线；"line": 每个非空行 */
  splitMode: SplitMode;
  /** 去掉 Markdown 标记，只留纯文字 */
  stripMarkdown: boolean;
  /** 过滤掉短于该长度的短句（按字符数） */
  minLength: number;
  /** 过滤掉长于该长度的短句；0 表示不限制 */
  maxLength: number;
  /** 是否对结果去重 */
  dedupe: boolean;
}

export const DEFAULT_PARSE_OPTIONS: ParseOptions = {
  splitMode: "smart",
  stripMarkdown: true,
  minLength: 1,
  maxLength: 0,
  dedupe: false,
};

const FRONTMATTER_RE = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/;

function stripFrontmatter(content: string): string {
  return content.replace(FRONTMATTER_RE, "");
}

function stripCodeFences(content: string): string {
  const lines = content.split(/\r?\n/);
  const out: string[] = [];
  let inFence = false;
  let fenceChar = "";
  for (const line of lines) {
    const open = line.match(/^[ \t]*(`{3,}|~{3,})/);
    if (!inFence) {
      if (open) {
        inFence = true;
        fenceChar = open[1][0];
        continue;
      }
      out.push(line);
    } else {
      if (open && open[1][0] === fenceChar) {
        inFence = false;
      }
    }
  }
  return out.join("\n");
}

export function stripMarkdown(text: string): string {
  let s = text;
  // 引用前缀
  s = s.replace(/^[ \t]*(?:>[ \t]?)+/, "");
  // 任务清单 [ ] / [x]
  s = s.replace(/^[ \t]*\[[ xX]\][ \t]+/, "");
  // 列表符号 - * + 1. 1)
  s = s.replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/, "");
  // 图片 ![alt](url) -> alt
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  // 链接 [text](url) -> text
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // wiki 链接 [[target|alias]] -> alias；[[target]] -> target
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  s = s.replace(/\[\[([^\]]+)\]\]/g, "$1");
  // 行内代码
  s = s.replace(/`([^`]*)`/g, "$1");
  // 加粗 / 斜体 / 删除线 / 高亮
  s = s.replace(/(\*\*\*|___)(.+?)\1/g, "$2");
  s = s.replace(/(\*\*|__)(.+?)\1/g, "$2");
  s = s.replace(/(\*|_)(.+?)\1/g, "$2");
  s = s.replace(/~~(.+?)~~/g, "$1");
  s = s.replace(/==(.+?)==/g, "$1");
  // 折叠多余空白
  s = s.replace(/[ \t]+/g, " ").trim();
  return s;
}

function isSkippable(line: string): boolean {
  // 标题行
  if (/^#{1,6}([ \t]|$)/.test(line)) return true;
  // 分隔线
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) return true;
  return false;
}

export function parsePhrases(
  content: string,
  options: Partial<ParseOptions> = {}
): string[] {
  const opt: ParseOptions = { ...DEFAULT_PARSE_OPTIONS, ...options };
  let text = stripFrontmatter(content);
  text = stripCodeFences(text);

  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;
    if (opt.splitMode === "smart" && isSkippable(line)) continue;

    if (opt.stripMarkdown) line = stripMarkdown(line);
    else line = line.trim();

    if (!line) continue;
    if (line.length < opt.minLength) continue;
    if (opt.maxLength > 0 && line.length > opt.maxLength) continue;

    if (opt.dedupe) {
      if (seen.has(line)) continue;
      seen.add(line);
    }
    result.push(line);
  }

  return result;
}
