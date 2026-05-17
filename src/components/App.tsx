/**
 * App - SABA 评估主界面（对话式）
 */
import { useEffect, useState } from 'react';
import { sabaClient } from '../client';
import { createBehaviorEventRequest } from '../lib/assessment-observability';
import { createChildTraceContext, createTraceContext } from '../lib/trace';
import { ConversationAssessment } from './chat/ConversationAssessment';
import { HistoryList } from './history/HistoryList';
import { ProfilePage } from './profile/ProfilePage';
import { ReasoningChain } from './assessment/ReasoningChain';
import { AuditDisclosure } from './assessment/AuditDisclosure';
import { ConfirmDialog } from '../web/ConfirmDialog';
import { FeedbackState } from './ui/FeedbackState';
import { PageHero } from './ui/PageHero';
import { TrustStrip } from './ui/TrustStrip';
import type { AssessmentDetail, HistoryResponse, TeamNotifyResponse } from '../types/index';

type View = 'chat' | 'history' | 'profile';

const USER_ID = 'user-123';

interface AppProps {
  onExitHome?: () => void;
}

function isClarificationResult(result: AssessmentDetail): boolean {
  return result.executive_summary?.status === 'clarification_required';
}

function buildAssessmentClosedEvent(lastResult: AssessmentDetail | null) {
  return createBehaviorEventRequest({
    event: 'assessment_closed',
    userId: USER_ID,
    assessmentId: lastResult?.assessment_id,
    sessionId: lastResult?.session_id,
    metadata: {
      source: 'exit',
      risk_level: lastResult?.risk_level,
      had_assessment_id: lastResult?.assessment_id != null,
    },
    trace: createChildTraceContext(createTraceContext('behavior_event'), 'behavior_event'),
  });
}

