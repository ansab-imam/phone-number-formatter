#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CountryCode, PhoneResult, formatPhone, parseCountry } from "./index";
import { parseCsv, stringifyCsv } from "./csv";

const EXIT_OK = 0;
const EXIT_INVALID = 1;
const EXIT_USAGE = 2;

const FORMATS = ["e164", "national", "international", "json"] as const;
type Format = (typeof FORMATS)[number];

const HELP = `Usage:
  phone-format [options] <number> [<number> ...]
  phone-format --csv <in.csv> --column <name> [-o <out.csv>] [options]

Normalise phone numbers to E.164 and readable formats.

Options:
  -c, --country <CC>     Country for numbers without a +/00 prefix
                         (US, CA, GB/UK, AU, IN, PK, AE, DE)
  -f, --format <fmt>     e164 (default), national, international or json
      --csv <file>       Read a CSV file and add phone_e164 and phone_valid columns
      --column <name>    CSV column holding the phone numbers (default: Phone)
  -o, --output <file>    Write CSV output here instead of stdout
  -h, --help             Show this help
  -v, --version          Show the version

Exit codes:
  0  all numbers valid (or CSV processed)
  1  at least one number was invalid
  2  usage or file error

Examples:
  phone-format "+44 (0)20 7946 0000"
  phone-format --country US "(415) 555-0123 ext. 12" --format national
  phone-format --csv leads.csv --column Phone -o leads-clean.csv
`;

class UsageError extends Error {}

interface Args {
  numbers: string[];
  country?: CountryCode;
  format: Format;
  csv?: string;
  column: string;
  output?: string;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { numbers: [], format: "e164", column: "Phone", help: false, version: false };

  const value = (flag: string, i: number): string => {
    const v = argv[i];
    if (v === undefined) throw new UsageError(`${flag} needs a value`);
    return v;
  };

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    const eq = raw.startsWith("--") ? raw.indexOf("=") : -1;
    const flag = eq > 0 ? raw.slice(0, eq) : raw;
    const inline = eq > 0 ? raw.slice(eq + 1) : undefined;
    const next = () => inline ?? value(flag, ++i);

    switch (flag) {
      case "-h":
      case "--help":
        args.help = true;
        break;
      case "-v":
      case "--version":
        args.version = true;
        break;
      case "-c":
      case "--country": {
        const v = next();
        const country = parseCountry(v);
        if (!country) throw new UsageError(`Unsupported country "${v}". Use one of US, CA, GB, UK, AU, IN, PK, AE, DE.`);
        args.country = country;
        break;
      }
      case "-f":
      case "--format": {
        const v = next().toLowerCase();
        if (!(FORMATS as readonly string[]).includes(v)) {
          throw new UsageError(`Unknown format "${v}". Use one of ${FORMATS.join(", ")}.`);
        }
        args.format = v as Format;
        break;
      }
      case "--csv":
        args.csv = next();
        break;
      case "--column":
        args.column = next();
        break;
      case "-o":
      case "--output":
        args.output = next();
        break;
      case "--":
        args.numbers.push(...argv.slice(i + 1));
        i = argv.length;
        break;
      default:
        // A number such as "-555-0123" is unusual but possible; only treat
        // dash-prefixed words with letters as unknown options.
        if (/^--?[A-Za-z]/.test(raw)) throw new UsageError(`Unknown option ${raw}`);
        args.numbers.push(raw);
    }
  }
  return args;
}

function render(result: PhoneResult, input: string, format: Format): string {
  if (format === "json") return JSON.stringify({ input, ...result });
  if (!result.valid) return `invalid: ${input} (${result.reason})`;
  const ext = result.extension ? ` ext. ${result.extension}` : "";
  if (format === "national") return result.national + ext;
  if (format === "international") return result.international + ext;
  return result.e164!;
}

function runCsv(args: Args): number {
  let text: string;
  try {
    text = readFileSync(args.csv!, "utf8");
  } catch (err) {
    throw new UsageError(`Cannot read ${args.csv}: ${(err as NodeJS.ErrnoException).code ?? err}`);
  }

  const rows = parseCsv(text);
  if (rows.length === 0) throw new UsageError(`${args.csv} is empty`);

  const header = rows[0];
  const wanted = args.column.trim().toLowerCase();
  const col = header.findIndex((h) => h.trim().toLowerCase() === wanted);
  if (col === -1) {
    throw new UsageError(`Column "${args.column}" not found. Columns: ${header.join(", ")}`);
  }

  let valid = 0;
  let invalid = 0;
  const out = [[...header, "phone_e164", "phone_valid"]];
  for (const row of rows.slice(1)) {
    const cell = row[col] ?? "";
    if (row.length === 1 && row[0] === "") {
      out.push(row);
      continue;
    }
    const result = formatPhone(cell, { defaultCountry: args.country });
    if (result.valid) valid++;
    else invalid++;
    const padded = [...row];
    while (padded.length < header.length) padded.push("");
    padded.push(result.e164 ?? "", String(result.valid));
    out.push(padded);
  }

  const csv = stringifyCsv(out);
  if (args.output) {
    try {
      writeFileSync(args.output, csv, "utf8");
    } catch (err) {
      throw new UsageError(`Cannot write ${args.output}: ${(err as NodeJS.ErrnoException).code ?? err}`);
    }
    process.stderr.write(`${valid} valid, ${invalid} invalid -> ${args.output}\n`);
  } else {
    process.stdout.write(csv);
  }
  return EXIT_OK;
}

function main(argv: string[]): number {
  const args = parseArgs(argv);

  if (args.help) {
    process.stdout.write(HELP);
    return EXIT_OK;
  }
  if (args.version) {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));
    process.stdout.write(`${pkg.version}\n`);
    return EXIT_OK;
  }
  if (args.csv) {
    if (args.numbers.length > 0) throw new UsageError("Pass either --csv or phone numbers, not both");
    return runCsv(args);
  }
  if (args.numbers.length === 0) throw new UsageError("No phone number given");

  let code = EXIT_OK;
  for (const input of args.numbers) {
    const result = formatPhone(input, { defaultCountry: args.country });
    const line = render(result, input, args.format);
    if (result.valid) {
      process.stdout.write(line + "\n");
    } else {
      code = EXIT_INVALID;
      (args.format === "json" ? process.stdout : process.stderr).write(line + "\n");
    }
  }
  return code;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  if (err instanceof UsageError || err instanceof SyntaxError) {
    process.stderr.write(`phone-format: ${err.message}\nRun "phone-format --help" for usage.\n`);
    process.exitCode = EXIT_USAGE;
  } else {
    throw err;
  }
}
