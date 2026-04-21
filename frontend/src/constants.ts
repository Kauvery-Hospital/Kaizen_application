
import { Role, Status, Suggestion } from './types';

export const MOCK_SUGGESTIONS: Suggestion[] = [
  {
    id: 'KZ-2023-001',
    theme: 'Reduction of Patient Wait Time in OPD Pharmacy',
    unit: 'Main Hospital',
    area: 'OPD Pharmacy',
    department: 'Pharmacy',
    dateSubmitted: '2023-10-01',
    employeeName: 'Rajesh Kumar',
    description: 'Patients wait too long for medicine collection. We need a barcode system.',
    status: Status.REWARDED,
    expectedBenefits: {
      productivity: true, quality: true, cost: false, delivery: true,
      safety: false, energy: false, environment: false, morale: true
    },
    // Implementation Details
    assignedImplementer: 'Rajesh Kumar',
    assignedUnit: 'Main Hospital',
    assignedDepartment: 'Pharmacy',
    problem: {
      what: 'High waiting time for patients collecting medicines.',
      where: 'OPD Pharmacy Counter',
      when: 'Peak hours (10 AM - 1 PM)',
      who: 'Outpatients',
      how: 'Manual billing process takes time.'
    },
    analysis: {
      why1: 'Billing process is slow',
      why2: 'Pharmacist has to type generic names manually',
      why3: 'Barcode scanner not configured for all SKUs',
      why4: 'System database incomplete',
      why5: 'New stock entry process was not followed',
      rootCause: 'Incomplete barcode database for new inventory.'
    },
    counterMeasure: 'Updated barcode database for all 500 new SKUs and trained staff on auto-entry.',
    ideaToEliminate: 'Manual typing of medicine names.',
    beforeDescription: 'Average wait time: 25 mins. Pharmacist typing names manually.',
    afterDescription: 'Average wait time: 10 mins. 100% barcode scanning implemented.',
    standardization: { opl: true, sop: true, manual: false, others: false },
    horizontalDeployment: 'IPD Pharmacy',
    teamMembers: 'Suresh, Anita',
    aiImpactScore: 92,
    aiCategory: 'Productivity',
    rewardEvaluation: {
      scores: {
        productivity: 15, originality: 10, efforts: 7, horizontal: 7, hse: 1, qualitative: 12, cost: 5
      },
      totalScore: 57,
      grade: 'Grade B (51~75)',
      voucherValue: 1500,
      evaluatedBy: 'Business Excellence Team',
      evaluationDate: '2023-10-20'
    }
  },
  {
    id: 'KZ-2023-002',
    theme: 'Elimination of Plastic Cups in Pantry',
    unit: 'Heart City',
    area: 'Admin Pantry',
    department: 'Admin',
    dateSubmitted: '2023-11-05',
    employeeName: 'Nurse Geetha',
    description: 'Replace plastic cups with steel tumblers to save environment and reduce waste.',
    status: Status.IDEA_SUBMITTED,
    expectedBenefits: {
      productivity: false, quality: false, cost: true, delivery: false,
      safety: false, energy: false, environment: true, morale: false
    }
  }
];

export const STATUS_COLORS: Record<Status, string> = {
  [Status.IDEA_SUBMITTED]: 'bg-gray-100 text-gray-900 border border-gray-300 font-bold',
  [Status.IDEA_REJECTED]: 'bg-red-50 text-red-900 border border-red-200 font-bold',
  [Status.APPROVED_FOR_ASSIGNMENT]: 'bg-blue-50 text-blue-900 border border-blue-200 font-bold',
  [Status.ASSIGNED_FOR_IMPLEMENTATION]: 'bg-indigo-50 text-indigo-900 border border-indigo-200 font-bold',
  [Status.IMPLEMENTATION_DONE]: 'bg-purple-50 text-purple-900 border border-purple-200 font-bold',
  [Status.VERIFIED_PENDING_APPROVAL]: 'bg-orange-50 text-orange-900 border border-orange-200 font-bold',
  [Status.BE_EVALUATION_PENDING]: 'bg-teal-50 text-teal-900 border border-teal-200 font-bold',
  [Status.REWARD_PENDING]: 'bg-emerald-50 text-emerald-900 border border-emerald-200 font-bold',
  [Status.REWARDED]: 'bg-pink-50 text-pink-900 border border-pink-200 font-bold',
};

export const EVALUATION_CRITERIA = [
  {
    id: 'productivity',
    label: 'Productivity',
    options: [
      { label: '<10%', points: 4 },
      { label: '11 ~ 20%', points: 8 },
      { label: '21 ~ 30%', points: 12 },
      { label: '> 30%', points: 15 },
    ]
  },
  {
    id: 'originality',
    label: 'Originality (Level Of Technical Idea)',
    options: [
      { label: 'Nearly Old Idea', points: 5 },
      { label: 'Somewhat changed the old system', points: 10 },
      { label: 'Similar to another but with further development', points: 15 },
      { label: 'Unique W/o precedence', points: 20 },
    ]
  },
  {
    id: 'efforts',
    label: 'Efforts taken for implementation',
    options: [
      { label: 'Implemented with the help of Top Management', points: 1 },
      { label: 'Impl. With help of HOD or Incharge', points: 5 },
      { label: 'With help of colleague', points: 7 },
      { label: 'Implemented by self', points: 10 },
    ]
  },
  {
    id: 'horizontal',
    label: 'Applicable range Horizontal Deployment',
    options: [
      { label: 'Difficult to use for other work', points: 1 },
      { label: 'Possible with slight modification', points: 5 },
      { label: 'Can be applied to other work', points: 7 },
      { label: 'Extremely with applicability', points: 10 },
    ]
  },
  {
    id: 'hse',
    label: 'HSE (Health, Safety and Environment)',
    options: [
      { label: 'Trivial risk eliminated', points: 1 },
      { label: 'Moderate risk eliminated', points: 5 },
      { label: 'Tolerable risk eliminated', points: 7 },
      { label: 'Significant risk eliminated', points: 10 },
    ]
  },
  {
    id: 'qualitative',
    label: 'Qualitative or Service excellence benefits',
    options: [
      { label: 'Trivial Benefits', points: 4 },
      { label: 'Moderate Benefits', points: 8 },
      { label: 'High Level Benefits', points: 12 },
      { label: 'Extreme Satisfaction', points: 15 },
    ]
  },
  {
    id: 'cost',
    label: 'Cost Reduction (In Rs)',
    options: [
      { label: '< 1000 per Month', points: 5 },
      { label: '1001-5000 per month', points: 10 },
      { label: '5001-10000 per month', points: 15 },
      { label: '> 10001 per month', points: 20 },
    ]
  }
];

export const GRADE_THRESHOLDS = [
  { grade: 'Grade A (76~100)', min: 76, value: 5000, color: 'bg-green-50 text-green-900 border border-green-200' },
  { grade: 'Grade B (51~75)', min: 51, value: 3000, color: 'bg-teal-50 text-teal-900 border border-teal-200' },
  { grade: 'Grade C (26~50)', min: 26, value: 2000, color: 'bg-yellow-50 text-yellow-900 border border-yellow-200' },
  { grade: 'Grade D (<25)', min: 0, value: 1000, color: 'bg-red-50 text-red-900 border border-red-200' },
];
