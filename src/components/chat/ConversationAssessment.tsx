import { useCallback, useEffect, useRef, useState } from 'react';
import { sabaClient } from '../../client';
import { createBehaviorEventRequest } from '../../lib/assessment-observability';
import { createChildTraceContext, createTraceContext } from '../../lib/trace';
import type {
  AssessRequest,
  AssessResponse,
  AssessmentDetail,
  ClarificationQuestion,
  PatientBaseline,
} from '../../types/index';
import { ChatBubble } from './ChatBubble';
import { ChatComposer } from './ChatComposer';
import { ChatResultMessage } from './ChatResultMessage';
import { BaselineIntakeCard } from './BaselineIntakeCard';
import type { AssessStreamEvent } from '../../types/index';
import { applyStreamStep, StreamingAssessmentView } from './StreamingAssessmentView';
import type { ChatMessageItem, ChatStreamState, ConversationPhase } from './types';
import {
  buildInitialGreetingMessage,
  buildMessagesFromAssessmentDetail,
} from './build-conversation-messages';
import { groupConsecutiveMessages } from './group-messages';
import { usePrefersReducedMotion } from '../../lib/use-prefers-reduced-motion';
import { CHAT_SYMPTOM_QUICK_TAGS } from '../../lib/chat-symptom-tags';

const USER_ID = 'user-123';

function isBaselineQuestion(q: ClarificationQuestion): boolean {
  return q.question_id.startsWith('baseline_');
}

async function upsertBaselineRequest(input: {
  user_id: string;
  treatment_category: string;
  treatment_anchor: string;
  primary_regimen?: string;
  trace?: AssessRequest['trace'];
}): Promise<PatientBaseline> {
  const res = await fetch('/api/v1/baseline', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(input.trace
        ? {
            'X-Trace-Id': input.trace.trace_id,
            'X-Span-Id': input.trace.span_id,
            ...(input.trace.parent_span_id ? { 'X-Parent-Span-Id': input.trace.parent_span_id } : {}),
            'X-Trace-Flow': input.trace.flow,
          }
        : {}),
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`保存基线失败 (${res.status}): ${text}`);
  }
  return (await res.json()) as PatientBaseline;
}

