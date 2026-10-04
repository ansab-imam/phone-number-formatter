# phone-number-formatter

Normalise messy phone numbers into [E.164](https://en.wikipedia.org/wiki/E.164) (`+14155550123`) and readable national and international formats. A TypeScript library and `phone-format` CLI for Node 18+, with zero runtime dependencies.

It is built for sales and CRM data cleanup: lead lists exported from forms, spreadsheets and old systems, where the same number shows up as `(415) 555-0123`, `+1.415.555.0123` and `001 415 555 0123`.

> **Scope:** this is a lightweight, rules-based formatter for a focused set of countries. It checks lengths and leading digits; it is **not** a full numbering-plan validator and cannot tell you whether a number is allocated or reachable. For exhaustive validation across every country, use Google's [libphonenumber](https://github.com/google/libphonenumber) (or its JavaScript port [libphonenumber-js](https://www.npmjs.com/package/libphonenumber-js)).

## What it handles

- Spaces, dots, dashes, slashes and brackets
- `+`, `00` and (for US/CA) `011` international prefixes
- Trunk prefix `0` for UK, AU, IN, PK, AE and DE, including the `(0)` in `+44 (0)20 7946 0000`
- Country code without the plus, e.g. `447700900123` with `defaultCountry: "GB"`
- Extensions written as `ext`, `ext.`, `extension`, `x` or `#`
- Vanity letters (`1-415-555-CALL` becomes `+14155552255`)

## Install

```sh
npm install github:ansab-imam/phone-number-formatter
```

The package builds itself on install (`prepare` runs `tsc`).

## Library usage

```ts
import { formatPhone } from "phone-number-formatter";

formatPhone("+44 (0)20 7946 0000");
// {
//   e164: "+442079460000",
//   national: "020 7946 0000",
//   international: "+44 20 7946 0000",
//   country: "GB",
//   valid: true,
//   reason: null,
//   extension: null
// }

formatPhone("(415) 555-0123 ext. 42", { defaultCountry: "US" });
// { e164: "+14155550123", national: "(415) 555-0123",
//   international: "+1 415-555-0123", country: "US", valid: true,
//   reason: null, extension: "42" }

formatPhone("555 0123", { defaultCountry: "US" });
// { e164: null, ..., country: "US", valid: false, reason: "too short", extension: null }
```

`defaultCountry` is used for numbers written without an international prefix. Accepted values: `US`, `CA`, `GB` (or `UK`), `AU`, `IN`, `PK`, `AE`, `DE`. An unsupported value throws a `RangeError`. Without a `defaultCountry`, national-format numbers come back invalid with the reason `no country code and no defaultCountry` rather than being guessed.

Invalid numbers always return `valid: false` with a short `reason` and `null` for the formatted fields. `country` is still filled in when it could be determined.

The package also exports `parseCsv(text)` and `stringifyCsv(rows)`, the RFC 4180 reader and writer used by the CLI.

## CLI usage

```sh
phone-format "+44 (0)20 7946 0000"
# +442079460000

phone-format --country US --format national "415.555.0123 x7"
# (415) 555-0123 ext. 7

phone-format -c AU -f international "0491 570 156" "0491 570 157"
# +61 491 570 156
# +61 491 570 157

phone-format --format json "+971 50 000 0001"
# {"input":"+971 50 000 0001","e164":"+971500000001",...}
```

| Option | Description |
| --- | --- |
| `-c, --country <CC>` | Country for numbers without a `+`/`00` prefix |
| `-f, --format <fmt>` | `e164` (default), `national`, `international` or `json` |
| `--csv <file>` | CSV mode: read a file and add `phone_e164` and `phone_valid` columns |
| `--column <name>` | CSV column holding the numbers (case-insensitive, default `Phone`) |
| `-o, --output <file>` | Write CSV output to a file instead of stdout |
| `-h, --help` / `-v, --version` | Help and version |

Exit codes: `0` everything valid (or CSV processed), `1` at least one number invalid, `2` usage or file error. Invalid numbers are reported on stderr, except in `json` format where every result goes to stdout.

### CSV mode

```sh
phone-format --csv leads.csv --column Phone --country US -o leads-clean.csv
# 3 valid, 1 invalid -> leads-clean.csv
```

Before (`leads.csv`):

| Name | Company | Phone |
| --- | --- | --- |
| Lead A | Socialist Fox | (415) 555-0123 |
| Lead B | Socialist Fox | +44 (0)20 7946 0000 |
| Lead C | Socialist Fox | 0061 491 570 156 x12 |
| Lead D | Socialist Fox | TBC |

After (`leads-clean.csv`):

| Name | Company | Phone | phone_e164 | phone_valid |
| --- | --- | --- | --- | --- |
| Lead A | Socialist Fox | (415) 555-0123 | +14155550123 | true |
| Lead B | Socialist Fox | +44 (0)20 7946 0000 | +442079460000 | true |
| Lead C | Socialist Fox | 0061 491 570 156 x12 | +61491570156 | true |
| Lead D | Socialist Fox | TBC | | false |

All original columns are kept unchanged. Quoted fields, embedded commas, quotes and line breaks are handled, a UTF-8 BOM is ignored, and output uses CRLF line endings as RFC 4180 specifies. Extensions are not included in `phone_e164`, because E.164 has no extension syntax.

## Supported countries

| Country | Code | National example | International example | Notes |
| --- | --- | --- | --- | --- |
| United States | +1 | (415) 555-0123 | +1 415-555-0123 | NANP area/exchange rules |
| Canada | +1 | (416) 555-0199 | +1 416-555-0199 | Detected by area code |
| United Kingdom | +44 | 020 7946 0000, 07700 900123 | +44 20 7946 0000 | 9–10 digit national numbers |
| Australia | +61 | 0491 570 156, 02 5550 1234 | +61 491 570 156 | Geographic and mobile |
| India | +91 | 090000 00001 | +91 90000 00001 | 10-digit national numbers |
| Pakistan | +92 | 0300 0000001 | +92 300 0000001 | Mobiles and landlines |
| UAE | +971 | 050 000 0001, 04 000 0001 | +971 50 000 0001 | Mobiles and landlines |
| Germany | +49 | 0151 00000001, 030 0000000 | +49 151 00000001 | Basic support, see below |

## Limitations

- Validation is by length and leading digits only. A "valid" result means the number is plausibly shaped, not that it exists.
- Any `+1` number whose area code is not in the built-in Canadian list is reported as `US`, including Caribbean NANP territories.
- Germany has variable-length area codes. Mobiles and the Berlin, Hamburg, Frankfurt and Munich codes are grouped; other landlines are shown as a single block after the trunk `0`.
- Indian and Pakistani landline grouping is approximate, since area code lengths vary.
- Non-geographic ranges such as Australian `1300`/`1800` are not supported.
- Numbers from countries outside the table are reported as `unsupported country code`.

## Run the tests

```sh
npm install
npm test
```

`npm test` compiles with `tsc` and runs the `node:test` suite against the compiled output in `dist/`. All example numbers in the code and tests come from reserved fictional ranges (US 555-01xx, UK 020 7946 0xxx and 07700 900xxx, AU 0491 570 xxx) or are obviously fictional.

## License

MIT © 2026 Socialist Fox. See [LICENSE](LICENSE).
