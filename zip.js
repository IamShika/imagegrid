// ============================================================
//  zip.js - makes a .zip file inside the customer's browser.
//
//  In simple words: a zip file is just
//     [file 1 header + file 1 bytes] [file 2 header + file 2 bytes] ... [a table of contents]
//  Photos and videos are already squeezed (JPEG, MP4), so we do NOT compress again.
//  We just put them in the box ("store" mode). That is fast and uses very little memory.
//
//  Used by app.js through  window.ZipMaker.
//  (It also works in Node, which is how it gets tested.)
// ============================================================
(function (root) {
  'use strict';

  // ---------- CRC-32: a "fingerprint" of the file that zip programs use to check it is not broken ----------
  const TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    TABLE[n] = c >>> 0;
  }

  // Add more bytes to a running fingerprint. Start with crc = 0.
  function crc32(bytes, crc) {
    let c = ~(crc || 0);
    for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return ~c >>> 0;
  }

  // Fingerprint of a whole Blob, read in 4 MB bites so a big video never fills the memory.
  async function crc32Blob(blob) {
    const BITE = 4 * 1024 * 1024;
    let crc = 0;
    for (let at = 0; at < blob.size; at += BITE) {
      const buf = await blob.slice(at, Math.min(at + BITE, blob.size)).arrayBuffer();
      crc = crc32(new Uint8Array(buf), crc);
    }
    return crc;
  }

  // ---------- File names ----------
  // Remove characters that Windows / Mac do not allow in file names.
  function safeName(name, fallback) {
    let n = String(name == null ? '' : name)
      .replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, '_')
      .replace(/^[\s.]+/, '')
      .trim();
    if (n.length > 200) {
      const dot = n.lastIndexOf('.');
      const ext = dot > 0 && n.length - dot <= 10 ? n.slice(dot) : '';
      n = n.slice(0, 200 - ext.length) + ext;
    }
    return n || fallback || 'file';
  }

  // Two photos with the same name? Turn the second into "name (2).jpg".
  // `taken` is a Set of lower-case names already used.
  function uniqueName(name, taken) {
    let out = name;
    let i = 2;
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    while (taken.has(out.toLowerCase())) out = stem + ' (' + i++ + ')' + ext;
    taken.add(out.toLowerCase());
    return out;
  }

  // ---------- Build the zip ----------
  // entries: [{ name: 'IMG_1.jpg', blob: Blob, crc: number }]  ->  a Blob (the .zip file)
  function dosTime(d) {
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
  }

  function build(entries, when) {
    const enc = new TextEncoder();
    const stamp = dosTime(when || new Date());
    const pieces = [];                // what goes into the final file, in order
    const central = [];               // the table of contents, built along the way
    let offset = 0;

    entries.forEach((e) => {
      const name = enc.encode(e.name);
      const size = e.blob.size;
      if (size >= 0xffffffff || offset >= 0xffffffff) throw new Error('zip too big');

      // Header that comes right before the file's bytes (30 bytes + the name)
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);       // "a file starts here"
      lh.setUint16(4, 20, true);               // needs zip version 2.0
      lh.setUint16(6, 0x0800, true);           // the name is UTF-8 (so Thai names work)
      lh.setUint16(8, 0, true);                // 0 = stored, not compressed
      lh.setUint16(10, stamp.time, true);
      lh.setUint16(12, stamp.date, true);
      lh.setUint32(14, e.crc >>> 0, true);
      lh.setUint32(18, size, true);            // size inside the zip
      lh.setUint32(22, size, true);            // real size (same, because stored)
      lh.setUint16(26, name.length, true);
      lh.setUint16(28, 0, true);
      pieces.push(lh.buffer, name, e.blob);

      // The matching line of the table of contents (46 bytes + the name)
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, stamp.time, true);
      ch.setUint16(14, stamp.date, true);
      ch.setUint32(16, e.crc >>> 0, true);
      ch.setUint32(20, size, true);
      ch.setUint32(24, size, true);
      ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);          // where this file starts
      central.push(ch.buffer, name);

      offset += 30 + name.length + size;
    });

    let centralSize = 0;
    central.forEach((p) => { centralSize += p.byteLength; });

    // The very end: "this many files, table of contents is over there"
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    return new Blob(pieces.concat(central, [end.buffer]), { type: 'application/zip' });
  }

  const api = { crc32, crc32Blob, safeName, uniqueName, build };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ZipMaker = api;
})(typeof window !== 'undefined' ? window : globalThis);