interface ConversationAssessmentProps {
  onDraftChange?: (hasDraft: boolean) => void;
  onComplete?: (result: AssessmentDetail) => void;
  onContactTeam?: () => void;
  /** 从历史等入口灌入只读对话；变更时重建气泡 */
  hydrateAssessment?: AssessmentDetail | null;
  onExitHydrate?: () => void;
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toAssessmentDetail(response: AssessResponse): AssessmentDetail {
  return {
    ...response,
    assessment_id: response.assessment_id,
    user_id: response.user_id ?? USER_ID,
    created_at: response.created_at,
  };
}

function isClarificationResult(response: AssessResponse): boolean {
  return response.executive_summary?.status === 'clarification_required';
}

export function ConversationAssessment({
  onDraftChange,
  onComplete,
  onContactTeam,
  hydrateAssessment,
  onExitHydrate,
}: ConversationAssessmentProps) {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [phase, setPhase] = useState<ConversationPhase>('chat');
  const [composerText, setComposerText] = useState('');
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [episodeId, setEpisodeId] = useState<string | undefined>();
  const [result, setResult] = useState<AssessmentDetail | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const initialized = useRef(false);
  const [showBaselineCard, setShowBaselineCard] = useState(false);
  const [streamState, setStreamState] = useState<ChatStreamState | null>(null);
  const [isAssessing, setIsAssessing] = useState(false);
  const lastUserInputRef = useRef<string>('');
  const startedTrackedRef = useRef(false);
  const assessmentTraceRef = useRef(createTraceContext('assessment'));
  const hydratedAssessmentIdRef = useRef<string | null>(null);

  const hasDraft = composerText.trim().length > 0;

  useEffect(() => {
    onDraftChange?.(hasDraft && phase === 'chat');
  }, [hasDraft, phase, onDraftChange]);

  useEffect(() => {
    if (startedTrackedRef.current) {
      return;
    }

    startedTrackedRef.current = true;
    void sabaClient.trackBehaviorEvent(
      createBehaviorEventRequest({
        event: 'assessment_started',
        userId: USER_ID,
        metadata: {
          source: 'conversation',
        },
        trace: createChildTraceContext(assessmentTraceRef.current, 'behavior_event'),
      }),
    );
  }, []);

  const appendMessage = useCallback((role: 'assistant' | 'user', text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === role && last.text === trimmed) {
        return prev;
      }
      return [...prev, { id: createId(), role, text: trimmed }];
    });
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({
        top: el.scrollHeight,
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    });
  }, [prefersReducedMotion]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, phase, result, isAssessing, streamState, scrollToBottom]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setMessages([buildInitialGreetingMessage()]);
  }, []);

  useEffect(() => {
    const assessmentId = hydrateAssessment?.assessment_id;
    if (!assessmentId) {
      hydratedAssessmentIdRef.current = null;
      return;
    }
    if (hydratedAssessmentIdRef.current === assessmentId) {
      return;
    }
    hydratedAssessmentIdRef.current = assessmentId;
    setMessages(buildMessagesFromAssessmentDetail(hydrateAssessment));
    setSessionId(hydrateAssessment.session_id);
    setEpisodeId(hydrateAssessment.episode_id);
    setResult(hydrateAssessment);
    setShowBaselineCard(false);
    setStreamState(null);
    setComposerText('');
    setPhase('chat');
  }, [hydrateAssessment]);

  const applyConversationIds = (response: AssessResponse) => {
    if (response.session_id) setSessionId(response.session_id);
    if (response.episode_id) setEpisodeId(response.episode_id);
  };

  const handleServerResponse = (response: AssessResponse) => {
    applyConversationIds(response);
    setStreamState(null);

    if (isClarificationResult(response)) {
      const questions = response.clarification_questions ?? [];
      const baselineGaps = questions.filter(isBaselineQuestion);
      const generalClarifications = questions.filter((question) => !isBaselineQuestion(question));

      void sabaClient.trackBehaviorEvent(
        createBehaviorEventRequest({
          event: 'assessment_clarification_requested',
          userId: USER_ID,
          sessionId: response.session_id,
          metadata: {
            source: 'conversation',
            clarification_question_count: questions.length,
            baseline_question_count: baselineGaps.length,
          },
        }),
      );

      if (baselineGaps.length > 0) {
        void sabaClient.trackBehaviorEvent(
          createBehaviorEventRequest({
            event: 'assessment_baseline_prompted',
            userId: USER_ID,
            sessionId: response.session_id,
            metadata: {
              source: 'conversation',
              baseline_question_count: baselineGaps.length,
              clarification_question_count: questions.length,
            },
          }),
        );
        setShowBaselineCard(true);
      }

      // immediate_action 已含 followUp / 不确定项 / nextStep，避免与 clarification_questions 重复刷屏
      if (response.immediate_action?.trim()) {
        appendMessage('assistant', response.immediate_action);
      } else if (response.reasoning) {
        appendMessage('assistant', response.reasoning);
      } else if (baselineGaps.length === 0) {
        if (questions.length === 0) {
          appendMessage('assistant', '为了更准确评估，请补充具体症状与持续时间。');
        } else {
          questions.forEach((q, index) => {
            appendMessage('assistant', questions.length > 1 ? `${index + 1}. ${q.text}` : q.text);
          });
        }
      } else if (generalClarifications.length > 0) {
        generalClarifications.forEach((q, index) => {
          appendMessage(
            'assistant',
            generalClarifications.length > 1 ? `${index + 1}. ${q.text}` : q.text,
          );
        });
      }
      return;
    }

    setShowBaselineCard(false);
    const detail = toAssessmentDetail(response);
    setResult(detail);
    // 流式结束后 streamState 会清空，必须把终稿写入 messages，否则对话区会变空
    appendMessage('assistant', response.immediate_action);
    setPhase('chat');
    onComplete?.(detail);
  };

  const handleStreamEvent = useCallback((event: AssessStreamEvent) => {
    if (event.type === 'step') {
      setStreamState((prev) => {
        const base: ChatStreamState = prev ?? {
          steps: {},
          thinking: '',
          message: '',
        };
        return {
          ...base,
          steps: applyStreamStep(base.steps, event),
        };
      });
      return;
    }

    if (event.type === 'thinking') {
      setStreamState((prev) => ({
        ...(prev ?? { steps: {}, thinking: '', message: '' }),
        thinking: `${prev?.thinking ?? ''}${event.delta}`,
      }));
      return;
    }

    if (event.type === 'message') {
      setStreamState((prev) => ({
        ...(prev ?? { steps: {}, thinking: '', message: '' }),
        message: `${prev?.message ?? ''}${event.delta}`,
      }));
    }
  }, []);

  const runAssessTurn = useCallback(
    async (input: string) => {
      setIsAssessing(true);
      setStreamState({ steps: {}, thinking: '', message: '' });
      setResult(null);

      const request: AssessRequest = {
        user_id: USER_ID,
        input,
        session_id: sessionId,
        episode_id: episodeId,
        trace: createChildTraceContext(assessmentTraceRef.current, 'assessment'),
      };

      try {
        const response = await sabaClient.assessStream(request, (event) => {
          if (event.type === 'done') {
            setStreamState((prev) =>
              prev
                ? {
                    ...prev,
                    riskLevel: event.result.risk_level,
                    riskScore: event.result.risk_score,
                  }
                : prev,
            );
            return;
          }
          handleStreamEvent(event);
        });
        handleServerResponse(response);
      } catch (error) {
        setStreamState(null);
        const message = error instanceof Error ? error.message : '评估请求失败，请稍后重试';
        appendMessage('assistant', message);
      } finally {
        setIsAssessing(false);
      }
    },
    [sessionId, episodeId, handleStreamEvent, appendMessage],
  );

  const sendMessage = async () => {
    const text = composerText.trim();
    if (!text || isAssessing || phase !== 'chat') return;

    if (hydrateAssessment) {
      onExitHydrate?.();
      hydratedAssessmentIdRef.current = null;
      setMessages([buildInitialGreetingMessage()]);
      setResult(null);
    }

    appendMessage('user', text);
    setComposerText('');
    lastUserInputRef.current = text;
    void sabaClient.trackBehaviorEvent(
      createBehaviorEventRequest({
        event: 'assessment_submitted',
        userId: USER_ID,
        sessionId,
        metadata: {
          source: 'conversation',
          input_length: text.length,
        },
        trace: createChildTraceContext(assessmentTraceRef.current, 'behavior_event'),
      }),
    );
    await runAssessTurn(text);
  };

  const handleBaselineSubmit = async (input: {
    treatment_category: string;
    treatment_anchor: string;
    primary_regimen?: string;
  }) => {
    try {
      await upsertBaselineRequest({
        user_id: USER_ID,
        ...input,
        trace: createChildTraceContext(assessmentTraceRef.current, 'baseline'),
      });
      void sabaClient.trackBehaviorEvent(
        createBehaviorEventRequest({
          event: 'assessment_baseline_submitted',
          userId: USER_ID,
          sessionId,
          metadata: {
            source: 'conversation',
            treatment_category: input.treatment_category,
          },
          trace: createChildTraceContext(assessmentTraceRef.current, 'behavior_event'),
        }),
      );
      appendMessage('assistant', '已保存治疗档案，继续根据您当前症状评估…');
      setShowBaselineCard(false);
      const lastInput = lastUserInputRef.current.trim();
      if (lastInput) {
        await runAssessTurn(lastInput);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存档案失败，请稍后重试';
      void sabaClient.trackBehaviorEvent(
        createBehaviorEventRequest({
          event: 'assessment_baseline_submit_failed',
          userId: USER_ID,
          sessionId,
          metadata: {
            source: 'conversation',
            treatment_category: input.treatment_category,
            error_message: message,
          },
          trace: createChildTraceContext(assessmentTraceRef.current, 'behavior_event'),
        }),
      );
      appendMessage('assistant', message);
    }
  };

  const messageGroups = groupConsecutiveMessages(messages);

  return (
    <div className="chat-shell" data-testid="chat-shell">
      <div className="chat-shell__clinical-bar">
        <span>
          <strong>症状对话</strong> · SYMPTOM INTAKE
        </span>
        <span className="chat-shell__clinical-pulse" aria-hidden />
        <span>循证评估进行中</span>
      </div>
      <div
        className="chat-thread"
        ref={scrollRef}
        aria-live="polite"
        aria-relevant="additions"
        aria-label="对话记录"
      >
        {messageGroups.map(group => (
          <ChatBubble key={group.items[0]!.id} role={group.role}>
            {group.items.map((msg, index) => (
              <p
                key={msg.id}
                className={
                  index > 0 ? 'chat-bubble__text chat-bubble__text--follow' : 'chat-bubble__text'
                }
              >
                {msg.text}
              </p>
            ))}
          </ChatBubble>
        ))}

        {streamState && (
          <ChatBubble role="assistant">
            <StreamingAssessmentView
              steps={streamState.steps}
              thinking={streamState.thinking}
              message={streamState.message}
              riskLevel={streamState.riskLevel}
              riskScore={streamState.riskScore}
            />
          </ChatBubble>
        )}

        {isAssessing && phase === 'chat' && !streamState && (
          <ChatBubble role="assistant">
            <p className="chat-bubble__typing">分析中…</p>
          </ChatBubble>
        )}

        {showBaselineCard && (
          <ChatBubble role="assistant">
            <BaselineIntakeCard
              prompt="在判断风险之前，请先告诉我您当前的治疗背景。"
              onSubmit={handleBaselineSubmit}
              disabled={isAssessing}
            />
          </ChatBubble>
        )}

        {result && (
          <ChatBubble role="assistant">
            <ChatResultMessage result={result} />
          </ChatBubble>
        )}
      </div>

      <div className="chat-dock">
        {result && result.team_contact_required && onContactTeam && (
          <div className="chat-dock__actions">
            <button
              type="button"
              className={`saba-btn ${result.risk_level === 'high' ? 'saba-btn--urgent' : ''}`}
              onClick={onContactTeam}
            >
              {result.risk_level === 'high' ? '立即联系团队' : '联系医疗团队'}
            </button>
          </div>
        )}
        <ChatComposer
          value={composerText}
          onChange={setComposerText}
          onSend={() => void sendMessage()}
          disabled={isAssessing}
          disabledReason={isAssessing ? '正在分析您的描述，请稍候…' : undefined}
          placeholder="描述您的症状，例如：今天开始恶心，饭后更明显"
          quickTags={[...CHAT_SYMPTOM_QUICK_TAGS]}
        />
      </div>
    </div>
  );
}
