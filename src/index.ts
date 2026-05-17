import { getConfig, reloadConfig } from './lib/env.js';
import { createConversationExecutive, type ConversationExecutive } from './agents/conversation-executive.js';

export * from './types/index.js';
export * from './agents/conversation-executive.js';
export { createConversationExecutive } from './agents/conversation-executive.js';
export { createSymptomParser, symptomParserTool } from './tools/symptom-parser.js';
export { createRiskAssessor, riskAssessorTool } from './tools/risk-assessor.js';
export { createAdviceGenerator, adviceGeneratorTool } from './tools/advice-generator.js';
export { createRAGRetriever, ragRetrieveTool } from './rag/retriever.js';
export { validateSafety } from './tools/safety-validator.js';
export {
  IntentFramer,
  createIntentFramer,
  type ConversationGoal,
  type IntentFramingInput,
  type IntentFramingResult,
  type IntentType,
} from './modules/intent-framing.js';
export {
  ClinicalTriage,
  createClinicalTriage,
  type ClinicalTriageInput,
  type ClinicalTriageOutput,
} from './modules/clinical-triage.js';
export {
  RiskDeliberation,
  createRiskDeliberation,
  type RiskDeliberationConfig,
  type RiskDeliberationInput,
  type RiskDeliberationResult,
} from './modules/risk-deliberation.js';
export {
  EvidenceRetrievalTool,
  createEvidenceRetrievalTool,
  type EvidenceRetrievalInput,
  type EvidenceRetrievalOutput,
} from './modules/evidence-retrieval.js';
export { getConfig, loadConfig, type SABA_CONFIG, type Env, loadConfigFromEnv } from './lib/env.js';
export { parseRiskAssessmentOutput, extractJSONObject } from './lib/structured-output.js';
export {
  getAnthropicClient,
  resetClient,
  extractSymptomsWithLLM,
  assessRiskWithLLM,
  generateAdviceWithLLM,
} from './lib/llm.js';

let runtimeReady = false;
let defaultExecutive: ConversationExecutive | undefined;

function ensureRuntimeReady(): void {
  if (runtimeReady) {
    return;
  }
  reloadConfig();
  defaultExecutive = undefined;
  runtimeReady = true;
}

function getDefaultExecutive(): ConversationExecutive {
  if (!defaultExecutive) {
    defaultExecutive = createConversationExecutive();
  }
  return defaultExecutive;
}

export const Saba = {
  get executive() {
    ensureRuntimeReady();
    return getDefaultExecutive();
  },
  get orchestrator() {
    ensureRuntimeReady();
    return {
      assess: (request: Parameters<ConversationExecutive['execute']>[0]) =>
        getDefaultExecutive().execute(request),
    };
  },
  get config() {
    ensureRuntimeReady();
    return getConfig();
  },
};
