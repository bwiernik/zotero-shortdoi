#!/usr/bin/env node
// Build the Zotero .xpi. Pulls the version from manifest.json so the two can
// never drift.
//
// An .xpi is a plain zip, and node:zlib already has deflate and crc32, so the
// ~70 lines below replace the one dependency this project had. Scope is
// deliberately narrow: small files, no zip64, no encryption, no directory
// entries (Zotero does not need them).

import { deflateRawSync, crc32 } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INCLUDE = [
  "content", "lib", "locale", "skin",
  "bootstrap.js", "manifest.json", "prefs.js",
];
const SKIP_DIRS = new Set(["__tests__"]);

/** Every file under `dir`, as paths relative to ROOT, with `/` separators. */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) out.push(...walk(full));
    } else {
      out.push(relative(ROOT, full).split(sep).join("/"));
    }
  }
  return out;
}

const files = INCLUDE.flatMap((entry) => {
  const full = join(ROOT, entry);
  return statSync(full).isDirectory() ? walk(full) : [entry];
});

// DOS timestamp. Fixed, so identical sources produce an identical .xpi.
const DOS_TIME = 0;
const DOS_DATE = (2024 - 1980) << 9 | 1 << 5 | 1;

const locals = [];
const central = [];
let offset = 0;

for (const name of files) {
  const raw = readFileSync(join(ROOT, name));
  const deflated = deflateRawSync(raw, { level: 9 });
  // Fall back to storing when deflate does not actually help.
  const useDeflate = deflated.length < raw.length;
  const body = useDeflate ? deflated : raw;
  const method = useDeflate ? 8 : 0;
  const nameBuf = Buffer.from(name, "utf8");
  const sum = crc32(raw);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);            // version needed
  local.writeUInt16LE(0, 6);             // flags
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(sum, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);            // extra length
  locals.push(local, nameBuf, body);

  const dir = Buffer.alloc(46);
  dir.writeUInt32LE(0x02014b50, 0);
  dir.writeUInt16LE(20, 4);              // version made by
  dir.writeUInt16LE(20, 6);              // version needed
  dir.writeUInt16LE(0, 8);               // flags
  dir.writeUInt16LE(method, 10);
  dir.writeUInt16LE(DOS_TIME, 12);
  dir.writeUInt16LE(DOS_DATE, 14);
  dir.writeUInt32LE(sum, 16);
  dir.writeUInt32LE(body.length, 20);
  dir.writeUInt32LE(raw.length, 24);
  dir.writeUInt16LE(nameBuf.length, 28);
  dir.writeUInt16LE(0, 30);              // extra length
  dir.writeUInt16LE(0, 32);              // comment length
  dir.writeUInt16LE(0, 34);              // disk number start
  dir.writeUInt16LE(0, 36);              // internal attributes
  dir.writeUInt32LE(0, 38);              // external attributes
  dir.writeUInt32LE(offset, 42);
  central.push(dir, nameBuf);

  offset += local.length + nameBuf.length + body.length;
}

const centralBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4);                 // this disk
end.writeUInt16LE(0, 6);                 // disk with central directory
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);
end.writeUInt16LE(0, 20);                // comment length

const { version } = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const outFile = join(ROOT, "dist", `zotero-doi-manager-${version}.xpi`);
mkdirSync(join(ROOT, "dist"), { recursive: true });
writeFileSync(outFile, Buffer.concat([...locals, centralBuf, end]));

console.log(
  `Built ${outFile} (${(statSync(outFile).size / 1024).toFixed(1)} KB, ${files.length} files)`
);