export function App({ onExitHome }: AppProps) {
  const [view, setView] = useState<View>('chat');
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<AssessmentDetail | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'assess' | 'history' | 'profile'>('assess');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [teamRequestResult, setTeamRequestResult] = useState<TeamNotifyResponse | null>(null);
  const [hydrateAssessment, setHydrateAssessment] = useState<AssessmentDetail | null>(null);
  const [fontScale, setFontScale] = useState<'normal' | 'large'>(() => {
    if (typeof window === 'undefined') return 'normal';
    return localStorage.getItem('saba-font-scale') === 'large' ? 'large' : 'normal';
  });
  const historyTrace = createTraceContext('history');

  useEffect(() => {
    document.documentElement.dataset.fontScale = fontScale;
    localStorage.setItem('saba-font-scale', fontScale);
  }, [fontScale]);

  const requestExit = () => {
    if (hasDraft && view === 'chat') {
      setShowExitConfirm(true);
      return;
    }

    void sabaClient.trackBehaviorEvent(buildAssessmentClosedEvent(lastResult));
    onExitHome?.();
  };

  const handleViewHistory = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const historyData = await sabaClient.getHistory({ user_id: 'user-123' }, historyTrace);
      setHistory(historyData);
      setView('history');
      setActiveTab('history');
      void sabaClient.trackBehaviorEvent(
        createBehaviorEventRequest({
          event: 'history_viewed',
          userId: USER_ID,
          metadata: {
            source: 'history',
            history_count: historyData.pagination.total,
          },
          trace: createChildTraceContext(historyTrace, 'behavior_event'),
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '加载历史记录失败';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAssessment = async (id: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const detail = await sabaClient.getAssessment(id, historyTrace);
      setLastResult(detail);
      setHydrateAssessment(detail);
      setTeamRequestResult(null);
      setView('chat');
      setActiveTab('assess');
      void sabaClient.trackBehaviorEvent(
        createBehaviorEventRequest({
          event: 'history_item_selected',
          userId: USER_ID,
          assessmentId: detail.assessment_id,
          sessionId: detail.session_id,
          metadata: {
            source: 'history',
            risk_level: detail.risk_level,
            selected_assessment_id: detail.assessment_id,
          },
          trace: createChildTraceContext(historyTrace, 'behavior_event'),
        }),
      );
      void sabaClient.trackBehaviorEvent(
        createBehaviorEventRequest({
          event: 'result_viewed',
          userId: USER_ID,
          assessmentId: detail.assessment_id,
          sessionId: detail.session_id,
          metadata: {
            source: 'history',
            risk_level: detail.risk_level,
          },
          trace: createChildTraceContext(historyTrace, 'behavior_event'),
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '加载评估详情失败';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleContactTeam = async () => {
    if (!lastResult?.assessment_id) {
      return;
    }

    void sabaClient.trackBehaviorEvent(
      createBehaviorEventRequest({
        event: 'contact_team_clicked',
        userId: USER_ID,
        assessmentId: lastResult.assessment_id,
        sessionId: lastResult.session_id,
        metadata: {
          source: 'conversation',
          risk_level: lastResult.risk_level,
          notification_type: lastResult.risk_level === 'high' ? 'high_risk' : 'team_contact',
        },
        trace: createChildTraceContext(createTraceContext('behavior_event'), 'behavior_event'),
      }),
    );

    const notifyTrace = createTraceContext('team_notify');
    const notifyResponse = await sabaClient.notifyTeam({
      assessment_id: lastResult.assessment_id,
      patient_id: USER_ID,
      notification_type: lastResult.risk_level === 'high' ? 'high_risk' : 'team_contact',
      message: lastResult.immediate_action,
      trace: notifyTrace,
    });
    setTeamRequestResult(notifyResponse);
  };

  return (
    <>
      <header className="saba-header">
        <div className="saba-header__bar">
          <span className="saba-header__brand">SABA // LAB</span>

          <nav className="saba-header__nav" aria-label="主导航">
            <button
              type="button"
              className={`saba-header__tab ${activeTab === 'assess' ? 'saba-header__tab--active' : ''}`}
              onClick={() => {
                setActiveTab('assess');
                setView('chat');
                setHydrateAssessment(null);
              }}
            >
              对话
            </button>
            <button
              type="button"
              className={`saba-header__tab ${activeTab === 'history' ? 'saba-header__tab--active' : ''}`}
              onClick={handleViewHistory}
            >
              历史
            </button>
            <button
              type="button"
              className={`saba-header__tab ${activeTab === 'profile' ? 'saba-header__tab--active' : ''}`}
              onClick={() => {
                setActiveTab('profile');
                setView('profile');
              }}
            >
              档案
            </button>
          </nav>

          <div className="saba-header__tools">
            <button
              type="button"
              className="saba-header__font-toggle"
              onClick={() => setFontScale(s => (s === 'large' ? 'normal' : 'large'))}
              aria-pressed={fontScale === 'large'}
              aria-label={fontScale === 'large' ? '切换为标准字号' : '切换为大字号'}
            >
              {fontScale === 'large' ? 'A−' : 'A+'}
            </button>
            {onExitHome ? (
              <button
                type="button"
                className="saba-header__exit"
                onClick={requestExit}
              >
                EXIT —
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="saba-main">
        {errorMessage && (
          <FeedbackState variant="error" message={errorMessage} />
        )}

        {/* 三视图均保持挂载；用 saba-view--active 切换，避免 hidden 与 flex 冲突盖住其它 tab */}
        <section
          className={`saba-view chat-layout ${view === 'chat' ? 'saba-view--active' : ''}`}
          aria-hidden={view !== 'chat'}
        >
          <ConversationAssessment
            hydrateAssessment={hydrateAssessment}
            onExitHydrate={() => setHydrateAssessment(null)}
            onDraftChange={setHasDraft}
            onComplete={(detail) => {
              setTeamRequestResult(null);
              setHydrateAssessment(null);
              if (!isClarificationResult(detail)) {
                setLastResult(detail);
              }
            }}
            onContactTeam={handleContactTeam}
          />
          {lastResult && !isClarificationResult(lastResult) && (
            <AuditDisclosure
              result={lastResult}
              teamRequestResult={teamRequestResult}
              onContactTeam={handleContactTeam}
            />
          )}
        </section>

        <section
          className={`saba-view saba-page-view ${view === 'history' ? 'saba-view--active' : ''}`}
          aria-hidden={view !== 'history'}
        >
          {history ? (
          <div className="saba-page-shell animate-in">
            <PageHero
              variant="history"
              protocol="RECORDS · ASSESSMENT HISTORY"
              title="评估历史"
              description="回顾历次症状评估与风险结论，点击记录可回到对应对话上下文。"
            />
            <TrustStrip />
            <button
              type="button"
              className="saba-back"
              onClick={() => {
                setView('chat');
                setActiveTab('assess');
              }}
            >
              ← 返回对话
            </button>

            <div className="saba-list-title">
              <h2>全部记录</h2>
              <span>共 {history.pagination.total} 条</span>
            </div>

            <HistoryList
              history={history}
              onSelect={handleSelectAssessment}
              isLoading={isLoading}
            />

            {lastResult && (
              <section className="saba-panel saba-panel--spaced">
                <h3 className="saba-section-label">最近一次评估推理</h3>
                {lastResult.evidence && lastResult.evidence.length > 0 && (
                  <ReasoningChain
                    evidence={lastResult.evidence}
                    reasoningChain={lastResult.reasoning_chain ?? []}
                  />
                )}
              </section>
            )}
          </div>
          ) : view === 'history' && isLoading ? (
            <div className="saba-page-shell">
              <PageHero
                variant="history"
                protocol="RECORDS · ASSESSMENT HISTORY"
                title="评估历史"
                description="正在加载您的评估记录…"
              />
              <div className="saba-stack">
                <div className="saba-skeleton" />
                <div className="saba-skeleton" />
                <div className="saba-skeleton" />
              </div>
            </div>
          ) : null}
        </section>

        <section
          className={`saba-view saba-page-view ${view === 'profile' ? 'saba-view--active' : ''}`}
          aria-hidden={view !== 'profile'}
        >
          <div className="saba-page-shell">
            <PageHero
              variant="profile"
              protocol="CHART · PATIENT BASELINE"
              title="治疗档案"
              description="完善治疗背景有助于更准确评估副作用风险；信息仅用于本次会话内的推理判断。"
            />
            <TrustStrip />
            <ProfilePage userId={USER_ID} />
          </div>
        </section>
      </main>

      <footer className="saba-footer">
        SABA — 乳腺癌患者副作用评估助手
        <br />
        本系统仅供辅助参考，不能替代专业医疗建议
      </footer>

      <ConfirmDialog
        open={showExitConfirm}
        title="离开对话？"
        message="当前对话尚未完成评估，离开后将不会保存已填内容。"
        cancelLabel="继续对话"
        confirmLabel="确认离开"
        onCancel={() => setShowExitConfirm(false)}
        onConfirm={() => {
          setShowExitConfirm(false);
          void sabaClient.trackBehaviorEvent(buildAssessmentClosedEvent(lastResult));
          onExitHome?.();
        }}
      />
    </>
  );
}

export default App;
