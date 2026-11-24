// Claude 모델 단가 (USD / 100만 토큰).
// 출처: https://platform.claude.com/docs/en/about-claude/pricing (2026-11-24 확인)
// 가격이 바뀌면 이 표만 고치면 된다.

const PRICES = {
  // Haiku 5.5는 프롬프트 길이(입력 토큰 합계)가 10만 토큰을 넘으면 더 비싸다.
  'claude-haiku-5-5': {
    short: { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
    long: { input: 0.5, output: 2.5, cacheWrite: 0.625, cacheRead: 0.05 },
    longThreshold: 100_000,
  },
  'claude-sonnet-5-5': {
    short: { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
  },
  'claude-opus-5-5': {
    short: { input: 4, output: 20 },
  },
  'claude-fable-5-2': {
    short: { input: 8, output: 40 },
  },
};

// 응답의 model 값에 날짜 등이 붙어 와도 찾을 수 있게 앞부분으로 매칭한다.
function findPrice(model) {
  if (!model) return null;
  if (PRICES[model]) return PRICES[model];
  const key = Object.keys(PRICES).find((k) => model.startsWith(k));
  return key ? PRICES[key] : null;
}

// Claude API 응답의 usage로 비용(USD)을 계산한다. 단가를 모르면 null.
export function costUsd(model, usage = {}) {
  const price = findPrice(model);
  if (!price) return null;

  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;

  const promptTokens = input + cacheWrite + cacheRead;
  const tier =
    price.long && promptTokens > price.longThreshold ? price.long : price.short;

  // 캐시 단가가 표에 없으면 일반 입력 단가로 계산한다.
  const writeRate = tier.cacheWrite ?? tier.input;
  const readRate = tier.cacheRead ?? tier.input;

  const total =
    input * tier.input + output * tier.output + cacheWrite * writeRate + cacheRead * readRate;

  return total / 1_000_000;
}
