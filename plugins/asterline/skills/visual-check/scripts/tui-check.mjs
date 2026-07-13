import { charWidth, hasAnsi, stringWidth, stripAnsi } from "./terminal-width.mjs";

const BOX_DRAWING_START = 9472;
const BOX_DRAWING_END = 9599;
const MAX_WIDE_COLUMNS = 64;

function splitLines(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function isFrameLine(plain) {
  for (const char of plain) {
    const codePoint = char.codePointAt(0);
    if (codePoint !== undefined && codePoint >= BOX_DRAWING_START && codePoint <= BOX_DRAWING_END) {
      return true;
    }
  }
  return false;
}

function wideStartColumns(plain) {
  const columns = [];
  let column = 0;
  for (const char of plain) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) continue;
    const width = charWidth(codePoint);
    if (width === 2) columns.push(column);
    column += width;
  }
  return columns;
}

function summarize(lineCount, maxWidth, expectedColumns, overflowCount, borderMisaligned, containsAnsi) {
  const parts = [`${lineCount} line(s)`, `max width ${maxWidth}/${expectedColumns}`];
  if (overflowCount > 0) parts.push(`${overflowCount} overflow line(s)`);
  if (borderMisaligned) parts.push("borders misaligned");
  if (containsAnsi) parts.push("contains ANSI");
  return `${parts.join("; ")}.`;
}

export function checkTui(text, expectedColumns) {
  const lines = splitLines(text);
  const lineWidths = [];
  const overflowLines = [];
  const wideColumns = new Set();
  const frameWidths = new Set();
  for (let index = 0; index < lines.length; index++) {
    const plain = stripAnsi(lines[index] ?? "");
    const width = stringWidth(plain);
    lineWidths.push(width);
    if (expectedColumns > 0 && width > expectedColumns) {
      overflowLines.push({ line: index + 1, width });
    }
    if (isFrameLine(plain)) frameWidths.add(width);
    for (const column of wideStartColumns(plain)) {
      if (wideColumns.size < MAX_WIDE_COLUMNS) wideColumns.add(column);
    }
  }
  const maxWidth = lineWidths.reduce((max, width) => width > max ? width : max, 0);
  const borderMisaligned = frameWidths.size > 1;
  const containsAnsi = hasAnsi(text);
  return {
    command: "tui-check",
    expectedColumns,
    lineCount: lines.length,
    lineWidths,
    maxWidth,
    overflowLines,
    borderMisaligned,
    wideCharColumns: [...wideColumns].sort((a, b) => a - b),
    hasAnsi: containsAnsi,
    summary: summarize(lines.length, maxWidth, expectedColumns, overflowLines.length, borderMisaligned, containsAnsi),
  };
}
