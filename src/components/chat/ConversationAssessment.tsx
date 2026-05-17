import { useCallback, useEffect, useRef, useState } from 'react';
import { sabaClient } from '../../client';
import { getTimeGreeting } from '../../lib/greeting';
import { createBehaviorEventRequest } from '../../lib/assessment-observability';
import type {
  AssessRequest,
  AssessResponse,
  AssessmentDetail,
  ClarificationQuestion,
  PatientBaseline,
  TreatmentCategory,
} from '../../types/index';
import { ChatBubble } from './ChatBubble';
import { ChatComposer } from './ChatComposer';
import { ChatResultMessage } from './ChatResultMessage';
import { BaselineIntakeCard } from './BaselineIntakeCard';
import type { ChatMessageItem, ConversationPhase } from './types';

const USER_ID = 'user-123';

function isBaselineQuestion(q: ClarificationQuestion): boolean {
  return q.question_id.startsWith('baseline_');
}

async function upsertBaselineRequest(input: {
  user_id: string;
  treatment_category: TreatmentCategory;
  treatment_anchor: string;
  primary_regimen?: string;
}): Promise<PatientBaseline> {
  const res = await fetch('/api/v1/baseline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`保存基线失败 (${res.status}): ${text}`);
  }
  return (await res.json()) as PatientBaseline;
}

interface ConversationAssessmentProps {
  onTurn: (request: AssessRequest) => Promise<AssessResponse>;
  isLoading: boolean;
  onDraftChange?: (hasDraft: boolean) => void;
  onComplete?: (result: AssessmentDetail) => void;
  onContactTeam?: () => void;
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
  onTurn,
  isLoading,
  onDraftChange,
  onComplete,
  onContactTeam,
}: ConversationAssessmentProps) {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [phase, setPhase] = useState<ConversationPhase>('chat');
  const [composerText, setComposerText] = useState('');
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [episodeId, setEpisodeId] = useState<string | undefined>();
  const [result, setResult] = useState<AssessmentDetail | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const [showBaselineCard, setShowBaselineCard] = useState(false);
  const lastUserInputRef = useRef<string>('');
  const startedTrackedRef = useRef(false);

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
      }),
    );
  }, []);

  const appendMessage = useCallback((role: 'assistant' | 'user', text: string) => {
    setMessages(prev => [...prev, { id: createId(), role, text }]);
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, phase, result, isLoading, scrollToBottom]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    appendMessage(
      'assistant',
      `${getTimeGreeting()} 我是 SABA 评估助手。请用您自己的话描述当前的不适（例如症状、开始时间、是否在加重）。我会根据您的描述继续追问或给出风险评估。`,
    );
  }, [appendMessage]);

  const applyConversationIds = (response: AssessResponse) => {
    if (response.session_id) setSessionId(response.session_id);
    if (response.episode_id) setEpisodeId(response.episode_id);
  };

  const handleServerResponse = (response: AssessResponse) => {
    applyConversationIds(response);

    if (isClarificationResult(response)) {
      if (response.immediate_action) {
        appendMessage('assistant', response.immediate_action);
      } else if (response.reasoning) {
        appendMessage('assistant', response.reasoning);
      }

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
        if (generalClarifications.length > 0) {
          generalClarifications.forEach((q, index) => {
            appendMessage('assistant', generalClarifications.length > 1 ? `${index + 1}. ${q.text}` : q.text);
          });
        }
        return;
      }

      if (questions.length === 0) {
        appendMessage('assistant', '为了更准确评估，请补充具体症状与持续时间。');
      } else {
        questions.forEach((q, index) => {
          appendMessage('assistant', questions.length > 1 ? `${index + 1}. ${q.text}` : q.text);
        });
      }
      return;
    }

    setShowBaselineCard(false);
    const detail = toAssessmentDetail(response);
    setResult(detail);
    appendMessage('assistant', response.immediate_action);
    setPhase('chat');
    onComplete?.(detail);
  };

  const runAssessTurn = useCallback(
    async (input: string) => {
      appendMessage('assistant', '正在结合循证知识与 AI 推理分析，请稍候…');

      const request: AssessRequest = {
        user_id: USER_ID,
        input,
        session_id: sessionId,
        episode_id: episodeId,
      };

      try {
        const response = await onTurn(request);
        setMessages((prev) =>
          prev.filter((m) => m.text !== '正在结合循证知识与 AI 推理分析，请稍候…'),
        );
        handleServerResponse(response);
      } catch (error) {
        setMessages((prev) =>
          prev.filter((m) => m.text !== '正在结合循证知识与 AI 推理分析，请稍候…'),
        );
        const message = error instanceof Error ? error.message : '评估请求失败，请稍后重试';
        appendMessage('assistant', message);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, episodeId, onTurn, appendMessage],
  );

  const sendMessage = async () => {
    const text = composerText.trim();
    if (!text || isLoading || phase !== 'chat') return;

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
      }),
    );
    await runAssessTurn(text);
  };

  const handleBaselineSubmit = async (input: {
    treatment_category: TreatmentCategory;
    treatment_anchor: string;
    primary_regimen?: string;
  }) => {
    try {
      await upsertBaselineRequest({ user_id: USER_ID, ...input });
      void sabaClient.trackBehaviorEvent(
        createBehaviorEventRequest({
          event: 'assessment_baseline_submitted',
          userId: USER_ID,
          sessionId,
          metadata: {
            source: 'conversation',
            treatment_category: input.treatment_category,
          },
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
        }),
      );
      appendMessage('assistant', message);
    }
  };

  return (
    <div className="chat-shell">
      <div className="chat-thread" ref={scrollRef}>
        {messages.map(msg => (
          <ChatBubble key={msg.id} role={msg.role}>
            <p className="chat-bubble__text">{msg.text}</p>
          </ChatBubble>
        ))}

        {isLoading && phase === 'chat' && (
          <ChatBubble role="assistant">
            <p className="chat-bubble__typing">分析中…</p>
          </ChatBubble>
        )}

        {showBaselineCard && (
          <ChatBubble role="assistant">
            <BaselineIntakeCard
              prompt="在判断风险之前，请先告诉我您当前的治疗背景。"
              onSubmit={handleBaselineSubmit}
              disabled={isLoading}
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
            <button type="button" className="saba-btn" onClick={onContactTeam}>
              {result.risk_level === 'high' ? '立即联系团队' : '联系医疗团队'}
            </button>
          </div>
        )}
        <ChatComposer
          value={composerText}
          onChange={setComposerText}
          onSend={() => void sendMessage()}
          disabled={isLoading}
          placeholder="描述您的症状，例如：今天开始恶心，饭后更明显"
        />
      </div>
    </div>
  );
}
