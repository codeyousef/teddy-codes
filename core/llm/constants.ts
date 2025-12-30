export const DEFAULT_MAX_TOKENS = 4096;
export const DEFAULT_CONTEXT_LENGTH = 32_768;
export const DEFAULT_TEMPERATURE = 0.5;
export const DEFAULT_PRUNING_LENGTH = 128000;
export const DEFAULT_REASONING_TOKENS = 2048;

export const DEFAULT_ARGS = {
  maxTokens: DEFAULT_MAX_TOKENS,
  temperature: DEFAULT_TEMPERATURE,
};

const PROXY_URL = "http://localhost:65433";

const DEFAULT_MAX_CHUNK_SIZE = 500; // 512 - buffer for safety (in case of differing tokenizers)
const DEFAULT_MAX_BATCH_SIZE = 64;

export enum LLMConfigurationStatuses {
  VALID = "valid",
  MISSING_API_KEY = "missing-api-key",
  MISSING_ENV_SECRET = "missing-env-secret",
}

export enum NEXT_EDIT_MODELS {
  MERCURY_CODER = "mercury-coder",
  INSTINCT = "instinct",
}

export { DEFAULT_MAX_BATCH_SIZE, DEFAULT_MAX_CHUNK_SIZE, PROXY_URL };
