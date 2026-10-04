const test = require("node:test");
const assert = require("node:assert/strict");
const { formatPhone } = require("../dist/index.js");

const cases = [
  // [input, defaultCountry, e164, national, international, country]
  ["(415) 555-0123", "US", "+14155550123", "(415) 555-0123", "+1 415-555-0123", "US"],
  ["415.555.0123", "US", "+14155550123", "(415) 555-0123", "+1 415-555-0123", "US"],
  ["1-415-555-0123", "US", "+14155550123", "(415) 555-0123", "+1 415-555-0123", "US"],
  ["+1 416 555 0199", undefined, "+14165550199", "(416) 555-0199", "+1 416-555-0199", "CA"],
  ["011 44 20 7946 0000", "US", "+442079460000", "020 7946 0000", "+44 20 7946 0000", "GB"],
  ["+44 (0)20 7946 0000", undefined, "+442079460000", "020 7946 0000", "+44 20 7946 0000", "GB"],
  ["0044 7700 900123", undefined, "+447700900123", "07700 900123", "+44 7700 900123", "GB"],
  ["07700-900-456", "UK", "+447700900456", "07700 900456", "+44 7700 900456", "GB"],
  ["0113 496 0000", "GB", "+441134960000", "0113 496 0000", "+44 113 496 0000", "GB"],
  ["447700900123", "GB", "+447700900123", "07700 900123", "+44 7700 900123", "GB"],
  ["0491 570 156", "AU", "+61491570156", "0491 570 156", "+61 491 570 156", "AU"],
  ["+61 (0)2 5550 1234", undefined, "+61255501234", "02 5550 1234", "+61 2 5550 1234", "AU"],
  ["090000 00001", "IN", "+919000000001", "090000 00001", "+91 90000 00001", "IN"],
  ["0300-0000001", "PK", "+923000000001", "0300 0000001", "+92 300 0000001", "PK"],
  ["+971 50 000 0001", undefined, "+971500000001", "050 000 0001", "+971 50 000 0001", "AE"],
  ["04 000 0001", "AE", "+97140000001", "04 000 0001", "+971 4 000 0001", "AE"],
  ["+49 (0)151 00000001", undefined, "+4915100000001", "0151 00000001", "+49 151 00000001", "DE"],
  ["030 0000000", "DE", "+49300000000", "030 0000000", "+49 30 0000000", "DE"],
];

for (const [input, defaultCountry, e164, national, international, country] of cases) {
  test(`formats ${input}`, () => {
    const r = formatPhone(input, { defaultCountry });
    assert.equal(r.valid, true, r.reason ?? "");
    assert.equal(r.e164, e164);
    assert.equal(r.national, national);
    assert.equal(r.international, international);
    assert.equal(r.country, country);
    assert.equal(r.reason, null);
  });
}

test("extracts extensions in several styles", () => {
  for (const input of [
    "415-555-0123 ext. 42",
    "415-555-0123 x42",
    "(415) 555-0123#42",
    "415 555 0123, extension 42",
  ]) {
    const r = formatPhone(input, { defaultCountry: "US" });
    assert.equal(r.e164, "+14155550123", input);
    assert.equal(r.extension, "42", input);
  }
  assert.equal(formatPhone("415 555 0123", { defaultCountry: "US" }).extension, null);
});

test("converts vanity letters to digits", () => {
  assert.equal(formatPhone("1-415-555-CALL", { defaultCountry: "US" }).e164, "+14155552255");
});

test("reports invalid input with a reason", () => {
  const check = (input, opts, reason) => {
    const r = formatPhone(input, opts);
    assert.equal(r.valid, false, input);
    assert.equal(r.e164, null);
    assert.equal(r.reason, reason, input);
  };
  check("", {}, "empty");
  check("n/a", {}, "no digits");
  check("call 555-0100!", { defaultCountry: "US" }, "contains unexpected characters");
  check("555 0123", { defaultCountry: "US" }, "too short");
  check("(415) 555-0123", {}, "no country code and no defaultCountry");
  check("+33 1 23 45 67 89", {}, "unsupported country code");
  check("(115) 555-0123", { defaultCountry: "US" }, "area code cannot start with 0 or 1");
  check("07700 9001234", { defaultCountry: "GB" }, "too long");
});

test("keeps the detected country on invalid numbers", () => {
  const r = formatPhone("+44 20 7946", {});
  assert.equal(r.country, "GB");
  assert.equal(r.valid, false);
});

test("011 is not treated as an exit code outside NANP", () => {
  assert.equal(formatPhone("0118 496 0000", { defaultCountry: "GB" }).e164, "+441184960000");
});

test("rejects an unsupported defaultCountry", () => {
  assert.throws(() => formatPhone("123", { defaultCountry: "FR" }), RangeError);
});
