import { GoogleGenAI, Type } from "@google/genai";
import { EVALUATION_CRITERIA } from '../constants';

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Check if API key is available
const isApiAvailable = () => !!apiKey;

export const analyzeSuggestion = async (title: string, context: string) => {
  if (!isApiAvailable()) {
    console.warn("Gemini API Key not found. Returning mock analysis.");
    return {
      impactScore: 85,
      category: "Process Improvement",
      feedback: "This is a valid suggestion. Mock analysis provided due to missing API key.",
      reasoning: "Standard mock response."
    };
  }

  try {
    const model = "gemini-2.5-flash";
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

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            impactScore: { type: Type.INTEGER },
            category: { type: Type.STRING },
            feedback: { type: Type.STRING },
            reasoning: { type: Type.STRING }
          },
          required: ["impactScore", "category", "feedback", "reasoning"]
        }
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Error analyzing suggestion:", error);
    throw error;
  }
};

export const generateImplementationPlan = async (title: string, solution: string) => {
  if (!isApiAvailable()) {
     return {
      steps: ["Step 1: Assessment", "Step 2: Planning", "Step 3: Execution"],
      resources: ["Team time", "Budget"],
      risk: "Low"
    };
  }

  try {
    const model = "gemini-2.5-flash";
    const prompt = `
      Create a draft implementation plan for this Kaizen solution:
      Title: ${title}
      Solution: ${solution}
      
      Return JSON with:
      - steps: Array of strings (actionable steps).
      - resources: Array of strings (resources needed).
      - risk: String (Low/Medium/High).
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
         responseSchema: {
          type: Type.OBJECT,
          properties: {
            steps: { type: Type.ARRAY, items: { type: Type.STRING } },
            resources: { type: Type.ARRAY, items: { type: Type.STRING } },
            risk: { type: Type.STRING }
          }
        }
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Error generating plan:", error);
    throw error;
  }
};

export const evaluateKaizen = async (suggestionData: any) => {
    if (!isApiAvailable()) {
        return {
            scores: { productivity: 8, originality: 10, efforts: 5, horizontal: 5, hse: 1, qualitative: 8, cost: 5 },
            reasoning: "Mock evaluation."
        };
    }

    try {
        const criteriaList = EVALUATION_CRITERIA.map(c => 
            `${c.id} (${c.label}): Options [${c.options.map(o => `${o.label}=${o.points}`).join(', ')}]`
        ).join('\n');

        const prompt = `
            Evaluate this Kaizen suggestion based on the following scoring matrix.
            
            Suggestion Details:
            Theme: ${suggestionData.theme}
            Problem: ${suggestionData.problem?.what}
            Solution: ${suggestionData.counterMeasure}
            Benefits: ${JSON.stringify(suggestionData.benefits)}

            Scoring Criteria Matrix:
            ${criteriaList}

            Return a JSON object where keys are criteria IDs and values are the recommended points (must be one of the exact point values listed in options).
        `;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        scores: { 
                            type: Type.OBJECT,
                            properties: {
                                productivity: { type: Type.INTEGER },
                                originality: { type: Type.INTEGER },
                                efforts: { type: Type.INTEGER },
                                horizontal: { type: Type.INTEGER },
                                hse: { type: Type.INTEGER },
                                qualitative: { type: Type.INTEGER },
                                cost: { type: Type.INTEGER }
                            }
                        },
                        reasoning: { type: Type.STRING }
                    }
                }
            }
        });

        return JSON.parse(response.text || '{}');
    } catch (error) {
        console.error("Error evaluating kaizen:", error);
        throw error;
    }
};