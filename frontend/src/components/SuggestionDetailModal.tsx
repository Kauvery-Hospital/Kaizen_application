
import React, { useEffect, useRef, useState } from 'react';
import {
  Suggestion,
  Status,
  Role,
  RewardEvaluation,
  type Comment,
  type User,
} from '../types';
import { resolveImplementationPatchActor } from '../utils/implementationPatchActor';
import {
  clampImplementationPercent,
  computeImplementationProgressPercentFromDraft,
} from '../utils/implementerTemplateProgress';
import { STATUS_COLORS } from '../constants';
import {
  appRoleToHodRoleCode,
  firstDepartmentKeyForRole,
  LEVEL_2_APPROVAL_ROUTES,
} from '../constants/hodDirectory';
import {
  isL2ApprovalPhase,
  pendingDepartmentL1ForUser,
  userMatchesDepartmentSlot,
} from '../utils/phasedApproval';
import { RewardEvaluationForm } from './RewardEvaluationForm';
import { SuggestionForm, type SuggestionFormHandle } from './SuggestionForm';
import { SearchableSelect } from './SearchableSelect';

/** Implementer deadline picker: only dates from assignment through assignment + this many calendar days. */
const MAX_DEADLINE_EXTENSION_DAYS = 10;

function addCalendarDaysToIsoDate(ymd: string, days: number): string | null {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface ModalProps {
  suggestion: Suggestion | null;
  isOpen: boolean;
  /** When `page`, renders in normal document flow (full main area) instead of a fixed overlay. */
  layout?: 'modal' | 'page';
  onClose: () => void;
  onOpenTemplatePage?: (suggestion: Suggestion, opts?: { edit?: boolean }) => void;
  role: Role;
  currentUserName?: string;
  /** Defaults to `[role]` when omitted; used to pick Implementer vs sidebar role on PATCH */
  userRoles?: Role[];
  onUpdateStatus: (
    id: string,
    status: Status,
    extraData?: Partial<Suggestion>,
    actorRoleOverride?: Role,
  ) => Promise<void> | void;
  /** Called after side-effect updates that bypass PATCH status (e.g. HR reward photo upload). */
  onSuggestionRefreshed?: (s: Suggestion) => void;
  initialView?: 'default' | 'tracking' | 'hod-review';
  apiBase: string;
  accessToken: string;
  unitOptions: { id: string; code: string; name: string }[];
  departmentOptions: { id: string; name: string }[];
  /** Used with {@link resolveImplementationPatchActor} so assignees are not treated as Unit Coordinator on submit */
  implementationActorUser?: User | null;
}

export const SuggestionDetailModal: React.FC<ModalProps> = ({
  suggestion,
  isOpen,
  layout = 'modal',
  onClose,
  onOpenTemplatePage,
  role,
  currentUserName = '',
  userRoles,
  onUpdateStatus,
  onSuggestionRefreshed,
  initialView = 'default',
  apiBase,
  accessToken,
  unitOptions,
  departmentOptions,
  implementationActorUser,
}) => {
  const isPageLayout = layout === 'page';
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
  const [notes, setNotes] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [approvalRemarks, setApprovalRemarks] = useState('');
  const [uploadingHrRewardPhoto, setUploadingHrRewardPhoto] = useState(false);

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
  /** Reporting line from hrms_employees.manager (not tied to committee assignment dropdown) */
  const [hrmsReportingManager, setHrmsReportingManager] = useState<string | null>(null);
  const [implementationDeadline, setImplementationDeadline] = useState('');
  const [implementationStage, setImplementationStage] = useState<'Started' | 'In Progress' | 'Completed'>('Started');
  const [implementationUpdate, setImplementationUpdate] = useState('');
  const [deadlineChangeDate, setDeadlineChangeDate] = useState('');
  const [deadlineChangeRemark, setDeadlineChangeRemark] = useState('');

  // Verification State (UC routing after BE review)
  /** Level 2 — Finance Head, Ops Head, Nursing only (unit-scoped portal users per role). */
  const [functionalApprovalSlots, setFunctionalApprovalSlots] = useState<
    {
      id: string;
      department: string;
      role: Role;
      approverName: string;
      approverEmployeeCode?: string | null;
    }[]
  >([]);
  /** Level 1 — department / named approver slots (before functional heads). */
  const [departmentApprovalSlots, setDepartmentApprovalSlots] = useState<
    {
      id: string;
      department: string;
      approverName: string;
      approverEmployeeCode?: string | null;
    }[]
  >([]);
  const [hodOptionsL1, setHodOptionsL1] = useState<{ employeeCode: string; name: string }[]>(
    [],
  );
  const [hodOptionsL2, setHodOptionsL2] = useState<{ employeeCode: string; name: string }[]>(
    [],
  );
  const [hodLoadingL1, setHodLoadingL1] = useState(false);
  const [hodLoadingL2, setHodLoadingL2] = useState(false);
  /** Merged master + unit-specific departments for Level 1 (preferred over prop-only list). */
  const [l1DepartmentPickerOptions, setL1DepartmentPickerOptions] = useState<
    { id: string; name: string }[]
  >([]);
  const [l1DeptCatalogLoading, setL1DeptCatalogLoading] = useState(false);
  /** Master HRMS department name (full department list). */
  const [selectedMasterDeptL1, setSelectedMasterDeptL1] = useState('');
  /** Selected row value = portal user employeeCode (from unit-scoped HOD API). */
  const [selectedHodEmpCodeL1, setSelectedHodEmpCodeL1] = useState('');
  /** Level 2 route: Finance / Ops / Nursing only. */
  const [selectedLevel2Role, setSelectedLevel2Role] = useState<Role | ''>('');
  const [selectedHodEmpCodeL2, setSelectedHodEmpCodeL2] = useState('');
  const [coordinatorSuggestion, setCoordinatorSuggestion] = useState('');
  const [assignmentDenialReason, setAssignmentDenialReason] = useState('');
  /** Required UC-entered title when approving/rejecting screening or routing after BE review. */
  const [ucApprovalHeading, setUcApprovalHeading] = useState('');
  /** Clinical / Supportive — mandatory at UC idea screening; persisted on `suggestion.category`. */
  const [ucScreeningCategory, setUcScreeningCategory] = useState<
    'Clinical' | 'Supportive' | ''
  >('');

  const effectiveRoles = userRoles?.length ? userRoles : [role];

  useEffect(() => {
    if (suggestion && isOpen) {
      setNotes(suggestion.screeningNotes || '');
      setUcApprovalHeading(String(suggestion.theme || '').trim());
      const c = suggestion.category;
      setUcScreeningCategory(
        c === 'Clinical' || c === 'Supportive' ? c : '',
      );
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
      setImplementationUpdate(suggestion.implementationUpdate || '');
      setDeadlineChangeDate('');
      setDeadlineChangeRemark('');
      setFunctionalApprovalSlots(
        (suggestion.requiredApprovals || []).map((r) => ({
          id: `persist-${suggestion.id}-${r}`,
          department: firstDepartmentKeyForRole(r) || String(r),
          role: r,
          approverName: String(suggestion.hodApproverNames?.[r] ?? ''),
        })),
      );
      setDepartmentApprovalSlots(
        Array.isArray(suggestion.departmentApprovals)
          ? suggestion.departmentApprovals.map((row: any) => ({
              id: String(row?.id || `slot-${suggestion.id}-${row?.department}`),
              department: String(row?.department || ''),
              approverName: String(row?.approverName || ''),
              approverEmployeeCode: row?.approverEmployeeCode
                ? String(row.approverEmployeeCode)
                : null,
            }))
          : [],
      );
      setHodOptionsL1([]);
      setHodOptionsL2([]);
      setL1DepartmentPickerOptions([]);
      setSelectedMasterDeptL1('');
      setSelectedHodEmpCodeL1('');
      setSelectedLevel2Role('');
      setSelectedHodEmpCodeL2('');
      setCoordinatorSuggestion(suggestion.coordinatorSuggestion || '');
      setAssignmentDenialReason('');
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

  useEffect(() => {
    if (!isOpen || !accessToken || !suggestion) {
      setHrmsReportingManager(null);
      return;
    }
    const code = String(suggestion.assignedImplementerCode ?? '').trim();
    if (!code) {
      setHrmsReportingManager(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${apiBase}/users/hrms/${encodeURIComponent(code)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!res.ok) {
          if (!cancelled) setHrmsReportingManager(null);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        const mgr = data?.manager != null ? String(data.manager).trim() : '';
        setHrmsReportingManager(mgr || null);
      } catch {
        if (!cancelled) setHrmsReportingManager(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, accessToken, isOpen, suggestion?.id, suggestion?.assignedImplementerCode]);

  useEffect(() => {
    if (!isOpen || !accessToken || !suggestion) return;
    if (role !== Role.UNIT_COORDINATOR) return;
    if (suggestion.status !== Status.BE_REVIEW_DONE) return;
    const unit = String(suggestion.assignedUnit || suggestion.unit || '').trim();
    if (!selectedMasterDeptL1 || !unit) {
      setHodOptionsL1([]);
      return;
    }
    let cancelled = false;
    setHodLoadingL1(true);
    (async () => {
      try {
        const res = await fetch(
          `${apiBase}/users/unit-department-members?unitCode=${encodeURIComponent(unit)}&department=${encodeURIComponent(selectedMasterDeptL1)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const data = res.ok ? await res.json() : [];
        if (cancelled) return;
        setHodOptionsL1(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setHodOptionsL1([]);
      } finally {
        if (!cancelled) setHodLoadingL1(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    apiBase,
    accessToken,
    isOpen,
    role,
    selectedMasterDeptL1,
    suggestion?.assignedUnit,
    suggestion?.id,
    suggestion?.status,
    suggestion?.unit,
  ]);

  useEffect(() => {
    if (!isOpen || !accessToken || !suggestion) return;
    if (role !== Role.UNIT_COORDINATOR) return;
    if (suggestion.status !== Status.BE_REVIEW_DONE) return;
    const unit = String(suggestion.assignedUnit || suggestion.unit || '').trim();
    if (!selectedLevel2Role || !unit) {
      setHodOptionsL2([]);
      return;
    }
    const rc = appRoleToHodRoleCode(selectedLevel2Role as Role);
    if (!rc) {
      setHodOptionsL2([]);
      return;
    }
    let cancelled = false;
    setHodLoadingL2(true);
    (async () => {
      try {
        const res = await fetch(
          `${apiBase}/users/unit-scoped-hods?unitCode=${encodeURIComponent(unit)}&roleCode=${encodeURIComponent(rc)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const data = res.ok ? await res.json() : [];
        if (cancelled) return;
        setHodOptionsL2(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setHodOptionsL2([]);
      } finally {
        if (!cancelled) setHodLoadingL2(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    apiBase,
    accessToken,
    isOpen,
    role,
    selectedLevel2Role,
    suggestion?.assignedUnit,
    suggestion?.id,
    suggestion?.status,
    suggestion?.unit,
  ]);

  useEffect(() => {
    if (!isOpen || !accessToken || !suggestion) return;
    if (role !== Role.UNIT_COORDINATOR) return;
    if (suggestion.status !== Status.BE_REVIEW_DONE) return;
    const unit = String(suggestion.assignedUnit || suggestion.unit || '').trim();
    let cancelled = false;
    setL1DeptCatalogLoading(true);
    (async () => {
      try {
        if (!unit) {
          if (!cancelled) setL1DepartmentPickerOptions([]);
          return;
        }
        const res = await fetch(
          `${apiBase}/hrms/departments-for-unit?unitCode=${encodeURIComponent(unit)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const data = res.ok ? await res.json() : [];
        if (cancelled) return;
        setL1DepartmentPickerOptions(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setL1DepartmentPickerOptions([]);
      } finally {
        if (!cancelled) setL1DeptCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    apiBase,
    accessToken,
    isOpen,
    role,
    suggestion?.assignedUnit,
    suggestion?.id,
    suggestion?.status,
    suggestion?.unit,
  ]);

  if (!suggestion) return null;
  if (!isPageLayout && !isOpen) return null;

  const level1DepartmentChoices =
    l1DepartmentPickerOptions.length > 0
      ? l1DepartmentPickerOptions
      : departmentOptions;

  const displayHeading =
    String(suggestion.theme || '').trim() ||
    `${suggestion.code || suggestion.id}`;

  // implementerOptions is rendered directly in the select

  // --- WORKFLOW ACTIONS ---

  // 1. Coordinator: Approve Idea -> Send to Committee
  const handleIdeaApproval = async (approved: boolean) => {
    try {
      const heading = String(ucApprovalHeading || '').trim().slice(0, 255);
      if (!heading) {
        showToast('error', 'Idea heading is required.');
        return;
      }
      if (ucScreeningCategory !== 'Clinical' && ucScreeningCategory !== 'Supportive') {
        showToast('error', 'Select Clinical or Supportive category.');
        return;
      }
      if (!approved && !String(notes || '').trim()) {
        showToast('error', 'Remarks are required to reject.');
        return;
      }
      await onUpdateStatus(
        suggestion.id,
        approved ? Status.APPROVED_FOR_ASSIGNMENT : Status.IDEA_REJECTED,
        {
          theme: heading,
          screeningNotes: notes,
          category: ucScreeningCategory,
        },
      );
      showToast('success', approved ? 'Idea approved' : 'Idea rejected');
      if (!approved) onClose();
    } catch (e: any) {
      showToast('error', 'Failed to update');
    }
  };

  const handleDenyAssignment = async () => {
    const remark = assignmentDenialReason.trim();
    if (!remark) {
      return alert('Please describe why you are declining this assignment.');
    }
    if (
      !window.confirm(
        'Decline this assignment? The idea will return to the Selection Committee for reassignment.',
      )
    ) {
      return;
    }
    try {
      await onUpdateStatus(
        suggestion.id,
        Status.APPROVED_FOR_ASSIGNMENT,
        { assignmentDenialNotes: remark },
        Role.IMPLEMENTER,
      );
      showToast('success', 'Assignment declined — returned to Selection Committee');
      onClose();
    } catch (e: any) {
      const msg = String(e?.message || '').trim();
      showToast('error', msg || 'Failed to decline assignment');
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
    } catch (e: any) {
      const msg = String(e?.message || '').trim();
      showToast('error', msg || 'Failed to assign implementer');
    }
  };

  /** Persists working status & notes only — % progress comes from saved template draft (automated). */
  const handleImplementerWorkStatusSave = async () => {
    try {
      await onUpdateStatus(suggestion.id, Status.ASSIGNED_FOR_IMPLEMENTATION, {
        implementationStage,
        implementationUpdate,
        implementationUpdateDate: new Date().toISOString().split('T')[0],
      });
      showToast('success', 'Status & notes saved');
    } catch {
      showToast('error', 'Failed to save');
    }
  };

  const handleImplementerDeadlineChange = async () => {
    if (!canImplementerUpdateWorkingStatus) return;
    if (!deadlineChangeDate) {
      alert('Please select the new deadline date.');
      return;
    }
    if (!deadlineChangeRemark.trim()) {
      alert('Remark is required when changing the deadline.');
      return;
    }
    const assignedDate = suggestion.implementationAssignedDate || suggestion.dateSubmitted;
    const assigned = new Date(`${assignedDate}T00:00:00`);
    const next = new Date(`${deadlineChangeDate}T00:00:00`);
    if (Number.isNaN(assigned.getTime()) || Number.isNaN(next.getTime())) {
      alert('Invalid date.');
      return;
    }
    if (next < assigned) {
      alert(`Deadline cannot be before assignment date (${assignedDate}).`);
      return;
    }
    const maxAllowedStr = addCalendarDaysToIsoDate(assignedDate, MAX_DEADLINE_EXTENSION_DAYS);
    if (!maxAllowedStr || deadlineChangeDate > maxAllowedStr) {
      alert(
        `Deadline must be within ${MAX_DEADLINE_EXTENSION_DAYS} calendar days of assignment (${assignedDate}). Latest allowed: ${maxAllowedStr ?? '—'}.`,
      );
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
      'horizontalDeploymentCostRows',
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
          const beActor = effectiveRoles.includes(Role.BUSINESS_EXCELLENCE)
            ? Role.BUSINESS_EXCELLENCE
            : undefined;
          await onUpdateStatus(
            suggestion.id,
            Status.IMPLEMENTATION_DONE,
            {
              ...data,
              beEditedFields: Array.from(new Set([...(suggestion.beEditedFields || []), ...changed])),
              beReviewNotes: 'Template updated by Business Excellence review.',
            },
            beActor,
          );
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
          const implActor =
            implementationActorUser != null && suggestion
              ? resolveImplementationPatchActor(suggestion, implementationActorUser)
              : effectiveRoles.includes(Role.IMPLEMENTER)
                ? Role.IMPLEMENTER
                : undefined;
          await onUpdateStatus(
            suggestion.id,
            Status.IMPLEMENTATION_DONE,
            {
              ...data,
              implementationProgress: 100,
              implementationStage: 'Completed',
              implementationDate: new Date().toISOString().split('T')[0],
              implementationDraft: data,
            },
            implActor,
          );
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
          const implActor =
            implementationActorUser != null && suggestion
              ? resolveImplementationPatchActor(suggestion, implementationActorUser)
              : effectiveRoles.includes(Role.IMPLEMENTER)
                ? Role.IMPLEMENTER
                : undefined;
          await onUpdateStatus(
            suggestion.id,
            suggestion.status as Status,
            {
              implementationDraft: data,
              implementationProgress: clampImplementationPercent(
                computeImplementationProgressPercentFromDraft(
                  data as Record<string, unknown>,
                ),
              ),
              implementationUpdateDate: new Date().toISOString().split('T')[0],
            },
            implActor,
          );
          showToast('success', 'Draft saved');
        } catch {
          showToast('error', 'Failed to save draft');
        }
      })();
  };

  // 4. Coordinator: Verify and Select Approvers
  const handleVerification = () => {
      const heading = String(ucApprovalHeading || '').trim().slice(0, 255);
      if (!heading) {
        showToast('error', 'Idea heading is required.');
        return;
      }
      const requiredApprovals = [...new Set(functionalApprovalSlots.map((s) => s.role))];
      const hodApproverNames: Partial<Record<Role, string>> = {};
      for (const s of functionalApprovalSlots) {
        hodApproverNames[s.role] = s.approverName;
      }
      const departmentApprovals = departmentApprovalSlots.map((s) => ({
        id: s.id,
        department: s.department,
        approverName: s.approverName,
        approverEmployeeCode: s.approverEmployeeCode ?? null,
        approvedAt: null as string | null,
        approvedBy: null as string | null,
      }));
      const approvalPhase = departmentApprovals.length > 0 ? 'L1' : 'L2';
      const hasLevel1 = departmentApprovals.length > 0;
      const hasLevel2 = requiredApprovals.length > 0;
      const nextStatus =
        !hasLevel1 && !hasLevel2
          ? Status.BE_EVALUATION_PENDING
          : Status.VERIFIED_PENDING_APPROVAL;

      onUpdateStatus(suggestion.id, nextStatus, {
        theme: heading,
        coordinatorSuggestion,
        approvals: {},
        requiredApprovals,
        hodApproverNames,
        departmentApprovals,
        approvalPhase: nextStatus === Status.VERIFIED_PENDING_APPROVAL ? approvalPhase : null,
        validatedBy: suggestion.validatedBy || currentUserName || 'Unit Coordinator',
      });
  };

  const hodRoleLabel = (r: Role) => {
    const map: Partial<Record<Role, string>> = {
      [Role.QUALITY_HOD]: 'Head — Quality',
      [Role.FINANCE_HOD]: 'Head — Finance',
      [Role.HR_HEAD]: 'Head — HR',
      [Role.OPS_HEAD]: 'Head — Operations',
      [Role.NURSING_HEAD]: 'Head — Nursing',
    };
    return map[r] || String(r);
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
    const heading = String(ucApprovalHeading || '').trim().slice(0, 255);
    if (!heading) {
      showToast('error', 'Idea heading is required.');
      return;
    }
    const remark = String(coordinatorSuggestion || '').trim();
    if (!remark) {
      showToast('error', 'Remarks are required for Not approved.');
      return;
    }
    try {
      await onUpdateStatus(suggestion.id, Status.IMPLEMENTATION_DONE, {
        theme: heading,
        coordinatorSuggestion: remark,
      });
      showToast('success', 'Sent back to BE review');
    } catch (e: any) {
      showToast('error', e?.message || 'Failed to send back');
    }
  };

  const handleFunctionalApprove = async () => {
    const r = role;
    if (
      ![
        Role.FINANCE_HOD,
        Role.QUALITY_HOD,
        Role.HR_HEAD,
        Role.OPS_HEAD,
        Role.NURSING_HEAD,
      ].includes(r)
    )
      return;
    try {
      const nextApprovals = { ...(suggestion.approvals || {}), [r]: true };
      const req = suggestion.requiredApprovals || [];
      const allDone = req.every((x) => nextApprovals?.[x]);
      const hasBeEvaluation = Boolean((suggestion as any)?.rewardEvaluation);
      await onUpdateStatus(
        suggestion.id,
        allDone
          ? hasBeEvaluation
            ? Status.REWARD_PENDING
            : Status.BE_EVALUATION_PENDING
          : Status.VERIFIED_PENDING_APPROVAL,
        { approvals: nextApprovals },
      );
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
      // Send back to Unit Coordinator for re-routing / clarification.
      await onUpdateStatus(suggestion.id, Status.BE_REVIEW_DONE, {
        beReviewNotes: remark,
        approvals: {},
        departmentApprovals: [],
        approvalPhase: null,
      });
      showToast('success', 'Sent back to Unit Coordinator');
      setApprovalRemarks('');
    } catch (e: any) {
      showToast('error', e?.message || 'Failed to send back');
    }
  };

  const addDepartmentSlotFromPicker = () => {
    if (!selectedMasterDeptL1 || !selectedHodEmpCodeL1) {
      alert('Select a department and a named approver (portal users in that department at this unit).');
      return;
    }
    const pick = hodOptionsL1.find((u) => u.employeeCode === selectedHodEmpCodeL1);
    const approverName = pick?.name ?? selectedHodEmpCodeL1;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `slot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setDepartmentApprovalSlots((prev) => [
      ...prev,
      {
        id,
        department: selectedMasterDeptL1,
        approverName,
        approverEmployeeCode: selectedHodEmpCodeL1,
      },
    ]);
    setSelectedMasterDeptL1('');
    setSelectedHodEmpCodeL1('');
  };

  const addFunctionalSlotFromPicker = () => {
    if (!selectedLevel2Role || !selectedHodEmpCodeL2) {
      alert('Select Finance Head, Ops Head, or Nursing, then a named head.');
      return;
    }
    const route = LEVEL_2_APPROVAL_ROUTES.find((x) => x.role === selectedLevel2Role);
    if (!route) return;
    const fnRole = route.role;
    const pick = hodOptionsL2.find((u) => u.employeeCode === selectedHodEmpCodeL2);
    const approverName = pick?.name ?? selectedHodEmpCodeL2;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `l2-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setFunctionalApprovalSlots((prev) => {
      const rest = prev.filter((s) => s.role !== fnRole);
      return [
        ...rest,
        {
          id,
          department: route.label,
          role: fnRole,
          approverName,
          approverEmployeeCode: selectedHodEmpCodeL2,
        },
      ];
    });
    setSelectedLevel2Role('');
    setSelectedHodEmpCodeL2('');
  };

  const removeDepartmentSlot = (id: string) => {
    setDepartmentApprovalSlots((prev) => prev.filter((s) => s.id !== id));
  };

  const handleDepartmentL1Approve = async (slotId: string) => {
    const slots = suggestion.departmentApprovals || [];
    const next = slots.map((row) =>
      row.id === slotId
        ? {
            ...row,
            approvedAt: new Date().toISOString(),
            approvedBy: currentUserName || String(role),
          }
        : row,
    );
    const l1Complete = next.every((row) => String(row?.approvedAt ?? '').trim());
    const hasLevel2 = (suggestion.requiredApprovals || []).length > 0;
    try {
      await onUpdateStatus(
        suggestion.id,
        Status.VERIFIED_PENDING_APPROVAL,
        {
          departmentApprovals: next,
        },
      );
      showToast(
        'success',
        l1Complete && !hasLevel2
          ? 'Final Level 1 approval recorded and sent to BE Head evaluation'
          : 'Department approval recorded',
      );
    } catch (e: any) {
      showToast('error', e?.message || 'Failed to record approval');
    }
  };

  const removeFunctionalSlot = (id: string) => {
    setFunctionalApprovalSlots((prev) => prev.filter((s) => s.id !== id));
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
        approvalPhase: 'L2',
        departmentApprovals: [],
      });
      return;
    }
    onUpdateStatus(suggestion.id, Status.REWARD_PENDING, { rewardEvaluation: evaluation });
  };

  // 7. HR: Process Reward (requires reward validation photo first — enforced server-side)
  const handleProcessReward = () => {
    const proof = String(suggestion.hrRewardValidationImagePath ?? '').trim();
    if (!proof) {
      showToast('error', 'Upload the HR reward validation photo before closing.');
      return;
    }
    void onUpdateStatus(suggestion.id, Status.REWARDED);
  };

  const handleHrRewardPhotoSelected = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file || !suggestion) return;
    setUploadingHrRewardPhoto(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${apiBase}/suggestions/${suggestion.id}/hr-reward-validation`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: fd,
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || 'Upload failed');
      }
      const updated = (await res.json()) as Suggestion;
      onSuggestionRefreshed?.(updated);
      showToast('success', 'Reward validation photo saved.');
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadingHrRewardPhoto(false);
    }
  };

  const pendingApprovers =
    isL2ApprovalPhase(suggestion) && suggestion.requiredApprovals
      ? suggestion.requiredApprovals.filter((r) => !suggestion.approvals?.[r])
      : [];

  const nextApprover =
    pendingApprovers.length > 0 ? pendingApprovers[0] : null;

  const level1Approvals = Array.isArray(suggestion.departmentApprovals)
    ? suggestion.departmentApprovals
    : [];
  const level1Approved = level1Approvals.filter((row) =>
    String(row?.approvedAt ?? '').trim(),
  );
  const level1Pending = level1Approvals.filter(
    (row) => !String(row?.approvedAt ?? '').trim(),
  );
  const level2Approvals = Array.isArray(suggestion.requiredApprovals)
    ? suggestion.requiredApprovals
    : [];
  const level2Approved = level2Approvals.filter((r) => suggestion.approvals?.[r]);
  const level2Pending = level2Approvals.filter((r) => !suggestion.approvals?.[r]);
  const approvalsRequired =
    level1Approvals.length > 0 || level2Approvals.length > 0;

  const formatTrackingDate = (value?: string | null) => {
    const raw = String(value || '').trim();
    if (!raw) return '—';
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString();
  };

  const getCurrentOwner = () => {
    if (suggestion.status === Status.IDEA_SUBMITTED) return Role.UNIT_COORDINATOR;
    if (suggestion.status === Status.APPROVED_FOR_ASSIGNMENT) return Role.SELECTION_COMMITTEE;
    if (suggestion.status === Status.ASSIGNED_FOR_IMPLEMENTATION) {
      return suggestion.assignedImplementer || Role.IMPLEMENTER;
    }
    if (suggestion.status === Status.IMPLEMENTATION_DONE) return Role.BUSINESS_EXCELLENCE;
    if (suggestion.status === Status.BE_REVIEW_DONE) return Role.UNIT_COORDINATOR;
    if (suggestion.status === Status.BE_EVALUATION_PENDING) return Role.BUSINESS_EXCELLENCE_HEAD;
    if (suggestion.status === Status.VERIFIED_PENDING_APPROVAL) {
      if (!isL2ApprovalPhase(suggestion)) return 'Department approvers (L1)';
      return nextApprover || Role.QUALITY_HOD;
    }
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
    if (suggestion.status === Status.BE_EVALUATION_PENDING) return 'Business Excellence Head final scoring and evaluation';
    if (suggestion.status === Status.VERIFIED_PENDING_APPROVAL) {
      if (!isL2ApprovalPhase(suggestion)) {
        return 'Pending Level 1 department sign-offs (then functional heads)';
      }
      if (nextApprover) return `Pending functional approval: ${String(nextApprover)}`;
      return 'Pending functional approvals';
    }
    if (suggestion.status === Status.REWARD_PENDING) return 'HR process payment and notify employee';
    if (suggestion.status === Status.REWARDED) return 'Completed';
    if (suggestion.status === Status.IDEA_REJECTED) return 'Rejected';
    return 'N/A';
  };

  const trackingStageTitle = (() => {
    if (suggestion.status === Status.IDEA_SUBMITTED) return 'Awaiting coordinator screening';
    if (suggestion.status === Status.APPROVED_FOR_ASSIGNMENT)
      return 'Waiting for implementer assignment';
    if (suggestion.status === Status.ASSIGNED_FOR_IMPLEMENTATION)
      return 'Implementation in progress';
    if (suggestion.status === Status.IMPLEMENTATION_DONE)
      return 'Waiting for BE review';
    if (suggestion.status === Status.BE_REVIEW_DONE)
      return 'Waiting for coordinator routing';
    if (suggestion.status === Status.VERIFIED_PENDING_APPROVAL) {
      if (!isL2ApprovalPhase(suggestion)) return 'Level 1 department approvals in progress';
      return 'Level 2 functional approvals in progress';
    }
    if (suggestion.status === Status.BE_EVALUATION_PENDING)
      return 'Waiting for BE Head evaluation';
    if (suggestion.status === Status.REWARD_PENDING)
      return 'Waiting for HR reward closure';
    if (suggestion.status === Status.REWARDED) return 'Closed successfully';
    if (suggestion.status === Status.IDEA_REJECTED) return 'Closed as rejected';
    return suggestion.status;
  })();

  const trackingStageHint = (() => {
    if (suggestion.status === Status.VERIFIED_PENDING_APPROVAL) {
      if (!isL2ApprovalPhase(suggestion)) {
        if (level1Pending.length === 0) {
          return level2Approvals.length > 0
            ? 'All Level 1 sign-offs are complete. Level 2 approvals are next.'
            : 'All Level 1 sign-offs are complete. The idea will move to BE Head evaluation.';
        }
        return `${level1Approved.length}/${level1Approvals.length} department sign-offs completed.`;
      }
      if (level2Approvals.length === 0) {
        return 'No functional approvals are pending.';
      }
      return `${level2Approved.length}/${level2Approvals.length} functional approvals completed.`;
    }
    if (suggestion.status === Status.REWARDED)
      return 'Reward processing is complete and the idea is closed.';
    if (suggestion.status === Status.IDEA_REJECTED)
      return 'This idea was rejected and removed from the active workflow.';
    return getActionRequired();
  })();

  const approvalTrackerSummary = (() => {
    if (!approvalsRequired) {
      return 'No Level 1 or Level 2 approvals were selected for this idea.';
    }
    if (level1Approvals.length > 0 && level2Approvals.length > 0) {
      return `${level1Approved.length}/${level1Approvals.length} Level 1 sign-offs and ${level2Approved.length}/${level2Approvals.length} Level 2 approvals completed.`;
    }
    if (level1Approvals.length > 0) {
      return `${level1Approved.length}/${level1Approvals.length} Level 1 department sign-offs completed.`;
    }
    return `${level2Approved.length}/${level2Approvals.length} Level 2 functional approvals completed.`;
  })();

  const approvalsOwnerLabel = (() => {
    if (!approvalsRequired) return 'Skipped';
    if (!isL2ApprovalPhase(suggestion)) return 'Named department approvers';
    return nextApprover || 'Functional heads';
  })();

  const workflowCurrentStepId = (() => {
    if (suggestion.status === Status.IDEA_SUBMITTED) return 'screening';
    if (suggestion.status === Status.APPROVED_FOR_ASSIGNMENT) return 'assignment';
    if (suggestion.status === Status.ASSIGNED_FOR_IMPLEMENTATION)
      return 'implementation';
    if (suggestion.status === Status.IMPLEMENTATION_DONE) return 'be_review';
    if (suggestion.status === Status.BE_REVIEW_DONE) return 'coordinator';
    if (suggestion.status === Status.VERIFIED_PENDING_APPROVAL) return 'approvals';
    if (suggestion.status === Status.BE_EVALUATION_PENDING) return 'be_head';
    if (suggestion.status === Status.REWARD_PENDING) return 'reward';
    return null;
  })();

  const workflowSteps: Array<{
    id: string;
    title: string;
    owner: string;
    detail: string;
    state: 'done' | 'current' | 'pending' | 'skipped';
  }> = [
    {
      id: 'submission',
      title: 'Idea submitted',
      owner: Role.EMPLOYEE,
      detail: 'Originator created and submitted the suggestion.',
      state: 'pending',
    },
    {
      id: 'screening',
      title: 'Coordinator screening',
      owner: Role.UNIT_COORDINATOR,
      detail: 'Unit Coordinator validates the idea and decides whether to proceed.',
      state: 'pending',
    },
    {
      id: 'assignment',
      title: 'Committee assignment',
      owner: Role.SELECTION_COMMITTEE,
      detail: 'Selection Committee assigns implementer, unit, department, and deadline.',
      state: 'pending',
    },
    {
      id: 'implementation',
      title: 'Implementation',
      owner: suggestion.assignedImplementer || Role.IMPLEMENTER,
      detail: 'Assigned implementer completes the kaizen work and template.',
      state: 'pending',
    },
    {
      id: 'be_review',
      title: 'BE review',
      owner: Role.BUSINESS_EXCELLENCE,
      detail: 'BE reviews the implementation and forwards it for routing.',
      state: 'pending',
    },
    {
      id: 'coordinator',
      title: 'Coordinator routing',
      owner: Role.UNIT_COORDINATOR,
      detail: 'Unit Coordinator decides whether approvals are needed before BE Head evaluation.',
      state: 'pending',
    },
    {
      id: 'approvals',
      title: 'Approvals',
      owner: approvalsOwnerLabel,
      detail: approvalsRequired
        ? approvalTrackerSummary
        : 'No Level 1 or Level 2 approval step was required.',
      state: 'pending',
    },
    {
      id: 'be_head',
      title: 'BE Head evaluation',
      owner: Role.BUSINESS_EXCELLENCE_HEAD,
      detail: 'BE Head performs final scoring and reward recommendation.',
      state: 'pending',
    },
    {
      id: 'reward',
      title: 'Reward closure',
      owner: 'HR / Unit Coordinator',
      detail: 'HR validates reward processing and closes the idea.',
      state: 'pending',
    },
  ].map((step, idx, arr) => {
    const approvalsSkipped =
      step.id === 'approvals' &&
      !approvalsRequired &&
      [
        Status.BE_EVALUATION_PENDING,
        Status.REWARD_PENDING,
        Status.REWARDED,
      ].includes(suggestion.status);

    if (approvalsSkipped) {
      return { ...step, state: 'skipped' as const };
    }
    if (suggestion.status === Status.REWARDED) {
      return { ...step, state: 'done' as const };
    }
    if (suggestion.status === Status.IDEA_REJECTED) {
      return {
        ...step,
        state:
          step.id === 'submission' || step.id === 'screening'
            ? ('done' as const)
            : ('pending' as const),
      };
    }
    if (step.id === 'submission') {
      return { ...step, state: 'done' as const };
    }
    const currentIndex = workflowCurrentStepId
      ? arr.findIndex((item) => item.id === workflowCurrentStepId)
      : -1;
    if (currentIndex >= 0 && idx < currentIndex) {
      return { ...step, state: 'done' as const };
    }
    if (currentIndex >= 0 && idx === currentIndex) {
      return { ...step, state: 'current' as const };
    }
    return { ...step, state: 'pending' as const };
  });
  const workflowProgressPercent = Math.round(
    (workflowSteps.filter((step) => step.state === 'done' || step.state === 'skipped').length /
      workflowSteps.length) *
      100,
  );
  const workflowStepStateMeta: Record<
    'done' | 'current' | 'pending' | 'skipped',
    { label: string; badgeClass: string; icon: string }
  > = {
    done: {
      label: 'Done',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      icon: 'check_circle',
    },
    current: {
      label: 'Current',
      badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
      icon: 'radio_button_checked',
    },
    pending: {
      label: 'Pending',
      badgeClass: 'bg-white text-gray-600 border-gray-300',
      icon: 'schedule',
    },
    skipped: {
      label: 'Skipped',
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
      icon: 'fast_forward',
    },
  };


  const approvalRouteSummary = (() => {
    if (!approvalsRequired) {
      return 'No approval routing was selected. The idea moves directly to BE Head evaluation after coordinator routing.';
    }
    if (level1Approvals.length > 0 && level2Approvals.length > 0) {
      return 'Route: Level 1 department sign-offs -> Level 2 functional head approvals -> BE Head evaluation.';
    }
    if (level1Approvals.length > 0) {
      return 'Route: Level 1 department sign-offs -> BE Head evaluation.';
    }
    return 'Route: Level 2 functional head approvals -> BE Head evaluation.';
  })();
  const activeApprovalStageLabel = (() => {
    if (!approvalsRequired) return 'No approval stage required';
    if (suggestion.status !== Status.VERIFIED_PENDING_APPROVAL) {
      if (
        [
          Status.BE_EVALUATION_PENDING,
          Status.REWARD_PENDING,
          Status.REWARDED,
        ].includes(suggestion.status)
      ) {
        return 'Approval stage completed';
      }
      return 'Approval stage not started';
    }
    return isL2ApprovalPhase(suggestion)
      ? 'Level 2 functional approvals in progress'
      : 'Level 1 department sign-offs in progress';
  })();
  const level2ApprovalDetails = level2Approvals.map((approvalRole) => ({
    role: approvalRole,
    approverName: String(suggestion.hodApproverNames?.[approvalRole] ?? '').trim(),
    approved: Boolean(suggestion.approvals?.[approvalRole]),
  }));
  const renderActionStatusSummaryPanel = () => (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Stage summary
            </div>
            <div className="mt-1.5 text-base font-bold leading-tight text-slate-900">
              {trackingStageTitle}
            </div>
            <div className="mt-1 text-sm font-medium text-slate-600">{trackingStageHint}</div>
          </div>
          <span className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
            {suggestion.status}
          </span>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <span>Overall progress</span>
            <span className="tabular-nums text-slate-800">{workflowProgressPercent}%</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-kauvery-purple to-kauvery-violet"
              style={{ width: `${workflowProgressPercent}%` }}
            />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Current owner
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {String(getCurrentOwner() || '—')}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Action required
            </div>
            <div className="mt-1 text-sm font-semibold leading-snug text-slate-900">
              {getActionRequired()}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Workflow steps
        </div>
        <div className="mt-3 space-y-2 max-h-64 overflow-y-auto pr-1">
          {workflowSteps.map((step, index) => {
            const stateMeta = workflowStepStateMeta[step.state];
            return (
              <div
                key={step.id}
                className={`rounded-lg border p-3 ${
                  step.state === 'current'
                    ? 'border-blue-200 bg-blue-50/80'
                    : step.state === 'done'
                      ? 'border-emerald-200 bg-emerald-50/70'
                      : 'border-slate-200 bg-slate-50/70'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-bold text-slate-600">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{step.title}</span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${stateMeta.badgeClass}`}
                      >
                        {stateMeta.label}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                      Owner: {step.owner}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Approval route
        </div>
        <div className="mt-2 text-sm font-medium text-slate-800">{approvalRouteSummary}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
            {activeApprovalStageLabel}
          </span>
          {level1Approvals.length > 0 && (
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-900">
              L1: {level1Approved.length}/{level1Approvals.length}
            </span>
          )}
          {level2Approvals.length > 0 && (
            <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-black text-cyan-900">
              L2: {level2Approved.length}/{level2Approvals.length}
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Approval details
        </div>
        {!approvalsRequired ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-3 text-sm font-medium text-slate-600">
            No Level 1 or Level 2 approvals were configured for this idea.
          </div>
        ) : (
          <div className="space-y-4">
            {level1Approvals.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-black uppercase tracking-wide text-amber-900">
                  Level 1 department sign-offs ({level1Approved.length}/{level1Approvals.length})
                </div>
                {level1Approvals.map((row) => {
                  const signed = Boolean(String(row?.approvedAt ?? '').trim());
                  return (
                    <div
                      key={row.id}
                      className={`rounded-lg border p-3 text-sm ${
                        signed
                          ? 'border-emerald-200 bg-emerald-50/70'
                          : 'border-amber-200 bg-amber-50/70'
                      }`}
                    >
                      <div className="font-semibold text-slate-900">{row.department}</div>
                      <div className="text-xs text-slate-700 mt-1">
                        {row.approverName || 'Not assigned'}
                        {row.approverEmployeeCode ? ` (${row.approverEmployeeCode})` : ''}
                        {' — '}
                        {signed ? 'Signed off' : 'Pending'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {level2Approvals.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-black uppercase tracking-wide text-cyan-900">
                  Level 2 functional approvals ({level2Approved.length}/{level2Approvals.length})
                </div>
                {level2ApprovalDetails.map((item) => (
                  <div
                    key={item.role}
                    className={`rounded-lg border p-3 text-sm ${
                      item.approved
                        ? 'border-emerald-200 bg-emerald-50/70'
                        : 'border-cyan-200 bg-cyan-50/70'
                    }`}
                  >
                    <div className="font-semibold text-slate-900">{item.role}</div>
                    <div className="text-xs text-slate-700 mt-1">
                      {item.approverName || 'Not specified'} — {item.approved ? 'Approved' : 'Pending'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Implementation
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
          <div>
            <div className="text-[10px] font-semibold uppercase text-slate-500">Implementer</div>
            <div className="font-semibold text-slate-900">
              {suggestion.assignedImplementer || 'Not assigned'}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase text-slate-500">Progress</div>
            <div className="font-semibold text-slate-900">{progressFloorEffective}%</div>
          </div>
        </div>
      </div>
    </div>
  );
  const getRoleActionState = () => {
    if (role === Role.EMPLOYEE) return { canAct: false, message: 'Employee can only view tracking status and remarks.' };
    if (role === Role.UNIT_COORDINATOR && suggestion.status === Status.IDEA_SUBMITTED) return { canAct: true, message: 'Approve or reject this submitted idea.' };
    if (role === Role.SELECTION_COMMITTEE && suggestion.status === Status.APPROVED_FOR_ASSIGNMENT) return { canAct: true, message: 'Assign implementer, unit, department, and deadline.' };
    if (role === Role.IMPLEMENTER && suggestion.status === Status.ASSIGNED_FOR_IMPLEMENTATION) return { canAct: true, message: 'Fill and submit implementation template.' };
    if (role === Role.BUSINESS_EXCELLENCE && suggestion.status === Status.IMPLEMENTATION_DONE) return { canAct: true, message: 'Review template, edit if needed, and approve to Unit Coordinator.' };
    if (role === Role.UNIT_COORDINATOR && suggestion.status === Status.BE_REVIEW_DONE) return { canAct: true, message: 'Approve after BE review and send to BE Head scoring.' };
    if (role === Role.BUSINESS_EXCELLENCE_HEAD && suggestion.status === Status.BE_EVALUATION_PENDING) return { canAct: true, message: 'Business Excellence Head evaluates score and reward.' };
    if (
      role === Role.EMPLOYEE &&
      suggestion.status === Status.VERIFIED_PENDING_APPROVAL &&
      pendingDepartmentL1ForUser(
        suggestion,
        currentUserName,
        implementationActorUser?.employeeCode,
      )
    ) {
      return {
        canAct: true,
        message: 'Complete your Level 1 department sign-off when you are named as approver.',
      };
    }
    if (
      [
        Role.HR_HEAD,
        Role.QUALITY_HOD,
        Role.FINANCE_HOD,
        Role.OPS_HEAD,
        Role.NURSING_HEAD,
      ].includes(role) &&
      suggestion.status === Status.VERIFIED_PENDING_APPROVAL &&
      isL2ApprovalPhase(suggestion) &&
      pendingApprovers.includes(role)
    ) {
      return { canAct: true, message: 'Approve or send back for BE re-evaluation.' };
    }
    if (role === Role.HR_HEAD && suggestion.status === Status.REWARD_PENDING)
      return {
        canAct: true,
        message:
          'Upload HR reward validation photo, then process payment and close the idea.',
      };
    return { canAct: false, message: 'No action available for this role at current status.' };
  };

  const roleActionState = getRoleActionState();
  const assigneeNorm = (suggestion.assignedImplementer || '').trim().toLowerCase();
  const actorNorm = (currentUserName || '').trim().toLowerCase();
  const assigneeCodeNorm = (suggestion.assignedImplementerCode || '').trim().toLowerCase();
  const actorCodeNorm = (implementationActorUser?.employeeCode || '').trim().toLowerCase();
  const isAssignedImplementerUser =
    (assigneeCodeNorm && actorCodeNorm && assigneeCodeNorm === actorCodeNorm) ||
    (assigneeNorm && actorNorm && assigneeNorm === actorNorm);
  const canImplementerUpdateWorkingStatus =
    role === Role.IMPLEMENTER &&
    suggestion.status === Status.ASSIGNED_FOR_IMPLEMENTATION &&
    isAssignedImplementerUser;
  const progressFloor = clampImplementationPercent(suggestion.implementationProgress);
  const draftAutoProgress = computeImplementationProgressPercentFromDraft(
    (suggestion.implementationDraft ?? {}) as Record<string, unknown>,
  );
  /** Stored progress or slide-based completion from saved draft — whichever is higher (no manual %). */
  const progressFloorEffective = Math.max(progressFloor, draftAutoProgress);
  const reportingFromImplementerList =
    implementerOptions.find((x) => x.employeeCode === implementerEmployeeCode)?.manager;
  const reportingTo =
    (hrmsReportingManager && hrmsReportingManager.trim()) ||
    (reportingFromImplementerList && String(reportingFromImplementerList).trim()) ||
    'Not mapped';
  const workflowThread = (Array.isArray((suggestion as any)?.workflowThread)
    ? ((suggestion as any).workflowThread as any[])
    : []
  )
    .map((item, idx) => {
      const actor = String(item?.actor ?? '').trim();
      const text = String(item?.text ?? '').trim();
      const roleRaw = item?.role;
      const roleSafe = (Object.values(Role) as string[]).includes(String(roleRaw))
        ? (roleRaw as Role)
        : (Role.EMPLOYEE as Role);
      const date = String(item?.date ?? '').trim();
      const id = String(item?.id ?? '').trim() || `${suggestion.id || 's'}-${idx}-${date || 't'}`;
      if (!actor && !text && !date) return null;
      return { id, actor: actor || 'System', role: roleSafe, text: text || '-', date: date || new Date().toISOString() };
    })
    .filter(Boolean) as { id: string; actor: string; role: Role; text: string; date: string }[];
  const hideAssignmentDenialFromViewer =
    role === Role.EMPLOYEE || role === Role.IMPLEMENTER;
  const showAssignmentDenialNotes =
    !hideAssignmentDenialFromViewer &&
    Boolean(String(suggestion.assignmentDenialNotes ?? '').trim());
  const visibleWorkflowThread = hideAssignmentDenialFromViewer
    ? workflowThread.filter((item) => !/declined the assignment/i.test(item.text))
    : workflowThread;
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
    const rel = String(relPath || '').trim();
    if (!rel || !apiBase) throw new Error('Missing file path');
    const url = `${apiBase}/kaizen-files/${rel}`;
    // `/kaizen-files/*` is served as static assets; adding Authorization triggers a CORS preflight
    // that often fails for static routes. These files are public downloads.
    const res = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit' });
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
      <div className="flex gap-0 overflow-x-auto border-b border-slate-200/90 bg-slate-50/50 px-4 sm:px-6 lg:px-8">
          <button type="button" onClick={() => setActiveTab('overview')} className={`px-4 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap border-b-2 -mb-px ${activeTab === 'overview' ? 'border-kauvery-purple text-kauvery-purple' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Overview</button>
          {suggestion.problem && (
             <button type="button" onClick={() => setActiveTab('analysis')} className={`px-4 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap border-b-2 -mb-px ${activeTab === 'analysis' ? 'border-kauvery-purple text-kauvery-purple' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Full Analysis (5W1H)</button>
          )}
          <button type="button" onClick={() => setActiveTab('review')} className={`px-4 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap border-b-2 -mb-px ${activeTab === 'review' ? 'border-kauvery-purple text-kauvery-purple' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Action & Status</button>
          {canViewSubmittedTemplateTab && (
            <button
              type="button"
              onClick={() => hasSubmittedTemplate && setActiveTab('template')}
              disabled={!hasSubmittedTemplate}
              className={`px-4 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap border-b-2 -mb-px ${
                activeTab === 'template'
                  ? 'border-kauvery-purple text-kauvery-purple'
                  : hasSubmittedTemplate
                    ? 'border-transparent text-slate-500 hover:text-slate-800'
                    : 'border-transparent text-slate-300 cursor-not-allowed'
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
      return null;
    }
    return (
      <div
        className={
          isPageLayout
            ? 'w-full max-w-5xl mx-auto py-2 min-h-0 flex justify-center [@media(orientation:landscape)]:py-1'
            : 'fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 [@media(orientation:landscape)]:p-2 overflow-y-auto'
        }
      >
        <div className="w-full max-w-5xl my-8 [@media(orientation:landscape)]:max-w-none [@media(orientation:landscape)]:my-2 [@media(orientation:landscape)]:min-h-0">
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
      <div
        className={
          isPageLayout
            ? 'w-full max-w-6xl mx-auto py-2 min-h-0 flex justify-center [@media(orientation:landscape)]:py-1'
            : 'fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 [@media(orientation:landscape)]:p-2 overflow-y-auto'
        }
      >
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
        <div className="w-full max-w-6xl my-8 [@media(orientation:landscape)]:max-w-none [@media(orientation:landscape)]:my-2 bg-gradient-to-br from-white via-purple-50/30 to-pink-50/20 rounded-2xl border border-purple-200/50 shadow-kauvery-card ring-1 ring-purple-100/70 overflow-hidden min-w-0">
          <div className="px-6 py-4 border-b border-purple-200/50 bg-gradient-to-r from-white via-purple-50/40 to-pink-50/30 flex justify-between items-start">
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
              className="text-kauvery-purple/70 hover:text-kauvery-violet p-2 hover:bg-purple-100/80 rounded-full transition-colors border border-transparent hover:border-purple-200"
            >
              <span className="material-icons-round">close</span>
            </button>
          </div>

          <div className="px-6 py-3 border-b border-purple-200/50 bg-white/80 flex flex-wrap items-center justify-between gap-3">
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
                className="px-3 py-2 rounded-lg bg-kauvery-violet text-white text-xs font-bold hover:bg-kauvery-purple border border-purple-800/30"
              >
                {finalPdfPathResolved ? 'Download PDF' : 'Generate & Download PDF'}
              </button>
            </div>
          </div>

          <div className="p-6 bg-gradient-to-b from-purple-50/40 via-[#faf8fc] to-pink-50/30 max-h-[74vh] overflow-y-auto">
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

          <div className="px-6 py-4 border-t border-purple-200/50 bg-gradient-to-r from-white to-purple-50/30 flex justify-end gap-2">
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
    <div
      className={
        isPageLayout
          ? 'w-full max-w-none min-h-0 flex flex-col'
          : 'fixed inset-0 z-50 flex items-center justify-center p-4'
      }
    >
      {!isPageLayout && (
        <div
          className="absolute inset-0 bg-gradient-to-br from-kauvery-purple/25 via-slate-900/35 to-kauvery-pink/20 backdrop-blur-sm transition-opacity"
          onClick={onClose}
          aria-hidden
        />
      )}

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

      {/* Main shell — neutral surface, clinical / enterprise tone */}
      <div
        className={`relative w-full flex flex-col animate-fade-in overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_4px_24px_-4px_rgba(15,23,42,0.08),0_0_0_1px_rgba(15,23,42,0.04)] ${
          isPageLayout
            ? 'max-w-none min-h-0 h-[calc(100dvh-9rem)] max-h-[calc(100dvh-9rem)] sm:h-[calc(100dvh-8.5rem)] sm:max-h-[calc(100dvh-8.5rem)] rounded-xl sm:rounded-2xl'
            : 'max-w-6xl h-[88vh]'
        }`}
      >
        
        {/* Header */}
        <div
          className={`flex shrink-0 items-start justify-between gap-4 border-b border-slate-200/90 bg-white ${
            isPageLayout ? 'px-4 py-4 sm:px-6 sm:py-5 lg:px-10' : 'px-6 py-5'
          }`}
        >
            <div className="min-w-0 flex-1 pr-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Kaizen record
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-mono font-semibold text-slate-800 tabular-nums">
                      {suggestion.code || suggestion.id}
                    </span>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[suggestion.status]}`}>{suggestion.status}</span>
                </div>
                <h2 className="mt-3 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl leading-snug break-words">
                  {displayHeading}
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  <span className="text-slate-500">Originator</span>{' '}
                  <span className="font-semibold text-slate-900">{suggestion.employeeName}</span>
                  <span className="text-slate-300"> · </span>
                  <span className="text-slate-600">{suggestion.department}</span>
                </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg border border-slate-200 bg-white p-2.5 text-slate-500 transition-colors hover:border-kauvery-purple/35 hover:bg-purple-50/60 hover:text-kauvery-purple"
              aria-label={isPageLayout ? 'Back' : 'Close'}
            >
              <span className="material-icons-round text-[22px] leading-none">
                {isPageLayout ? 'arrow_back' : 'close'}
              </span>
            </button>
        </div>

        {initialView !== 'tracking' && (
          <>
            {initialView === 'hod-review' && (
              <div className="flex flex-col gap-3 border-b border-slate-200/90 bg-slate-50/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Head review
                  </div>
                  <p className="mt-1 text-sm font-medium leading-relaxed text-slate-700">
                    Read the summary and submitted Kaizen template, then record your decision under Action
                    &amp; Status.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveTab('overview')}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold border transition-colors ${
                      activeTab === 'overview'
                        ? 'border-kauvery-purple bg-kauvery-purple text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    Summary
                  </button>
                  <button
                    type="button"
                    onClick={() => hasSubmittedTemplate && setActiveTab('template')}
                    disabled={!hasSubmittedTemplate}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold border transition-colors ${
                      !hasSubmittedTemplate
                        ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                        : activeTab === 'template'
                          ? 'border-kauvery-purple bg-kauvery-purple text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    Submitted template
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('review')}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold border transition-colors ${
                      activeTab === 'review'
                        ? 'border-kauvery-purple bg-kauvery-purple text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    Decision
                  </button>
                </div>
              </div>
            )}
            {initialView !== 'hod-review' && <Tabs />}
          </>
        )}

        {/* Content */}
        <div
          className={`flex-1 min-h-0 overflow-y-auto bg-slate-50/80 text-slate-900 ${
            isPageLayout ? 'px-4 py-5 sm:px-6 sm:py-6 lg:px-10 lg:py-8' : 'p-6'
          }`}
        >
            
            {/* OVERVIEW TAB */}
            {initialView !== 'tracking' && activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Summary cards */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Kaizen No</div>
                      <div className="mt-2 text-sm font-bold text-slate-900 tabular-nums">
                        {suggestion.code || suggestion.id}
                      </div>
                      <div className="mt-3">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[suggestion.status]}`}>
                          {suggestion.status}
                        </span>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Current owner</div>
                      <div className="mt-2 text-sm font-bold text-slate-900">
                        {String(getCurrentOwner() || '—')}
                      </div>
                      <div className="mt-2 text-xs font-medium text-slate-500">
                        {suggestion.assignedImplementer ? `Implementer: ${suggestion.assignedImplementer}` : 'Implementer not assigned'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Next action</div>
                      <div className="mt-2 text-sm font-bold leading-snug text-slate-900">
                        {getActionRequired()}
                      </div>
                      <div className="mt-2 text-xs font-medium text-slate-500">
                        Submitted: {suggestion.dateSubmitted || '—'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Progress</div>
                      <div className="mt-2 text-sm font-bold tabular-nums text-slate-900">
                        {progressFloorEffective}%
                      </div>
                      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-kauvery-purple to-kauvery-violet"
                          style={{ width: `${progressFloorEffective}%` }}
                        />
                      </div>
                      <div className="mt-2 text-xs font-medium text-slate-500">
                        {suggestion.implementationStage || 'Started'}
                        {suggestion.implementationDeadline ? ` · Due ${suggestion.implementationDeadline}` : ''}
                      </div>
                    </div>
                  </div>

                  {/* Key details (useful, data-driven) */}
                  <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          Key details
                        </div>
                        <div className="mt-1 text-sm font-medium text-slate-600">
                          Quick context from the submitted idea.
                        </div>
                      </div>
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-kauvery-purple">
                        <span className="material-icons-round text-xl">info</span>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 p-3.5">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Unit</div>
                        <div className="mt-1.5 truncate text-sm font-semibold text-slate-900">
                          {suggestion.assignedUnit || suggestion.unit || '—'}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 p-3.5">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Department</div>
                        <div className="mt-1.5 truncate text-sm font-semibold text-slate-900">
                          {suggestion.assignedDepartment || suggestion.department || '—'}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 p-3.5">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Area</div>
                        <div className="mt-1.5 truncate text-sm font-semibold text-slate-900">
                          {suggestion.area || '—'}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 p-3.5">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Attachments</div>
                        <div className="mt-1.5 text-sm font-semibold text-slate-900">
                          {(Array.isArray(suggestion.ideaAttachmentPaths) ? suggestion.ideaAttachmentPaths.length : 0) +
                            (Array.isArray(suggestion.templateAttachmentPaths) ? suggestion.templateAttachmentPaths.length : 0)}
                        </div>
                        <div className="mt-1 text-xs font-medium text-slate-500">
                          Idea: {Array.isArray(suggestion.ideaAttachmentPaths) ? suggestion.ideaAttachmentPaths.length : 0} · Template: {Array.isArray(suggestion.templateAttachmentPaths) ? suggestion.templateAttachmentPaths.length : 0}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="text-[11px] font-extrabold uppercase text-gray-500 mb-2">Expected benefits</div>
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          const b = suggestion.expectedBenefits || ({} as any);
                          const items: Array<{ key: string; label: string }> = [
                            { key: 'productivity', label: 'Productivity' },
                            { key: 'quality', label: 'Quality' },
                            { key: 'cost', label: 'Cost' },
                            { key: 'delivery', label: 'Delivery' },
                            { key: 'safety', label: 'Safety' },
                            { key: 'energy', label: 'Energy' },
                            { key: 'environment', label: 'Environment' },
                            { key: 'morale', label: 'Morale' },
                          ];
                          const tierOf = (raw: unknown): 'primary' | 'secondary' | null => {
                            if (raw === 'secondary') return 'secondary';
                            if (raw === 'primary' || raw === true) return 'primary';
                            return null;
                          };
                          const picked = items
                            .map((x) => ({ ...x, tier: tierOf((b as any)[x.key]) }))
                            .filter((x) => x.tier !== null);
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
                              className={`text-[11px] font-black px-2.5 py-1 rounded-full border ${
                                x.tier === 'secondary'
                                  ? 'bg-amber-100 border-amber-300 text-amber-950'
                                  : 'bg-emerald-100 border-emerald-300 text-emerald-950'
                              }`}
                            >
                              {x.label}
                              {x.tier === 'secondary' ? ' (secondary)' : ' (primary)'}
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
                        <div className="text-lg font-black text-gray-900 mt-1">{displayHeading}</div>
                        <div className="text-sm text-gray-600 font-semibold mt-1">
                          Originator: <span className="text-gray-900 font-extrabold">{suggestion.employeeName}</span>
                          {suggestion.department ? ` (${suggestion.department})` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="bg-purple-50/45 border border-purple-200/70 rounded-xl p-4">
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
                  {(suggestion.screeningNotes ||
                    suggestion.coordinatorSuggestion ||
                    showAssignmentDenialNotes ||
                    suggestion.implementationUpdate) && (
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
                        {showAssignmentDenialNotes && (
                          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-gray-900">
                            <div className="text-[11px] uppercase font-extrabold text-rose-900 mb-1">
                              Implementer declined assignment
                            </div>
                            <div className="font-semibold whitespace-pre-wrap">
                              {suggestion.assignmentDenialNotes}
                            </div>
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
                  <div className="overflow-x-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
                    <div
                      className={`grid min-h-0 ${
                        isPageLayout
                          ? 'grid-cols-1 lg:grid-cols-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.1fr)_minmax(16rem,22rem)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_24rem] lg:min-h-[min(480px,calc(100dvh-14rem))] xl:min-h-[min(520px,calc(100dvh-16rem))]'
                          : 'grid-cols-1 lg:grid-cols-12 min-h-[500px]'
                      }`}
                    >
                      {/* Column 1 — workflow status + tracking flow */}
                      <div
                        className={`space-y-4 ${
                          isPageLayout
                            ? 'min-h-0 border-b border-slate-200/80 bg-slate-50/40 p-4 sm:p-6 lg:p-8 lg:border-b-0 lg:border-r'
                            : 'lg:col-span-4 border-r border-slate-200/80 bg-slate-50/40 p-6'
                        }`}
                      >
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-bold tracking-tight text-slate-900 xl:text-xl">
                              Workflow tracking
                            </h3>
                            <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-600 tabular-nums">
                              {suggestion.code || suggestion.id}
                            </span>
                          </div>
                          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-900/[0.03]">
                            <div className="flex flex-col gap-4">
                              <div>
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                  Current stage
                                </div>
                                <div className="mt-1.5 text-base font-bold leading-snug text-slate-900 xl:text-lg">
                                  {trackingStageTitle}
                                </div>
                                <div className="mt-1.5 text-sm font-medium text-slate-600">
                                  {trackingStageHint}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700">
                                  {suggestion.status}
                                </span>
                                <span className="inline-flex items-center rounded-full border border-kauvery-purple/20 bg-purple-50/80 px-3 py-1 text-[11px] font-semibold text-kauvery-purple">
                                  Owner: {String(getCurrentOwner() || '—')}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-900/[0.03]">
                            <div className="mb-3 flex items-start justify-between gap-3">
                              <div>
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                  Tracking flow
                                </div>
                                <div className="mt-1 text-sm font-medium text-slate-600">
                                  Every stage, owner, and next step in one place.
                                </div>
                              </div>
                            </div>
                            <div className="max-h-[min(45vh,26rem)] space-y-3 overflow-y-auto pr-1 lg:max-h-[min(50vh,28rem)]">
                              {workflowSteps.map((step, index) => {
                                const stateMeta = workflowStepStateMeta[step.state];
                                return (
                                  <div
                                    key={step.id}
                                    className={`rounded-lg border p-3 ${
                                      step.state === 'current'
                                        ? 'border-blue-200 bg-blue-50/80'
                                        : step.state === 'done'
                                        ? 'border-emerald-200 bg-emerald-50/70'
                                        : step.state === 'skipped'
                                        ? 'border-amber-200 bg-amber-50/70'
                                        : 'border-slate-200 bg-slate-50/70'
                                    }`}
                                  >
                                    <div className="flex items-start gap-3">
                                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-[11px] font-bold text-slate-600">
                                        {index + 1}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <div className="text-sm font-semibold text-slate-900">
                                            {step.title}
                                          </div>
                                          <span
                                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${stateMeta.badgeClass}`}
                                          >
                                            <span className="material-icons-round text-[12px]">
                                              {stateMeta.icon}
                                            </span>
                                            {stateMeta.label}
                                          </span>
                                        </div>
                                        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                          Owner: {step.owner}
                                        </div>
                                        <div className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
                                          {step.detail}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Column 2 — idea summary, remarks, thread, comments */}
                      <div
                        className={`min-h-0 space-y-4 ${
                          isPageLayout
                            ? 'border-b border-slate-200/80 bg-white p-4 sm:p-6 lg:p-8 lg:border-b-0 lg:border-r'
                            : 'lg:col-span-4 border-r border-slate-200/80 bg-white p-6'
                        }`}
                      >
                        <div className="mb-4 rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
                          <div className="border-b border-slate-100 pb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            Suggestion summary
                          </div>
                          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {[
                              { label: 'Originator', value: suggestion.employeeName },
                              { label: 'Department', value: suggestion.department },
                              { label: 'Area', value: suggestion.area },
                              { label: 'Submitted', value: suggestion.dateSubmitted },
                            ].map((row) => (
                              <div
                                key={row.label}
                                className="flex min-h-[4rem] flex-col justify-center rounded-lg border border-slate-200/80 bg-slate-50/60 px-3 py-3 sm:px-4"
                              >
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                  {row.label}
                                </div>
                                <div className="mt-1 break-words text-sm font-semibold leading-snug text-slate-900">
                                  {row.value || '—'}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-4 rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 py-3 sm:px-4 sm:py-3.5">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                              Description
                            </div>
                            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-700 whitespace-pre-wrap">
                              {suggestion.description || '—'}
                            </p>
                          </div>
                        </div>

                        {(suggestion.screeningNotes ||
                    suggestion.coordinatorSuggestion ||
                    showAssignmentDenialNotes ||
                    suggestion.implementationUpdate) && (
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
                            {showAssignmentDenialNotes && (
                              <div className="text-xs text-gray-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                                <span className="font-bold text-rose-900">Implementer declined assignment:</span>{' '}
                                {suggestion.assignmentDenialNotes}
                              </div>
                            )}
                            {suggestion.implementationUpdate && (
                              <div className="text-xs text-gray-700 bg-purple-50 border border-purple-200 rounded-lg p-2.5">
                                <span className="font-bold text-purple-900">Implementer Update:</span> {suggestion.implementationUpdate}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="mb-4 overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
                          <div className="border-b border-slate-200/80 bg-slate-50/80 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600 sm:px-5">
                            Workflow thread
                          </div>
                          <div
                            className={`space-y-4 overflow-y-auto p-4 sm:p-5 ${
                              isPageLayout ? 'max-h-[min(42vh,22rem)] xl:max-h-[min(50vh,28rem)]' : 'max-h-56'
                            }`}
                          >
                            {visibleWorkflowThread.length === 0 ? (
                              <div className="text-xs font-medium text-slate-500">No workflow updates yet.</div>
                            ) : (
                              visibleWorkflowThread.map(item => (
                                <div key={item.id} className="relative flex gap-3">
                                  <div className="absolute bottom-[-12px] left-[11px] top-7 w-px bg-slate-200" />
                                  <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-bold text-kauvery-purple">
                                    {String(item.actor || 'S').trim().charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0 flex-1 rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 py-2">
                                    <div className="text-xs font-medium leading-relaxed text-slate-800">{item.text}</div>
                                    <div className="mt-1 text-[10px] text-slate-500">
                                      {item.actor} ({item.role}) · {new Date(item.date).toLocaleString()}
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="border-t border-slate-200/80 pt-4">
                          <div className="flex items-start gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-bold text-slate-600">
                              {role.charAt(0)}
                            </div>
                            <textarea
                              rows={3}
                              value={commentDraft}
                              onChange={e => setCommentDraft(e.target.value)}
                              placeholder="Add a comment or update..."
                              className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm font-medium text-slate-900 outline-none ring-kauvery-purple/30 transition-shadow focus:border-kauvery-purple/40 focus:ring-2"
                            />
                          </div>
                          <div className="mt-3 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleAddNote}
                              disabled={!commentDraft.trim()}
                              className={`rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-sm transition-opacity ${
                                commentDraft.trim()
                                  ? 'bg-gradient-to-r from-kauvery-purple to-kauvery-violet hover:opacity-95'
                                  : 'cursor-not-allowed bg-slate-300 opacity-70'
                              }`}
                            >
                              Add note
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Column 3 — progress, approvals, implementation */}
                      <div
                        className={`space-y-4 ${
                          isPageLayout
                            ? 'min-h-0 border-t border-slate-200/80 bg-slate-50/50 p-4 sm:p-5 lg:p-6 lg:sticky lg:top-0 lg:max-h-[calc(100dvh-14rem)] lg:self-start lg:overflow-y-auto lg:border-t-0 xl:max-h-[calc(100dvh-16rem)]'
                            : 'lg:col-span-4 space-y-4 border-l border-slate-200/80 bg-slate-50/50 p-5'
                        }`}
                      >
                        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                Stage summary
                              </div>
                              <div className="mt-1.5 text-base font-bold leading-tight text-slate-900">
                                {trackingStageTitle}
                              </div>
                              <div className="mt-1 text-sm font-medium text-slate-600">
                                {trackingStageHint}
                              </div>
                            </div>
                            <span className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                              {suggestion.status}
                            </span>
                          </div>
                          <div className="mt-4">
                            <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                              <span>Overall progress</span>
                              <span className="tabular-nums text-slate-800">{workflowProgressPercent}%</span>
                            </div>
                            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-kauvery-purple to-kauvery-violet"
                                style={{ width: `${workflowProgressPercent}%` }}
                              />
                            </div>
                          </div>
                          <div className="mt-4 grid grid-cols-1 gap-3">
                            <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 p-3">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                Current owner
                              </div>
                              <div className="mt-1 text-sm font-semibold text-slate-900">
                                {String(getCurrentOwner() || '—')}
                              </div>
                            </div>
                            <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 p-3">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                Action required
                              </div>
                              <div className="mt-1 text-sm font-semibold leading-snug text-slate-900">
                                {getActionRequired()}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            Approval route
                          </div>
                          <div className="mt-2 text-sm font-medium text-slate-800">
                            {approvalRouteSummary}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                              {activeApprovalStageLabel}
                            </span>
                            {level1Approvals.length > 0 && (
                              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-900">
                                L1: {level1Approved.length}/{level1Approvals.length}
                              </span>
                            )}
                            {level2Approvals.length > 0 && (
                              <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-black text-cyan-900">
                                L2: {level2Approved.length}/{level2Approvals.length}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
                          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            Approval details
                          </div>
                          {!approvalsRequired ? (
                            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-3 text-sm font-medium text-slate-600">
                              No Level 1 or Level 2 approvals were configured for this idea.
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {level1Approvals.length > 0 && (
                                <div>
                                  <div className="flex items-center justify-between gap-2 mb-2">
                                    <div className="text-xs font-black uppercase tracking-wide text-amber-900">
                                      Level 1 department sign-offs
                                    </div>
                                    <div className="text-[11px] font-black text-amber-900">
                                      {level1Approved.length}/{level1Approvals.length} completed
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    {level1Approvals.map((row) => {
                                      const signed = Boolean(String(row?.approvedAt ?? '').trim());
                                      return (
                                        <div
                                          key={row.id}
                                          className={`rounded-xl border p-3 ${
                                            signed
                                              ? 'border-emerald-200 bg-emerald-50/70'
                                              : 'border-amber-200 bg-amber-50/70'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between gap-2">
                                            <div className="text-sm font-black text-gray-900">
                                              {row.department || 'Department'}
                                            </div>
                                            <span
                                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                                                signed
                                                  ? 'border-emerald-300 bg-white text-emerald-800'
                                                  : 'border-amber-300 bg-white text-amber-900'
                                              }`}
                                            >
                                              {signed ? 'Signed off' : 'Pending'}
                                            </span>
                                          </div>
                                          <div className="mt-1 text-xs font-semibold text-gray-700">
                                            Approver: {row.approverName || 'Not assigned'}
                                            {row.approverEmployeeCode
                                              ? ` (${row.approverEmployeeCode})`
                                              : ''}
                                          </div>
                                          {signed && (
                                            <div className="mt-1 text-[11px] font-semibold text-gray-600">
                                              Signed by {row.approvedBy || row.approverName || '—'} on{' '}
                                              {formatTrackingDate(row.approvedAt)}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {level2Approvals.length > 0 && (
                                <div>
                                  <div className="flex items-center justify-between gap-2 mb-2">
                                    <div className="text-xs font-black uppercase tracking-wide text-cyan-900">
                                      Level 2 functional approvals
                                    </div>
                                    <div className="text-[11px] font-black text-cyan-900">
                                      {level2Approved.length}/{level2Approvals.length} completed
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    {level2ApprovalDetails.map((item) => (
                                      <div
                                        key={item.role}
                                        className={`rounded-xl border p-3 ${
                                          item.approved
                                            ? 'border-emerald-200 bg-emerald-50/70'
                                            : 'border-cyan-200 bg-cyan-50/70'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="text-sm font-black text-gray-900">
                                            {item.role}
                                          </div>
                                          <span
                                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                                              item.approved
                                                ? 'border-emerald-300 bg-white text-emerald-800'
                                                : 'border-cyan-300 bg-white text-cyan-900'
                                            }`}
                                          >
                                            {item.approved ? 'Approved' : 'Pending'}
                                          </span>
                                        </div>
                                        <div className="mt-1 text-xs font-semibold text-gray-700">
                                          Selected approver: {item.approverName || 'Not specified'}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
                          <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            Implementation context
                          </div>
                          <div className="grid grid-cols-1 gap-3">
                            <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 p-3">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                Assigned to
                              </div>
                              <div className="mt-1 text-sm font-semibold text-slate-900">
                                {suggestion.assignedImplementer || 'Not assigned'}
                              </div>
                            </div>
                            <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 p-3">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                Reporting to
                              </div>
                              <div className="mt-1 text-sm font-semibold text-slate-900">
                                {reportingTo || '—'}
                              </div>
                              <div className="mt-1 text-[10px] font-medium text-slate-500">
                                Based on implementer manager from HRMS.
                              </div>
                            </div>
                            <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                    Progress
                                  </div>
                                  <div className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                                    {progressFloorEffective}%
                                  </div>
                                </div>
                                <div className="text-[11px] font-medium text-slate-600">
                                  {suggestion.implementationStage || 'Started'}
                                </div>
                              </div>
                              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-kauvery-purple to-kauvery-violet"
                                  style={{ width: `${progressFloorEffective}%` }}
                                />
                              </div>
                              <div className="mt-2 text-[11px] font-medium text-slate-500">
                                Last update: {suggestion.implementationUpdateDate || 'NA'}
                              </div>
                            </div>
                            <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 p-3">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                Deadline
                              </div>
                              <div className="mt-1 text-sm font-semibold text-slate-900">
                                {suggestion.implementationDeadline || '—'}
                              </div>
                              {suggestion.deadlineChangeRemark && (
                                <div className="mt-1 text-[11px] font-medium text-slate-600">
                                  Remark: {suggestion.deadlineChangeRemark}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : renderActionStatusSummaryPanel()}

                {/* 1. UNIT COORDINATOR: Approve Initial Idea */}
                {role === Role.UNIT_COORDINATOR && suggestion.status === Status.IDEA_SUBMITTED && (
                  <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <h4 className="text-sm font-black text-gray-900 mb-2">Idea Screening</h4>
                    <p className="text-xs text-gray-600 mb-3 font-semibold">Review the submitted idea and record your decision.</p>
                    <label className="text-xs font-extrabold text-gray-700 block mb-1">
                      Idea heading <span className="text-red-600 font-black">*</span>
                    </label>
                    <input
                      type="text"
                      value={ucApprovalHeading}
                      onChange={(e) => setUcApprovalHeading(e.target.value)}
                      maxLength={255}
                      placeholder="Short title for this idea (stored as the Kaizen heading)"
                      className="w-full border border-gray-300 bg-white rounded-lg px-3 py-2 text-sm mb-3 focus:ring-2 focus:ring-kauvery-purple outline-none text-gray-900 font-medium"
                    />
                    <label className="text-xs font-extrabold text-gray-700 block mb-1">
                      Category <span className="text-red-600 font-black">*</span>
                    </label>
                    <p className="text-[11px] text-gray-500 mb-2 font-semibold">
                      Stored on the suggestion record for reporting (Clinical vs Supportive).
                    </p>
                    <div className="flex flex-wrap gap-4 mb-3">
                      <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800 cursor-pointer">
                        <input
                          type="radio"
                          name="ucScreeningCategory"
                          checked={ucScreeningCategory === 'Clinical'}
                          onChange={() => setUcScreeningCategory('Clinical')}
                          className="text-kauvery-purple focus:ring-kauvery-purple"
                        />
                        Clinical
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800 cursor-pointer">
                        <input
                          type="radio"
                          name="ucScreeningCategory"
                          checked={ucScreeningCategory === 'Supportive'}
                          onChange={() => setUcScreeningCategory('Supportive')}
                          className="text-kauvery-purple focus:ring-kauvery-purple"
                        />
                        Supportive
                      </label>
                    </div>
                    <label className="text-xs font-extrabold text-gray-700 block mb-1">
                      Validation notes <span className="text-gray-500 font-semibold">(required when rejecting)</span>
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full border border-gray-300 bg-white rounded-lg p-3 text-sm mb-3 focus:ring-2 focus:ring-kauvery-purple outline-none text-gray-900 font-medium"
                      placeholder="Notes for approval; remarks required if you reject…"
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
                    {suggestion.assignmentDenialNotes && (
                      <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950">
                        <div className="text-[11px] font-black uppercase tracking-wide text-rose-800">
                          Previous implementer declined
                        </div>
                        <p className="mt-1 font-semibold whitespace-pre-wrap">
                          {suggestion.assignmentDenialNotes}
                        </p>
                        <p className="mt-2 text-xs font-semibold text-rose-800/90">
                          Assign a different implementer or follow up with the unit before reassigning.
                        </p>
                      </div>
                    )}
                    <p className="text-xs text-gray-600 mb-4 font-semibold">
                      Select unit and department first, then choose the implementer from the list.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="text-xs font-extrabold text-gray-700 block mb-1">Unit</label>
                        <SearchableSelect
                          aria-label="Assign unit"
                          value={assignUnit}
                          onChange={(v) => {
                            setAssignUnit(v);
                            setImplementerDept('');
                            setImplementerName('');
                            setImplementerEmployeeCode('');
                          }}
                          emptyOptionLabel="Select unit..."
                          options={unitOptions.map((u) => ({ value: u.code, label: u.name }))}
                          placeholder="Search units…"
                          inputClassName="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 font-medium bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-extrabold text-gray-700 block mb-1">Department</label>
                        <SearchableSelect
                          aria-label="Assign department"
                          value={implementerDept}
                          onChange={(v) => {
                            setImplementerDept(v);
                            setImplementerName('');
                            setImplementerEmployeeCode('');
                          }}
                          emptyOptionLabel="Select department..."
                          options={departmentOptions.map((d) => ({ value: d.name, label: d.name }))}
                          placeholder="Search departments…"
                          inputClassName="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 font-medium bg-white"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-xs font-extrabold text-gray-700 block mb-1">Implementer Name</label>
                        <SearchableSelect
                          aria-label="Implementer"
                          value={implementerEmployeeCode}
                          onChange={(code) => {
                            setImplementerEmployeeCode(code);
                            const picked = implementerOptions.find((x) => x.employeeCode === code);
                            setImplementerName(picked?.name || '');
                          }}
                          disabled={!assignUnit || !implementerDept || implementerOptions.length === 0}
                          emptyOptionLabel={
                            !assignUnit || !implementerDept
                              ? 'Select unit and department first'
                              : implementerOptions.length === 0
                                ? 'No users listed for this combination'
                                : 'Select implementer...'
                          }
                          options={implementerOptions.map((u) => ({
                            value: u.employeeCode,
                            label: `${u.name} (${u.employeeCode})`,
                          }))}
                          placeholder="Search implementers…"
                          inputClassName="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 font-medium bg-white disabled:bg-gray-100 disabled:text-gray-500"
                        />
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
                  <div className="space-y-4">
                  {canImplementerUpdateWorkingStatus && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-4">
                      <h4 className="text-sm font-black text-rose-950 mb-1">Decline assignment</h4>
                      <p className="text-xs font-semibold text-rose-900/90 mb-3">
                        If you cannot take this work, explain why. The idea returns to the Selection Committee
                        for reassignment.
                      </p>
                      <textarea
                        rows={3}
                        value={assignmentDenialReason}
                        onChange={(e) => setAssignmentDenialReason(e.target.value)}
                        placeholder="Reason for declining (required)..."
                        className="w-full rounded-lg border border-rose-200 bg-white p-3 text-sm text-gray-900 font-medium outline-none focus:ring-2 focus:ring-rose-300"
                      />
                      <button
                        type="button"
                        onClick={handleDenyAssignment}
                        className="mt-3 rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-black text-rose-800 hover:bg-rose-100"
                      >
                        Decline & return to Selection Committee
                      </button>
                    </div>
                  )}
                  <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <h4 className="text-lg font-black text-gray-900 mb-2">Implementation Progress</h4>
                    <p className="text-sm text-gray-600 mb-4 font-semibold">
                      Completion % updates automatically when you save the implementation template (Save draft on the
                      report). Optionally note status and blockers below — progress itself is not edited manually.
                    </p>
                    {suggestion.beEditedFields && suggestion.beEditedFields.length > 0 && (
                      <div className="mb-4 text-xs bg-amber-50 border border-amber-200 rounded p-2.5 text-amber-900">
                        <span className="font-bold">BE changed fields:</span> {suggestion.beEditedFields.join(', ')}
                      </div>
                    )}

                    {!canImplementerUpdateWorkingStatus && (
                      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 font-semibold">
                        Status notes and deadline changes are only available to the assigned implementer
                        {suggestion.assignedImplementer ? ` (${suggestion.assignedImplementer}).` : '.'}
                      </p>
                    )}

                    {canImplementerUpdateWorkingStatus
                      ? (
                    <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="text-xs font-extrabold text-gray-700 block mb-1">Current Status</label>
                        <SearchableSelect
                          aria-label="Implementation stage"
                          value={implementationStage}
                          onChange={(v) =>
                            setImplementationStage(v as 'Started' | 'In Progress' | 'Completed')
                          }
                          options={[
                            { value: 'Started', label: 'Started' },
                            { value: 'In Progress', label: 'In Progress' },
                            { value: 'Completed', label: 'Completed' },
                          ]}
                          placeholder="Search status…"
                          inputClassName="w-full border border-gray-300 bg-white rounded-lg px-3 py-2 text-sm text-gray-900 font-medium"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-extrabold text-gray-700 block mb-1">Progress (automatic)</label>
                        <div className="text-lg font-black text-kauvery-purple">{progressFloorEffective}%</div>
                        <div className="mt-1 w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-kauvery-purple transition-[width] duration-300"
                            style={{ width: `${progressFloorEffective}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1.5 leading-snug">
                          From saved template content. Use Save draft in the implementation report to raise this.
                        </div>
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
                        {(() => {
                          const assignBase =
                            suggestion.implementationAssignedDate || suggestion.dateSubmitted || '';
                          const deadlineMaxStr = assignBase
                            ? addCalendarDaysToIsoDate(assignBase, MAX_DEADLINE_EXTENSION_DAYS)
                            : null;
                          const storedDl = suggestion.implementationDeadline || '';
                          const storedPastWindow =
                            Boolean(deadlineMaxStr && storedDl && storedDl > deadlineMaxStr);
                          const dateInputValue =
                            deadlineChangeDate ||
                            (storedPastWindow ? '' : storedDl);
                          return (
                            <>
                              {storedPastWindow && (
                                <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-2 font-semibold">
                                  Saved deadline {storedDl} is outside the allowed range (assignment +{' '}
                                  {MAX_DEADLINE_EXTENSION_DAYS} days). Choose a new date below (latest{' '}
                                  {deadlineMaxStr}).
                                </p>
                              )}
                              <input
                                type="date"
                                value={dateInputValue}
                                min={assignBase || undefined}
                                max={deadlineMaxStr ?? undefined}
                                onChange={(e) => setDeadlineChangeDate(e.target.value)}
                                className="w-full border border-gray-300 bg-white rounded-lg px-3 py-2 text-sm text-gray-900 font-medium"
                              />
                            </>
                          );
                        })()}
                      </div>
                      <div>
                        <label className="text-xs font-extrabold text-gray-700 block mb-1">
                          Deadline change remark <span className="text-red-600">(required)</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={deadlineChangeRemark}
                          onChange={e => setDeadlineChangeRemark(e.target.value)}
                          placeholder="Reason for extending or changing the deadline"
                          className="w-full border border-gray-300 bg-white rounded-lg px-3 py-2 text-sm text-gray-900 font-medium"
                        />
                      </div>
                    </div>
                    <div className="text-[10px] text-gray-500 mb-3">
                      You can only choose a deadline from the assignment date through{' '}
                      {MAX_DEADLINE_EXTENSION_DAYS} calendar days after assignment (
                      {suggestion.implementationAssignedDate || suggestion.dateSubmitted || '—'}
                      {(() => {
                        const base = suggestion.implementationAssignedDate || suggestion.dateSubmitted;
                        const end = base ? addCalendarDaysToIsoDate(base, MAX_DEADLINE_EXTENSION_DAYS) : null;
                        return end ? ` → ${end}` : '';
                      })()}
                      ). Remark is required when saving a new deadline.
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleImplementerWorkStatusSave}
                        className="bg-white text-gray-800 px-4 py-2 rounded-lg text-sm font-bold border border-gray-300 hover:bg-gray-100"
                      >
                        Save status & notes
                      </button>
                      <button onClick={handleImplementerDeadlineChange} className="bg-white text-gray-800 px-4 py-2 rounded-lg text-sm font-bold border border-gray-300 hover:bg-gray-100">
                        Update Deadline
                      </button>
                      <button
                        onClick={() => {
                          if (onOpenTemplatePage) {
                            onOpenTemplatePage(suggestion, { edit: true });
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
                      <div>Progress: <span className="font-bold">{progressFloorEffective}%</span></div>
                      {suggestion.implementationUpdate && (
                        <div className="text-xs text-gray-600 border border-gray-200 rounded p-2 bg-gray-50">
                          <span className="font-bold">Latest update:</span> {suggestion.implementationUpdate}
                        </div>
                      )}
                    </div>
                      )}
                  </div>
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
                    <p className="text-xs text-gray-600 mb-4 font-semibold">
                      <span className="font-black">Level 1</span> (optional): full department list for this unit plus the HRMS
                      master catalog — pick a department, then the <span className="font-black">admin-assigned HOD</span> for
                      that department + unit. <span className="font-black">Level 2</span> (required): only{' '}
                      <span className="font-black">Finance Head</span>, <span className="font-black">Ops Head</span>, and{' '}
                      <span className="font-black">Nursing</span> — each needs a unit-scoped portal user. Functional heads act
                      only after Level 1 is complete when Level 1 is used.
                    </p>

                    <div className="mb-4">
                      <label className="text-xs font-extrabold text-gray-700 block mb-1">
                        Idea heading <span className="text-red-600 font-black">*</span>
                      </label>
                      <input
                        type="text"
                        value={ucApprovalHeading}
                        onChange={(e) => setUcApprovalHeading(e.target.value)}
                        maxLength={255}
                        placeholder="Confirm or edit the Kaizen heading before routing"
                        className="w-full border border-gray-300 bg-white rounded-lg px-3 py-2 text-sm mb-1 focus:ring-2 focus:ring-kauvery-purple outline-none text-gray-900 font-medium"
                      />
                      <p className="text-[11px] text-gray-500 mb-3">Stored on the idea record with your decision.</p>
                    </div>

                    {/* Level 1 first — department → named approver */}
                    <div className="mb-5 rounded-xl border-2 border-amber-200 bg-amber-50/40 p-4">
                      <label className="text-xs font-extrabold text-amber-950 block mb-1">
                        Level 1 — Department sign-offs <span className="text-gray-600 font-semibold">(optional)</span>
                      </label>
                      <p className="text-[11px] text-amber-900/90 mb-2 font-semibold">
                        Departments include the full HRMS master list plus any extra names seen on employees at this unit.
                        The approver list is limited to the <span className="font-black">department HOD assigned by Admin</span>{' '}
                        for the selected department + unit. Unit:{' '}
                        <span className="font-black">
                          {String(suggestion.assignedUnit || suggestion.unit || '').trim() || '—'}
                        </span>
                        {l1DeptCatalogLoading ? ' · Loading catalog…' : ''}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                        <SearchableSelect
                          aria-label="Level 1 department"
                          value={selectedMasterDeptL1}
                          onChange={(v) => {
                            setSelectedMasterDeptL1(v);
                            setSelectedHodEmpCodeL1('');
                          }}
                          emptyOptionLabel="Department…"
                          options={[...level1DepartmentChoices]
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map((d) => ({ value: d.name, label: d.name }))}
                          placeholder="Search departments…"
                          inputClassName="w-full border border-amber-300 rounded-lg px-2 py-2 text-xs font-medium text-gray-900 bg-white"
                        />
                        <SearchableSelect
                          aria-label="Level 1 named approver"
                          value={selectedHodEmpCodeL1}
                          onChange={setSelectedHodEmpCodeL1}
                          disabled={!selectedMasterDeptL1 || hodLoadingL1}
                          emptyOptionLabel={hodLoadingL1 ? 'Loading staff in department…' : 'Named approver…'}
                          options={hodOptionsL1.map((u) => ({
                            value: u.employeeCode,
                            label: `${u.name} (${u.employeeCode})`,
                          }))}
                          placeholder="Search approvers…"
                          inputClassName="w-full border border-amber-300 rounded-lg px-2 py-2 text-xs font-medium text-gray-900 bg-white disabled:bg-amber-100/80"
                        />
                      </div>
                      {selectedMasterDeptL1 && !hodLoadingL1 && hodOptionsL1.length === 0 && (
                        <p className="text-[11px] text-amber-950 mb-2 font-semibold">
                          No department HOD is assigned for this department + unit. In User Management, assign{' '}
                          <span className="font-black">HOD - {selectedMasterDeptL1 || 'Department'}</span> and choose the unit
                          code for the intended approver.
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={addDepartmentSlotFromPicker}
                        className="w-full sm:w-auto px-3 py-2 rounded-lg text-xs font-black border border-amber-600 text-amber-950 bg-white hover:bg-amber-100"
                      >
                        Add to Level 1 list
                      </button>
                      {departmentApprovalSlots.length > 0 && (
                        <ul className="mt-3 space-y-1.5 text-[11px] text-gray-800 font-semibold">
                          {departmentApprovalSlots.map((s) => (
                            <li
                              key={s.id}
                              className="flex items-center justify-between gap-2 rounded-md bg-white border border-amber-200 px-2 py-1.5"
                            >
                              <span>
                                <span className="font-black text-amber-900">L1</span> · {s.department} — {s.approverName}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeDepartmentSlot(s.id)}
                                className="text-red-700 hover:underline font-bold shrink-0"
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Level 2 — Finance / Ops / Nursing routes only */}
                    <div className="mb-4 rounded-xl border-2 border-purple-200/60 bg-purple-50/60 p-4">
                      <label className="text-xs font-extrabold text-gray-900 block mb-1">
                        Level 2 — Functional heads <span className="text-gray-600 font-semibold">(optional)</span>
                      </label>
                      <p className="text-[11px] text-gray-600 mb-3 font-semibold">
                        Level 2 is only <span className="font-black">Finance Head</span>,{' '}
                        <span className="font-black">Ops Head</span>, or <span className="font-black">Nursing</span>. This
                        section is optional. If you leave it empty, the flow goes to BE Head evaluation after Level 1
                        finishes (or immediately if Level 1 is also empty). Pick the route, then the portal user who
                        holds that role with a unit scope for{' '}
                        <span className="font-black text-gray-800">
                          {String(suggestion.assignedUnit || suggestion.unit || '').trim() || '—'}
                        </span>
                        .
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                        <SearchableSelect
                          aria-label="Level 2 route"
                          value={selectedLevel2Role}
                          onChange={(v) => {
                            setSelectedLevel2Role((v || '') as Role | '');
                            setSelectedHodEmpCodeL2('');
                          }}
                          emptyOptionLabel="Route…"
                          options={LEVEL_2_APPROVAL_ROUTES.map((r) => ({ value: r.role, label: r.label }))}
                          placeholder="Search routes…"
                          inputClassName="w-full border border-gray-300 rounded-lg px-2 py-2 text-xs font-medium text-gray-900 bg-white"
                        />
                        <SearchableSelect
                          aria-label="Level 2 named head"
                          value={selectedHodEmpCodeL2}
                          onChange={setSelectedHodEmpCodeL2}
                          disabled={!selectedLevel2Role || hodLoadingL2}
                          emptyOptionLabel={hodLoadingL2 ? 'Loading unit-scoped heads…' : 'Named head…'}
                          options={hodOptionsL2.map((u) => ({
                            value: u.employeeCode,
                            label: `${u.name} (${u.employeeCode})`,
                          }))}
                          placeholder="Search heads…"
                          inputClassName="w-full border border-gray-300 rounded-lg px-2 py-2 text-xs font-medium text-gray-900 bg-white disabled:bg-gray-100"
                        />
                      </div>
                      {selectedLevel2Role && !hodLoadingL2 && hodOptionsL2.length === 0 && (
                        <p className="text-[11px] text-gray-700 mb-2 font-semibold">
                          No portal users with this head role scoped to this unit. Assign Finance / Ops / Nursing head roles and
                          unit scopes in User Management.
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={addFunctionalSlotFromPicker}
                        className="w-full sm:w-auto px-3 py-2 rounded-lg text-xs font-black border border-kauvery-purple text-kauvery-purple bg-white hover:bg-purple-50"
                      >
                        Add to Level 2 list
                      </button>
                      {functionalApprovalSlots.length > 0 && (
                        <ul className="mt-3 space-y-1.5 text-[11px] text-gray-700 font-semibold">
                          {functionalApprovalSlots.map((s) => (
                            <li
                              key={s.id}
                              className="flex items-center justify-between gap-2 rounded-md bg-white border border-purple-200/60 px-2 py-1.5"
                            >
                              <span>
                                <span className="font-black text-kauvery-purple">L2</span> · {s.department} —{' '}
                                {s.approverName}{' '}
                                <span className="text-gray-500 font-medium">({hodRoleLabel(s.role)})</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => removeFunctionalSlot(s.id)}
                                className="text-red-700 hover:underline font-bold shrink-0"
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="mb-4">
                      <label className="text-xs font-extrabold text-gray-700 block mb-1">Coordinator remarks (optional)</label>
                      <textarea
                        value={coordinatorSuggestion}
                        onChange={e => setCoordinatorSuggestion(e.target.value)}
                        rows={2}
                        placeholder="Suggestion for implementer / audit note…"
                        className="w-full border border-gray-300 bg-white rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-kauvery-purple text-gray-900 font-medium"
                      />
                    </div>

                    <div className="mb-4 bg-purple-50/45 p-3 rounded-lg border border-gray-200">
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
                        Send forward (Level 1 if listed → optional Level 2 → BE Head)
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

                {/* Level 1 — named department approvers (same status PATCH) */}
                {suggestion.status === Status.VERIFIED_PENDING_APPROVAL &&
                  pendingDepartmentL1ForUser(
                    suggestion,
                    currentUserName,
                    implementationActorUser?.employeeCode,
                  ) && (
                    <div className="bg-amber-50 p-5 rounded-xl border border-amber-200 shadow-sm">
                      <h4 className="text-sm font-black text-amber-950 mb-2">Level 1 — Your department sign-off</h4>
                      <p className="text-xs text-amber-900/90 mb-3 font-semibold">
                        You are named as an approver for this idea. Approve when satisfied; functional heads act only after
                        all Level 1 sign-offs complete.
                      </p>
                      <ul className="space-y-2 mb-3">
                        {(suggestion.departmentApprovals || [])
                          .filter(
                            (row) =>
                              !String(row?.approvedAt ?? '').trim() &&
                              userMatchesDepartmentSlot(
                                row,
                                currentUserName,
                                implementationActorUser?.employeeCode,
                              ),
                          )
                          .map((row) => (
                            <li
                              key={row.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-gray-900"
                            >
                              <span>
                                {row.department} — <span className="font-black">{row.approverName}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => void handleDepartmentL1Approve(row.id)}
                                className="bg-kauvery-purple text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-kauvery-violet"
                              >
                                Sign off
                              </button>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}

                {/* Functional approvals — Level 2 (Finance / Ops / Nursing; legacy Quality/HR if still on the idea) */}
                {[
                  Role.FINANCE_HOD,
                  Role.QUALITY_HOD,
                  Role.HR_HEAD,
                  Role.OPS_HEAD,
                  Role.NURSING_HEAD,
                ].includes(role) &&
                  suggestion.status === Status.VERIFIED_PENDING_APPROVAL &&
                  isL2ApprovalPhase(suggestion) &&
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
                    <div className="text-sm text-green-900 font-black uppercase mb-2">BE reward recommendation</div>
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

                    {suggestion.hrRewardValidationImagePath &&
                      suggestion.status === Status.REWARDED && (
                        <div className="mt-4 pt-4 border-t border-green-200 text-left">
                          <div className="text-[11px] font-black uppercase text-green-900 mb-2 text-center">
                            HR reward validation photo
                          </div>
                          <a
                            href={`${apiBase}/kaizen-files/${String(suggestion.hrRewardValidationImagePath).replace(/^\/+/, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="block rounded-lg overflow-hidden border border-green-200 bg-white"
                          >
                            <img
                              src={`${apiBase}/kaizen-files/${String(suggestion.hrRewardValidationImagePath).replace(/^\/+/, '')}`}
                              alt="HR reward validation"
                              className="w-full max-h-64 object-contain mx-auto"
                            />
                          </a>
                        </div>
                      )}

                    {(role === Role.HR_HEAD || role === Role.UNIT_COORDINATOR) && suggestion.status === Status.REWARD_PENDING && (
                      <div className="mt-4 pt-4 border-t border-green-200 text-left space-y-3">
                        <div>
                          <div className="text-xs font-black text-amber-900 uppercase tracking-wide text-center">
                            HR validation — reward photo required
                          </div>
                          <p className="text-[11px] text-amber-800/90 font-semibold text-center mt-1">
                            Upload a picture of the reward (e.g. voucher / presentation) before closing this idea.
                          </p>
                        </div>
                        {String(suggestion.hrRewardValidationImagePath ?? '').trim() ? (
                          <div className="rounded-lg overflow-hidden border border-amber-200 bg-white">
                            <img
                              src={`${apiBase}/kaizen-files/${String(suggestion.hrRewardValidationImagePath).replace(/^\/+/, '')}`}
                              alt="Reward validation preview"
                              className="w-full max-h-56 object-contain mx-auto"
                            />
                            <p className="text-[10px] text-center text-gray-600 font-semibold py-2">
                              Photo on file — choose another image to replace it.
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs font-bold text-red-700 text-center">No validation photo yet.</p>
                        )}
                        <label className="flex flex-col items-center gap-2 cursor-pointer">
                          <span className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-amber-400 bg-white text-amber-950 text-xs font-black hover:bg-amber-50 disabled:opacity-50">
                            {uploadingHrRewardPhoto ? 'Uploading…' : 'Choose reward photo'}
                          </span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            disabled={uploadingHrRewardPhoto}
                            className="sr-only"
                            onChange={(e) => void handleHrRewardPhotoSelected(e.target.files)}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={handleProcessReward}
                          disabled={
                            uploadingHrRewardPhoto ||
                            !String(suggestion.hrRewardValidationImagePath ?? '').trim()
                          }
                          className={`w-full mt-2 px-6 py-2.5 rounded-full font-bold shadow-lg border transition-colors ${
                            String(suggestion.hrRewardValidationImagePath ?? '').trim()
                              ? 'bg-kauvery-pink text-white hover:bg-red-600 border-red-700'
                              : 'bg-gray-200 text-gray-500 border-gray-300 cursor-not-allowed'
                          }`}
                        >
                          Process Payment & Intimate Employee
                        </button>
                      </div>
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
                        {suggestion.code || suggestion.id} — {displayHeading}
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
                    <div className="rounded-xl border border-gray-200 bg-purple-50/45 p-4">
                      <div className="text-xs font-extrabold uppercase text-gray-600">Final PPT</div>
                      <div className="text-[11px] font-mono text-gray-600 mt-1 truncate">
                        {finalPptPath ? finalPptPath.split('/').pop() : 'Not uploaded'}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setTemplateAssetPreview('ppt');
                            setIsTemplatePreviewMode(true);
                          }}
                          disabled={!hasSubmittedTemplate}
                          className={`px-3 py-2 rounded-lg text-xs font-black border ${
                            hasSubmittedTemplate
                              ? 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50'
                              : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          Preview
                        </button>
                        <a
                          href={finalPptPath ? `${apiBase}/kaizen-files/${finalPptPath}` : undefined}
                          download
                          className={`px-3 py-2 rounded-lg text-xs font-black ${
                            finalPptPath
                              ? 'bg-kauvery-purple text-white hover:bg-kauvery-violet'
                              : 'bg-gray-200 text-gray-500 pointer-events-none'
                          }`}
                        >
                          Download PPTX
                        </a>
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-purple-50/45 p-4">
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
                          View PDF
                        </a>
                        <a
                          href={finalPdfPath ? `${apiBase}/kaizen-files/${finalPdfPath}` : undefined}
                          download
                          className={`px-3 py-2 rounded-lg text-xs font-black ${
                            finalPdfPath
                              ? 'bg-kauvery-violet text-white hover:bg-kauvery-purple border border-purple-800/30'
                              : 'bg-gray-200 text-gray-500 pointer-events-none'
                          }`}
                        >
                          Download PDF
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

export default SuggestionDetailModal;
