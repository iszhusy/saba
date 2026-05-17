import type { TreatmentCategory } from '../types/index.js';

export interface BaselineSelectOption {
  value: string;
  label: string;
}

export interface BaselineOptionGroup {
  label: string;
  options: BaselineSelectOption[];
}

export const TREATMENT_CATEGORY_PRESETS: Array<{ value: TreatmentCategory; label: string }> = [
  { value: 'chemotherapy', label: '化疗' },
  { value: 'targeted', label: '靶向治疗' },
  { value: 'endocrine', label: '内分泌治疗' },
  { value: 'immunotherapy', label: '免疫治疗' },
  { value: 'radiation', label: '放疗' },
  { value: 'general', label: '术后随访/其他' },
];

const IN_PROGRESS = '治疗进行中';
const INTERVAL_PROGNOSIS = '间隔期 / 预后';
const POSTOP = '术后恢复';
const FOLLOWUP = '随访 / 预后';

/** 按治疗类型分组的时间锚点（选中类型后展示） */
export const ANCHOR_GROUPS_BY_CATEGORY: Record<TreatmentCategory, BaselineOptionGroup[]> = {
  chemotherapy: [
    {
      label: IN_PROGRESS,
      options: [
        { value: '化疗第1周期第1天', label: '第1周期第1天' },
        { value: '化疗第1周期进行中', label: '第1周期进行中' },
        { value: '化疗第2周期', label: '第2周期' },
        { value: '化疗第3周期及以后', label: '第3周期及以后' },
      ],
    },
    {
      label: INTERVAL_PROGNOSIS,
      options: [
        { value: '两周期化疗间隔中', label: '两周期化疗间隔中' },
        { value: '化疗已全部完成，随访中', label: '化疗已全部完成，随访中' },
      ],
    },
  ],
  targeted: [
    {
      label: IN_PROGRESS,
      options: [
        { value: '靶向/免疫治疗第1周期', label: '第1周期 / 刚开始' },
        { value: '靶向治疗第2周期及以后', label: '第2周期及以后' },
        { value: '靶向治疗进行中（周期不详）', label: '进行中（周期不详）' },
      ],
    },
    {
      label: INTERVAL_PROGNOSIS,
      options: [
        { value: '靶向治疗暂停/间隔中', label: '暂停或间隔中' },
        { value: '靶向治疗已结束，随访中', label: '已结束，随访中' },
      ],
    },
  ],
  endocrine: [
    {
      label: IN_PROGRESS,
      options: [
        { value: '内分泌治疗第1个月', label: '刚开始（1个月内）' },
        { value: '内分泌治疗第3个月', label: '约3个月' },
        { value: '内分泌治疗满6个月', label: '满6个月' },
        { value: '内分泌治疗满1年', label: '满1年及以上' },
      ],
    },
    {
      label: FOLLOWUP,
      options: [
        { value: '内分泌治疗已停药，随访中', label: '已停药，随访中' },
        { value: '内分泌治疗换方案调整中', label: '换方案调整中' },
      ],
    },
  ],
  immunotherapy: [
    {
      label: IN_PROGRESS,
      options: [
        { value: '免疫治疗第1周期', label: '第1周期' },
        { value: '免疫治疗第2周期及以后', label: '第2周期及以后' },
        { value: '免疫治疗进行中', label: '进行中（周期不详）' },
      ],
    },
    {
      label: INTERVAL_PROGNOSIS,
      options: [
        { value: '免疫治疗间隔/暂停中', label: '间隔或暂停中' },
        { value: '免疫治疗已结束，随访中', label: '已结束，随访中' },
      ],
    },
  ],
  radiation: [
    {
      label: IN_PROGRESS,
      options: [
        { value: '放疗第1周', label: '第1周' },
        { value: '放疗进行中', label: '放疗进行中' },
        { value: '放疗接近尾声', label: '接近尾声' },
      ],
    },
    {
      label: INTERVAL_PROGNOSIS,
      options: [
        { value: '放疗刚结束1周内', label: '刚结束1周内' },
        { value: '放疗结束随访中', label: '结束，随访中' },
      ],
    },
  ],
  general: [
    {
      label: POSTOP,
      options: [
        { value: '术后第1周', label: '术后第1周' },
        { value: '术后1个月内', label: '术后1个月内' },
        { value: '术后3个月内', label: '术后3个月内' },
      ],
    },
    {
      label: FOLLOWUP,
      options: [
        { value: '定期复查随访中', label: '定期复查随访中' },
        { value: '治疗已全部完成，居家观察', label: '治疗已完成，居家观察' },
        { value: '尚未开始系统治疗，观察等待', label: '尚未开始系统治疗' },
      ],
    },
  ],
};

