/**
 * Parses RFC 4180 CSV text into rows of fields. Accepts CRLF or LF line
 * endings, quoted fields containing commas, quotes ("") and newlines, and a
 * leading UTF-8 byte order mark.
 */
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += ch;
      }
      i++;
      continue;
    }

    if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r" || ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else {
      field += ch;
    }
    i++;
  }

  if (quoted) throw new SyntaxError("Unterminated quoted field in CSV");
  // A trailing newline ends the last record; it does not start an empty one.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function quoteField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Serialises rows as RFC 4180 CSV with CRLF line endings. */
export function stringifyCsv(rows: string[][]): string {
  return rows.map((row) => row.map(quoteField).join(",") + "\r\n").join("");
}
