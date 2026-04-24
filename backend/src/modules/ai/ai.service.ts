import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Type } from '@google/genai';

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

@Injectable()
export class AiService {
  private readonly apiKey: string;
  private readonly ai: GoogleGenAI | null;

  constructor(private readonly config: ConfigService) {
    this.apiKey = String(this.config.get<string>('GEMINI_API_KEY') ?? '').trim();
    this.ai = this.apiKey ? new GoogleGenAI({ apiKey: this.apiKey }) : null;
  }

  private isAvailable(): boolean {
    return Boolean(this.ai);
  }

  async analyzeSuggestion(title: string, context: string): Promise<AnalyzeSuggestionResult> {
    if (!this.isAvailable()) {
      return {
        impactScore: 85,
        category: 'Process Improvement',
        feedback: 'Mock analysis (GEMINI_API_KEY not configured).',
        reasoning: 'Gemini disabled; returning deterministic mock response.',
      };
    }

    const prompt = `
Analyze the following Kaizen suggestion.
Theme/Title: ${title}
Details (Problem, Root Cause, Solution): ${context}

Provide a JSON response with:
- impactScore: A number between 1-100 indicating potential positive impact.
- category: One of [Cost, Quality, Safety, Delivery, Morale].
- feedback: A short 1-sentence summary of why this is good or bad.
- reasoning: A brief explanation.
`;

    const response = await this.ai!.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            impactScore: { type: Type.INTEGER },
            category: { type: Type.STRING },
            feedback: { type: Type.STRING },
            reasoning: { type: Type.STRING },
          },
          required: ['impactScore', 'category', 'feedback', 'reasoning'],
        },
      },
    });

    return JSON.parse(response.text || '{}') as AnalyzeSuggestionResult;
  }

  async evaluateKaizen(
    suggestionData: Record<string, unknown>,
    criteriaList: string,
  ): Promise<EvaluateKaizenResult> {
    if (!this.isAvailable()) {
      return {
        scores: {
          productivity: 8,
          originality: 10,
          efforts: 5,
          horizontal: 5,
          hse: 1,
          qualitative: 8,
          cost: 5,
        },
        reasoning: 'Mock evaluation (GEMINI_API_KEY not configured).',
      };
    }

    const theme = String(suggestionData.theme ?? '');
    const problemWhat = String((suggestionData as any)?.problem?.what ?? '');
    const counterMeasure = String((suggestionData as any)?.counterMeasure ?? '');
    const benefits = JSON.stringify((suggestionData as any)?.benefits ?? null);

    const prompt = `
Evaluate this Kaizen suggestion based on the following scoring matrix.

Suggestion Details:
Theme: ${theme}
Problem: ${problemWhat}
Solution: ${counterMeasure}
Benefits: ${benefits}

Scoring Criteria Matrix:
${criteriaList}

Return JSON with:
- scores: object where keys are criteria IDs and values are the recommended points (must be one of the exact point values listed in options).
- reasoning: brief explanation.
`;

    const response = await this.ai!.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            scores: { type: Type.OBJECT },
            reasoning: { type: Type.STRING },
          },
          required: ['scores', 'reasoning'],
        },
      },
    });

    return JSON.parse(response.text || '{}') as EvaluateKaizenResult;
  }
}

