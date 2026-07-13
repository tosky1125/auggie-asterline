import { Buffer } from "node:buffer";
import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export class PngDecodeError extends Error {
  name = "PngDecodeError";
}

function readChunks(buffer) {
  const chunks = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) break;
    chunks.push({ type, data: buffer.subarray(dataStart, dataEnd) });
    offset = dataEnd + 4;
  }
  return chunks;
}

function channelsForColorType(colorType) {
  switch (colorType) {
    case 0: return 1;
    case 2: return 3;
    case 4: return 2;
    case 6: return 4;
    default: throw new PngDecodeError(`unsupported color type ${colorType}`);
  }
}

function parseHeader(data) {
  if (data.length < 13) throw new PngDecodeError("invalid IHDR chunk length");
  const colorType = data[9] ?? 0;
  return {
    width: data.readUInt32BE(0),
    height: data.readUInt32BE(4),
    bitDepth: data[8] ?? 0,
    colorType,
    channels: channelsForColorType(colorType),
  };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilterRow(filterType, row, prev, bpp) {
  const out = Buffer.alloc(row.length);
  for (let i = 0; i < row.length; i++) {
    const raw = row[i] ?? 0;
    const a = i >= bpp ? out[i - bpp] ?? 0 : 0;
    const b = prev ? prev[i] ?? 0 : 0;
    const c = i >= bpp && prev ? prev[i - bpp] ?? 0 : 0;
    switch (filterType) {
      case 0: out[i] = raw; break;
      case 1: out[i] = raw + a & 255; break;
      case 2: out[i] = raw + b & 255; break;
      case 3: out[i] = raw + (a + b >> 1) & 255; break;
      case 4: out[i] = raw + paeth(a, b, c) & 255; break;
      default: throw new PngDecodeError(`unsupported filter type ${filterType}`);
    }
  }
  return out;
}

function decodePixels(idat, width, height, bpp) {
  const inflated = inflateSync(idat);
  const rowBytes = width * bpp;
  if (inflated.length < height * (rowBytes + 1)) {
    throw new PngDecodeError("truncated image data");
  }
  const pixels = Buffer.alloc(width * height * bpp);
  let prev = null;
  for (let y = 0; y < height; y++) {
    const rowStart = y * (rowBytes + 1);
    const filterType = inflated[rowStart] ?? 0;
    const filtered = inflated.subarray(rowStart + 1, rowStart + 1 + rowBytes);
    const row = unfilterRow(filterType, filtered, prev, bpp);
    row.copy(pixels, y * rowBytes);
    prev = row;
  }
  return pixels;
}

function normalizeToRgba(pixels, pixelCount, channels) {
  const rgba = new Uint8Array(pixelCount * 4);
  let hasTransparent = false;
  for (let i = 0; i < pixelCount; i++) {
    const src = i * channels;
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 255;
    switch (channels) {
      case 1: {
        const value = pixels[src] ?? 0;
        r = value; g = value; b = value;
        break;
      }
      case 2: {
        const value = pixels[src] ?? 0;
        r = value; g = value; b = value; a = pixels[src + 1] ?? 255;
        break;
      }
      case 3:
        r = pixels[src] ?? 0; g = pixels[src + 1] ?? 0; b = pixels[src + 2] ?? 0;
        break;
      default:
        r = pixels[src] ?? 0; g = pixels[src + 1] ?? 0; b = pixels[src + 2] ?? 0;
        a = pixels[src + 3] ?? 255;
    }
    const dst = i * 4;
    rgba[dst] = r; rgba[dst + 1] = g; rgba[dst + 2] = b; rgba[dst + 3] = a;
    if (a < 255) hasTransparent = true;
  }
  return { rgba, hasTransparent };
}

export function decodePng(buffer) {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new PngDecodeError("not a PNG file (bad signature)");
  }
  const chunks = readChunks(buffer);
  const ihdr = chunks.find((chunk) => chunk.type === "IHDR");
  if (ihdr === undefined) throw new PngDecodeError("missing IHDR chunk");
  const header = parseHeader(ihdr.data);
  if (header.bitDepth !== 8) throw new PngDecodeError(`unsupported bit depth ${header.bitDepth}`);
  const idatChunks = chunks.filter((chunk) => chunk.type === "IDAT");
  if (idatChunks.length === 0) throw new PngDecodeError("missing IDAT chunk");
  const pixels = decodePixels(
    Buffer.concat(idatChunks.map((chunk) => chunk.data)),
    header.width,
    header.height,
    header.channels,
  );
  const normalized = normalizeToRgba(pixels, header.width * header.height, header.channels);
  return {
    width: header.width,
    height: header.height,
    rgba: normalized.rgba,
    hasAlphaChannel: header.colorType === 4 || header.colorType === 6,
    hasTransparentPixels: normalized.hasTransparent,
  };
}
