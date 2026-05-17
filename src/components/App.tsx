/**
 * App - SABA 评估主界面（对话式）
 */
import { useState } from 'react';
import { sabaClient } from '../client';
import { createBehaviorEventRequest } from '../lib/assessment-observability';
import { ConversationAssessment } from './chat/ConversationAssessment';
import { HistoryList } from './history/HistoryList';
import { ReasoningChain } from './assessment/ReasoningChain';
import { ResultCard } from './assessment/ResultCard';
import { ConfirmDialog } from '../web/ConfirmDialog';
import type { AssessmentDetail, HistoryResponse, TeamNotifyResponse } from '../types/index';
import type { AssessRequest } from '../types/index';

type View = 'chat' | 'history';

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
  });
}

export function App({ onExitHome }: AppProps) {
  const [view, setView] = useState<View>('chat');
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<AssessmentDetail | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'assess' | 'history'>('assess');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [teamRequestResult, setTeamRequestResult] = useState<TeamNotifyResponse | null>(null);

  const requestExit = () => {
    if (hasDraft && view === 'chat') {
      setShowExitConfirm(true);
      return;
    }

    void sabaClient.trackBehaviorEvent(buildAssessmentClosedEvent(lastResult));
    onExitHome?.();
  };

  const handleTurn = async (request: AssessRequest) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await sabaClient.assess(request);
      setTeamRequestResult(null);
      if (!isClarificationResult(result as AssessmentDetail)) {
        setLastResult(result as AssessmentDetail);
      }
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '评估请求失败，请稍后重试';
      setErrorMessage(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewHistory = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const historyData = await sabaClient.getHistory({ user_id: 'user-123' });
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
      const detail = await sabaClient.getAssessment(id);
      setLastResult(detail);
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
      }),
    );

    const notifyResponse = await sabaClient.notifyTeam({
      assessment_id: lastResult.assessment_id,
      patient_id: USER_ID,
      notification_type: lastResult.risk_level === 'high' ? 'high_risk' : 'team_contact',
      message: lastResult.immediate_action,
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
          </nav>

          {onExitHome ? (
            <button
              type="button"
              className="saba-header__exit"
              onClick={requestExit}
            >
              EXIT —
            </button>
          ) : (
            <span />
          )}
        </div>
      </header>

      <main className={`saba-main ${view === 'chat' ? 'saba-main--chat' : ''}`}>
        {errorMessage && (
          <div className="saba-alert" role="alert">
            {errorMessage}
          </div>
        )}

        {view === 'chat' && (
          <>
            <ConversationAssessment
              onTurn={handleTurn}
              isLoading={isLoading}
              onDraftChange={setHasDraft}
              onComplete={setLastResult}
              onContactTeam={handleContactTeam}
            />
            {lastResult && (
              <section className="saba-panel" style={{ marginTop: '1.5rem' }}>
                <h3 className="saba-section-label">审计信息</h3>
                <ResultCard result={lastResult} onContactTeam={handleContactTeam} />
                {teamRequestResult && (
                  <div className="saba-alert" role="status" style={{ marginTop: '1rem' }}>
                    已创建协同请求：{teamRequestResult.notification_id} ·
                    评估 {teamRequestResult.assessment_id} ·
                    创建时间 {new Date(teamRequestResult.created_at).toLocaleString('zh-CN', {
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {view === 'history' && history && (
          <div className="animate-in">
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
              <h2>评估历史</h2>
              <span>共 {history.pagination.total} 条</span>
            </div>

            <HistoryList
              history={history}
              onSelect={handleSelectAssessment}
              isLoading={isLoading}
            />

            {lastResult && (
              <section className="saba-panel" style={{ marginTop: '1.5rem' }}>
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
        )}
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
