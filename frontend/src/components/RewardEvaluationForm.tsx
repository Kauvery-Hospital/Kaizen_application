
import React, { useState, useEffect } from 'react';
import { EVALUATION_CRITERIA, GRADE_THRESHOLDS } from '../constants';
import { EvaluationScore, RewardEvaluation, Suggestion } from '../types';
import { evaluateKaizen } from '../services/geminiService';

interface Props {
  suggestion: Suggestion;
  apiBase: string;
  authHeaders: () => Record<string, string>;
  onSave: (evaluation: RewardEvaluation) => void;
  initialData?: RewardEvaluation;
  readOnly?: boolean;
}

export const RewardEvaluationForm: React.FC<Props> = ({
  suggestion,
  apiBase,
  authHeaders,
  onSave,
  initialData,
  readOnly = false,
}) => {
  const [scores, setScores] = useState<EvaluationScore>({});
  const [aiScores, setAiScores] = useState<EvaluationScore | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [totalScore, setTotalScore] = useState(0);
  const [currentGrade, setCurrentGrade] = useState(GRADE_THRESHOLDS[3]); // Default to lowest
  const [step, setStep] = useState<'score' | 'split'>('score');
  const [originatorAmount, setOriginatorAmount] = useState<number>(0);
  const [implementerAmount, setImplementerAmount] = useState<number>(0);
  const [splitError, setSplitError] = useState<string>('');

  useEffect(() => {
    if (initialData) {
      setScores(initialData.scores);
      if (initialData.split) {
        setOriginatorAmount(Number(initialData.split.originatorAmount) || 0);
        setImplementerAmount(Number(initialData.split.implementerAmount) || 0);
      }
    } else {
      // Initialize with minimum scores
      const initialScores: EvaluationScore = {};
      EVALUATION_CRITERIA.forEach(c => {
        initialScores[c.id] = c.options[0].points;
      });
      setScores(initialScores);
    }
  }, [initialData]);

  useEffect(() => {
    const total = (Object.values(scores) as number[]).reduce((sum, val) => sum + val, 0);
    setTotalScore(total);
    
    const grade = GRADE_THRESHOLDS.find(g => total >= g.min) || GRADE_THRESHOLDS[3];
    setCurrentGrade(grade);
  }, [scores]);

  useEffect(() => {
    if (readOnly) return;
    // Default split: if no explicit split yet, default to 100% to originator (common practice) until BE Head decides.
    // We also avoid fighting user inputs once they type something.
    if (initialData?.split) return;
    const total = Number(currentGrade.value) || 0;
    if (originatorAmount === 0 && implementerAmount === 0) {
      setOriginatorAmount(total);
      setImplementerAmount(0);
    }
  }, [currentGrade.value, readOnly, initialData, originatorAmount, implementerAmount]);

  const handleScoreChange = (criteriaId: string, points: number) => {
    if (readOnly) return;
    setScores(prev => ({
      ...prev,
      [criteriaId]: points
    }));
  };

  const handleRunAiAnalysis = async () => {
    setIsAnalyzing(true);
    try {
        const result = await evaluateKaizen(apiBase, authHeaders, suggestion as any);
        if (result && result.scores) {
            setAiScores(result.scores);
        }
    } catch (error) {
        console.error("AI Evaluation failed", error);
    } finally {
        setIsAnalyzing(false);
    }
  };

  const handleApplyAiScores = () => {
    if (aiScores) {
        setScores(aiScores);
    }
  };

  const originatorName = String(suggestion.employeeName || 'Originator').trim();
  const implementerName = String(suggestion.assignedImplementer || 'Implementer').trim();

  const buildEvaluation = (): RewardEvaluation => {
    return {
      scores,
      totalScore,
      grade: currentGrade.grade,
      voucherValue: currentGrade.value,
      split: {
        originatorName,
        implementerName,
        originatorAmount: Number(originatorAmount) || 0,
        implementerAmount: Number(implementerAmount) || 0,
      },
      evaluatedBy: 'Business Excellence Head',
      evaluationDate: new Date().toISOString().split('T')[0],
    };
  };

  const handleContinueToSplit = () => {
    setSplitError('');
    setStep('split');
  };

  const handleSplitSave = () => {
    const total = Number(currentGrade.value) || 0;
    const a = Number(originatorAmount) || 0;
    const b = Number(implementerAmount) || 0;
    if (a < 0 || b < 0) {
      setSplitError('Amounts cannot be negative.');
      return;
    }
    if (Math.round((a + b) * 100) / 100 !== Math.round(total * 100) / 100) {
      setSplitError(`Split must equal total voucher amount (₹${total}).`);
      return;
    }
    setSplitError('');
    onSave(buildEvaluation());
  };

  return (
    <div className="bg-white rounded-lg border border-gray-300 overflow-hidden shadow-sm">
      <div className="p-4 bg-gray-50 border-b border-gray-300 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
            <h3 className="text-lg font-black text-gray-900">Kaizen Evaluation Sheet</h3>
            <p className="text-sm text-gray-700 font-medium">
              {readOnly
                ? 'Evaluation summary.'
                : step === 'score'
                  ? 'Select scores manually or use AI assistance.'
                  : 'Decide the reward split between originator and implementer.'}
            </p>
        </div>
        {!readOnly && (
            <div className="flex gap-2">
                {aiScores && (
                    <button 
                        onClick={handleApplyAiScores}
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-900 rounded-lg text-xs font-bold hover:bg-blue-200 transition-colors border border-blue-300"
                    >
                        <span className="material-icons-round text-sm">done_all</span>
                        Apply AI Scores
                    </button>
                )}
                <button 
                    onClick={handleRunAiAnalysis}
                    disabled={isAnalyzing}
                    className={`flex items-center gap-2 px-4 py-2 bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-md hover:bg-indigo-800 transition-colors ${isAnalyzing ? 'opacity-70 cursor-wait' : ''}`}
                >
                    <span className="material-icons-round text-sm">{isAnalyzing ? 'hourglass_empty' : 'auto_awesome'}</span>
                    {isAnalyzing ? 'Analyzing...' : 'Parallel Comparison by AI'}
                </button>
            </div>
        )}
      </div>

      {!readOnly && (
        <div className="px-4 py-3 border-b border-gray-200 bg-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-extrabold">
            <div className={`px-2.5 py-1 rounded-full border ${step === 'score' ? 'bg-kauvery-purple text-white border-purple-900' : 'bg-white text-gray-700 border-gray-300'}`}>
              1. Scoring
            </div>
            <div className="text-gray-400 font-black">→</div>
            <div className={`px-2.5 py-1 rounded-full border ${step === 'split' ? 'bg-kauvery-purple text-white border-purple-900' : 'bg-white text-gray-700 border-gray-300'}`}>
              2. Reward Split
            </div>
          </div>
          {step === 'split' && (
            <button
              type="button"
              onClick={() => setStep('score')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-900 text-xs font-extrabold hover:bg-gray-50"
            >
              <span className="material-icons-round text-sm">arrow_back</span>
              Back
            </button>
          )}
        </div>
      )}

      {/* Legend */}
      {aiScores && (
          <div className="bg-blue-50 px-4 py-2 border-b border-blue-200 flex gap-4 text-xs font-bold">
              <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-kauvery-purple rounded border border-purple-900"></div>
                  <span className="text-gray-900">Your Selection</span>
              </div>
              <div className="flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-blue-600 rounded"></div>
                  <span className="text-blue-900">AI Recommendation</span>
              </div>
          </div>
      )}
      
      {step === 'score' ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-900 uppercase bg-gray-200 font-extrabold">
              <tr>
                <th className="px-4 py-3 w-1/4 border-b border-gray-300">Criteria</th>
                <th className="px-4 py-3 text-center border-b border-gray-300">Level 1</th>
                <th className="px-4 py-3 text-center border-b border-gray-300">Level 2</th>
                <th className="px-4 py-3 text-center border-b border-gray-300">Level 3</th>
                <th className="px-4 py-3 text-center border-b border-gray-300">Level 4</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {EVALUATION_CRITERIA.map((criteria) => (
                <tr key={criteria.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-bold text-gray-900 border-r border-gray-100">
                    {criteria.label}
                  </td>
                  {criteria.options.map((option) => {
                    const isSelected = scores[criteria.id] === option.points;
                    const isAiRecommended = aiScores && aiScores[criteria.id] === option.points;
                    
                    let cellClass = "bg-white border-gray-300 text-gray-800";
                    if (isSelected && isAiRecommended) {
                        cellClass = "bg-kauvery-purple text-white border-kauvery-purple ring-2 ring-blue-600 ring-offset-1";
                    } else if (isSelected) {
                        cellClass = "bg-kauvery-purple text-white border-kauvery-purple shadow-md";
                    } else if (isAiRecommended) {
                        cellClass = "bg-white text-blue-900 border-blue-400 ring-2 ring-blue-600 ring-offset-1 ring-dashed font-bold";
                    }

                    return (
                      <td 
                        key={option.points} 
                        onClick={() => handleScoreChange(criteria.id, option.points)}
                        className={`px-4 py-3 cursor-pointer transition-all relative ${readOnly ? '' : 'hover:bg-gray-100'}`}
                      >
                        <div className={`p-2 rounded-lg text-center border transition-all duration-200 ${cellClass}`}>
                          {isAiRecommended && !isSelected && (
                               <div className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full shadow-sm z-10 font-bold border border-white">AI</div>
                          )}
                          <div className="font-extrabold mb-1 text-lg">{option.points}</div>
                          <div className={`text-xs leading-tight font-semibold ${isSelected ? 'text-purple-100' : 'text-gray-600'}`}>{option.label}</div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-6 bg-white">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-200 bg-slate-50 p-4">
              <div className="text-xs font-extrabold text-gray-700 uppercase">Total Voucher</div>
              <div className="mt-1 text-3xl font-black text-green-800">₹{Number(currentGrade.value || 0).toLocaleString()}</div>
              <div className="mt-2 text-xs text-gray-600 font-semibold">
                Grade: <span className="font-black text-gray-900">{currentGrade.grade}</span> · Total Points: <span className="font-black text-gray-900">{totalScore}</span>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="text-xs font-extrabold text-gray-700 uppercase mb-3">Reward split</div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-extrabold text-gray-700 uppercase block mb-1">Originator (Idea submitter)</label>
                  <div className="text-sm font-black text-gray-900 truncate" title={originatorName}>{originatorName}</div>
                  <div className="mt-2 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-black">₹</span>
                    <input
                      type="number"
                      min={0}
                      value={Number.isFinite(originatorAmount) ? originatorAmount : 0}
                      onChange={(e) => {
                        const next = Number(e.target.value || 0);
                        setOriginatorAmount(next);
                        const total = Number(currentGrade.value) || 0;
                        setImplementerAmount(Math.max(0, Math.round((total - next) * 100) / 100));
                        setSplitError('');
                      }}
                      className="w-full pl-7 pr-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 font-extrabold outline-none focus:ring-2 focus:ring-kauvery-purple"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-extrabold text-gray-700 uppercase block mb-1">Implementer</label>
                  <div className="text-sm font-black text-gray-900 truncate" title={implementerName}>{implementerName}</div>
                  <div className="mt-2 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-black">₹</span>
                    <input
                      type="number"
                      min={0}
                      value={Number.isFinite(implementerAmount) ? implementerAmount : 0}
                      onChange={(e) => {
                        const next = Number(e.target.value || 0);
                        setImplementerAmount(next);
                        const total = Number(currentGrade.value) || 0;
                        setOriginatorAmount(Math.max(0, Math.round((total - next) * 100) / 100));
                        setSplitError('');
                      }}
                      className="w-full pl-7 pr-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 font-extrabold outline-none focus:ring-2 focus:ring-kauvery-purple"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs font-bold text-gray-700">
                <div>
                  Total: <span className="font-black text-gray-900">₹{(Number(originatorAmount || 0) + Number(implementerAmount || 0)).toLocaleString()}</span>
                </div>
                <div className="text-gray-500">
                  Must equal ₹{Number(currentGrade.value || 0).toLocaleString()}
                </div>
              </div>

              {splitError && (
                <div className="mt-3 text-xs font-extrabold text-red-800 bg-red-50 border border-red-200 rounded-lg p-2">
                  {splitError}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="p-6 bg-gray-100 border-t border-gray-300 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-6">
          <div>
            <span className="block text-sm font-bold text-gray-600">Total Points</span>
            <span className="text-3xl font-black text-gray-900">{totalScore}</span>
          </div>
          <div className={`px-4 py-2 rounded-lg border-2 ${currentGrade.color}`}>
            <span className="block text-xs font-black uppercase opacity-90">Grade</span>
            <span className="text-xl font-black">{currentGrade.grade}</span>
          </div>
          <div>
            <span className="block text-sm font-bold text-gray-600">Voucher Value</span>
            <span className="text-2xl font-black text-green-700">₹{currentGrade.value}</span>
          </div>
        </div>

        {!readOnly && (
          step === 'score' ? (
            <button
              onClick={handleContinueToSplit}
              className="w-full md:w-auto bg-kauvery-purple hover:bg-kauvery-violet text-white px-8 py-3 rounded-lg font-bold shadow-lg transition-transform transform active:scale-95 flex items-center justify-center gap-2 border border-purple-900"
            >
              <span className="material-icons-round text-sm">arrow_forward</span>
              Continue
            </button>
          ) : (
            <button
              onClick={handleSplitSave}
              className="w-full md:w-auto bg-kauvery-purple hover:bg-kauvery-violet text-white px-8 py-3 rounded-lg font-bold shadow-lg transition-transform transform active:scale-95 flex items-center justify-center gap-2 border border-purple-900"
            >
              <span className="material-icons-round text-sm">save</span>
              Submit Evaluation
            </button>
          )
        )}
      </div>
    </div>
  );
};
