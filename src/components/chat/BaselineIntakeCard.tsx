import { useMemo, useState } from 'react';
import type { PatientBaseline } from '../../types/index';
import {
  baselineFieldStorageKey,
  flattenOptionGroups,
  formatTreatmentCategoryLabel,
  getAnchorGroupsForCategory,
  getRegimenPresetsForCategory,
  isValueInBaselineOptions,
  TREATMENT_CATEGORY_PRESETS,
} from '../../lib/baseline-field-presets';
import { CreatableSelect } from '../ui/CreatableSelect';

/**
 * 基线建档卡：当 assess 返回的 clarification_questions 含 `baseline_*` 问句时展示。
 * 治疗类型 → 时间锚点 / 主要方案 级联预设。
 */
export interface BaselineIntakeCardProps {
  initial?: Partial<PatientBaseline>;
  prompt?: string;
  onSubmit: (input: {
    treatment_category: string;
    treatment_anchor: string;
    primary_regimen?: string;
  }) => Promise<void>;
  disabled?: boolean;
}

export function BaselineIntakeCard({
  initial,
  prompt,
  onSubmit,
  disabled,
}: BaselineIntakeCardProps) {
  const [category, setCategory] = useState<string>(initial?.treatment_category ?? '');
  const [anchor, setAnchor] = useState<string>(initial?.treatment_anchor ?? '');
  const [regimen, setRegimen] = useState<string>(initial?.primary_regimen ?? '');
  const [submitting, setSubmitting] = useState(false);

  const categorySelected = !!category.trim();
  const anchorGroups = useMemo(
    () => (categorySelected ? getAnchorGroupsForCategory(category) : []),
    [category, categorySelected],
  );
  const regimenPresets = useMemo(
    () => (categorySelected ? getRegimenPresetsForCategory(category) : []),
    [category, categorySelected],
  );

  const anchorFieldKey = baselineFieldStorageKey('treatment_anchor', category);
  const regimenFieldKey = baselineFieldStorageKey('primary_regimen', category);

  const handleCategoryChange = (next: string) => {
    setCategory(next);
    if (!next.trim()) {
      setAnchor('');
      setRegimen('');
      return;
    }
    const nextAnchors = flattenOptionGroups(getAnchorGroupsForCategory(next));
    const nextRegimens = getRegimenPresetsForCategory(next);
    if (!isValueInBaselineOptions(anchor, nextAnchors)) {
      setAnchor('');
    }
    if (!isValueInBaselineOptions(regimen, nextRegimens)) {
      setRegimen('');
    }
  };

  const canSubmit = categorySelected && !!anchor.trim() && !submitting && !disabled;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({
        treatment_category: category.trim(),
        treatment_anchor: anchor.trim(),
        primary_regimen: regimen.trim() || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const categoryHint = categorySelected
    ? `已选「${formatTreatmentCategoryLabel(category)}」，下方选项已按该类型筛选`
    : undefined;

  return (
    <div className="baseline-intake-card" role="group" aria-label="治疗基线建档">
      {prompt && <p className="baseline-intake-card__prompt">{prompt}</p>}

      <CreatableSelect
        fieldKey="treatment_category"
        label="当前治疗类型"
        value={category}
        onChange={handleCategoryChange}
        presets={TREATMENT_CATEGORY_PRESETS}
        placeholder="请选择治疗类型"
        disabled={disabled}
        required
      />

      <CreatableSelect
        fieldKey={anchorFieldKey}
        label="时间锚点"
        value={anchor}
        onChange={setAnchor}
        presetGroups={anchorGroups}
        placeholder="请先选择治疗类型"
        disabled={disabled || !categorySelected}
        required
        hint={
          categorySelected
            ? '按「治疗进行中」或「间隔/预后」选择当前阶段；选不准可用自定义'
            : '请先选择治疗类型，再选时间阶段'
        }
      />

      <CreatableSelect
        fieldKey={regimenFieldKey}
        label="主要方案（可选）"
        value={regimen}
        onChange={setRegimen}
        presets={regimenPresets}
        placeholder="请先选择治疗类型"
        emptyOption={{ value: '', label: '暂不填写' }}
        disabled={disabled || !categorySelected}
        hint={
          categorySelected
            ? `${formatTreatmentCategoryLabel(category)} 常用方案如下，也可自定义`
            : undefined
        }
      />

      {categoryHint ? <p className="baseline-intake-card__cascade-hint">{categoryHint}</p> : null}

      <button
        type="button"
        className="baseline-intake-card__submit"
        onClick={() => void handleSubmit()}
        disabled={!canSubmit}
      >
        {submitting ? '正在保存档案…' : '保存档案并继续'}
      </button>
      <p className="baseline-intake-card__hint">
        先选治疗类型，时间锚点与方案会随之更新。自定义项保存在本机，按治疗类型分别记忆。
      </p>
    </div>
  );
}
