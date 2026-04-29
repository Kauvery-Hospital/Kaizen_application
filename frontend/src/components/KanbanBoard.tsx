
import React from 'react';
import { Suggestion, Status, Role } from '../types';
import { STATUS_COLORS } from '../constants';

interface KanbanBoardProps {
  suggestions: Suggestion[];
  role: Role;
  currentUserName?: string;
  onSelect: (suggestion: Suggestion) => void;
}

const COLUMNS = [
  { id: 'new', title: 'Ideas Submitted', statuses: [Status.IDEA_SUBMITTED] },
  { id: 'assign', title: 'To Assign', statuses: [Status.APPROVED_FOR_ASSIGNMENT] },
  { id: 'wip', title: 'Implementation', statuses: [Status.ASSIGNED_FOR_IMPLEMENTATION] },
  { id: 'verify', title: 'Verification & Approval', statuses: [Status.IMPLEMENTATION_DONE, Status.VERIFIED_PENDING_APPROVAL] },
  { id: 'eval', title: 'Evaluation', statuses: [Status.BE_EVALUATION_PENDING, Status.REWARD_PENDING] },
  { id: 'done', title: 'Rewarded', statuses: [Status.REWARDED] },
];

const filterSuggestionsForRole = (role: Role, suggestion: Suggestion, currentUserName?: string) => {
  // Mirror role-based visibility from SuggestionList so both views stay in sync.
  if (role === Role.ADMIN) return true;

  if (role === Role.EMPLOYEE) {
    return currentUserName ? suggestion.employeeName === currentUserName : true;
  }

  if (role === Role.UNIT_COORDINATOR) {
    const isOwn =
      currentUserName &&
      suggestion.employeeName.trim().toLowerCase() === currentUserName.trim().toLowerCase();
    if (isOwn) return false;
    return [
      Status.IDEA_SUBMITTED,
      Status.APPROVED_FOR_ASSIGNMENT,
      Status.IMPLEMENTATION_DONE,
      Status.BE_REVIEW_DONE,
    ].includes(suggestion.status);
  }

  if (role === Role.SELECTION_COMMITTEE) {
    return suggestion.status === Status.APPROVED_FOR_ASSIGNMENT;
  }

  if (role === Role.IMPLEMENTER) {
    const isAssignedToMe = currentUserName
      ? suggestion.assignedImplementer === currentUserName
      : true;
    return isAssignedToMe && suggestion.status === Status.ASSIGNED_FOR_IMPLEMENTATION;
  }

  if (role === Role.BUSINESS_EXCELLENCE) {
    return [Status.IMPLEMENTATION_DONE, Status.BE_REVIEW_DONE].includes(suggestion.status);
  }

  if (role === Role.BUSINESS_EXCELLENCE_HEAD) {
    return [
      Status.BE_EVALUATION_PENDING,
      Status.REWARD_PENDING,
      Status.REWARDED,
    ].includes(suggestion.status);
  }

  if (role === Role.HR_HEAD) {
    if ([Status.REWARD_PENDING, Status.REWARDED].includes(suggestion.status)) return true;
    return (
      suggestion.status === Status.VERIFIED_PENDING_APPROVAL &&
      suggestion.requiredApprovals?.includes(role) &&
      !suggestion.approvals?.[role]
    );
  }

  if (role === Role.QUALITY_HOD || role === Role.FINANCE_HOD) {
    return (
      suggestion.status === Status.VERIFIED_PENDING_APPROVAL &&
      suggestion.requiredApprovals?.includes(role) &&
      !suggestion.approvals?.[role]
    );
  }

  return true;
};

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ suggestions, role, currentUserName, onSelect }) => {
  return (
    <div className="h-[calc(100vh-140px)] overflow-x-auto pb-4">
      <div className="flex gap-4 h-full min-w-max">
        {COLUMNS.map(col => {
            const items = suggestions
              .filter(s => filterSuggestionsForRole(role, s, currentUserName))
              .filter(s => col.statuses.includes(s.status));
            
            return (
                <div key={col.id} className="w-80 flex-shrink-0 flex flex-col bg-gray-200 rounded-xl overflow-hidden border border-gray-300">
                    <div className="p-3 bg-gray-300 border-b border-gray-400 flex justify-between items-center">
                        <h3 className="font-extrabold text-gray-800 text-xs uppercase tracking-wide">{col.title}</h3>
                        <span className="bg-gray-400 text-gray-900 text-[10px] px-2 py-0.5 rounded-full font-bold">{items.length}</span>
                    </div>
                    <div className="p-2 overflow-y-auto flex-1 space-y-3">
                        {items.map(item => (
                            <div 
                                key={item.id} 
                                onClick={() => onSelect(item)}
                                className="bg-white p-4 rounded-lg shadow-sm border border-gray-300 cursor-pointer hover:shadow-md transition-all group"
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-[10px] font-mono text-gray-600 font-bold">
                                      {item.code || item.id}
                                    </span>
                                    {item.aiImpactScore && item.aiImpactScore > 80 && (
                                        <span className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-bold border border-green-200">Hi-Impact</span>
                                    )}
                                </div>
                                <h4 className="text-sm font-extrabold text-gray-900 leading-snug mb-2 group-hover:text-kauvery-purple">{item.theme}</h4>
                                <div className="flex items-center gap-2 mb-3">
                                     <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-700 border border-gray-300">
                                        {item.employeeName.charAt(0)}
                                     </div>
                                     <span className="text-xs text-gray-700 font-bold truncate">{item.employeeName}</span>
                                </div>
                                <div className="flex justify-between items-center border-t border-gray-200 pt-2">
                                    <span className={`text-[10px] px-2 py-1 rounded-full ${STATUS_COLORS[item.status]}`}>
                                        {item.status.split(' ')[0]}
                                    </span>
                                    <span className="text-[10px] text-gray-600 font-bold">{item.dateSubmitted}</span>
                                </div>
                            </div>
                        ))}
                        {items.length === 0 && (
                            <div className="text-center py-10 text-gray-500 text-sm italic font-medium">No items</div>
                        )}
                    </div>
                </div>
            )
        })}
      </div>
    </div>
  );
};