/** 按治疗类型过滤的主要方案 */
export const REGIMEN_PRESETS_BY_CATEGORY: Record<TreatmentCategory, BaselineSelectOption[]> = {
  chemotherapy: [
    { value: 'AC-T', label: 'AC-T' },
    { value: 'EC-T', label: 'EC-T' },
    { value: 'T-DXd', label: 'T-DXd（德曲妥珠单抗）' },
    { value: '紫杉醇 + 曲妥珠单抗', label: '紫杉醇 + 曲妥珠单抗' },
    { value: '卡铂 + 紫杉醇', label: '卡铂 + 紫杉醇' },
    { value: '口服化疗（卡培他滨等）', label: '口服化疗（卡培他滨等）' },
  ],
  targeted: [
    { value: '曲妥珠单抗', label: '曲妥珠单抗' },
    { value: '曲妥珠单抗 + 帕妥珠单抗', label: '曲妥珠单抗 + 帕妥珠单抗' },
    { value: 'T-DXd', label: 'T-DXd（德曲妥珠单抗）' },
    { value: '吡咯替尼 / 拉帕替尼', label: '吡咯替尼 / 拉帕替尼' },
    { value: 'CDK4/6 抑制剂', label: 'CDK4/6 抑制剂' },
  ],
  endocrine: [
    { value: '他莫昔芬', label: '他莫昔芬' },
    { value: '来曲唑 / 阿那曲唑', label: '来曲唑 / 阿那曲唑' },
    { value: 'CDK4/6 抑制剂 + 内分泌', label: 'CDK4/6 抑制剂 + 内分泌' },
    { value: '依西美坦', label: '依西美坦' },
    { value: '卵巢抑制 + 内分泌', label: '卵巢抑制 + 内分泌' },
  ],
  immunotherapy: [
    { value: '帕博利珠单抗', label: '帕博利珠单抗' },
    { value: '阿替利珠单抗', label: '阿替利珠单抗' },
    { value: '免疫 + 化疗联合', label: '免疫 + 化疗联合' },
  ],
  radiation: [
    { value: '术后胸壁/区域放疗', label: '术后胸壁/区域放疗' },
    { value: '保乳术后全乳放疗', label: '保乳术后全乳放疗' },
    { value: '骨转移姑息放疗', label: '骨转移姑息放疗' },
    { value: '脑转移姑息放疗', label: '脑转移姑息放疗' },
  ],
  general: [
    { value: '术后内分泌维持', label: '术后内分泌维持' },
    { value: '单纯定期复查', label: '单纯定期复查' },
    { value: '临床试验方案', label: '临床试验方案' },
  ],
};

const CATEGORY_LABEL_MAP = Object.fromEntries(
  TREATMENT_CATEGORY_PRESETS.map((item) => [item.value, item.label]),
) as Record<TreatmentCategory, string>;

const KNOWN_CATEGORY_IDS = new Set<string>(TREATMENT_CATEGORY_PRESETS.map((item) => item.value));

const CUSTOM_OPTIONS_STORAGE_PREFIX = 'saba:baseline-custom:';

export function resolveTreatmentCategoryKey(category: string): TreatmentCategory {
  const trimmed = category.trim();
  if (KNOWN_CATEGORY_IDS.has(trimmed)) {
    return trimmed as TreatmentCategory;
  }
  return 'general';
}

export function getAnchorGroupsForCategory(category: string): BaselineOptionGroup[] {
  const key = resolveTreatmentCategoryKey(category);
  return ANCHOR_GROUPS_BY_CATEGORY[key];
}

export function flattenOptionGroups(groups: BaselineOptionGroup[]): BaselineSelectOption[] {
  return groups.flatMap((group) => group.options);
}

export function getRegimenPresetsForCategory(category: string): BaselineSelectOption[] {
  const key = resolveTreatmentCategoryKey(category);
  return REGIMEN_PRESETS_BY_CATEGORY[key];
}

export function isValueInBaselineOptions(
  value: string,
  options: BaselineSelectOption[],
): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  return options.some((option) => option.value === trimmed);
}

export function baselineFieldStorageKey(baseKey: string, category: string): string {
  if (!category.trim()) {
    return baseKey;
  }
  return `${baseKey}:${resolveTreatmentCategoryKey(category)}`;
}

export function loadCustomBaselineOptions(fieldKey: string): BaselineSelectOption[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem(`${CUSTOM_OPTIONS_STORAGE_PREFIX}${fieldKey}`);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => {
        const value = item.trim();
        return { value, label: value };
      });
  } catch {
    return [];
  }
}

export function saveCustomBaselineOption(fieldKey: string, value: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }
  const existing = loadCustomBaselineOptions(fieldKey);
  const next = [...existing.filter((item) => item.value !== trimmed), { value: trimmed, label: trimmed }];
  localStorage.setItem(`${CUSTOM_OPTIONS_STORAGE_PREFIX}${fieldKey}`, JSON.stringify(next.map((item) => item.value)));
}

export function formatTreatmentCategoryLabel(category?: string): string {
  if (!category?.trim()) {
    return '未填写';
  }
  const known = CATEGORY_LABEL_MAP[category as TreatmentCategory];
  return known ?? category;
}
