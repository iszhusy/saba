import { describe, expect, it } from 'vitest';
import {
  flattenOptionGroups,
  getAnchorGroupsForCategory,
  getRegimenPresetsForCategory,
  isValueInBaselineOptions,
  resolveTreatmentCategoryKey,
} from './baseline-field-presets.js';

describe('baseline-field-presets cascade', () => {
  it('resolves unknown category to general', () => {
    expect(resolveTreatmentCategoryKey('临床试验')).toBe('general');
    expect(resolveTreatmentCategoryKey('chemotherapy')).toBe('chemotherapy');
  });

  it('returns grouped anchors for chemotherapy with in-progress and interval', () => {
    const groups = getAnchorGroupsForCategory('chemotherapy');
    expect(groups.length).toBeGreaterThanOrEqual(2);
    expect(groups[0]?.label).toContain('进行中');
    const flat = flattenOptionGroups(groups);
    expect(flat.some((o) => o.value.includes('化疗第1周期'))).toBe(true);
    expect(flat.some((o) => o.value.includes('间隔'))).toBe(true);
  });

  it('returns regimen presets scoped to endocrine', () => {
    const regimens = getRegimenPresetsForCategory('endocrine');
    expect(regimens.some((o) => o.value.includes('他莫昔芬'))).toBe(true);
    expect(regimens.some((o) => o.value === 'AC-T')).toBe(false);
  });

  it('clears incompatible anchor when category changes', () => {
    const chemoAnchors = flattenOptionGroups(getAnchorGroupsForCategory('chemotherapy'));
    const endocrineAnchors = flattenOptionGroups(getAnchorGroupsForCategory('endocrine'));
    expect(isValueInBaselineOptions('化疗第2周期', chemoAnchors)).toBe(true);
    expect(isValueInBaselineOptions('化疗第2周期', endocrineAnchors)).toBe(false);
  });
});
