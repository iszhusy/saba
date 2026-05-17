import { useEffect, useMemo, useState } from 'react';
import type { PatientBaseline, TraceContext } from '../../types/index';
import { formatTreatmentCategoryLabel } from '../../lib/baseline-field-presets';
import { createChildTraceContext, createTraceContext } from '../../lib/trace';
import { BaselineIntakeCard } from '../chat/BaselineIntakeCard';
import { FeedbackState } from '../ui/FeedbackState';

interface ProfilePageProps {
  userId: string;
}

async function fetchBaseline(userId: string, trace?: TraceContext): Promise<PatientBaseline | null> {
  const response = await fetch(`/api/v1/baseline?user_id=${encodeURIComponent(userId)}`, {
    headers: trace
      ? {
          'X-Trace-Id': trace.trace_id,
          'X-Span-Id': trace.span_id,
          ...(trace.parent_span_id ? { 'X-Parent-Span-Id': trace.parent_span_id } : {}),
          'X-Trace-Flow': trace.flow,
        }
      : undefined,
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`读取档案失败 (${response.status}): ${text}`);
  }
  return (await response.json()) as PatientBaseline;
}

async function saveBaseline(userId: string, input: {
  treatment_category: string;
  treatment_anchor: string;
  primary_regimen?: string;
}, trace?: TraceContext): Promise<PatientBaseline> {
  const response = await fetch('/api/v1/baseline', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(trace
        ? {
            'X-Trace-Id': trace.trace_id,
            'X-Span-Id': trace.span_id,
            ...(trace.parent_span_id ? { 'X-Parent-Span-Id': trace.parent_span_id } : {}),
            'X-Trace-Flow': trace.flow,
          }
        : {}),
    },
    body: JSON.stringify({
      user_id: userId,
      treatment_category: input.treatment_category,
      treatment_anchor: input.treatment_anchor,
      primary_regimen: input.primary_regimen,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`保存档案失败 (${response.status}): ${text}`);
  }
  return (await response.json()) as PatientBaseline;
}

export function ProfilePage({ userId }: ProfilePageProps) {
  const [baseline, setBaseline] = useState<PatientBaseline | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const traceRef = useState(() => createTraceContext('baseline'))[0];

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const next = await fetchBaseline(userId, createChildTraceContext(traceRef, 'baseline'));
        if (!isMounted) {
          return;
        }
        setBaseline(next);
      } catch (error) {
        if (!isMounted) {
          return;
        }
        const message = error instanceof Error ? error.message : '读取档案失败';
        setErrorMessage(message);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  const baselineSummary = useMemo(() => {
    if (!baseline) {
      return null;
    }
    return [
      {
        label: '治疗类型',
        value: formatTreatmentCategoryLabel(baseline.treatment_category),
      },
      {
        label: '时间锚点',
        value: baseline.treatment_anchor ?? '未填写',
      },
      {
        label: '主要方案',
        value: baseline.primary_regimen ?? '未填写',
      },
      {
        label: '最后更新时间',
        value: new Date(baseline.updated_at).toLocaleString('zh-CN', {
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      },
    ];
  }, [baseline]);

  const handleSubmit = async (input: {
    treatment_category: string;
    treatment_anchor: string;
    primary_regimen?: string;
  }) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    const saved = await saveBaseline(userId, input, createChildTraceContext(traceRef, 'baseline'));
    setBaseline(saved);
    setSuccessMessage('档案已保存，后续评估会直接使用这些基础信息。');
  };

  return (
    <section className="profile-page">
      {errorMessage && <FeedbackState variant="error" message={errorMessage} />}

      {successMessage && <FeedbackState variant="success" message={successMessage} />}

      <div className="profile-page__grid">
        <section className="profile-page__panel profile-page__panel--record">
          <h3 className="profile-page__panel-title">当前档案</h3>
          {isLoading ? (
            <div className="saba-skeleton" />
          ) : baselineSummary ? (
            <dl className="profile-page__summary">
              {baselineSummary.map((item) => (
                <div key={item.label} className="profile-page__summary-row">
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="profile-page__empty">尚未建立档案，请先填写下方基础信息。</p>
          )}
        </section>

        <section className="profile-page__panel profile-page__panel--record">
          <h3 className="profile-page__panel-title">编辑档案</h3>
          <BaselineIntakeCard
            initial={baseline ?? undefined}
            prompt="请补充或更新治疗背景。保存后，后续评估将直接复用。"
            onSubmit={handleSubmit}
            disabled={isLoading}
          />
        </section>
      </div>

      <p className="profile-page__disclaimer">
        档案信息用于辅助副作用风险评估，不构成诊断或处方建议。如有急性或加重症状，请立即联系主治医生或急诊。
      </p>
    </section>
  );
}
