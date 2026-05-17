/**
 * Structured output parsing helpers for LLM responses.
 */

export interface ParsedRiskAssessmentOutput {
  risk_level: 'high' | 'medium' | 'low';
  risk_score: number;
  reasoning: string;
  warning_signs: string[];
  immediate_action: string;
  follow_up: string;
  confidence: number;
  decision_mode?: 'conclusive' | 'provisional' | 'insufficient';
  visible_uncertainty?: string[];
  next_step?: string;
}

function clampScore(score: unknown): number {
  const value = typeof score === 'number' ? score : Number(score);
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeRiskLevel(level: unknown, score: number): 'high' | 'medium' | 'low' {
  if (level === 'high' || level === 'medium' || level === 'low') return level;
  if (score >= 71) return 'high';
  if (score >= 41) return 'medium';
  return 'low';
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function tryParseJSON(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return null;
}

function extractBalancedJSONObject(text: string): string | null {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (char === '}') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          return text.slice(start, i + 1);
        }
      }
    }
  }

  return null;
}

export function extractJSONObject(text: string): Record<string, unknown> | null {
  const direct = tryParseJSON(text.trim());
  if (direct) return direct;

  const fencedMatches = text.match(/```(?:json)?\s*([\s\S]*?)```/gi) ?? [];
  for (const match of fencedMatches) {
    const inner = match.replace(/```(?:json)?/i, '').replace(/```$/, '').trim();
    const parsed = tryParseJSON(inner);
    if (parsed) return parsed;
  }

  const balanced = extractBalancedJSONObject(text);
  if (balanced) {
    const parsed = tryParseJSON(balanced);
    if (parsed) return parsed;
  }

  return null;
}

export function parseRiskAssessmentOutput(text: string): ParsedRiskAssessmentOutput | null {
  const parsed = extractJSONObject(text);
  if (!parsed) return null;

  const riskScore = clampScore(parsed.risk_score);

  return {
    risk_level: normalizeRiskLevel(parsed.risk_level, riskScore),
    risk_score: riskScore,
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    warning_signs: normalizeStringArray(parsed.warning_signs),
    immediate_action: typeof parsed.immediate_action === 'string' ? parsed.immediate_action : '',
    follow_up:
      typeof parsed.follow_up === 'string'
        ? parsed.follow_up
        : '',
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : Number(parsed.confidence ?? 0.8) || 0.8,
    decision_mode:
      parsed.decision_mode === 'conclusive' || parsed.decision_mode === 'provisional' || parsed.decision_mode === 'insufficient'
        ? parsed.decision_mode
        : undefined,
    visible_uncertainty: normalizeStringArray(parsed.visible_uncertainty),
    next_step: typeof parsed.next_step === 'string' ? parsed.next_step : undefined,
  };
}
