import {
  CALLING_CODES,
  CountryCode,
  RULES,
  parseCountry,
  resolveNanpCountry,
} from "./countries";

export type { CountryCode } from "./countries";
export { parseCountry } from "./countries";

export interface FormatOptions {
  /** Country assumed for numbers written without an international prefix. "UK" is accepted as an alias for "GB". */
  defaultCountry?: CountryCode | "UK" | string;
}

export interface PhoneResult {
  /** E.164 form, e.g. "+14155550123". Null when the number is not valid. */
  e164: string | null;
  /** Format as dialled within the country, e.g. "(415) 555-0123" or "020 7946 0000". */
  national: string | null;
  /** Human-readable international format, e.g. "+44 20 7946 0000". */
  international: string | null;
  /** Detected country, when the calling code or default country could be resolved. */
  country: CountryCode | null;
  valid: boolean;
  /** Why the number is invalid; null when valid. */
  reason: string | null;
  /** Extension digits, if one was written after the number. */
  extension: string | null;
}

const KEYPAD: Record<string, string> = {
  A: "2", B: "2", C: "2", D: "3", E: "3", F: "3", G: "4", H: "4", I: "4",
  J: "5", K: "5", L: "5", M: "6", N: "6", O: "6", P: "7", Q: "7", R: "7",
  S: "7", T: "8", U: "8", V: "8", W: "9", X: "9", Y: "9", Z: "9",
};

// The extension marker must follow at least one digit so that a vanity word
// ending in "x" (or a lone "#") is not misread as an extension.
const EXTENSION = /^(.*\d[\s.)-]*?)[\s,;]*(?:extension|ext\.?|x|#)\s*[.:]?\s*(\d{1,7})\s*#?$/i;

function invalid(reason: string, extra: Partial<PhoneResult> = {}): PhoneResult {
  return {
    e164: null,
    national: null,
    international: null,
    country: null,
    valid: false,
    reason,
    extension: null,
    ...extra,
  };
}

function splitCallingCode(digits: string): [CountryCode, string] | null {
  for (const [code, country] of CALLING_CODES) {
    if (digits.startsWith(code)) return [country, digits.slice(code.length)];
  }
  return null;
}

/**
 * Normalises a phone number written in any common style into E.164 plus
 * readable national and international formats.
 */
export function formatPhone(input: string, options: FormatOptions = {}): PhoneResult {
  let defaultCountry: CountryCode | null = null;
  if (options.defaultCountry !== undefined) {
    defaultCountry = parseCountry(String(options.defaultCountry));
    if (!defaultCountry) {
      throw new RangeError(`Unsupported defaultCountry "${options.defaultCountry}"`);
    }
  }

  let text = String(input ?? "").trim();
  if (text === "") return invalid("empty");

  let extension: string | null = null;
  const ext = EXTENSION.exec(text);
  if (ext) {
    text = ext[1];
    extension = ext[2];
  }

  if (/[^0-9A-Za-z\s.\-()\/+]/.test(text)) {
    return invalid("contains unexpected characters", { extension });
  }

  let international = /^\s*\+/.test(text);
  if (text.lastIndexOf("+") > 0) return invalid("misplaced '+'", { extension });

  // "+44 (0)20 ..." shows the trunk prefix for domestic callers; it is never dialled
  // from abroad, so drop it before collecting digits.
  text = text.replace(/\(\s*0\s*\)/g, "");

  // Vanity letters only make sense alongside real digits; "n/a" or "TBC" is not a number.
  if (!/\d/.test(text)) return invalid("no digits", { extension });
  let digits = text.replace(/[A-Za-z]/g, (ch) => KEYPAD[ch.toUpperCase()]).replace(/\D/g, "");

  if (!international) {
    if (digits.startsWith("00")) {
      digits = digits.slice(2);
      international = true;
    } else if (
      digits.startsWith("011") &&
      (defaultCountry === "US" || defaultCountry === "CA" || defaultCountry === null)
    ) {
      digits = digits.slice(3);
      international = true;
    }
  }

  let country: CountryCode;
  let nsn: string;

  if (international) {
    const match = splitCallingCode(digits);
    if (!match) return invalid("unsupported country code", { extension });
    [country, nsn] = match;
    const trunk = RULES[country].trunkPrefix;
    if (trunk && nsn.startsWith(trunk)) nsn = nsn.slice(trunk.length);
  } else {
    if (!defaultCountry) {
      return invalid("no country code and no defaultCountry", { extension });
    }
    country = defaultCountry;
    nsn = digits;
    const rule = RULES[country];
    if (rule.callingCode === "1") {
      if (nsn.length === 11 && nsn.startsWith("1")) nsn = nsn.slice(1);
    } else if (nsn.startsWith(rule.trunkPrefix)) {
      nsn = nsn.slice(rule.trunkPrefix.length);
    } else if (nsn.startsWith(rule.callingCode) && nsn.length > 10) {
      // Common in spreadsheets: "447700900123" with the plus sign lost.
      nsn = nsn.slice(rule.callingCode.length);
    }
  }

  if (RULES[country].callingCode === "1") country = resolveNanpCountry(nsn);
  const rule = RULES[country];

  const reason = rule.check(nsn);
  if (reason) return invalid(reason, { country, extension });

  const groups = rule.group(nsn);
  let national: string;
  let intl: string;
  if (rule.callingCode === "1") {
    national = `(${groups[0]}) ${groups[1]}-${groups[2]}`;
    intl = `+1 ${groups.join("-")}`;
  } else {
    national = rule.trunkPrefix + groups.join(" ");
    intl = `+${rule.callingCode} ${groups.join(" ")}`;
  }

  return {
    e164: `+${rule.callingCode}${nsn}`,
    national,
    international: intl,
    country,
    valid: true,
    reason: null,
    extension,
  };
}

export { parseCsv, stringifyCsv } from "./csv";
