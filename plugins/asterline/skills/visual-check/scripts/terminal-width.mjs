const ESC = String.fromCharCode(27);
const CSI = String.fromCharCode(155);
const ANSI_PATTERN = new RegExp(
  `[${ESC}${CSI}][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]`,
  "g",
);
const ZERO_WIDTH_RANGES = [
  { start: 768, end: 879 }, { start: 1155, end: 1161 }, { start: 1425, end: 1469 },
  { start: 1552, end: 1562 }, { start: 1611, end: 1631 }, { start: 1648, end: 1648 },
  { start: 1750, end: 1756 }, { start: 4448, end: 4607 }, { start: 8203, end: 8207 },
  { start: 8234, end: 8238 }, { start: 8288, end: 8292 }, { start: 8400, end: 8447 },
  { start: 65056, end: 65071 }, { start: 65279, end: 65279 },
];
const WIDE_RANGES = [
  { start: 4352, end: 4447 }, { start: 8986, end: 8987 }, { start: 11904, end: 12350 },
  { start: 12353, end: 13311 }, { start: 13312, end: 19903 }, { start: 19968, end: 40959 },
  { start: 40960, end: 42191 }, { start: 43360, end: 43391 }, { start: 44032, end: 55203 },
  { start: 63744, end: 64255 }, { start: 65040, end: 65049 }, { start: 65072, end: 65135 },
  { start: 65280, end: 65376 }, { start: 65504, end: 65510 }, { start: 110592, end: 110959 },
  { start: 127488, end: 127743 }, { start: 127744, end: 129791 }, { start: 131072, end: 262141 },
];

function inRanges(codePoint, ranges) {
  for (const range of ranges) {
    if (codePoint >= range.start && codePoint <= range.end) return true;
  }
  return false;
}

export function stripAnsi(input) {
  return input.replace(ANSI_PATTERN, "");
}

export function hasAnsi(input) {
  return stripAnsi(input) !== input;
}

export function charWidth(codePoint) {
  if (codePoint === 0 || codePoint < 32) return 0;
  if (codePoint >= 127 && codePoint <= 159) return 0;
  if (inRanges(codePoint, ZERO_WIDTH_RANGES)) return 0;
  if (inRanges(codePoint, WIDE_RANGES)) return 2;
  return 1;
}

export function stringWidth(text) {
  let total = 0;
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (codePoint !== undefined) total += charWidth(codePoint);
  }
  return total;
}
