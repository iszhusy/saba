import type {
  AssessPipelineStepId,
  AssessResponse,
  AssessStreamEvent,
} from '../types/index.js';

export interface AssessStreamSink {
  emit(event: AssessStreamEvent): void;
}

export interface StreamingStepState {
  status: 'pending' | 'active' | 'done';
  detail?: string;
}

export const PIPELINE_STEP_LABELS: Record<AssessPipelineStepId, string> = {
  intent_framing: '理解对话意图',
  clinical_triage: '症状识别与规则初判',
  evidence_retrieval: '检索循证知识',
  risk_deliberation: '风险综合审议',
  safety_check: '安全校验',
  executive_synthesis: '生成患者回复',
};

export function emitPipelineStep(
  sink: AssessStreamSink | undefined,
  step: AssessPipelineStepId,
  status: 'start' | 'done',
  detail?: string,
): void {
  if (!sink) return;
  sink.emit({
    type: 'step',
    step,
    status,
    label: PIPELINE_STEP_LABELS[step],
    detail,
  });
}

export function createAssessStreamSink(onEvent: (event: AssessStreamEvent) => void): AssessStreamSink {
  return { emit: onEvent };
}

export function encodeSseEvent(event: AssessStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** 将完整文本切成小块推送到 message 流（改善首字延迟观感） */
export async function emitMessageStream(
  sink: AssessStreamSink,
  text: string,
  chunkSize = 8,
  delayMs = 12,
): Promise<void> {
  const normalized = text.trim();
  if (!normalized) return;

  for (let i = 0; i < normalized.length; i += chunkSize) {
    sink.emit({ type: 'message', delta: normalized.slice(i, i + chunkSize) });
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export async function streamAssessResponse(
  sink: AssessStreamSink,
  result: AssessResponse,
): Promise<void> {
  emitPipelineStep(sink, 'executive_synthesis', 'start');
  const messageText = result.reasoning?.trim() || result.immediate_action;
  await emitMessageStream(sink, messageText);
  emitPipelineStep(sink, 'executive_synthesis', 'done');
  sink.emit({ type: 'done', result });
}
