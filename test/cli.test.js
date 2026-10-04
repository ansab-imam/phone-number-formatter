const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, readFileSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const CLI = join(__dirname, "..", "dist", "cli.js");
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

test("formats a single number as E.164 by default", () => {
  const r = run("+44 (0)20 7946 0000");
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "+442079460000\n");
});

test("supports --country and --format", () => {
  const r = run("--country", "US", "--format", "national", "415.555.0123 x7");
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "(415) 555-0123 ext. 7\n");
  const j = JSON.parse(run("-c", "AU", "-f", "json", "0491 570 157").stdout);
  assert.equal(j.e164, "+61491570157");
  assert.equal(j.input, "0491 570 157");
});

test("exits 1 for an invalid number and 2 for usage errors", () => {
  const bad = run("--country", "US", "555");
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /invalid: 555 \(too short\)/);
  assert.equal(run().status, 2);
  assert.equal(run("--country", "FR", "1").status, 2);
  assert.equal(run("--bogus").status, 2);
});

test("prints help and version", () => {
  assert.match(run("--help").stdout, /Usage:/);
  const pkg = require("../package.json");
  assert.equal(run("--version").stdout.trim(), pkg.version);
});

test("adds phone_e164 and phone_valid columns in CSV mode", () => {
  const dir = mkdtempSync(join(tmpdir(), "phone-format-"));
  try {
    const input = join(dir, "in.csv");
    const output = join(dir, "out.csv");
    writeFileSync(
      input,
      'Name,Phone\r\n"Lead, A",(415) 555-0100\r\nLead B,+44 (0)20 7946 0001\r\nLead C,not given\r\n'
    );
    const r = run("--csv", input, "--column", "phone", "--country", "US", "-o", output);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /2 valid, 1 invalid/);
    assert.equal(
      readFileSync(output, "utf8"),
      'Name,Phone,phone_e164,phone_valid\r\n"Lead, A",(415) 555-0100,+14155550100,true\r\n' +
        "Lead B,+44 (0)20 7946 0001,+442079460001,true\r\nLead C,not given,,false\r\n"
    );
    const missing = run("--csv", input, "--column", "Mobile");
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /Column "Mobile" not found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
