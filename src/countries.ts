export type CountryCode = "US" | "CA" | "GB" | "AU" | "IN" | "PK" | "AE" | "DE";

export interface CountryRule {
  /** ISO 3166-1 alpha-2 code. */
  country: CountryCode;
  /** International calling code without the plus sign. */
  callingCode: string;
  /** National trunk prefix dialled before the national number, if any. */
  trunkPrefix: string;
  /** Returns a reason string when the national significant number is not plausible. */
  check(nsn: string): string | null;
  /** Splits the national significant number into display groups. */
  group(nsn: string): string[];
}

// Canadian NANP area codes. Everything else in +1 is reported as US, which is
// right for CRM purposes but means other NANP territories (Caribbean) show as US.
const CANADIAN_AREA_CODES = new Set([
  "204", "226", "236", "249", "250", "257", "263", "289", "306", "343", "354",
  "365", "367", "368", "382", "387", "403", "416", "418", "428", "431", "437",
  "438", "450", "460", "468", "474", "506", "514", "519", "548", "579", "581",
  "584", "587", "604", "613", "639", "647", "672", "683", "705", "709", "742",
  "753", "778", "780", "782", "807", "819", "825", "867", "873", "879", "902",
  "905", "942",
]);

function split(digits: string, sizes: number[]): string[] {
  const groups: string[] = [];
  let pos = 0;
  for (const size of sizes) {
    if (pos >= digits.length) break;
    groups.push(digits.slice(pos, pos + size));
    pos += size;
  }
  if (pos < digits.length) groups.push(digits.slice(pos));
  return groups;
}

function lengthReason(nsn: string, min: number, max: number): string | null {
  if (nsn.length < min) return "too short";
  if (nsn.length > max) return "too long";
  return null;
}

const nanp = (country: "US" | "CA"): CountryRule => ({
  country,
  callingCode: "1",
  trunkPrefix: "",
  check(nsn) {
    const len = lengthReason(nsn, 10, 10);
    if (len) return len;
    if (!/^[2-9]/.test(nsn)) return "area code cannot start with 0 or 1";
    if (/^[2-9]11/.test(nsn)) return "N11 codes are service numbers, not area codes";
    if (!/^[2-9]/.test(nsn.slice(3))) return "exchange code cannot start with 0 or 1";
    return null;
  },
  group: (nsn) => split(nsn, [3, 3, 4]),
});

export const RULES: Record<CountryCode, CountryRule> = {
  US: nanp("US"),
  CA: nanp("CA"),
  GB: {
    country: "GB",
    callingCode: "44",
    trunkPrefix: "0",
    check(nsn) {
      if (!/^[1235789]/.test(nsn)) return "not a valid UK number range";
      if (nsn.startsWith("7")) return lengthReason(nsn, 10, 10);
      return lengthReason(nsn, 9, 10);
    },
    group(nsn) {
      if (nsn.startsWith("2")) return split(nsn, [2, 4]);
      if (nsn.startsWith("7")) return split(nsn, [4]);
      // 011x and 01x1 are large-city codes with a three-digit area code.
      if (/^1(1\d|\d1)/.test(nsn)) return split(nsn, [3, 3]);
      if (nsn.startsWith("1")) return split(nsn, [4]);
      return split(nsn, [3, 3]);
    },
  },
  AU: {
    country: "AU",
    callingCode: "61",
    trunkPrefix: "0",
    check(nsn) {
      if (!/^[23478]/.test(nsn)) return "not a valid Australian number range";
      return lengthReason(nsn, 9, 9);
    },
    group: (nsn) => (nsn.startsWith("4") ? split(nsn, [3, 3]) : split(nsn, [1, 4])),
  },
  IN: {
    country: "IN",
    callingCode: "91",
    trunkPrefix: "0",
    check(nsn) {
      const len = lengthReason(nsn, 10, 10);
      if (len) return len;
      if (nsn.startsWith("0")) return "not a valid Indian number range";
      return null;
    },
    group: (nsn) => (/^[6-9]/.test(nsn) ? split(nsn, [5]) : split(nsn, [2, 4])),
  },
  PK: {
    country: "PK",
    callingCode: "92",
    trunkPrefix: "0",
    check(nsn) {
      if (nsn.startsWith("0")) return "not a valid Pakistani number range";
      if (nsn.startsWith("3")) return lengthReason(nsn, 10, 10);
      return lengthReason(nsn, 9, 10);
    },
    group: (nsn) => (nsn.startsWith("3") ? split(nsn, [3]) : split(nsn, [2])),
  },
  AE: {
    country: "AE",
    callingCode: "971",
    trunkPrefix: "0",
    check(nsn) {
      if (nsn.startsWith("5")) return lengthReason(nsn, 9, 9);
      if (/^[234679]/.test(nsn)) return lengthReason(nsn, 8, 8);
      return "not a valid UAE number range";
    },
    group: (nsn) => (nsn.startsWith("5") ? split(nsn, [2, 3]) : split(nsn, [1, 3])),
  },
  DE: {
    country: "DE",
    callingCode: "49",
    trunkPrefix: "0",
    check(nsn) {
      if (nsn.startsWith("0")) return "not a valid German number range";
      if (/^1[567]/.test(nsn)) return lengthReason(nsn, 10, 11);
      return lengthReason(nsn, 6, 11);
    },
    group(nsn) {
      if (/^1[567]/.test(nsn)) return split(nsn, [3]);
      // German area codes vary from 2 to 5 digits; only the four big two-digit
      // ones are split out, everything else is left as one block.
      if (/^(30|40|69|89)/.test(nsn)) return split(nsn, [2]);
      return [nsn];
    },
  },
};

/** Calling codes checked longest-first so +971 is not mistaken for something shorter. */
export const CALLING_CODES: Array<[string, CountryCode]> = [
  ["971", "AE"],
  ["44", "GB"],
  ["61", "AU"],
  ["91", "IN"],
  ["92", "PK"],
  ["49", "DE"],
  ["1", "US"],
];

export function resolveNanpCountry(nsn: string): "US" | "CA" {
  return CANADIAN_AREA_CODES.has(nsn.slice(0, 3)) ? "CA" : "US";
}

const ALIASES: Record<string, CountryCode> = { UK: "GB" };

export function parseCountry(value: string): CountryCode | null {
  const upper = value.trim().toUpperCase();
  const code = ALIASES[upper] ?? upper;
  return code in RULES ? (code as CountryCode) : null;
}
