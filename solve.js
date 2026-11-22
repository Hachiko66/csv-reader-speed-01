// A fast drop-in for csv-reader 1.0.0: run(input) returns exactly the answer
// csv-reader gives for {text, header} — {columns, rows, errors} — but reads
// the text with an indexOf-driven scanner instead of one character at a time.
//
// How it stays identical: the text is read once, left to right. An unquoted
// field is one slice between the next comma, line break or end of text, with
// stray CRs (a CR not followed by LF) dropped one by one only when the field
// actually holds one. A quoted field is one slice between its opening quote
// and its first un-doubled quote, with "" folded to one quote and CR/CRLF
// inside it read as LF only when the field actually holds them. Everything
// else — BOM, blank lines, quote junk, an unterminated quote, short and long
// rows, the line each error belongs to — follows the reference's policy.
//
// How it stays fast: the common case never loops over characters. Fields
// are slices, delimiters are found by indexOf (native code), and the only
// per-character loops run on the rare fields that need them (a stray CR, a
// line break inside quotes, an escaped quote). No state is kept between
// calls; two runs over the same input give the same answer.
//
// Field endings, as small numbers so the hot loop stays allocation-free:
// 0 = comma (the record goes on), 1 = line break, 2 = end of text.
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input, {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  // A U+FEFF at the very start is dropped.
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;

  // The record being read: the line it starts on, and the index in rows it
  // takes (null while the header is still unread).
  let recordLine = 1;
  let recordRow = null;

  // How the field just read ended, and how many characters the last
  // unquoted scan kept (quote junk is an error only when it kept any).
  let fEnded = END;
  let fAdded = 0;

  function pushError(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads an unquoted field starting at pos, with `initial` already in its
  // value. Returns the value; sets fEnded and fAdded.
  function readUnquoted(initial) {
    const start = pos;
    const ci = text.indexOf(',', pos);
    const ni = text.indexOf('\n', pos);
    let end;
    if (ci === -1) end = ni === -1 ? n : ni;
    else if (ni === -1) end = ci;
    else end = ci < ni ? ci : ni;
    const seg = text.slice(start, end);
    if (end === n) {
      fEnded = END;
      pos = n;
    } else if (text.charCodeAt(end) === 44) {
      fEnded = COMMA;
      pos = end + 1;
    } else {
      fEnded = LINE_BREAK;
      pos = end + 1;
      line += 1;
    }
    const ri = seg.indexOf('\r');
    if (ri === -1) {
      fAdded = seg.length;
      return initial === '' ? seg : initial + seg;
    }
    // The field holds a CR. A trailing one before a line break is the CRLF
    // that ends the field, not an error; every other CR is a stray CR and is
    // dropped, one error each, in the order met.
    let limit = seg.length;
    if (fEnded === LINE_BREAK && seg.charCodeAt(seg.length - 1) === 13) limit = seg.length - 1;
    let out = '';
    let s = 0;
    let i = ri;
    let dropped = 0;
    while (i !== -1 && i < limit) {
      pushError('stray_cr');
      out += seg.slice(s, i);
      s = i + 1;
      dropped += 1;
      i = seg.indexOf('\r', s);
    }
    out += seg.slice(s, limit);
    fAdded = limit - dropped;
    return initial === '' ? out : initial + out;
  }

  // Reads a quoted field whose opening quote is at pos. Returns the value;
  // sets fEnded (and fAdded, through the junk scan, when junk follows).
  function readQuoted() {
    const open = pos;
    const openLine = line;
    // The closing quote is the first quote not followed by another quote.
    let q = text.indexOf('"', pos + 1);
    let close = -1;
    let hasEscape = false;
    while (q !== -1) {
      if (text.charCodeAt(q + 1) === 34) {
        hasEscape = true;
        q = text.indexOf('"', q + 2);
      } else {
        close = q;
        break;
      }
    }
    if (close === -1) {
      // The quote never closes: it is a literal character, and the text
      // after it is read again as unquoted.
      pushError('unterminated_quote');
      pos = open + 1;
      line = openLine;
      return readUnquoted('"');
    }
    const seg = text.slice(open + 1, close);
    const nl = seg.indexOf('\n');
    const cr = seg.indexOf('\r');
    let value;
    if (!hasEscape && nl === -1 && cr === -1) {
      value = seg;
    } else if (nl === -1 && cr === -1) {
      value = seg.replaceAll('""', '"');
    } else {
      // Line breaks inside quotes: each CRLF or lone CR reads as one LF.
      // Escaped quotes fold to one quote at the same time.
      let out = '';
      let s = 0;
      let i = 0;
      let breaks = 0;
      const m = seg.length;
      while (i < m) {
        const ch = seg.charCodeAt(i);
        if (ch === 34) {
          out += seg.slice(s, i) + '"';
          i += 2;
          s = i;
        } else if (ch === 13) {
          out += seg.slice(s, i) + '\n';
          breaks += 1;
          i += seg.charCodeAt(i + 1) === 10 ? 2 : 1;
          s = i;
        } else if (ch === 10) {
          out += seg.slice(s, i) + '\n';
          breaks += 1;
          i += 1;
          s = i;
        } else {
          i += 1;
        }
      }
      out += seg.slice(s);
      value = out;
      line += breaks;
    }
    pos = close + 1;
    if (pos >= n) {
      fEnded = END;
      return value;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      fEnded = COMMA;
      pos += 1;
      return value;
    }
    if (c === 10) {
      fEnded = LINE_BREAK;
      pos += 1;
      line += 1;
      return value;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      fEnded = LINE_BREAK;
      pos += 2;
      line += 1;
      return value;
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break; it is quote junk when it kept anything.
    const junk = readUnquoted(value);
    if (fAdded > 0) pushError('quote_junk');
    return junk;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let lastQuoted = false;
    do {
      lastQuoted = text.charCodeAt(pos) === 34;
      fields.push(lastQuoted ? readQuoted() : readUnquoted(''));
    } while (fEnded === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
