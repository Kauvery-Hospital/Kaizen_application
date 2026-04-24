type AnalyzeSuggestionResult = {
  impactScore: number;
  category: string;
  feedback: string;
  reasoning: string;
};

type EvaluateKaizenResult = {
  scores: Record<string, number>;
  reasoning: string;
};

async function messageFromFailedResponse(res: Response): Promise<string> {
  const text = await res.text();
  if (!text) return `Request failed (${res.status})`;
  try {
    const body = JSON.parse(text) as { message?: string | string[] };
    const m = body.message;
    if (Array.isArray(m)) return m.join(' ');
    if (typeof m === 'string') return m;
  } catch {
    // ignore
  }
  return text;
}

export async function analyzeSuggestion(
  apiBase: string,
  authHeaders: () => Record<string, string>,
  title: string,
  context: string,
): Promise<AnalyzeSuggestionResult> {
  const res = await fetch(`${apiBase}/ai/analyze-suggestion`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ title, context }),
  });
  if (!res.ok) throw new Error(await messageFromFailedResponse(res));
  return (await res.json()) as AnalyzeSuggestionResult;
}

export async function evaluateKaizen(
  apiBase: string,
  authHeaders: () => Record<string, string>,
  suggestionData: Record<string, unknown>,
): Promise<EvaluateKaizenResult> {
  const res = await fetch(`${apiBase}/ai/evaluate-kaizen`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ suggestionData }),
  });
  if (!res.ok) throw new Error(await messageFromFailedResponse(res));
  return (await res.json()) as EvaluateKaizenResult;
}