/**
 * Regression: internal pipeline must not reintroduce legacy mode field names.
 * Canonical protocol: executive_summary.final_mode (+ intent_framing.interaction_mode).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_DIR = join(import.meta.dirname, '..');

type AllowRule = {
  file: RegExp;
  /** When set, only lines matching this pattern are allowed to contain forbidden tokens. */
  line?: RegExp;
};

const FORBIDDEN_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'response_mode', pattern: /\bresponse_mode\b/ },
  { name: 'current_response_mode', pattern: /\bcurrent_response_mode\b/ },
];

/** Files/lines that may reference legacy names only for guards or negative assertions. */
const ALLOW_RULES: AllowRule[] = [
  { file: /architecture-invariants\.ts$/, line: /response_mode/ },
  { file: /architecture-invariants\.test\.ts$/, line: /response_mode/ },
  { file: /mode-protocol-remnants\.test\.ts$/, line: /response_mode|current_response_mode|FORBIDDEN_PATTERNS/ },
  { file: /conversation-state\.test\.ts$/, line: /current_response_mode/ },
  { file: /evaluation-harness\.test\.ts$/, line: /response_mode/ },
];

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      walkTsFiles(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function isLineAllowed(filePath: string, line: string): boolean {
  return ALLOW_RULES.some((rule) => {
    if (!rule.file.test(filePath)) return false;
    if (!rule.line) return true;
    return rule.line.test(line);
  });
}

describe('internal mode protocol remnants', () => {
  it('src/ 不含未豁免的 response_mode 或 current_response_mode', () => {
    const violations: string[] = [];

    for (const file of walkTsFiles(SRC_DIR)) {
      const rel = relative(SRC_DIR, file);
      const lines = readFileSync(file, 'utf8').split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (isLineAllowed(file, line)) continue;

        for (const { name, pattern } of FORBIDDEN_PATTERNS) {
          if (pattern.test(line)) {
            violations.push(`${rel}:${i + 1} — ${name}: ${line.trim()}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
