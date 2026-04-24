
import React, { useEffect, useRef, useState } from 'react';
import { Suggestion, Status, Role, RewardEvaluation, type Comment } from '../types';
import { STATUS_COLORS } from '../constants';
import { HOD_DIRECTORY, HOD_DEPARTMENT_OPTIONS } from '../constants/hodDirectory';
import { analyzeSuggestion } from '../services/geminiService';
import { RewardEvaluationForm } from './RewardEvaluationForm';
import { SuggestionForm, type SuggestionFormHandle } from './SuggestionForm';

interface ModalProps {
  suggestion: Suggestion | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenTemplatePage?: (suggestion: Suggestion, opts?: { edit?: boolean }) => void;
  role: Role;
  currentUserName?: string;
  onUpdateStatus: (id: string, status: Status, extraData?: Partial<Suggestion>) => Promise<void> | void;
  initialView?: 'default' | 'tracking';
  apiBase: string;
  accessToken: string;
  unitOptions: { id: string; code: string; name: string }[];
  departmentOptions: { id: string; name: string }[];
}

export const SuggestionDetailModal: React.FC<ModalProps> = ({
  suggestion,
  isOpen,
  onClose,
  onOpenTemplatePage,
  role,
  currentUserName = '',
  onUpdateStatus,
  initialView = 'default',
  apiBase,
  accessToken,
  unitOptions,
  departmentOptions,
}) => {
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const templateFormRef = useRef<SuggestionFormHandle | null>(null);
  const [finalGenerated, setFinalGenerated] = useState<{ pptPath?: string; pdfPath?: string } | null>(null);
  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  };

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'analysis' | 'review' | 'template' | 'discussion'
  >('overview');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [commentDraft, setCommentDraft] = useState('');

  const handleAddNote = async () => {
    const text = String(commentDraft || '').trim();
    if (!text || !suggestion) return;

    const existing = Array.isArray(suggestion.comments)
      ? (suggestion.comments as Comment[])
      : [];
    const next: Comment = {
      id: `C-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      author: currentUserName || 'User',
      role,
      text,
      date: new Date().toISOString(),
    };

    try {
      await onUpdateStatus(suggestion.id, suggestion.status as Status, {
        comments: [...existing, next],
      });
      setCommentDraft('');
      showToast('success', 'Note added');
    } catch {
      showToast('error', 'Failed to add note');
    }
  };
  
  // Implementation State
  const [isImplementationMode, setIsImplementationMode] = useState(false);
  const [isBeTemplateEditMode, setIsBeTemplateEditMode] = useState(false);
  const [isTemplatePreviewMode, setIsTemplatePreviewMode] = useState(false);
  const [templateAssetPreview, setTemplateAssetPreview] = useState<'pdf' | 'ppt' | null>(null);
  const [implementerName, setImplementerName] = useState('');
  const [implementerEmployeeCode, setImplementerEmployeeCode] = useState('');
  const [assignUnit, setAssignUnit] = useState('');
  const [implementerDept, setImplementerDept] = useState('');
  const [implementerOptions, setImplementerOptions] = useState<
    { employeeCode: string; name: string; manager?: string | null }[]
  >([]);
  const [implementationDeadline, setImplementationDeadline] = useState('');
  const [implementationStage, setImplementationStage] = useState<'Started' | 'In Progress' | 'Completed'>('Started');
  const [implementationProgress, setImplementationProgress] = useState<number>(0);
  const [implementationUpdate, setImplementationUpdate] = useState('');
  const [deadlineChangeDate, setDeadlineChangeDate] = useState('');
  const [deadlineChangeRemark, setDeadlineChangeRemark] = useState('');

  // Verification State
  const [selectedApprovers, setSelectedApprovers] = useState<Role[]>([]);
  const [hodApproverNames, setHodApproverNames] = useState<Partial<Record<Role, string>>>({});
  const [selectedDeptForHod, setSelectedDeptForHod] = useState('');
  const [selectedHodUserName, setSelectedHodUserName] = useState('');
  const [coordinatorSuggestion, setCoordinatorSuggestion] = useState('');

  useEffect(() => {
    if (suggestion && isOpen) {
      setNotes(suggestion.screeningNotes || '');
      setAiAnalysis(null);
      setActiveTab(initialView === 'tracking' ? 'review' : 'overview');
      setCommentDraft('');
      setIsImplementationMode(false);
      setIsBeTemplateEditMode(false);
      setIsTemplatePreviewMode(false);
      setTemplateAssetPreview(null);
      setImplementerName(suggestion.assignedImplementer || '');
      setImplementerEmployeeCode(suggestion.assignedImplementerCode || '');
      setAssignUnit(suggestion.assignedUnit || suggestion.unit || '');
      setImplementerDept(suggestion.assignedDepartment || '');
      setImplementationDeadline(suggestion.implementationDeadline || '');
      setImplementationStage((suggestion.implementationStage as any) || 'Started');
      setImplementationProgress(suggestion.implementationProgress || 0);
      setImplementationUpdate(suggestion.implementationUpdate || '');
      setDeadlineChangeDate('');
      setDeadlineChangeRemark('');
      setSelectedApprovers(suggestion.requiredApprovals || []);
      setHodApproverNames(suggestion.hodApproverNames || {});
      setSelectedDeptForHod('');
      setSelectedHodUserName('');
      setCoordinatorSuggestion(suggestion.coordinatorSuggestion || '');
      setFinalGenerated(null);
    }
  }, [suggestion, isOpen, initialView]);

  useEffect(() => {
    if (!isOpen) return;
    if (!accessToken) return;
    // Only committee/admin/superadmin can call this endpoint
    const canFetchImplementers =
      role === Role.SELECTION_COMMITTEE ||
      role === Role.ADMIN ||
      role === Role.SUPER_ADMIN;
    if (!canFetchImplementers) {
      setImplementerOptions([]);
      return;
    }
    if (!assignUnit || !implementerDept) {
      setImplementerOptions([]);
      return;
    }
    if (!suggestion) return;
    // Only needed during assignment step
    if (suggestion.status !== Status.APPROVED_FOR_ASSIGNMENT) return;
    let cancelled = false;
    (async () => {
      try {
        const url = `${apiBase}/users/implementers?unitCode=${encodeURIComponent(assignUnit)}&department=${encodeURIComponent(implementerDept)}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setImplementerOptions(Array.isArray(data) ? data : []);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, accessToken, assignUnit, implementerDept, isOpen, role, suggestion]);

  if (!isOpen || !suggestion) return null;

  // implementerOptions is rendered directly in the select

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const context = suggestion.problem 
          ? `Problem: ${suggestion.problem.what} Root Cause: ${suggestion.analysis?.rootCause} Solution: ${suggestion.counterMeasure}`
          : `Idea: ${suggestion.description}`;
          
      const result = await analyzeSuggestion(
        apiBase,
        () => ({ Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }),
        suggestion.theme,
        context,
      );
      setAiAnalysis(result);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- WORKFLOW ACTIONS ---

  // 1. Coordinator: Approve Idea -> Send to Committee
  const handleIdeaApproval = async (approved: boolean) => {
    try {
      if (!approved && !String(notes || '').trim()) {
        showToast('error', 'Remarks are required to reject.');
        return;
      }
      await onUpdateStatus(
        suggestion.id,
        approved ? Status.APPROVED_FOR_ASSIGNMENT : Status.IDEA_REJECTED,
        { screeningNotes: notes },
      );
      showToast('success', approved ? 'Idea approved' : 'Idea rejected');
      if (!approved) onClose();
    } catch (e: any) {
      showToast('error', 'Failed to update');
    }
  };

  // 2. Committee: Assign Implementer
  const handleAssignImplementer = async () => {
    if (
      !implementerName ||
      !implementerEmployeeCode ||
      !assignUnit ||
      !implementerDept ||
      !implementationDeadline
    ) {
      return alert('Please select unit, department, implementer, and deadline');
    }
    try {
      await onUpdateStatus(suggestion.id, Status.ASSIGNED_FOR_IMPLEMENTATION, {
        assignedImplementer: implementerName,
        assignedImplementerCode: implementerEmployeeCode,
        assignedUnit: assignUnit,
        assignedDepartment: implementerDept,
        implementationDeadline,
        implementationAssignedDate: new Date().toISOString().split('T')[0],
        implementationStage: 'Started',
        implementationProgress: 0
      });
      showToast('success', 'Implementer assigned');
    } catch {
      showToast('error', 'Failed to assign implementer');
    }
  };

  const handleImplementerProgressUpdate = async () => {
    const floor = suggestion.implementationProgress ?? 0;
    try {
      await onUpdateStatus(suggestion.id, Status.ASSIGNED_FOR_IMPLEMENTATION, {
        implementationStage,
        implementationProgress: Math.max(floor, implementationProgress),
        implementationUpdate,
        implementationUpdateDate: new Date().toISOString().split('T')[0],
      });
      showToast('success', 'Progress updated');
    } catch {
      showToast('error', 'Failed to update progress');
    }
  };

  const handleImplementerDeadlineChange = async () => {
    if (!canImplementerUpdateWorkingStatus) return;
    if (!deadlineChangeDate) {
      alert('Please select the new deadline date.');
      return;
    }
    if (!deadlineChangeRemark.trim()) {
      alert('Please add remark for deadline change.');
      return;
    }
    const assignedDate = suggestion.implementationAssignedDate || suggestion.dateSubmitted;
    const assigned = new Date(`${assignedDate}T00:00:00`);
    const max = new Date(assigned);
    max.setMonth(max.getMonth() + 1);
    const next = new Date(`${deadlineChangeDate}T00:00:00`);
    if (next < assigned || next > max) {
      alert(`Deadline must be within 1 month from assigned date (${assignedDate}).`);
      return;
    }
    try {
      await onUpdateStatus(suggestion.id, suggestion.status, {
        implementationDeadline: deadlineChangeDate,
        deadlineChangeRemark: deadlineChangeRemark.trim(),
        implementationUpdateDate: new Date().toISOString().split('T')[0],
      });
      setDeadlineChangeRemark('');
      showToast('success', 'Deadline updated');
    } catch {
      showToast('error', 'Failed to update deadline');
    }
  };

  const collectEditedFields = (prev: Suggestion, next: Partial<Suggestion>) => {
    const keysToTrack: Array<keyof Suggestion> = [
      'counterMeasure',
      'ideaToEliminate',
      'beforeDescription',
      'afterDescription',
      'horizontalDeployment',
      'quantitativeResults',
      'howMuch',
      'processBefore',
      'processAfter',
      'result1',
      'result2',
      'result3',
      'result1Before',
      'result1After',
      'result2Before',
      'result2After',
      'result3Before',
      'result3After',
      'startDate',
      'completionDate',
      'category',
    ];
    const changed: string[] = [];
    keysToTrack.forEach(k => {
      if (next[k] !== undefined && JSON.stringify(prev[k]) !== JSON.stringify(next[k])) {
        changed.push(k as string);
      }
    });
    if (next.problem && JSON.stringify(prev.problem) !== JSON.stringify(next.problem)) changed.push('problem');
    if (next.analysis && JSON.stringify(prev.analysis) !== JSON.stringify(next.analysis)) changed.push('analysis');
    if (next.standardization && JSON.stringify(prev.standardization) !== JSON.stringify(next.standardization)) changed.push('standardization');
    return changed;
  };

  // 3. Implementer/BE: Submit Report
  const handleImplementationSubmit = (
    data: Partial<Suggestion>,
    _meta?: { ideaFiles?: File[] },
  ) => {
      if (isBeTemplateEditMode && role === Role.BUSINESS_EXCELLENCE) {
        const changed = collectEditedFields(suggestion, data);
      (async () => {
        try {
          await onUpdateStatus(suggestion.id, Status.IMPLEMENTATION_DONE, {
          ...data,
          beEditedFields: Array.from(new Set([...(suggestion.beEditedFields || []), ...changed])),
          beReviewNotes: 'Template updated by Business Excellence review.',
          });
          showToast('success', 'Template updated');
          setIsImplementationMode(false);
          setIsBeTemplateEditMode(false);
        } catch {
          showToast('error', 'Failed to submit');
        }
      })();
        return;
      }
      (async () => {
        try {
          await onUpdateStatus(suggestion.id, Status.IMPLEMENTATION_DONE, {
            ...data,
            implementationProgress: 100,
            implementationStage: 'Completed',
            implementationDate: new Date().toISOString().split('T')[0],
            // Keep a snapshot of the submitted template (used for preview/export later)
            implementationDraft: data,
          });
          showToast('success', 'Implementation report submitted');
          setIsImplementationMode(false);
        } catch {
          showToast('error', 'Failed to submit report');
        }
      })();
  };

  const handleImplementationDraftSave = (data: Partial<Suggestion>) => {
      (async () => {
        try {
          await onUpdateStatus(suggestion.id, Status.ASSIGNED_FOR_IMPLEMENTATION, {
            ...data,
            implementationUpdateDate: new Date().toISOString().split('T')[0],
          });
          showToast('success', 'Draft saved');
        } catch {
          showToast('error', 'Failed to save draft');
        }
      })();
  };

  // 4. Coordinator: Verify and Select Approvers
  const handleVerification = () => {
      onUpdateStatus(suggestion.id, Status.BE_EVALUATION_PENDING, {
          coordinatorSuggestion,
          approvals: {},
          // Populate template footer "Validated By — Department In-charger / HOD" with the approving Unit Coordinator.
          validatedBy: suggestion.validatedBy || currentUserName || 'Unit Coordinator',
      });
  };

  const handleBEReviewApproval = () => {
    onUpdateStatus(suggestion.id, Status.BE_REVIEW_DONE, {
      beReviewNotes: 'BE reviewed and approved template for Unit Coordinator approval.',
    });
  };

  const handleBEReviewNotApproved = async () => {
    const remark = String(notes || '').trim();
    if (!remark) {
      showToast('error', 'Remarks are required for Not approved.');
      return;
    }
    try {
      await onUpdateStatus(suggestion.id, Status.ASSIGNED_FOR_IMPLEMENTATION, {
        beReviewNotes: remark,
      });
      showToast('success', 'Sent back to implementer');
    } catch (e: any) {
      showToast('error', e?.message || 'Failed to send back');
    }
  };

  const handleCoordinatorNotApproved = async () => {
    const remark = String(coordinatorSuggestion || '').trim();
    if (!remark) {
      showToast('error', 'Remarks are required for Not approved.');
      return;
    }
    try {
      await onUpdateStatus(suggestion.id, Status.IMPLEMENTATION_DONE, {
        coordinatorSuggestion: remark,
      });
      showToast('success', 'Sent back to BE review');
    } catch (e: any) {
      showToast('error', e?.message || 'Failed to send back');
    }
  };

  const [approvalRemarks, setApprovalRemarks] = useState('');
  const handleFunctionalApprove = async () => {
    const r = role;
    if (![Role.FINANCE_HOD, Role.QUALITY_HOD, Role.HR_HEAD].includes(r)) return;
    try {
      const nextApprovals = { ...(suggestion.approvals || {}), [r]: true };
      const req = suggestion.requiredApprovals || [];
      const allDone = req.every((x) => nextApprovals?.[x]);
      if (r === Role.FINANCE_HOD && allDone) {
        await onUpdateStatus(suggestion.id, Status.REWARD_PENDING, {
          approvals: nextApprovals,
        });
      } else {
        await onUpdateStatus(suggestion.id, Status.VERIFIED_PENDING_APPROVAL, {
          approvals: nextApprovals,
        });
      }
      showToast('success', 'Approval recorded');
      setApprovalRemarks('');
    } catch (e: any) {
      showToast('error', e?.message || 'Failed to approve');
    }
  };

  const handleFunctionalNotApproved = async () => {
    const remark = String(approvalRemarks || '').trim();
    if (!remark) {
      showToast('error', 'Remarks are required for Not approved.');
      return;
    }
    try {
      await onUpdateStatus(suggestion.id, Status.BE_EVALUATION_PENDING, {
        beReviewNotes: remark,
      });
      showToast('success', 'Sent back to BE Head');
      setApprovalRemarks('');
    } catch (e: any) {
      showToast('error', e?.message || 'Failed to send back');
    }
  };

  const addHodFromPicker = () => {
    if (!selectedDeptForHod || !selectedHodUserName) {
      alert('Select a department and an HOD user to assign.');
      return;
    }
    const entry = HOD_DIRECTORY[selectedDeptForHod];
    if (!entry) return;
    const r = entry.role;
    setSelectedApprovers(prev => (prev.includes(r) ? prev : [...prev, r]));
    setHodApproverNames(prev => ({ ...prev, [r]: selectedHodUserName }));
  };

  const removeApprover = (r: Role) => {
    setSelectedApprovers(prev => prev.filter(x => x !== r));
    setHodApproverNames(prev => {
      const next = { ...prev };
      delete next[r];
      return next;
    });
  };

  const handleTemplateAssetAction = (fileType: 'ppt' | 'pdf') => {
    setTemplateAssetPreview(fileType);
  };

  const handleViewTemplate = () => {
    setIsTemplatePreviewMode(true);
  };

  // 6. BE: Evaluate
  const handleRewardSave = (evaluation: RewardEvaluation) => {
    const voucher = Number((evaluation as any)?.voucherValue ?? 0);
    // If voucher > 2000, require Finance Head approval before moving to HR reward processing.
    if (voucher > 2000) {
      onUpdateStatus(suggestion.id, Status.VERIFIED_PENDING_APPROVAL, {
        rewardEvaluation: evaluation,
        approvals: {},
        requiredApprovals: [Role.FINANCE_HOD],
      });
      return;
    }
    onUpdateStatus(suggestion.id, Status.REWARD_PENDING, { rewardEvaluation: evaluation });
  };

  // 7. HR: Process Reward
  const handleProcessReward = () => {
      onUpdateStatus(suggestion.id, Status.REWARDED);
  };

  const pendingApprovers =
    suggestion.requiredApprovals?.filter(r => !suggestion.approvals?.[r]) || [];

  const getCurrentOwner = () => {
    if (suggestion.status === Status.IDEA_SUBMITTED) return Role.UNIT_COORDINATOR;
    if (suggestion.status === Status.APPROVED_FOR_ASSIGNMENT) return Role.SELECTION_COMMITTEE;
    if (suggestion.status === Status.ASSIGNED_FOR_IMPLEMENTATION) {
      return suggestion.assignedImplementer || Role.IMPLEMENTER;
    }
    if (suggestion.status === Status.IMPLEMENTATION_DONE) return Role.BUSINESS_EXCELLENCE;
    if (suggestion.status === Status.BE_REVIEW_DONE) return Role.UNIT_COORDINATOR;
    if (suggestion.status === Status.VERIFIED_PENDING_APPROVAL) return Role.BUSINESS_EXCELLENCE_HEAD;
    if (suggestion.status === Status.BE_EVALUATION_PENDING) return Role.BUSINESS_EXCELLENCE_HEAD;
    if (suggestion.status === Status.REWARD_PENDING) return 'HR';
    if (suggestion.status === Status.REWARDED) return 'Closed';
    if (suggestion.status === Status.IDEA_REJECTED) return 'Closed';
    return 'N/A';
  };

  const getActionRequired = () => {
    if (suggestion.status === Status.IDEA_SUBMITTED) return 'Screen idea and add remarks';
    if (suggestion.status === Status.APPROVED_FOR_ASSIGNMENT) return 'Assign implementer and department';
    if (suggestion.status === Status.ASSIGNED_FOR_IMPLEMENTATION) return 'Complete Kaizen template';
    if (suggestion.status === Status.IMPLEMENTATION_DONE) return 'BE review/edit template and approve to Unit Coordinator';
    if (suggestion.status === Status.BE_REVIEW_DONE) return 'Unit Coordinator approval after BE review';
    if (suggestion.status === Status.VERIFIED_PENDING_APPROVAL) return 'Pending BE final scoring';
    if (suggestion.status === Status.BE_EVALUATION_PENDING) return 'Business Excellence Head final scoring and evaluation';
    if (suggestion.status === Status.REWARD_PENDING) return 'HR process payment and notify employee';
    if (suggestion.status === Status.REWARDED) return 'Completed';
    if (suggestion.status === Status.IDEA_REJECTED) return 'Rejected';
    return 'N/A';
  };

  const workflowSteps: Array<{
    id: string;
    title: string;
    owner: string;
    statuses: Status[];
    state: 'done' | 'current' | 'pending';
  }> = [
    {
      id: 'submission',
      title: 'Idea Submitted',
      owner: Role.EMPLOYEE,
      statuses: [
        Status.IDEA_SUBMITTED,
        Status.APPROVED_FOR_ASSIGNMENT,
        Status.ASSIGNED_FOR_IMPLEMENTATION,
        Status.IMPLEMENTATION_DONE,
        Status.BE_REVIEW_DONE,
        Status.VERIFIED_PENDING_APPROVAL,
        Status.BE_EVALUATION_PENDING,
        Status.REWARD_PENDING,
        Status.REWARDED,
      ],
      state: 'pending',
    },
    {
      id: 'screening',
      title: 'Coordinator Screening',
      owner: Role.UNIT_COORDINATOR,
      statuses: [
        Status.APPROVED_FOR_ASSIGNMENT,
        Status.ASSIGNED_FOR_IMPLEMENTATION,
        Status.IMPLEMENTATION_DONE,
        Status.BE_REVIEW_DONE,
        Status.VERIFIED_PENDING_APPROVAL,
        Status.BE_EVALUATION_PENDING,
        Status.REWARD_PENDING,
        Status.REWARDED,
      ],
      state: 'pending',
    },
    {
      id: 'assignment',
      title: 'Committee Assignment',
      owner: Role.SELECTION_COMMITTEE,
      statuses: [
        Status.ASSIGNED_FOR_IMPLEMENTATION,
        Status.IMPLEMENTATION_DONE,
        Status.BE_REVIEW_DONE,
        Status.VERIFIED_PENDING_APPROVAL,
        Status.BE_EVALUATION_PENDING,
        Status.REWARD_PENDING,
        Status.REWARDED,
      ],
      state: 'pending',
    },
    {
      id: 'implementation',
      title: 'Implementer Template',
      owner: suggestion.assignedImplementer || Role.IMPLEMENTER,
      statuses: [
        Status.IMPLEMENTATION_DONE,
        Status.VERIFIED_PENDING_APPROVAL,
        Status.BE_EVALUATION_PENDING,
        Status.REWARD_PENDING,
        Status.REWARDED,
      ],
      state: 'pending',
    },
    {
      id: 'functional',
      title: 'Unit Coordinator Approval',
      owner: Role.UNIT_COORDINATOR,
      statuses: [Status.VERIFIED_PENDING_APPROVAL, Status.BE_EVALUATION_PENDING, Status.REWARD_PENDING, Status.REWARDED],
      state: 'pending',
    },
    {
      id: 'be',
      title: 'Business Excellence Head Evaluation',
      owner: Role.BUSINESS_EXCELLENCE_HEAD,
      statuses: [Status.REWARD_PENDING, Status.REWARDED],
      state: 'pending',
    },
    {
      id: 'reward',
      title: 'Reward Processing & Closure',
      owner: 'HR / Unit Coordinator',
      statuses: [Status.REWARDED],
      state: 'pending',
    },
  ].map(step => {
    if (suggestion.status === Status.IDEA_REJECTED) {
      return { ...step, state: step.id === 'submission' ? 'done' : 'pending' as const };
    }
    if (step.statuses.includes(suggestion.status)) return { ...step, state: 'done' as const };
    if (
      (step.id === 'screening' && suggestion.status === Status.IDEA_SUBMITTED) ||
      (step.id === 'assignment' && suggestion.status === Status.APPROVED_FOR_ASSIGNMENT) ||
      (step.id === 'implementation' && suggestion.status === Status.ASSIGNED_FOR_IMPLEMENTATION) ||
      (step.id === 'functional' && suggestion.status === Status.BE_REVIEW_DONE) ||
      (step.id === 'be' && (suggestion.status === Status.VERIFIED_PENDING_APPROVAL || suggestion.status === Status.BE_EVALUATION_PENDING)) ||
      (step.id === 'reward' && suggestion.status === Status.REWARD_PENDING)
    ) {
      return { ...step, state: 'current' as const };
    }
    return { ...step, state: 'pending' as const };
  });
  const getRoleActionState = () => {
    if (role === Role.EMPLOYEE) return { canAct: false, message: 'Employee can only view tracking status and remarks.' };
    if (role === Role.UNIT_COORDINATOR && suggestion.status === Status.IDEA_SUBMITTED) return { canAct: true, message: 'Approve or reject this submitted idea.' };
    if (role === Role.SELECTION_COMMITTEE && suggestion.status === Status.APPROVED_FOR_ASSIGNMENT) return { canAct: true, message: 'Assign implementer, unit, department, and deadline.' };
    if (role === Role.IMPLEMENTER && suggestion.status === Status.ASSIGNED_FOR_IMPLEMENTATION) return { canAct: true, message: 'Fill and submit implementation template.' };
    if (role === Role.BUSINESS_EXCELLENCE && suggestion.status === Status.IMPLEMENTATION_DONE) return { canAct: true, message: 'Review template, edit if needed, and approve to Unit Coordinator.' };
    if (role === Role.UNIT_COORDINATOR && suggestion.status === Status.BE_REVIEW_DONE) return { canAct: true, message: 'Approve after BE review and send to BE Head scoring.' };
    if (role === Role.BUSINESS_EXCELLENCE_HEAD && suggestion.status === Status.BE_EVALUATION_PENDING) return { canAct: true, message: 'Business Excellence Head evaluates score and reward.' };
    if (role === Role.HR_HEAD && suggestion.status === Status.REWARD_PENDING) return { canAct: true, message: 'Process payment and close the idea.' };
    return { canAct: false, message: 'No action available for this role at current status.' };
  };

  const roleActionState = getRoleActionState();
  const assigneeNorm = (suggestion.assignedImplementer || '').trim().toLowerCase();
  const actorNorm = (currentUserName || '').trim().toLowerCase();
  const isAssignedImplementerUser =
    !assigneeNorm || (Boolean(actorNorm) && assigneeNorm === actorNorm);
  const canImplementerUpdateWorkingStatus =
    role === Role.IMPLEMENTER &&
    suggestion.status === Status.ASSIGNED_FOR_IMPLEMENTATION &&
    isAssignedImplementerUser;
  const progressFloor = suggestion.implementationProgress ?? 0;
  const reportingTo =
    implementerOptions.find((x) => x.employeeCode === implementerEmployeeCode)
      ?.manager || 'Not mapped';
  const workflowThread = suggestion.workflowThread || [];
  const templatePaths: string[] = Array.isArray(suggestion?.templateAttachmentPaths)
    ? (suggestion.templateAttachmentPaths as any)
    : [];
  const pickTemplatePathByExt = (exts: string[]) => {
    const lower = exts.map((e) => e.toLowerCase());
    for (const p of templatePaths) {
      const s = String(p || '').trim();
      const dot = s.lastIndexOf('.');
      const ext = dot >= 0 ? s.slice(dot).toLowerCase() : '';
      if (lower.includes(ext)) return s;
    }
    return '';
  };
  const finalPptPath = pickTemplatePathByExt(['.pptx', '.ppt']);
  const finalPdfPath = pickTemplatePathByExt(['.pdf']);
  const finalPptPathResolved = (finalGenerated?.pptPath || finalPptPath || '').toString().trim();
  const finalPdfPathResolved = (finalGenerated?.pdfPath || finalPdfPath || '').toString().trim();
  const hasSubmittedTemplate =
    suggestion.status !== Status.ASSIGNED_FOR_IMPLEMENTATION &&
    (Boolean(suggestion.problem) ||
      Boolean((suggestion as any).implementedKaizen) ||
      Boolean(suggestion.implementationDraft) ||
      templatePaths.length > 0);

  const downloadRelFileAsBlob = async (relPath: string, filename: string) => {
    debugger
    const rel = String(relPath || '').trim();
    if (!rel || !apiBase) throw new Error('Missing file path');
    const url = `${apiBase}/kaizen-files/${rel}`;
    // `/kaizen-files/*` is served as static assets; adding Authorization triggers a CORS preflight
    // that often fails for static routes. These files are public downloads.
    const res = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit' });
    console.log("res-->",res);
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Delay revocation; some browsers start reading the blob URL after the click.
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
  };

  const ensureFinalAssets = async (): Promise<{ pptPath: string; pdfPath: string } | null> => {
    if (!apiBase || !accessToken) return null;
    if (finalPptPathResolved && finalPdfPathResolved) {
      return { pptPath: finalPptPathResolved, pdfPath: finalPdfPathResolved };
    }
    const slides = await templateFormRef.current?.renderTemplatePngSlides?.();
    if (!slides || slides.length === 0) return null;
    const res = await fetch(
      `${apiBase}/suggestions/${encodeURIComponent(suggestion.id)}/template/finalize`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slides,
          fileNameBase: suggestion.code || suggestion.id,
        }),
      },
    );
                  if (!res.ok) {
                    const txt = await res.text();
                    throw new Error(txt || `Finalize failed (${res.status})`);
                  }
    const out = (await res.json()) as { pptPath: string; pdfPath: string };
    if (!out?.pptPath || !out?.pdfPath) return null;
    setFinalGenerated({ pptPath: out.pptPath, pdfPath: out.pdfPath });
    return out;
  };
  const canViewSubmittedTemplateTab = (() => {
    // Admin / Super Admin / BE roles can view everything.
    if (
      role === Role.ADMIN ||
      role === Role.SUPER_ADMIN ||
      role === Role.BUSINESS_EXCELLENCE ||
      role === Role.BUSINESS_EXCELLENCE_HEAD
    ) {
      return true;
    }

    // Employees should not see the submitted template screen; they can track status only.
    if (role === Role.EMPLOYEE) return false;

    // Implementer can view only if assigned to them.
    if (role === Role.IMPLEMENTER) return Boolean(canImplementerUpdateWorkingStatus);

    // All other roles in the workflow can view once submitted.
    return true;
  })();

  // --- RENDERERS ---

  const Tabs = () => (
      <div className="flex border-b border-gray-200 px-6 overflow-x-auto bg-white">
          <button onClick={() => setActiveTab('overview')} className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'overview' ? 'border-kauvery-purple text-kauvery-purple' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>Overview</button>
          {suggestion.problem && (
             <button onClick={() => setActiveTab('analysis')} className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'analysis' ? 'border-kauvery-purple text-kauvery-purple' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>Full Analysis (5W1H)</button>
          )}
          <button onClick={() => setActiveTab('review')} className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'review' ? 'border-kauvery-purple text-kauvery-purple' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>Action & Status</button>
          {canViewSubmittedTemplateTab && (
            <button
              onClick={() => hasSubmittedTemplate && setActiveTab('template')}
              disabled={!hasSubmittedTemplate}
              className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'template'
                  ? 'border-kauvery-purple text-kauvery-purple'
                  : hasSubmittedTemplate
                    ? 'border-transparent text-gray-600 hover:text-gray-900'
                    : 'border-transparent text-gray-300 cursor-not-allowed'
              }`}
              title={hasSubmittedTemplate ? 'View submitted template' : 'Template not submitted yet'}
            >
              Submitted Template
            </button>
          )}
      </div>
  );

  // If in implementation filling mode, show the form instead of details
  if (isImplementationMode) {
    // Keep legacy state, but route to full page when available
    if (onOpenTemplatePage) {
      onOpenTemplatePage(suggestion, { edit: true });
      setIsImplementationMode(false);
      onClose();
      return null;
    }
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-70 backdrop-blur-md p-4 overflow-y-auto">
        <div className="w-full max-w-5xl my-8">
          <SuggestionForm
            mode="implement"
            initialData={suggestion}
            editedFieldKeys={suggestion.beEditedFields || []}
            apiBase={apiBase}
            accessToken={accessToken}
            onSubmit={handleImplementationSubmit}
            onSaveDraft={handleImplementationDraftSave}
            onCancel={() => setIsImplementationMode(false)}
          />
        </div>
      </div>
    );
  }

  if (isTemplatePreviewMode || templateAssetPreview) {
    const previewLabel = templateAssetPreview ? templateAssetPreview.toUpperCase() : 'TEMPLATE';
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-70 backdrop-blur-md p-4 overflow-y-auto">
        {toast && (
          <div className="fixed top-5 right-5 z-[60]">
            <div
              className={`px-4 py-3 rounded-xl shadow-lg border text-sm font-bold ${
                toast.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
              role="status"
            >
              {toast.message}
            </div>
          </div>
        )}
        <div className="w-full max-w-6xl my-8 bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-white flex justify-between items-start">
            <div>
              <div className="text-xs font-mono text-gray-600 font-bold">
                {suggestion.code || suggestion.id}
              </div>
              <h3 className="text-xl font-black text-gray-900">
                {templateAssetPreview ? `${previewLabel} Preview` : 'Submitted Implementation Template'}
              </h3>
              {/* <p className="text-sm text-gray-600 font-medium mt-1">
                Same layout as template submission pages for coordinator review.
              </p> */}
            </div>
            <button
              onClick={() => {
                setTemplateAssetPreview(null);
                setIsTemplatePreviewMode(false);
              }}
              className="text-gray-500 hover:text-gray-800 p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <span className="material-icons-round">close</span>
            </button>
          </div>

          <div className="px-6 py-3 border-b border-gray-200 bg-white flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-extrabold text-gray-900">Generated template files</div>
              <div className="text-xs text-gray-500 font-semibold mt-0.5">
                {finalPptPathResolved || finalPdfPathResolved ? (
                  <>
                    {finalPptPathResolved ? `PPT: ${finalPptPathResolved.split('/').pop()}` : 'PPT: Not generated'}{' '}
                    {' • '}
                    {finalPdfPathResolved ? `PDF: ${finalPdfPathResolved.split('/').pop()}` : 'PDF: Not generated'}
                  </>
                ) : (
                  'Not generated yet'
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const out = await ensureFinalAssets();
                    if (!out) throw new Error('Failed');
                    console.log("out-->",out);
                    await downloadRelFileAsBlob(
                      out.pptPath,
                      `${suggestion.code || suggestion.id}.pptx`,
                    );
                    showToast('success', 'PPT generated');
                  } catch (e: any) {
                    showToast('error', e?.message ? `PPT failed: ${e.message}` : 'Failed to generate PPT');
                  }
                }}
                className="px-3 py-2 rounded-lg bg-kauvery-purple text-white text-xs font-bold hover:bg-kauvery-violet"
              >
                {finalPptPathResolved ? 'Download PPT' : 'Generate & Download PPT'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const out = await ensureFinalAssets();
                    if (!out) throw new Error('Failed');
                    await downloadRelFileAsBlob(
                      out.pdfPath,
                      `${suggestion.code || suggestion.id}.pdf`,
                    );
                    showToast('success', 'PDF generated');
                  } catch (e: any) {
                    showToast('error', e?.message ? `PDF failed: ${e.message}` : 'Failed to generate PDF');
                  }
                }}
                className="px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-bold hover:bg-gray-800"
              >
                {finalPdfPathResolved ? 'Download PDF' : 'Generate & Download PDF'}
              </button>
            </div>
          </div>

          <div className="p-6 bg-slate-50 max-h-[74vh] overflow-y-auto">
            <SuggestionForm
              ref={templateFormRef}
              mode="implement"
              initialData={suggestion}
              editedFieldKeys={suggestion.beEditedFields || []}
              apiBase={apiBase}
              accessToken={accessToken}
              onSubmit={() => undefined}
              onSaveDraft={() => undefined}
              isTemplatePreview={true}
              onCancel={() => {
                setTemplateAssetPreview(null);
                setIsTemplatePreviewMode(false);
              }}
            />
          </div>

          <div className="px-6 py-4 border-t border-gray-200 bg-white flex justify-end gap-2">
            <button
              onClick={() => {
                setTemplateAssetPreview(null);
                setIsTemplatePreviewMode(false);
              }}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-bold text-gray-800 bg-white hover:bg-gray-100"
            >
              Back
            </button>
            {templateAssetPreview && (
              <button
                onClick={async () => {
                  try {
                    // Pixel-perfect PPT: render current UI template pages to images and send to backend
                    const slides = await templateFormRef.current?.renderTemplatePngSlides?.();
                    if (!slides || slides.length === 0) throw new Error('No slides rendered');
                    const url = `${apiBase}/suggestions/${encodeURIComponent(suggestion.id)}/pptx/rendered`;
                    const res = await fetch(url, {
                      method: 'POST',
                      headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        slides,
                        fileNameBase: suggestion.code || suggestion.id,
                      }),
                    });
                    if (!res.ok) throw new Error(await res.text());
                    const blob = await res.blob();
                    const a = document.createElement('a');
                    const blobUrl = URL.createObjectURL(blob);
                    a.href = blobUrl;
                    a.download = `${suggestion.code || suggestion.id}.pptx`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    // Delay revocation; some browsers start reading the blob URL after the click.
                    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
                    showToast('success', 'PPT downloaded');
                  } catch (e: any) {
                    const msg = e?.message ? String(e.message) : 'PPT download failed';
                    showToast('error', msg.length > 200 ? `${msg.slice(0, 200)}…` : msg);
                  }
                }}
                className="px-4 py-2 rounded-lg bg-kauvery-purple text-white text-sm font-bold hover:bg-kauvery-violet"
              >
                Download {previewLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-gray-900 bg-opacity-60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>

      {toast && (
        <div className="fixed top-5 right-5 z-[60]">
          <div
            className={`px-4 py-3 rounded-xl shadow-lg border text-sm font-bold ${
              toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
            role="status"
          >
            {toast.message}
          </div>
        </div>
      )}
      
      {/* Centered Panel */}
      <div className="relative w-full max-w-6xl bg-white shadow-[0_18px_48px_rgba(15,23,42,0.18)] rounded-2xl border border-gray-200 h-[88vh] flex flex-col animate-fade-in overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-white flex justify-between items-start">
            <div>
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-gray-700 bg-white border border-gray-400 px-1.5 rounded font-bold">
                      {suggestion.code || suggestion.id}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${STATUS_COLORS[suggestion.status]}`}>{suggestion.status}</span>
                </div>
                <h2 className="text-xl font-extrabold text-gray-900 leading-tight mt-2">{suggestion.theme}</h2>
                <p className="text-sm text-gray-700 mt-1 font-medium">Submitted by <span className="font-extrabold text-gray-900">{suggestion.employeeName}</span> ({suggestion.department})</p>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-800 p-2 hover:bg-gray-100 rounded-full transition-colors border border-transparent hover:border-gray-200">
                <span className="material-icons-round font-bold">close</span>
            </button>
        </div>

        {initialView !== 'tracking' && <Tabs />}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 text-gray-900">
            
            {/* OVERVIEW TAB */}
            {initialView !== 'tracking' && activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Summary cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                      <div className="text-[11px] font-extrabold uppercase text-gray-500">Kaizen No</div>
                      <div className="mt-1 text-sm font-black text-gray-900 truncate">
                        {suggestion.code || suggestion.id}
                      </div>
                      <div className="mt-2 inline-flex items-center gap-2">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-black ${STATUS_COLORS[suggestion.status]}`}>
                          {suggestion.status}
                        </span>
                      </div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                      <div className="text-[11px] font-extrabold uppercase text-gray-500">Current Owner</div>
                      <div className="mt-1 text-sm font-black text-gray-900 truncate">
                        {String(getCurrentOwner() || '—')}
                      </div>
                      <div className="mt-2 text-[11px] text-gray-600 font-semibold">
                        {suggestion.assignedImplementer ? `Implementer: ${suggestion.assignedImplementer}` : 'Implementer not assigned'}
                      </div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                      <div className="text-[11px] font-extrabold uppercase text-gray-500">Next Action</div>
                      <div className="mt-1 text-sm font-black text-gray-900 leading-snug">
                        {getActionRequired()}
                      </div>
                      <div className="mt-2 text-[11px] text-gray-600 font-semibold">
                        Submitted: {suggestion.dateSubmitted || '—'}
                      </div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                      <div className="text-[11px] font-extrabold uppercase text-gray-500">Progress</div>
                      <div className="mt-1 text-sm font-black text-gray-900">
                        {suggestion.implementationProgress ?? 0}%
                      </div>
                      <div className="mt-2 w-full h-2 bg-gray-200 rounded overflow-hidden">
                        <div
                          className="h-full bg-kauvery-purple"
                          style={{ width: `${suggestion.implementationProgress ?? 0}%` }}
                        />
                      </div>
                      <div className="mt-2 text-[11px] text-gray-600 font-semibold">
                        {suggestion.implementationStage || 'Started'}
                        {suggestion.implementationDeadline ? ` • Due ${suggestion.implementationDeadline}` : ''}
                      </div>
                    </div>
                  </div>

                  {/* Key details (useful, data-driven) */}
                  <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-500 font-extrabold">
                          Key details
                        </div>
                        <div className="text-sm text-gray-700 font-semibold mt-1">
                          Quick context from the submitted idea.
                        </div>
                      </div>
                      <div className="w-10 h-10 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-kauvery-purple shadow-sm">
                        <span className="material-icons-round">info</span>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="rounded-xl border border-gray-200 bg-slate-50 p-3">
                        <div className="text-[11px] font-extrabold uppercase text-gray-500">Unit</div>
                        <div className="text-sm font-black text-gray-900 mt-1 truncate">
                          {suggestion.assignedUnit || suggestion.unit || '—'}
                        </div>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-slate-50 p-3">
                        <div className="text-[11px] font-extrabold uppercase text-gray-500">Department</div>
                        <div className="text-sm font-black text-gray-900 mt-1 truncate">
                          {suggestion.assignedDepartment || suggestion.department || '—'}
                        </div>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-slate-50 p-3">
                        <div className="text-[11px] font-extrabold uppercase text-gray-500">Area</div>
                        <div className="text-sm font-black text-gray-900 mt-1 truncate">
                          {suggestion.area || '—'}
                        </div>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-slate-50 p-3">
                        <div className="text-[11px] font-extrabold uppercase text-gray-500">Attachments</div>
                        <div className="text-sm font-black text-gray-900 mt-1">
                          {(Array.isArray(suggestion.ideaAttachmentPaths) ? suggestion.ideaAttachmentPaths.length : 0) +
                            (Array.isArray(suggestion.templateAttachmentPaths) ? suggestion.templateAttachmentPaths.length : 0)}
                        </div>
                        <div className="text-[11px] text-gray-600 font-semibold mt-1">
                          Idea: {Array.isArray(suggestion.ideaAttachmentPaths) ? suggestion.ideaAttachmentPaths.length : 0} • Template: {Array.isArray(suggestion.templateAttachmentPaths) ? suggestion.templateAttachmentPaths.length : 0}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="text-[11px] font-extrabold uppercase text-gray-500 mb-2">Expected benefits</div>
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          const b = suggestion.expectedBenefits || ({} as any);
                          const items: Array<{ key: string; label: string; cls: string }> = [
                            { key: 'productivity', label: 'Productivity', cls: 'bg-blue-50 border-blue-200 text-blue-900' },
                            { key: 'quality', label: 'Quality', cls: 'bg-emerald-50 border-emerald-200 text-emerald-900' },
                            { key: 'cost', label: 'Cost', cls: 'bg-amber-50 border-amber-200 text-amber-900' },
                            { key: 'delivery', label: 'Delivery', cls: 'bg-indigo-50 border-indigo-200 text-indigo-900' },
                            { key: 'safety', label: 'Safety', cls: 'bg-rose-50 border-rose-200 text-rose-900' },
                            { key: 'energy', label: 'Energy', cls: 'bg-yellow-50 border-yellow-200 text-yellow-900' },
                            { key: 'environment', label: 'Environment', cls: 'bg-teal-50 border-teal-200 text-teal-900' },
                            { key: 'morale', label: 'Morale', cls: 'bg-purple-50 border-purple-200 text-purple-900' },
                          ];
                          const picked = items.filter((x) => Boolean((b as any)[x.key]));
                          if (picked.length === 0) {
                            return (
                              <span className="text-xs font-semibold text-gray-600">
                                Not specified.
                              </span>
                            );
                          }
                          return picked.map((x) => (
                            <span
                              key={x.key}
                              className={`text-[11px] font-black px-2.5 py-1 rounded-full border ${x.cls}`}
                            >
                              {x.label}
                            </span>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Idea section */}
                  <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-500 font-extrabold">
                          Idea summary
                        </div>
                        <div className="text-lg font-black text-gray-900 mt-1">{suggestion.theme}</div>
                        <div className="text-sm text-gray-600 font-semibold mt-1">
                          Originator: <span className="text-gray-900 font-extrabold">{suggestion.employeeName}</span>
                          {suggestion.department ? ` (${suggestion.department})` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <div className="text-[11px] font-extrabold uppercase text-gray-600 mb-2">
                        Initial description
                      </div>
                      <div className="text-sm text-gray-900 font-semibold leading-relaxed whitespace-pre-wrap">
                        {suggestion.description || '—'}
                      </div>
                    </div>
                  </div>

                  {/* Before / After */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                      <div className="text-xs uppercase tracking-wide text-gray-500 font-extrabold mb-2">
                        Before
                      </div>
                      <div className="text-sm text-gray-900 font-semibold whitespace-pre-wrap">
                        {suggestion.beforeDescription || 'Pending implementation.'}
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-purple-200 p-6 shadow-sm ring-1 ring-purple-100">
                      <div className="text-xs uppercase tracking-wide text-kauvery-purple font-extrabold mb-2">
                        After (Solution)
                      </div>
                      <div className="text-sm text-gray-900 font-bold whitespace-pre-wrap">
                        {suggestion.counterMeasure || 'Pending implementation.'}
                      </div>
                    </div>
                  </div>

                  {/* Remarks / updates */}
                  {(suggestion.screeningNotes || suggestion.coordinatorSuggestion || suggestion.implementationUpdate) && (
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                      <div className="text-xs uppercase tracking-wide text-gray-500 font-extrabold mb-3">
                        Remarks & updates
                      </div>
                      <div className="space-y-3">
                        {suggestion.screeningNotes && (
                          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-gray-900">
                            <div className="text-[11px] uppercase font-extrabold text-amber-900 mb-1">Screening remark</div>
                            <div className="font-semibold whitespace-pre-wrap">{suggestion.screeningNotes}</div>
                          </div>
                        )}
                        {suggestion.coordinatorSuggestion && (
                          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-sm text-gray-900">
                            <div className="text-[11px] uppercase font-extrabold text-orange-900 mb-1">Coordinator note</div>
                            <div className="font-semibold whitespace-pre-wrap">{suggestion.coordinatorSuggestion}</div>
                          </div>
                        )}
                        {suggestion.implementationUpdate && (
                          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-sm text-gray-900">
                            <div className="text-[11px] uppercase font-extrabold text-purple-900 mb-1">Latest implementer update</div>
                            <div className="font-semibold whitespace-pre-wrap">{suggestion.implementationUpdate}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* AI Insight Widget */}
                  <div className="border border-indigo-200 bg-indigo-50 rounded-2xl p-6 shadow-sm">
                    <div className="flex justify-between items-center mb-3 gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-2xl bg-white border border-indigo-200 flex items-center justify-center text-indigo-800 shadow-sm">
                          <span className="material-icons-round text-lg">auto_awesome</span>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wide text-indigo-900/80 font-extrabold">
                            AI impact analysis
                          </div>
                          <div className="text-sm font-black text-indigo-950">Optional decision support</div>
                        </div>
                      </div>
                      <button
                        onClick={handleAnalyze}
                        disabled={isAnalyzing}
                        className="text-xs bg-white text-indigo-800 px-3 py-2 rounded-lg shadow-sm border border-indigo-300 font-black hover:bg-indigo-100 disabled:opacity-50"
                      >
                        {isAnalyzing ? 'Analyzing...' : aiAnalysis ? 'Re-Analyze' : 'Run Analysis'}
                      </button>
                    </div>
                    {aiAnalysis ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white p-4 rounded-xl border border-indigo-200 text-center shadow-sm">
                          <div className="text-3xl font-black text-indigo-800">{aiAnalysis.impactScore}/100</div>
                          <div className="text-xs text-gray-700 font-bold uppercase mt-1">Impact score</div>
                        </div>
                        <div className="md:col-span-2 space-y-2">
                          <div className="flex gap-2">
                            <span className="text-xs font-black px-2 py-0.5 bg-indigo-100 text-indigo-900 border border-indigo-300 rounded">
                              {aiAnalysis.category}
                            </span>
                          </div>
                          <p className="text-sm text-gray-900 leading-relaxed font-semibold">{aiAnalysis.feedback}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-indigo-900 italic font-medium opacity-80">
                        Generate insights to see potential impact scoring and categorization.
                      </p>
                    )}
                  </div>
                </div>
            )}

            {/* ANALYSIS TAB (5W1H) */}
            {initialView !== 'tracking' && activeTab === 'analysis' && suggestion.problem && (
                <div className="space-y-6 animate-fade-in">
                    <div>
                        <h3 className="text-sm font-extrabold text-gray-900 uppercase border-b border-gray-300 pb-2 mb-4">5W1H Problem Definition</h3>
                        <div className="grid grid-cols-1 gap-4">
                            {Object.entries(suggestion.problem).map(([key, value]) => (
                                <div key={key} className="grid grid-cols-12 gap-4">
                                    <div className="col-span-2 text-sm font-extrabold text-gray-700 uppercase pt-2">{key}</div>
                                    <div className="col-span-10 text-sm text-gray-900 bg-gray-50 border border-gray-300 p-3 rounded font-bold">{value as string}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-extrabold text-gray-900 uppercase border-b border-gray-300 pb-2 mb-4">Why-Why Root Cause Analysis</h3>
                        <div className="space-y-2">
                             {[1,2,3,4,5].map(n => {
                                 const val = (suggestion.analysis as any)[`why${n}`];
                                 if(!val) return null;
                                 return (
                                    <div key={n} className="flex gap-3">
                                        <div className="w-8 h-8 rounded-full bg-kauvery-pink bg-opacity-10 text-kauvery-pink flex items-center justify-center font-black text-sm shrink-0 border border-pink-200">{n}</div>
                                        <div className="text-sm text-gray-900 py-1.5 font-semibold">{val}</div>
                                    </div>
                                 )
                             })}
                             <div className="mt-4 p-4 bg-red-50 border border-red-300 rounded text-red-950 text-sm shadow-sm">
                                 <span className="font-black mr-2 text-red-900">ROOT CAUSE:</span>
                                 <span className="font-bold">{suggestion.analysis?.rootCause}</span>
                             </div>
                        </div>
                    </div>
                </div>
            )}

            {/* REVIEW & ACTION TAB - THE WORKFLOW ENGINE */}
            {(initialView === 'tracking' || activeTab === 'review') && (
              <div className="space-y-6 animate-fade-in">
                {initialView === 'tracking' ? (
                  <div className="bg-gradient-to-br from-white to-slate-50 border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[500px]">
                      <div className="lg:col-span-8 p-6 border-r border-gray-200">
                        <div className="flex items-center gap-2 mb-4">
                          <h3 className="text-2xl font-black text-slate-900 leading-tight">Request Details</h3>
                          <span className="text-[10px] font-mono text-kauvery-purple bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-md font-bold">
                            {suggestion.code || suggestion.id}
                          </span>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 shadow-sm">
                          <div className="text-xs font-black text-gray-700 uppercase mb-3">Suggestion Summary</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                              <div className="text-[11px] text-gray-500 uppercase font-extrabold">Originator</div>
                              <div className="font-bold text-gray-900">{suggestion.employeeName}</div>
                            </div>
                            <div>
                              <div className="text-[11px] text-gray-500 uppercase font-extrabold">Department</div>
                              <div className="font-bold text-gray-900">{suggestion.department}</div>
                            </div>
                            <div>
                              <div className="text-[11px] text-gray-500 uppercase font-extrabold">Area</div>
                              <div className="font-bold text-gray-900">{suggestion.area}</div>
                            </div>
                            <div>
                              <div className="text-[11px] text-gray-500 uppercase font-extrabold">Submitted</div>
                              <div className="font-bold text-gray-900">{suggestion.dateSubmitted}</div>
                            </div>
                          </div>
                          <div className="mt-4">
                            <div className="text-[11px] text-gray-500 uppercase font-extrabold mb-1">Description</div>
                            <p className="text-sm text-gray-800 font-medium">{suggestion.description}</p>
                          </div>
                        </div>

                        {(suggestion.screeningNotes || suggestion.coordinatorSuggestion || suggestion.implementationUpdate) && (
                          <div className="space-y-2 mb-4">
                            {suggestion.screeningNotes && (
                              <div className="text-xs text-gray-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                                <span className="font-bold text-amber-900">Screening Remark:</span> {suggestion.screeningNotes}
                              </div>
                            )}
                            {suggestion.coordinatorSuggestion && (
                              <div className="text-xs text-gray-700 bg-orange-50 border border-orange-200 rounded-lg p-2.5">
                                <span className="font-bold text-orange-900">Coordinator Suggestion:</span> {suggestion.coordinatorSuggestion}
                              </div>
                            )}
                            {suggestion.implementationUpdate && (
                              <div className="text-xs text-gray-700 bg-purple-50 border border-purple-200 rounded-lg p-2.5">
                                <span className="font-bold text-purple-900">Implementer Update:</span> {suggestion.implementationUpdate}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="mb-4 border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm">
                          <div className="px-4 py-3 border-b border-gray-200 text-xs font-black uppercase text-gray-700 bg-slate-50">
                            Workflow Thread
                          </div>
                          <div className="max-h-56 overflow-y-auto p-4 space-y-4">
                            {workflowThread.length === 0 ? (
                              <div className="text-xs text-gray-500 font-medium">No workflow updates yet.</div>
                            ) : (
                              workflowThread.map(item => (
                                <div key={item.id} className="flex gap-3 relative">
                                  <div className="absolute left-[11px] top-7 bottom-[-14px] w-px bg-purple-100" />
                                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-100 to-fuchsia-100 text-kauvery-purple flex items-center justify-center text-[10px] font-black border border-purple-200 z-10">
                                    {item.actor.charAt(0)}
                                  </div>
                                  <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                                    <div className="text-xs text-gray-900 font-semibold leading-relaxed">{item.text}</div>
                                    <div className="text-[10px] text-gray-500 mt-1">
                                      {item.actor} ({item.role}) • {new Date(item.date).toLocaleString()}
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="border-t border-gray-200 pt-4">
                          <div className="flex items-start gap-3">
                            <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-black text-gray-700">
                              {role.charAt(0)}
                            </div>
                            <textarea
                              rows={3}
                              value={commentDraft}
                              onChange={e => setCommentDraft(e.target.value)}
                              placeholder="Add a comment or update..."
                              className="w-full border border-gray-300 rounded-xl p-3 text-sm text-gray-900 font-medium outline-none focus:ring-2 focus:ring-kauvery-purple bg-white"
                            />
                          </div>
                          <div className="mt-3 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleAddNote}
                              disabled={!commentDraft.trim()}
                              className={`bg-gradient-to-r from-kauvery-purple to-kauvery-violet text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm ${
                                commentDraft.trim() ? 'hover:opacity-95' : 'opacity-60 cursor-not-allowed'
                              }`}
                            >
                              Add Note
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="lg:col-span-4 p-5 bg-slate-50/80 space-y-4 border-l border-gray-200">
                        <div className="pb-3 border-b border-gray-200">
                          <div className="text-[11px] text-gray-500 font-bold uppercase mb-1">Status</div>
                          <input
                            type="text"
                            value={suggestion.status}
                            readOnly
                            className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm font-bold bg-gray-100 text-gray-900"
                          />
                        </div>

                        <div className="pb-3 border-b border-gray-200">
                          <div className="text-[11px] text-gray-500 font-bold uppercase mb-1">Next Action</div>
                          <div className="text-sm font-semibold text-gray-800">{getActionRequired()}</div>
                        </div>

                        <div className="pb-3 border-b border-gray-200">
                          <div className="text-[11px] text-gray-500 font-bold uppercase mb-1">Assigned To</div>
                          <input
                            type="text"
                            value={suggestion.assignedImplementer || ''}
                            readOnly
                            className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm text-gray-900 font-semibold bg-gray-100"
                            placeholder="Assignee name"
                          />
                        </div>

                        <div className="pb-3 border-b border-gray-200">
                          <div className="text-[11px] text-gray-500 font-bold uppercase mb-1">Reporting To</div>
                          <input
                            type="text"
                            value={reportingTo}
                            readOnly
                            className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm text-gray-900 font-semibold bg-gray-100"
                          />
                          <div className="text-[10px] text-gray-500 mt-1">
                            Based on implementer manager from HRMS
                          </div>
                        </div>

                        <div className="pb-3 border-b border-gray-200">
                          <div className="text-[11px] text-gray-500 font-bold uppercase mb-1">Progress</div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={suggestion.implementationProgress || 0}
                            disabled
                            className="w-full accent-kauvery-purple disabled:opacity-60"
                          />
                          <div className="text-xs font-bold text-right text-gray-800">{suggestion.implementationProgress || 0}%</div>
                          <div className="text-[10px] text-gray-500 mt-1">
                            Information only (read-only).
                          </div>
                        </div>

                        <div className="pb-3 border-b border-gray-200">
                          <div className="text-[11px] text-gray-500 font-bold uppercase mb-1">Working Status</div>
                          <div className="text-sm font-bold text-gray-900">
                            {suggestion.implementationStage || 'Started'}
                          </div>
                          <div className="text-[10px] text-gray-500 mt-1">
                            Last update: {suggestion.implementationUpdateDate || 'NA'}
                          </div>
                        </div>

                        <div className="pb-3 border-b border-gray-200">
                          <div className="text-[11px] text-gray-500 font-bold uppercase mb-1">Deadline</div>
                          <input
                            type="date"
                            value={suggestion.implementationDeadline || ''}
                            readOnly
                            className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm text-gray-900 font-semibold bg-gray-100"
                          />
                          {suggestion.deadlineChangeRemark && (
                            <div className="text-[10px] text-gray-600 mt-1">
                              Remark: {suggestion.deadlineChangeRemark}
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="text-[11px] text-gray-500 font-bold uppercase mb-2">Tracking Flow</div>
                          <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                            {workflowSteps.map(step => (
                              <div key={step.id} className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-gray-800">{step.title}</span>
                                <span
                                  className={`px-2 py-0.5 rounded border font-bold ${
                                    step.state === 'done'
                                      ? 'bg-green-100 text-green-800 border-green-300'
                                      : step.state === 'current'
                                      ? 'bg-blue-100 text-blue-800 border-blue-300'
                                      : 'bg-white text-gray-500 border-gray-300'
                                  }`}
                                >
                                  {step.state === 'done' ? 'Done' : step.state === 'current' ? 'Review' : 'Pending'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* 1. UNIT COORDINATOR: Approve Initial Idea */}
                {role === Role.UNIT_COORDINATOR && suggestion.status === Status.IDEA_SUBMITTED && (
                  <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <h4 className="text-sm font-black text-gray-900 mb-2">Idea Screening</h4>
                    <p className="text-xs text-gray-600 mb-3 font-semibold">Review the submitted idea and record your decision.</p>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full border border-gray-300 bg-white rounded-lg p-3 text-sm mb-3 focus:ring-2 focus:ring-kauvery-purple outline-none text-gray-900 font-medium"
                      placeholder="Validation notes..."
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => handleIdeaApproval(true)} className="bg-kauvery-purple text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-kauvery-violet shadow-sm">Approve Idea</button>
                      <button onClick={() => handleIdeaApproval(false)} className="bg-white text-gray-800 px-6 py-2 rounded-lg text-sm font-bold hover:bg-gray-100 border border-gray-300">Reject</button>
                    </div>
                  </div>
                )}

                {/* 2. COMMITTEE: Assign Implementer */}
                {role === Role.SELECTION_COMMITTEE && suggestion.status === Status.APPROVED_FOR_ASSIGNMENT && (
                  <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <h4 className="text-sm font-black text-gray-900 mb-2">Implementation Assignment</h4>
                    <p className="text-xs text-gray-600 mb-4 font-semibold">
                      Select unit and department first, then choose the implementer from the list.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="text-xs font-extrabold text-gray-700 block mb-1">Unit</label>
                        <select
                          value={assignUnit}
                          onChange={e => {
                            setAssignUnit(e.target.value);
                            setImplementerDept('');
                            setImplementerName('');
                            setImplementerEmployeeCode('');
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 font-medium"
                        >
                          <option value="">Select unit...</option>
                          {unitOptions.map(u => (
                            <option key={u.id} value={u.code}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-extrabold text-gray-700 block mb-1">Department</label>
                        <select
                          value={implementerDept}
                          onChange={e => {
                            setImplementerDept(e.target.value);
                            setImplementerName('');
                            setImplementerEmployeeCode('');
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 font-medium"
                        >
                          <option value="">Select department...</option>
                          {departmentOptions.map(d => (
                            <option key={d.id} value={d.name}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-xs font-extrabold text-gray-700 block mb-1">Implementer Name</label>
                        <select
                          value={implementerEmployeeCode}
                          onChange={e => {
                            const code = e.target.value;
                            setImplementerEmployeeCode(code);
                            const picked = implementerOptions.find(x => x.employeeCode === code);
                            setImplementerName(picked?.name || '');
                          }}
                          disabled={!assignUnit || !implementerDept || implementerOptions.length === 0}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 font-medium disabled:bg-gray-100 disabled:text-gray-500"
                        >
                          <option value="">
                            {!assignUnit || !implementerDept
                              ? 'Select unit and department first'
                              : implementerOptions.length === 0
                                ? 'No users listed for this combination'
                                : 'Select implementer...'}
                          </option>
                          {implementerOptions.map((u) => (
                            <option key={u.employeeCode} value={u.employeeCode}>
                              {u.name} ({u.employeeCode})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-xs font-extrabold text-gray-700 block mb-1">Implementation Deadline</label>
                        <input
                          type="date"
                          value={implementationDeadline}
                          onChange={e => setImplementationDeadline(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 font-medium"
                        />
                      </div>
                    </div>
                    <button onClick={handleAssignImplementer} className="bg-kauvery-purple text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-kauvery-violet shadow-sm">Assign & Notify</button>
                  </div>
                )}

                {/* 3. IMPLEMENTER: Submit Report */}
                {role === Role.IMPLEMENTER && suggestion.status === Status.ASSIGNED_FOR_IMPLEMENTATION && (
                  <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <h4 className="text-lg font-black text-gray-900 mb-2">Implementation Progress Update</h4>
                    <p className="text-sm text-gray-600 mb-4 font-semibold">Update current progress regularly, then submit final template once completed.</p>
                    {suggestion.beEditedFields && suggestion.beEditedFields.length > 0 && (
                      <div className="mb-4 text-xs bg-amber-50 border border-amber-200 rounded p-2.5 text-amber-900">
                        <span className="font-bold">BE changed fields:</span> {suggestion.beEditedFields.join(', ')}
                      </div>
                    )}

                    {!canImplementerUpdateWorkingStatus && (
                      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 font-semibold">
                        Progress and work updates are only available to the assigned implementer
                        {suggestion.assignedImplementer ? ` (${suggestion.assignedImplementer}).` : '.'}
                      </p>
                    )}

                    {canImplementerUpdateWorkingStatus
                      ? (
                    <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="text-xs font-extrabold text-gray-700 block mb-1">Current Status</label>
                        <select
                          value={implementationStage}
                          onChange={e => setImplementationStage(e.target.value as 'Started' | 'In Progress' | 'Completed')}
                          className="w-full border border-gray-300 bg-white rounded-lg px-3 py-2 text-sm text-gray-900 font-medium"
                        >
                          <option value="Started">Started</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Completed">Completed</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-extrabold text-gray-700 block mb-1">Progress ({Math.max(progressFloor, implementationProgress)}%)</label>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={Math.max(progressFloor, implementationProgress)}
                          onChange={e => setImplementationProgress(Math.max(progressFloor, Number(e.target.value)))}
                          className="w-full accent-kauvery-purple"
                        />
                      </div>
                    </div>

                    <textarea
                      rows={3}
                      value={implementationUpdate}
                      onChange={e => setImplementationUpdate(e.target.value)}
                      placeholder="What is done, blockers, next action..."
                      className="w-full border border-gray-300 bg-white rounded-lg p-3 text-sm mb-3 outline-none focus:ring-2 focus:ring-kauvery-purple text-gray-900 font-medium"
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="text-xs font-extrabold text-gray-700 block mb-1">Change Deadline</label>
                        <input
                          type="date"
                          value={deadlineChangeDate || suggestion.implementationDeadline || ''}
                          min={suggestion.implementationAssignedDate || suggestion.dateSubmitted}
                          max={(() => {
                            const d = new Date(`${(suggestion.implementationAssignedDate || suggestion.dateSubmitted)}T00:00:00`);
                            d.setMonth(d.getMonth() + 1);
                            return d.toISOString().split('T')[0];
                          })()}
                          onChange={e => setDeadlineChangeDate(e.target.value)}
                          className="w-full border border-gray-300 bg-white rounded-lg px-3 py-2 text-sm text-gray-900 font-medium"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-extrabold text-gray-700 block mb-1">Deadline Change Remark</label>
                        <input
                          type="text"
                          value={deadlineChangeRemark}
                          onChange={e => setDeadlineChangeRemark(e.target.value)}
                          placeholder="Reason for extending/changing deadline"
                          className="w-full border border-gray-300 bg-white rounded-lg px-3 py-2 text-sm text-gray-900 font-medium"
                        />
                      </div>
                    </div>
                    <div className="text-[10px] text-gray-500 mb-3">
                      Deadline can be changed only within 1 month from assignment date ({suggestion.implementationAssignedDate || suggestion.dateSubmitted}).
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button onClick={handleImplementerProgressUpdate} className="bg-white text-gray-800 px-4 py-2 rounded-lg text-sm font-bold border border-gray-300 hover:bg-gray-100">
                        Update Progress
                      </button>
                      <button onClick={handleImplementerDeadlineChange} className="bg-white text-gray-800 px-4 py-2 rounded-lg text-sm font-bold border border-gray-300 hover:bg-gray-100">
                        Update Deadline
                      </button>
                      <button
                        onClick={() => {
                          if (onOpenTemplatePage) {
                            onOpenTemplatePage(suggestion, { edit: true });
                            onClose();
                            return;
                          }
                          setIsImplementationMode(true);
                        }}
                        className="bg-kauvery-purple text-white px-6 py-2 rounded-lg font-bold shadow-sm hover:bg-kauvery-violet transition-transform active:scale-95"
                      >
                        Fill Implementation Report
                      </button>
                    </div>
                    </>
                      )
                      : (
                    <div className="text-sm text-gray-700 space-y-2 font-medium">
                      <div>Working status: <span className="font-bold">{suggestion.implementationStage || 'Started'}</span></div>
                      <div>Progress: <span className="font-bold">{suggestion.implementationProgress ?? 0}%</span></div>
                      {suggestion.implementationUpdate && (
                        <div className="text-xs text-gray-600 border border-gray-200 rounded p-2 bg-gray-50">
                          <span className="font-bold">Latest update:</span> {suggestion.implementationUpdate}
                        </div>
                      )}
                    </div>
                      )}
                  </div>
                )}

                {role === Role.IMPLEMENTER && [Status.IMPLEMENTATION_DONE, Status.BE_REVIEW_DONE].includes(suggestion.status) && (
                  <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <h4 className="text-sm font-black text-gray-900 mb-2">Template Review (Read-only)</h4>
                    <p className="text-xs text-gray-600 mb-3 font-semibold">Business Excellence has reviewed your template. Open to view highlighted changes.</p>
                    {suggestion.beEditedFields && suggestion.beEditedFields.length > 0 && (
                      <div className="mb-3 text-xs bg-amber-50 border border-amber-200 rounded p-2.5 text-amber-900">
                        <span className="font-bold">Changed:</span> {suggestion.beEditedFields.join(', ')}
                      </div>
                    )}
                    <button onClick={handleViewTemplate} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-900 text-xs font-bold hover:bg-emerald-100">
                      <span className="material-icons-round text-sm">visibility</span>
                      View Template
                    </button>
                  </div>
                )}

                {/* 4. BUSINESS EXCELLENCE: Template Review + Edit */}
                {role === Role.BUSINESS_EXCELLENCE && suggestion.status === Status.IMPLEMENTATION_DONE && (
                  <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <h4 className="text-sm font-black text-gray-900 mb-2">Business Excellence Template Review</h4>
                    <p className="text-xs text-gray-600 mb-4 font-semibold">Review submitted template, edit if needed, then approve to Unit Coordinator.</p>
                    <div className="mb-4">
                      <label className="text-xs font-extrabold text-gray-700 block mb-1">Remarks</label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={2}
                        placeholder="If not approved, remarks are mandatory..."
                        className="w-full border border-gray-300 bg-white rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-kauvery-purple text-gray-900 font-medium"
                      />
                    </div>
                    {suggestion.beEditedFields && suggestion.beEditedFields.length > 0 && (
                      <div className="mb-3 text-xs bg-amber-50 border border-amber-200 rounded p-2.5 text-amber-900">
                        <span className="font-bold">Already edited fields:</span> {suggestion.beEditedFields.join(', ')}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button onClick={handleViewTemplate} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-900 text-xs font-bold hover:bg-emerald-100">
                        <span className="material-icons-round text-sm">visibility</span>
                        View Template
                      </button>
                      <button
                        onClick={() => {
                          setIsBeTemplateEditMode(true);
                          if (onOpenTemplatePage) {
                            onOpenTemplatePage(suggestion, { edit: true });
                            onClose();
                            return;
                          }
                          setIsImplementationMode(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-300 bg-gray-100 text-gray-900 text-xs font-bold hover:bg-gray-200"
                      >
                        <span className="material-icons-round text-sm">edit</span>
                        Edit Template
                      </button>
                      <button onClick={handleBEReviewApproval} className="bg-kauvery-purple text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-kauvery-violet shadow-sm">
                        Approve & Send to Unit Coordinator
                      </button>
                      <button
                        onClick={handleBEReviewNotApproved}
                        className="bg-white text-gray-800 px-6 py-2 rounded-lg text-sm font-bold hover:bg-gray-100 border border-gray-300"
                      >
                        Not approved
                      </button>
                    </div>
                  </div>
                )}

                {/* 5. COORDINATOR: Approval after BE review */}
                {role === Role.UNIT_COORDINATOR && suggestion.status === Status.BE_REVIEW_DONE && (
                  <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <h4 className="text-sm font-black text-gray-900 mb-2">Unit Coordinator Approval</h4>
                    <p className="text-xs text-gray-600 mb-4 font-semibold">Final coordinator approval after BE review, then send to BE Head scoring.</p>

                    <div className="mb-4">
                      <label className="text-xs font-extrabold text-gray-700 block mb-1">Coordinator Suggestion</label>
                      <textarea
                        value={coordinatorSuggestion}
                        onChange={e => setCoordinatorSuggestion(e.target.value)}
                        rows={2}
                        placeholder="Add suggestion for implementer / audit note..."
                        className="w-full border border-gray-300 bg-white rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-kauvery-purple text-gray-900 font-medium"
                      />
                    </div>

                    <div className="mb-4 bg-slate-50 p-3 rounded-lg border border-gray-200">
                      <div className="text-xs font-extrabold text-gray-800 mb-2 uppercase">Template Actions</div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleViewTemplate}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-900 text-xs font-bold hover:bg-emerald-100"
                        >
                          <span className="material-icons-round text-sm">visibility</span>
                          View Template
                        </button>
                        <button
                          onClick={() => handleTemplateAssetAction('ppt')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-blue-300 bg-blue-50 text-blue-900 text-xs font-bold hover:bg-blue-100"
                        >
                          <span className="material-icons-round text-sm">slideshow</span>
                          PPT
                        </button>
                        <button
                          onClick={() => handleTemplateAssetAction('pdf')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-red-300 bg-red-50 text-red-900 text-xs font-bold hover:bg-red-100"
                        >
                          <span className="material-icons-round text-sm">picture_as_pdf</span>
                          PDF
                        </button>
                        <button
                          onClick={() => {
                            if (onOpenTemplatePage) {
                              onOpenTemplatePage(suggestion, { edit: true });
                              onClose();
                              return;
                            }
                            setIsImplementationMode(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-300 bg-gray-100 text-gray-900 text-xs font-bold hover:bg-gray-200"
                        >
                          <span className="material-icons-round text-sm">edit</span>
                          Edit
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={handleVerification} className="bg-kauvery-purple text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-kauvery-violet shadow-sm">
                        Approve & Send to BE Final Evaluation
                      </button>
                      <button
                        onClick={handleCoordinatorNotApproved}
                        className="bg-white text-gray-800 px-6 py-2 rounded-lg text-sm font-bold hover:bg-gray-100 border border-gray-300"
                      >
                        Not approved
                      </button>
                    </div>
                  </div>
                )}

                {/* Functional approvals (Finance/Quality/HR) */}
                {[Role.FINANCE_HOD, Role.QUALITY_HOD, Role.HR_HEAD].includes(role) &&
                  suggestion.status === Status.VERIFIED_PENDING_APPROVAL &&
                  (suggestion.requiredApprovals || []).includes(role) &&
                  !suggestion.approvals?.[role] && (
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                      <h4 className="text-sm font-black text-gray-900 mb-2">Approval</h4>
                      <p className="text-xs text-gray-600 mb-3 font-semibold">
                        Approve this idea, or mark as not approved with mandatory remarks (it will go back to previous stage).
                      </p>
                      <label className="text-xs font-extrabold text-gray-700 block mb-1">Remarks (required for Not approved)</label>
                      <textarea
                        value={approvalRemarks}
                        onChange={(e) => setApprovalRemarks(e.target.value)}
                        rows={2}
                        placeholder="Enter remarks..."
                        className="w-full border border-gray-300 bg-white rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-kauvery-purple text-gray-900 font-medium mb-3"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={handleFunctionalApprove}
                          className="bg-kauvery-purple text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-kauvery-violet shadow-sm"
                        >
                          Approve
                        </button>
                        <button
                          onClick={handleFunctionalNotApproved}
                          className="bg-white text-gray-800 px-6 py-2 rounded-lg text-sm font-bold hover:bg-gray-100 border border-gray-300"
                        >
                          Not approved
                        </button>
                      </div>
                    </div>
                  )}

                {/* 6. BUSINESS EXCELLENCE ADMIN: Evaluation */}
                {role === Role.BUSINESS_EXCELLENCE_HEAD && suggestion.status === Status.BE_EVALUATION_PENDING && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-black text-gray-900">Business Excellence Head Evaluation</h4>
                    <p className="text-xs text-gray-600 font-semibold">Final review, scoring, and reward recommendation before HR processing.</p>
                    <RewardEvaluationForm
                      suggestion={suggestion}
                      apiBase={apiBase}
                      authHeaders={() => ({ Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' })}
                      onSave={handleRewardSave}
                    />
                  </div>
                )}

                {/* 7. FINAL: Payment */}
                {suggestion.rewardEvaluation && (
                  <div className="bg-green-50 border border-green-300 rounded-xl p-6 text-center shadow-sm">
                    <div className="text-sm text-green-900 font-black uppercase mb-2">Reward Granted</div>
                    <div className="text-4xl font-extrabold text-green-800 mb-1">₹{suggestion.rewardEvaluation.voucherValue}</div>
                    <div className="text-green-900 text-sm font-bold">{suggestion.rewardEvaluation.grade}</div>
                    {suggestion.rewardEvaluation.split && (
                      <div className="mt-3 inline-block text-left bg-white/70 border border-green-200 rounded-lg px-4 py-3">
                        <div className="text-[11px] font-extrabold uppercase text-green-900/80 mb-2">Split</div>
                        <div className="text-xs text-gray-800 font-semibold space-y-1">
                          <div className="flex items-center justify-between gap-4">
                            <span className="truncate" title={suggestion.rewardEvaluation.split.originatorName || ''}>
                              Originator
                              {suggestion.rewardEvaluation.split.originatorName ? ` (${suggestion.rewardEvaluation.split.originatorName})` : ''}
                            </span>
                            <span className="font-black text-gray-900">₹{suggestion.rewardEvaluation.split.originatorAmount}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="truncate" title={suggestion.rewardEvaluation.split.implementerName || ''}>
                              Implementer
                              {suggestion.rewardEvaluation.split.implementerName ? ` (${suggestion.rewardEvaluation.split.implementerName})` : ''}
                            </span>
                            <span className="font-black text-gray-900">₹{suggestion.rewardEvaluation.split.implementerAmount}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    {(role === Role.HR_HEAD || role === Role.UNIT_COORDINATOR) && suggestion.status === Status.REWARD_PENDING && (
                      <button onClick={handleProcessReward} className="mt-4 bg-kauvery-pink text-white px-6 py-2 rounded-full font-bold shadow-lg hover:bg-red-600 transition-colors border border-red-700">
                        Process Payment & Intimate Employee
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SUBMITTED TEMPLATE TAB */}
            {initialView !== 'tracking' && canViewSubmittedTemplateTab && activeTab === 'template' && (
              <div className="space-y-4 animate-fade-in">
                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-500 font-extrabold">
                        Submitted Template
                      </div>
                      <div className="text-lg font-black text-gray-900 mt-1">
                        {suggestion.code || suggestion.id} — {suggestion.theme}
                      </div>
                      <div className="text-sm text-gray-600 font-semibold mt-1">
                        {hasSubmittedTemplate ? 'Template is available.' : 'Template not submitted yet.'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setTemplateAssetPreview('ppt');
                        setIsTemplatePreviewMode(true);
                      }}
                      disabled={!hasSubmittedTemplate}
                      className={`px-4 py-2 rounded-lg text-sm font-black ${
                        hasSubmittedTemplate
                          ? 'bg-kauvery-purple text-white hover:bg-kauvery-violet'
                          : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      View Template
                    </button>
                  </div>

                  <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-gray-200 bg-slate-50 p-4">
                      <div className="text-xs font-extrabold uppercase text-gray-600">Final PPT</div>
                      <div className="text-[11px] font-mono text-gray-600 mt-1 truncate">
                        {finalPptPath ? finalPptPath.split('/').pop() : 'Not uploaded'}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <a
                          href={finalPptPath ? `${apiBase}/kaizen-files/${finalPptPath}` : undefined}
                          target="_blank"
                          rel="noreferrer"
                          className={`px-3 py-2 rounded-lg text-xs font-black border ${
                            finalPptPath
                              ? 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50'
                              : 'border-gray-200 bg-gray-100 text-gray-400 pointer-events-none'
                          }`}
                        >
                          View
                        </a>
                        <a
                          href={finalPptPath ? `${apiBase}/kaizen-files/${finalPptPath}` : undefined}
                          download
                          className={`px-3 py-2 rounded-lg text-xs font-black ${
                            finalPptPath
                              ? 'bg-kauvery-purple text-white hover:bg-kauvery-violet'
                              : 'bg-gray-200 text-gray-500 pointer-events-none'
                          }`}
                        >
                          Download
                        </a>
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-slate-50 p-4">
                      <div className="text-xs font-extrabold uppercase text-gray-600">Final PDF</div>
                      <div className="text-[11px] font-mono text-gray-600 mt-1 truncate">
                        {finalPdfPath ? finalPdfPath.split('/').pop() : 'Not uploaded'}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <a
                          href={finalPdfPath ? `${apiBase}/kaizen-files/${finalPdfPath}` : undefined}
                          target="_blank"
                          rel="noreferrer"
                          className={`px-3 py-2 rounded-lg text-xs font-black border ${
                            finalPdfPath
                              ? 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50'
                              : 'border-gray-200 bg-gray-100 text-gray-400 pointer-events-none'
                          }`}
                        >
                          View
                        </a>
                        <a
                          href={finalPdfPath ? `${apiBase}/kaizen-files/${finalPdfPath}` : undefined}
                          download
                          className={`px-3 py-2 rounded-lg text-xs font-black ${
                            finalPdfPath
                              ? 'bg-gray-900 text-white hover:bg-gray-800'
                              : 'bg-gray-200 text-gray-500 pointer-events-none'
                          }`}
                        >
                          Download
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* DISCUSSION TAB */}
            {activeTab === 'discussion' && (
                <div className="flex flex-col h-full">
                    <div className="flex-1 space-y-4 mb-4">
                        <div className="text-center text-gray-500 text-sm py-8 font-bold">No comments yet. Start the discussion!</div>
                    </div>
                    <div className="flex gap-2">
                        <input type="text" placeholder="Type a comment..." className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-kauvery-purple outline-none text-gray-900 font-medium" />
                        <button className="bg-kauvery-purple text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-kauvery-violet border border-purple-900">Send</button>
                    </div>
                </div>
            )}

        </div>
      </div>
    </div>
  );
};
