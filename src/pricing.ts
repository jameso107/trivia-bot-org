// Inference is payroll (blueprint §8): every run meters its own cost into
// the ledger. USD per 1M tokens; env-overridable for models not listed.
// Unknown models fall back to the PESSIMISTIC rate so budget stops fire
// early rather than late.
const PRICES: Record<string, { in: number; out: number }> = {
  // 5.6 family rates as of the 2026-07-30 price cut (openai.com pricing).
  "gpt-5.6-terra": { in: 2, out: 12 },
  "gpt-5.6-luna": { in: 0.2, out: 1.2 },
  "gpt-5": { in: 1.25, out: 10 },
  "gpt-5-mini": { in: 0.25, out: 2 },
  "gpt-5-nano": { in: 0.05, out: 0.4 },
};

const FALLBACK = { in: Number(process.env.PRICE_IN_PER_M ?? 5), out: Number(process.env.PRICE_OUT_PER_M ?? 20) };

export function estimateUsd(model: string, inputTokens: number, outputTokens: number): number {
  const base = Object.keys(PRICES).find((k) => model.startsWith(k));
  const p = base ? PRICES[base] : FALLBACK;
  return (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
}
