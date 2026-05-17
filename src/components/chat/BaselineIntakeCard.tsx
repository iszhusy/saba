import { useState } from 'react';
import type { PatientBaseline, TreatmentCategory } from '../../types/index';

/**
 * 基线建档卡：当 assess 返回的 clarification_questions 含 `baseline_*` 问句时展示。
 * MVP 三字段：治疗大类 + 时间锚点 + 可选 regimen。
 * 提交后会先 PUT /api/v1/baseline，再触发下一轮 assess。
 */
export interface BaselineIntakeCardProps {
  initial?: Partial<PatientBaseline>;
  prompt?: string;
  onSubmit: (input: {
    treatment_category: TreatmentCategory;
    treatment_anchor: string;
    primary_regimen?: string;
  }) => Promise<void>;
  disabled?: boolean;
}

const TREATMENT_CATEGORIES: Array<{ id: TreatmentCategory; label: string }> = [
  { id: 'chemotherapy', label: '化疗' },
  { id: 'targeted', label: '靶向治疗' },
  { id: 'endocrine', label: '内分泌治疗' },
  { id: 'immunotherapy', label: '免疫治疗' },
  { id: 'radiation', label: '放疗' },
  { id: 'general', label: '术后随访/其他' },
];

export function BaselineIntakeCard({
  initial,
  prompt,
  onSubmit,
  disabled,
}: BaselineIntakeCardProps) {
  const initialCategory = initial?.treatment_category;
  const normalizedInitialCategory = TREATMENT_CATEGORIES.find(
    (option) => option.id === initialCategory,
  )?.id;
  const [category, setCategory] = useState<TreatmentCategory | ''>(
    normalizedInitialCategory ?? '',
  );
  const [anchor, setAnchor] = useState<string>(initial?.treatment_anchor ?? '');
  const [regimen, setRegimen] = useState<string>(initial?.primary_regimen ?? '');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = !!category && !!anchor.trim() && !submitting && !disabled;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({
        treatment_category: category,
        treatment_anchor: anchor.trim(),
        primary_regimen: regimen.trim() || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="baseline-intake-card" role="group" aria-label="治疗基线建档">
      {prompt && <p className="baseline-intake-card__prompt">{prompt}</p>}

      <label className="baseline-intake-card__field">
        <span className="baseline-intake-card__label">当前治疗类型</span>
        <div className="baseline-intake-card__options">
          {TREATMENT_CATEGORIES.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`baseline-intake-card__option ${category === opt.id ? 'baseline-intake-card__option--selected' : ''}`}
              onClick={() => setCategory(opt.id)}
              aria-pressed={category === opt.id}
              disabled={disabled}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </label>

      <label className="baseline-intake-card__field">
        <span className="baseline-intake-card__label">时间锚点</span>
        <input
          type="text"
          className="baseline-intake-card__input"
          placeholder="例如：上周三手术 / 化疗第2周期第3天"
          value={anchor}
          onChange={(e) => setAnchor(e.target.value)}
          disabled={disabled}
        />
      </label>

      <label className="baseline-intake-card__field">
        <span className="baseline-intake-card__label">主要方案（可选）</span>
        <input
          type="text"
          className="baseline-intake-card__input"
          placeholder="例如：AC-T / 紫杉醇 + 帕妥珠单抗"
          value={regimen}
          onChange={(e) => setRegimen(e.target.value)}
          disabled={disabled}
        />
      </label>

      <button
        type="button"
        className="baseline-intake-card__submit"
        onClick={() => void handleSubmit()}
        disabled={!canSubmit}
      >
        {submitting ? '正在保存档案…' : '保存档案并继续'}
      </button>
      <p className="baseline-intake-card__hint">
        档案只保存一次，后续评估自动复用。完成后系统将基于您当前的症状继续分析。
      </p>
    </div>
  );
}
