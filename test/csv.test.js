const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCsv, stringifyCsv } = require("../dist/csv.js");

test("parses quoted fields, escaped quotes and embedded newlines", () => {
  const text = '﻿Name,Note\r\n"Doe, J","said ""hi""\nthen left"\nB,\n';
  assert.deepEqual(parseCsv(text), [
    ["Name", "Note"],
    ["Doe, J", 'said "hi"\nthen left'],
    ["B", ""],
  ]);
});

test("handles a final record without a trailing newline", () => {
  assert.deepEqual(parseCsv("a,b\n1,2"), [
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("throws on an unterminated quote", () => {
  assert.throws(() => parseCsv('a\n"oops'), SyntaxError);
});

test("round-trips through stringifyCsv", () => {
  const rows = [
    ["a", "b,c"],
    ['say "x"', "line\nbreak"],
    ["", "plain"],
  ];
  assert.equal(stringifyCsv(rows), 'a,"b,c"\r\n"say ""x""","line\nbreak"\r\n,plain\r\n');
  assert.deepEqual(parseCsv(stringifyCsv(rows)), rows);
});
