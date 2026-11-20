import React, { useMemo, useState } from 'react';
import {
  Target,
  HelpCircle,
  Send,
  CheckCircle2,
  Coins,
  Plus,
  Edit2,
  Trash2,
  PauseCircle,
  PlayCircle,
  Upload,
  Sparkles,
  ExternalLink,
  Clock,
  XCircle,
  ShieldCheck,
  Loader2,
  X,
  Image as ImageIcon,
  Award,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  FileText,
  Wand2,
  Check,
} from 'lucide-react';
import { useEco } from '../context/EcoContext';
import {
  EcoMission,
  MissionSubmission,
  MissionType,
  QuizQuestionItem,
} from '../types/eco';
import { openAdTargetUrl, resolveMediaUrl } from '../utils/api';

type MissionFilter = 'all' | MissionType;
type PageTab = 'missions' | 'submissions';
type QuizBuilderTab = 'manual' | 'import';

interface EditableQuestion {
  id: string;
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
}

interface MissionFormState {
  type: MissionType;
  title: string;
  description: string;
  rewardCoins: number;
  passingPercent: number;
  category: string;
  questions: EditableQuestion[];
  channelUsername: string;
  channelUrl: string;
  requiresProof: boolean;
}

interface QuizAttemptResult {
  passed: boolean;
  scorePercent: number;
  correctCount: number;
  totalCount: number;
  passingPercent: number;
  awardedCoins?: number;
  message?: string;
  results?: {
    questionId: string;
    question: string;
    selectedIndex: number;
    correctIndex: number;
    isCorrect: boolean;
    explanation?: string;
  }[];
}

const makeBlankQuestion = (idx = 1): EditableQuestion => ({
  id: `q_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
  question: '',
  options: ['', '', '', ''],
  correctIndex: 0,
  explanation: '',
});

const DEFAULT_FORM: MissionFormState = {
  type: 'custom_task',
  title: '',
  description: '',
  rewardCoins: 100,
  passingPercent: 70,
  category: 'Amaliy Harakat',
  questions: [makeBlankQuestion(1)],
  channelUsername: '@Ecoheros_channel',
  channelUrl: 'https://t.me/Ecoheros_channel',
  requiresProof: true,
};

function getMissionQuestions(mission: EcoMission): QuizQuestionItem[] {
  if (Array.isArray(mission.questions) && mission.questions.length > 0) {
    return mission.questions;
  }
  if (mission.question && Array.isArray(mission.options) && mission.options.length > 0) {
    return [
      {
        id: `${mission.id}_q1`,
        question: mission.question,
        options: mission.options,
        correctIndex: mission.correctIndex,
        explanation: mission.explanation,
      },
    ];
  }
  return [];
}

export const EcoMissionsPage: React.FC = () => {
  const {
    user,
    isSuperAdmin,
    ecoMissions,
    missionSubmissions,
    missionCompletions,
    createMission,
    updateMission,
    deleteMission,
    submitMission,
    parseQuizFromText,
    reviewMissionSubmission,
    uploadMediaFile,
    showNotification,
    triggerConfetti,
    triggerHaptic,
  } = useEco();

  const canManageMissions =
    isSuperAdmin ||
    user.role === 'super_admin' ||
    user.role === 'school_admin' ||
    user.role === 'moderator';

  const [pageTab, setPageTab] = useState<PageTab>('missions');
  const [filterType, setFilterType] = useState<MissionFilter>('all');

  // Sequential Multi-Question Quiz Runner Modal State
  const [activeQuizMission, setActiveQuizMission] = useState<EcoMission | null>(null);
  const [quizStepIndex, setQuizStepIndex] = useState(0);
  const [quizDraftOption, setQuizDraftOption] = useState<number | null>(null);
  const [quizLockedAnswers, setQuizLockedAnswers] = useState<number[]>([]);
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [quizAttemptResult, setQuizAttemptResult] = useState<QuizAttemptResult | null>(null);

  // Custom task proof state per mission
  const [proofTexts, setProofTexts] = useState<Record<string, string>>({});
  const [proofMediaUrls, setProofMediaUrls] = useState<Record<string, string>>({});
  const [uploadingMissionId, setUploadingMissionId] = useState<string | null>(null);
  const [submittingMissionId, setSubmittingMissionId] = useState<string | null>(null);

  // Admin modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [form, setForm] = useState<MissionFormState>(DEFAULT_FORM);
  const [savingMission, setSavingMission] = useState(false);
  const [quizBuilderTab, setQuizBuilderTab] = useState<QuizBuilderTab>('manual');
  const [importRawText, setImportRawText] = useState('');
  const [parsingImport, setParsingImport] = useState(false);

  // Admin submission review notes
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewingSubId, setReviewingSubId] = useState<string | null>(null);

  const visibleMissions = useMemo(() => {
    const list = canManageMissions
      ? ecoMissions
      : ecoMissions.filter(m => m.status === 'active');
    if (filterType === 'all') return list;
    return list.filter(m => m.type === filterType);
  }, [ecoMissions, canManageMissions, filterType]);

  const pendingSubmissions = useMemo(
    () => missionSubmissions.filter(s => s.status === 'pending'),
    [missionSubmissions]
  );

  const sortedSubmissions = useMemo(() => {
    const rank: Record<string, number> = { pending: 0, approved: 1, rejected: 2 };
    return [...missionSubmissions].sort((a, b) => {
      const diff = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
      if (diff !== 0) return diff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [missionSubmissions]);

  const activeCount = useMemo(
    () => ecoMissions.filter(m => m.status === 'active').length,
    [ecoMissions]
  );

  // --- QUIZ RUNNER HANDLERS ---
  const openQuizRunner = (mission: EcoMission) => {
    const qs = getMissionQuestions(mission);
    if (qs.length === 0) {
      showNotification('Bu quizda hali savollar mavjud emas.', 'warning');
      return;
    }
    triggerHaptic('light');
    setActiveQuizMission(mission);
    setQuizStepIndex(0);
    setQuizDraftOption(null);
    setQuizLockedAnswers([]);
    setQuizAttemptResult(null);
  };

  const restartQuizRunner = () => {
    triggerHaptic('light');
    setQuizStepIndex(0);
    setQuizDraftOption(null);
    setQuizLockedAnswers([]);
    setQuizAttemptResult(null);
  };

  const handleAdvanceOrSubmitQuiz = async () => {
    if (!activeQuizMission || quizDraftOption === null || quizSubmitting) return;
    const qs = getMissionQuestions(activeQuizMission);
    const nextAnswers = [...quizLockedAnswers, quizDraftOption];
    triggerHaptic('light');

    if (quizStepIndex < qs.length - 1) {
      setQuizLockedAnswers(nextAnswers);
      setQuizStepIndex(prev => prev + 1);
      setQuizDraftOption(null);
      return;
    }

    setQuizLockedAnswers(nextAnswers);
    setQuizSubmitting(true);
    try {
      const res = await submitMission(activeQuizMission.id, { answers: nextAnswers });
      if (res.success) {
        const passed = res.passed !== false;
        if (passed) {
          triggerHaptic('heavy');
          triggerConfetti();
        } else {
          triggerHaptic('medium');
        }
        setQuizAttemptResult({
          passed,
          scorePercent: res.scorePercent ?? (passed ? 100 : 0),
          correctCount: res.correctCount ?? 0,
          totalCount: res.totalCount ?? qs.length,
          passingPercent: res.passingPercent ?? activeQuizMission.passingPercent ?? 70,
          awardedCoins: res.awardedCoins,
          message: res.message,
          results: res.results,
        });
      } else {
        showNotification(res.error || 'Quiz natijasini tekshirishda xatolik.', 'warning');
      }
    } finally {
      setQuizSubmitting(false);
    }
  };

  // --- ADMIN MODAL HANDLERS ---
  const openCreateModal = (presetType: MissionType = 'custom_task') => {
    setEditingMissionId(null);
    setQuizBuilderTab('manual');
    setImportRawText('');
    setForm({
      ...DEFAULT_FORM,
      type: presetType,
      rewardCoins: presetType === 'quiz' ? 100 : presetType === 'channel_subscribe' ? 100 : 300,
      questions: [makeBlankQuestion(1)],
    });
    setModalOpen(true);
  };

  const openEditModal = (mission: EcoMission) => {
    setEditingMissionId(mission.id);
    setQuizBuilderTab('manual');
    setImportRawText('');
    const existingQs = getMissionQuestions(mission);
    const editableQs: EditableQuestion[] =
      existingQs.length > 0
        ? existingQs.map((q, idx) => ({
            id: q.id || `q_${idx + 1}`,
            question: q.question || '',
            options: [
              q.options?.[0] || '',
              q.options?.[1] || '',
              q.options?.[2] || '',
              q.options?.[3] || '',
            ],
            correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
            explanation: q.explanation || '',
          }))
        : [makeBlankQuestion(1)];

    setForm({
      type: mission.type,
      title: mission.title,
      description: mission.description,
      rewardCoins: mission.rewardCoins,
      passingPercent: mission.passingPercent || 70,
      category: mission.category || 'Ekologiya',
      questions: editableQs,
      channelUsername: mission.channelUsername || '@Ecoheros_channel',
      channelUrl: mission.channelUrl || 'https://t.me/Ecoheros_channel',
      requiresProof: mission.requiresProof ?? true,
    });
    setModalOpen(true);
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (!text.trim()) {
        showNotification('Tanlangan fayl bo‘sh.', 'warning');
        return;
      }
      setImportRawText(text);
      showNotification(`"${file.name}" fayl matni yuklandi! Endi "Testlarni Ajratish" tugmasini bosing.`, 'info');
    } catch {
      showNotification('Faylni o‘qishda xatolik yuz berdi.', 'warning');
    } finally {
      e.target.value = '';
    }
  };

  const handleParseBulkQuiz = async (mode: 'replace' | 'append') => {
    if (!importRawText.trim() || parsingImport) {
      showNotification('Avval test matnini kiriting yoki .txt/.json fayl yuklang.', 'warning');
      return;
    }
    setParsingImport(true);
    try {
      const res = await parseQuizFromText(importRawText);
      if (!res.success || !res.questions || res.questions.length === 0) {
        showNotification(
          res.error || 'Matndan savollar ajratib bo‘lmadi. Namuna formatdan foydalaning.',
          'warning'
        );
        return;
      }
      const normalized: EditableQuestion[] = res.questions.map((q, idx) => ({
        id: q.id || `imp_${Date.now()}_${idx + 1}`,
        question: q.question || '',
        options: [
          q.options?.[0] || '',
          q.options?.[1] || '',
          q.options?.[2] || '',
          q.options?.[3] || '',
        ],
        correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
        explanation: q.explanation || '',
      }));

      setForm(prev => {
        const existingValid = prev.questions.filter(q => q.question.trim());
        const nextQuestions =
          mode === 'append' && existingValid.length > 0
            ? [...existingValid, ...normalized]
            : normalized;
        return { ...prev, questions: nextQuestions };
      });
      setQuizBuilderTab('manual');
      triggerHaptic('medium');
      showNotification(`${normalized.length} ta savol muvaffaqiyatli ajratildi!`, 'success');
    } finally {
      setParsingImport(false);
    }
  };

  const handleSaveMission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      showNotification('Missiya sarlavhasini kiriting.', 'warning');
      return;
    }

    let cleanedQuestions: QuizQuestionItem[] = [];
    if (form.type === 'quiz') {
      cleanedQuestions = form.questions
        .map((q, idx) => {
          const opts = q.options.map(o => o.trim()).filter(Boolean);
          const safeCorrect = Math.min(Math.max(0, q.correctIndex), Math.max(0, opts.length - 1));
          return {
            id: q.id || `q_${idx + 1}`,
            question: q.question.trim(),
            options: opts,
            correctIndex: safeCorrect,
            explanation: q.explanation.trim() || undefined,
          };
        })
        .filter(q => q.question && q.options.length >= 2);

      if (cleanedQuestions.length === 0) {
        showNotification('Kamida 1 ta to‘liq savol va 2 ta javob variantini kiriting.', 'warning');
        return;
      }
    }

    setSavingMission(true);
    try {
      const payload: Omit<EcoMission, 'id' | 'createdAt' | 'status'> = {
        type: form.type,
        title: form.title.trim(),
        description: form.description.trim() || form.title.trim(),
        rewardCoins: Math.max(5, Number(form.rewardCoins) || 50),
        category: form.category.trim() || undefined,
        ...(form.type === 'quiz'
          ? {
              passingPercent: Math.max(50, Math.min(100, Number(form.passingPercent) || 70)),
              questions: cleanedQuestions,
              question: cleanedQuestions[0].question,
              options: cleanedQuestions[0].options,
              correctIndex: cleanedQuestions[0].correctIndex,
              explanation: cleanedQuestions[0].explanation,
            }
          : {}),
        ...(form.type === 'channel_subscribe'
          ? {
              channelUsername: form.channelUsername.trim(),
              channelUrl:
                form.channelUrl.trim() ||
                `https://t.me/${form.channelUsername.trim().replace(/^@/, '')}`,
            }
          : {}),
        ...(form.type === 'custom_task'
          ? {
              requiresProof: form.requiresProof,
              proofType: 'image',
            }
          : {}),
      };

      const res = editingMissionId
        ? await updateMission(editingMissionId, payload)
        : await createMission(payload);

      if (res.success) {
        triggerHaptic('medium');
        showNotification(
          editingMissionId ? 'Missiya yangilandi!' : 'Yangi missiya yaratildi!',
          'success'
        );
        setModalOpen(false);
        setEditingMissionId(null);
      } else {
        showNotification(res.error || 'Saqlashda xatolik yuz berdi.', 'warning');
      }
    } finally {
      setSavingMission(false);
    }
  };

  const handleToggleStatus = async (mission: EcoMission) => {
    const nextStatus = mission.status === 'active' ? 'paused' : 'active';
    const res = await updateMission(mission.id, { status: nextStatus });
    if (res.success) {
      triggerHaptic('light');
      showNotification(
        nextStatus === 'active' ? 'Missiya faollashtirildi.' : 'Missiya vaqtincha to‘xtatildi.',
        'info'
      );
    }
  };

  const handleDeleteMission = async (mission: EcoMission) => {
    const res = await deleteMission(mission.id);
    if (res.success) {
      triggerHaptic('light');
      showNotification(`"${mission.title}" o'chirildi.`, 'info');
    } else {
      showNotification(res.error || "O'chirishda xatolik.", 'warning');
    }
  };

  const handleChannelVerify = async (mission: EcoMission) => {
    setSubmittingMissionId(mission.id);
    try {
      const res = await submitMission(mission.id, {});
      if (res.success) {
        triggerHaptic('heavy');
        triggerConfetti();
        showNotification(
          res.message || `Obuna tasdiqlandi! +${mission.rewardCoins} EcoCoin`,
          'success'
        );
      } else {
        showNotification(res.error || 'Obuna tasdiqlanmadi.', 'warning');
      }
    } finally {
      setSubmittingMissionId(null);
    }
  };

  const handleProofFileChange = async (
    missionId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 80 * 1024 * 1024) {
      showNotification('Fayl hajmi 80 MB dan oshmasligi kerak.', 'warning');
      e.target.value = '';
      return;
    }

    setUploadingMissionId(missionId);
    try {
      const uploaded = await uploadMediaFile(file, file.name);
      if (uploaded.success && uploaded.url) {
        setProofMediaUrls(prev => ({ ...prev, [missionId]: uploaded.url! }));
        showNotification('Dalil fayli muvaffaqiyatli yuklandi!', 'success');
      } else {
        showNotification(uploaded.error || 'Fayl yuklashda xatolik.', 'warning');
      }
    } catch {
      showNotification('Faylni yuklashda xatolik yuz berdi.', 'warning');
    } finally {
      setUploadingMissionId(null);
      e.target.value = '';
    }
  };

  const handleCustomTaskSubmit = async (mission: EcoMission) => {
    const text = (proofTexts[mission.id] || '').trim();
    const mediaUrl = proofMediaUrls[mission.id];

    if (mission.requiresProof && !mediaUrl && !text) {
      showNotification('Dalil rasmi yuklang yoki bajarilgan ish tavsifini yozing.', 'warning');
      return;
    }

    setSubmittingMissionId(mission.id);
    try {
      const res = await submitMission(mission.id, {
        proofText: text || `${mission.title} bajarildi`,
        mediaUrl,
      });
      if (res.success) {
        triggerHaptic('medium');
        showNotification(
          res.message || 'Topshiriq yuborildi va admin tekshiruviga tushdi!',
          'success'
        );
        setProofTexts(prev => ({ ...prev, [mission.id]: '' }));
        setProofMediaUrls(prev => ({ ...prev, [mission.id]: '' }));
      } else {
        showNotification(res.error || 'Topshiriqni yuborishda xatolik.', 'warning');
      }
    } finally {
      setSubmittingMissionId(null);
    }
  };

  const handleReviewSubmission = async (
    sub: MissionSubmission,
    action: 'approve' | 'reject'
  ) => {
    setReviewingSubId(sub.id);
    try {
      const res = await reviewMissionSubmission(sub.id, action, reviewNotes[sub.id]);
      if (res.success) {
        triggerHaptic(action === 'approve' ? 'heavy' : 'light');
        if (action === 'approve') triggerConfetti();
        showNotification(
          action === 'approve'
            ? `Tasdiqlandi! ${sub.userName} hisobiga EcoCoin o'tkazildi.`
            : 'Ariza rad etildi.',
          action === 'approve' ? 'success' : 'info'
        );
      } else {
        showNotification(res.error || 'Tekshirishda xatolik.', 'warning');
      }
    } finally {
      setReviewingSubId(null);
    }
  };

  const getUserLatestSubmission = (missionId: string) =>
    missionSubmissions.find(s => s.missionId === missionId && s.userId === user.uid);

  const typeMeta = (type: MissionType) => {
    if (type === 'quiz') {
      return {
        label: 'Eko-Quiz Test',
        icon: HelpCircle,
        accent: 'text-sky-400',
        border: 'border-sky-500/20',
        btn: 'bg-sky-500 hover:bg-sky-400 text-slate-950',
      };
    }
    if (type === 'channel_subscribe') {
      return {
        label: 'Telegram Kanal',
        icon: Send,
        accent: 'text-indigo-400',
        border: 'border-indigo-500/20',
        btn: 'bg-indigo-500 hover:bg-indigo-400 text-white',
      };
    }
    return {
      label: 'Amaliy Topshiriq',
      icon: Target,
      accent: 'text-emerald-400',
      border: 'border-emerald-500/20',
      btn: 'bg-emerald-500 hover:bg-emerald-400 text-slate-950',
    };
  };

  const activeQuizQuestions = activeQuizMission ? getMissionQuestions(activeQuizMission) : [];
  const currentQuizQuestion = activeQuizQuestions[quizStepIndex];
  const quizProgressPct =
    activeQuizQuestions.length > 0
      ? Math.round(((quizStepIndex + (quizDraftOption !== null ? 0.5 : 0)) / activeQuizQuestions.length) * 100)
      : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 pb-28 space-y-8">
      {/* Structured Header Banner */}
      <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-slate-900 via-emerald-950/60 to-slate-950 border border-emerald-500/20 p-6 sm:p-10 text-white shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-emerald-400 text-xs font-black uppercase tracking-widest">
              <Sparkles className="w-4 h-4" />
              <span>EcoHero Ta'lim & Topshiriqlar</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">
              Missiyalarni Bajaring, <span className="text-emerald-400">EcoCoin Yuting</span>
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Ko‘p savolli ekologiya quizlaridan 70%+ natija bilan o‘ting, rasmiy kanallarga
              qo‘shiling va amaliy topshiriqlar orqali tangalar jamg‘aring.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="px-4 py-3 rounded-2xl bg-slate-950/75 border border-white/10 flex items-center gap-3">
              <Coins className="w-6 h-6 text-amber-400 shrink-0" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  Balansingiz
                </div>
                <div className="text-lg font-black text-amber-300 font-mono tabular-nums">
                  {user.ecoCoins.toLocaleString()} EC
                </div>
              </div>
            </div>

            <div className="px-4 py-3 rounded-2xl bg-slate-950/75 border border-white/10 flex items-center gap-3">
              <Award className="w-6 h-6 text-emerald-400 shrink-0" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  Bajarilgan
                </div>
                <div className="text-lg font-black text-emerald-300 font-mono tabular-nums">
                  {missionCompletions.length} / {activeCount}
                </div>
              </div>
            </div>

            {canManageMissions && (
              <button
                onClick={() => openCreateModal('quiz')}
                className="min-h-[44px] px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-500/25 cursor-pointer transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Yangi Quiz / Missiya</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Filter Bar & Admin Switch */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: 'all', label: 'Barchasi' },
              { id: 'quiz', label: 'Eko-Quiz Testlar' },
              { id: 'channel_subscribe', label: 'Telegram Kanallar' },
              { id: 'custom_task', label: 'Amaliy Topshiriqlar' },
            ] as { id: MissionFilter; label: string }[]
          ).map(f => (
            <button
              key={f.id}
              onClick={() => {
                setPageTab('missions');
                setFilterType(f.id);
              }}
              className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                pageTab === 'missions' && filterType === f.id
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/40'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {canManageMissions && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPageTab('missions')}
              className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all tabular-nums ${
                pageTab === 'missions'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-950'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400'
              }`}
            >
              Missiyalar ({visibleMissions.length})
            </button>
            <button
              onClick={() => setPageTab('submissions')}
              className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all ${
                pageTab === 'submissions'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
              }`}
            >
              <span>Kelgan Arizalar</span>
              {pendingSubmissions.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black tabular-nums">
                  {pendingSubmissions.length}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* MISSIONS GRID */}
      {pageTab === 'missions' ? (
        visibleMissions.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-12 text-center space-y-3">
            <Target className="w-10 h-10 text-emerald-500 mx-auto" />
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              Hozircha bu bo‘limda missiya yo‘q
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Admin tez orada yangi topshiriq va quiz testlarni joylaydi.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {visibleMissions.map(mission => {
              const meta = typeMeta(mission.type);
              const MetaIcon = meta.icon;
              const isCompleted = missionCompletions.includes(mission.id);
              const latestSub = getUserLatestSubmission(mission.id);
              const isBusy = submittingMissionId === mission.id;
              const qCount = mission.type === 'quiz' ? getMissionQuestions(mission).length : 0;
              const passThreshold = mission.passingPercent || 70;

              return (
                <div
                  key={mission.id}
                  className={`rounded-3xl border p-6 flex flex-col justify-between gap-5 transition-all bg-white dark:bg-slate-900/85 shadow-lg ${
                    mission.status === 'paused'
                      ? 'border-amber-500/30 opacity-75'
                      : isCompleted
                      ? 'border-emerald-500/45'
                      : 'border-slate-200 dark:border-slate-800 hover:border-emerald-500/40'
                  }`}
                >
                  <div className="space-y-4">
                    {/* Clean Unboxed Top Metadata Strip + Admin Controls */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-bold">
                        <span className={`inline-flex items-center gap-1.5 ${meta.accent}`}>
                          <MetaIcon className="w-4 h-4" />
                          <span>{meta.label}</span>
                        </span>
                        <span className="text-slate-400 dark:text-slate-600">·</span>
                        <span className="text-amber-500 font-black tabular-nums">
                          +{mission.rewardCoins} EC
                        </span>
                        {mission.type === 'quiz' && (
                          <>
                            <span className="text-slate-400 dark:text-slate-600">·</span>
                            <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                              {qCount} ta savol · {passThreshold}%
                            </span>
                          </>
                        )}
                        {isCompleted && (
                          <>
                            <span className="text-slate-400 dark:text-slate-600">·</span>
                            <span className="text-emerald-400 inline-flex items-center gap-1 font-black">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Bajarilgan
                            </span>
                          </>
                        )}
                        {mission.status === 'paused' && (
                          <>
                            <span className="text-slate-400 dark:text-slate-600">·</span>
                            <span className="text-amber-400">To‘xtatilgan</span>
                          </>
                        )}
                      </div>

                      {canManageMissions && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => openEditModal(mission)}
                            title="Tahrirlash"
                            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-emerald-400 cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(mission)}
                            title={mission.status === 'active' ? "To'xtatish" : 'Faollashtirish'}
                            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-amber-400 cursor-pointer"
                          >
                            {mission.status === 'active' ? (
                              <PauseCircle className="w-4 h-4" />
                            ) : (
                              <PlayCircle className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleDeleteMission(mission)}
                            title="O'chirish"
                            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Title & Description */}
                    <div className="space-y-1.5">
                      <h3 className="text-xl font-black text-slate-900 dark:text-white leading-snug">
                        {mission.title}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                        {mission.description}
                      </p>
                    </div>

                    {/* QUIZ SUMMARY STAGE */}
                    {mission.type === 'quiz' && (
                      <div className="p-4 rounded-2xl bg-sky-500/5 border border-sky-500/20 flex items-center justify-between gap-3">
                        <div className="space-y-0.5 text-xs">
                          <div className="font-black text-slate-900 dark:text-white tabular-nums">
                            {qCount} ta test savoli · O‘tish chegarasi: {passThreshold}%
                          </div>
                          <div className="text-slate-500 dark:text-slate-400">
                            Test davomida natijalar yashiriladi va yakunda umumiy foiz hisoblanadi.
                          </div>
                        </div>
                      </div>
                    )}

                    {/* CHANNEL SUBSCRIBE BODY */}
                    {mission.type === 'channel_subscribe' && (
                      <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">
                            Rasmiy Kanal
                          </div>
                          <div className="text-sm font-black text-slate-900 dark:text-white">
                            {mission.channelUsername || '@Ecoheros_channel'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            openAdTargetUrl(
                              mission.channelUrl ||
                                `https://t.me/${(mission.channelUsername || 'Ecoheros_channel').replace(/^@/, '')}`
                            )
                          }
                          className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-black transition-all cursor-pointer"
                        >
                          <span>Kanalga o‘tish</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* CUSTOM TASK BODY */}
                    {mission.type === 'custom_task' && !isCompleted && (
                      <div className="space-y-3 pt-1">
                        {latestSub && (
                          <div
                            className={`p-3 rounded-2xl border text-xs font-semibold flex items-start gap-2 ${
                              latestSub.status === 'pending'
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                : latestSub.status === 'approved'
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                            }`}
                          >
                            <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <div>
                                Holat:{' '}
                                {latestSub.status === 'pending'
                                  ? 'Admin tekshiruvida'
                                  : latestSub.status === 'approved'
                                  ? 'Tasdiqlandi'
                                  : 'Rad etildi'}
                              </div>
                              {latestSub.aiCheck?.verdictUz && (
                                <div className="opacity-80">AI: {latestSub.aiCheck.verdictUz}</div>
                              )}
                              {latestSub.adminNote && (
                                <div className="opacity-80">Izoh: {latestSub.adminNote}</div>
                              )}
                            </div>
                          </div>
                        )}

                        <textarea
                          rows={2}
                          value={proofTexts[mission.id] || ''}
                          onChange={e =>
                            setProofTexts(prev => ({ ...prev, [mission.id]: e.target.value }))
                          }
                          placeholder="Bajarilgan ish haqida qisqa izoh yozing..."
                          className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                        />

                        <div className="flex flex-wrap items-center gap-3">
                          <label className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer transition-all">
                            {uploadingMissionId === mission.id ? (
                              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                            ) : (
                              <Upload className="w-4 h-4 text-emerald-500" />
                            )}
                            <span>
                              {uploadingMissionId === mission.id
                                ? 'Yuklanmoqda...'
                                : 'Dalil Rasmi / Video Yuklash'}
                            </span>
                            <input
                              type="file"
                              accept="image/*,video/*,.mp4,.mov,.webm"
                              className="hidden"
                              onChange={e => handleProofFileChange(mission.id, e)}
                            />
                          </label>

                          {proofMediaUrls[mission.id] && (
                            <div className="flex items-center gap-2">
                              {/\.(mp4|mov|webm|m4v)(\?|$)/i.test(proofMediaUrls[mission.id]) ? (
                                <video
                                  src={resolveMediaUrl(proofMediaUrls[mission.id])}
                                  className="w-14 h-11 rounded-xl object-cover border border-emerald-500/40 bg-black"
                                />
                              ) : (
                                <img
                                  src={resolveMediaUrl(proofMediaUrls[mission.id])}
                                  alt="Dalil"
                                  className="w-11 h-11 rounded-xl object-cover border border-emerald-500/40"
                                />
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setProofMediaUrls(prev => ({ ...prev, [mission.id]: '' }))
                                }
                                className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer CTA */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80">
                    {isCompleted ? (
                      <div className="w-full min-h-[44px] py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Mukofot Olingan (+{mission.rewardCoins} EC)</span>
                      </div>
                    ) : mission.type === 'quiz' ? (
                      <button
                        disabled={mission.status === 'paused' || qCount === 0}
                        onClick={() => openQuizRunner(mission)}
                        className="w-full min-h-[44px] py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>Testni Boshlash ({qCount} savol · +{mission.rewardCoins} EC)</span>
                      </button>
                    ) : mission.type === 'channel_subscribe' ? (
                      <button
                        disabled={isBusy || mission.status === 'paused'}
                        onClick={() => handleChannelVerify(mission)}
                        className="w-full min-h-[44px] py-3 rounded-2xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all"
                      >
                        {isBusy ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        <span>Obunani Tekshirish (+{mission.rewardCoins} Coin)</span>
                      </button>
                    ) : (
                      <button
                        disabled={
                          isBusy ||
                          mission.status === 'paused' ||
                          latestSub?.status === 'pending'
                        }
                        onClick={() => handleCustomTaskSubmit(mission)}
                        className="w-full min-h-[44px] py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all"
                      >
                        {isBusy ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        <span>
                          {latestSub?.status === 'pending'
                            ? 'Tekshiruv kutilmoqda...'
                            : `Topshiriqni Yuborish (+${mission.rewardCoins} Coin)`}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* ADMIN SUBMISSIONS REVIEW TAB */
        <div className="space-y-4">
          {sortedSubmissions.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-12 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <div className="text-base font-black text-slate-900 dark:text-white">
                Tekshiruv uchun ariza yo‘q
              </div>
              <p className="text-sm text-slate-500">
                O‘quvchilar topshiriq yuborganida bu yerda ko‘rinadi.
              </p>
            </div>
          ) : (
            sortedSubmissions.map(sub => {
              const isBusy = reviewingSubId === sub.id;
              return (
                <div
                  key={sub.id}
                  className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-5 flex flex-col md:flex-row gap-5 justify-between"
                >
                  <div className="flex flex-col sm:flex-row gap-4 flex-1 min-w-0">
                    {sub.mediaUrl ? (
                      /\.(mp4|mov|webm|m4v)(\?|$)/i.test(sub.mediaUrl) ? (
                        <video
                          src={resolveMediaUrl(sub.mediaUrl)}
                          controls
                          className="w-full sm:w-36 h-32 rounded-2xl object-cover border border-slate-700 shrink-0 bg-black"
                        />
                      ) : (
                        <img
                          src={resolveMediaUrl(sub.mediaUrl)}
                          alt={sub.missionTitle}
                          className="w-full sm:w-32 h-32 rounded-2xl object-cover border border-slate-700 shrink-0"
                        />
                      )
                    ) : (
                      <div className="w-full sm:w-32 h-32 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                        <ImageIcon className="w-8 h-8" />
                      </div>
                    )}

                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                        <span className="text-sm font-black text-slate-900 dark:text-white">
                          {sub.missionTitle}
                        </span>
                        <span className="text-slate-500">·</span>
                        <span
                          className={
                            sub.status === 'pending'
                              ? 'text-amber-400'
                              : sub.status === 'approved'
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }
                        >
                          {sub.status === 'pending'
                            ? 'Kutilmoqda'
                            : sub.status === 'approved'
                            ? 'Tasdiqlandi'
                            : 'Rad etildi'}
                        </span>
                        <span className="text-slate-500">·</span>
                        <span className="text-amber-400 font-black tabular-nums">
                          +{sub.awardedCoins} EC
                        </span>
                      </div>

                      <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                        O‘quvchi: <span className="text-slate-900 dark:text-slate-200">{sub.userName}</span>
                        {sub.schoolName ? ` · ${sub.schoolName}` : ''}
                      </div>

                      {sub.proofText && (
                        <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                          {sub.proofText}
                        </p>
                      )}

                      {sub.aiCheck && (
                        <div
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border ${
                            sub.aiCheck.isValidEco && !sub.aiCheck.isAiGenerated
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                          }`}
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>AI Tekshiruv: {sub.aiCheck.verdictUz}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {sub.status === 'pending' && (
                    <div className="flex flex-col justify-between gap-2 w-full md:w-64 shrink-0">
                      <input
                        type="text"
                        placeholder="Admin izohi (ixtiyoriy)"
                        value={reviewNotes[sub.id] || ''}
                        onChange={e =>
                          setReviewNotes(prev => ({ ...prev, [sub.id]: e.target.value }))
                        }
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          disabled={isBusy}
                          onClick={() => handleReviewSubmission(sub, 'approve')}
                          className="flex-1 min-h-[40px] py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Tasdiqlash</span>
                        </button>
                        <button
                          disabled={isBusy}
                          onClick={() => handleReviewSubmission(sub, 'reject')}
                          className="flex-1 min-h-[40px] py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>Rad etish</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* MULTI-QUESTION SEQUENTIAL QUIZ RUNNER MODAL */}
      {activeQuizMission && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-[32px] bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-2xl my-8 space-y-6">
            {/* Quiz Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="text-[11px] font-black uppercase tracking-widest text-sky-400">
                  Eko-Quiz Test · +{activeQuizMission.rewardCoins} EcoCoin
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                  {activeQuizMission.title}
                </h2>
              </div>
              <button
                onClick={() => setActiveQuizMission(null)}
                className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!quizAttemptResult && currentQuizQuestion ? (
              <div className="space-y-6">
                {/* Completion Progress Bar ONLY — NO running score shown */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                    <span>
                      Savol {quizStepIndex + 1} / {activeQuizQuestions.length}
                    </span>
                    <span>O‘tish bali: {activeQuizMission.passingPercent || 70}%</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all duration-300 rounded-full"
                      style={{ width: `${Math.max(8, quizProgressPct)}%` }}
                    />
                  </div>
                </div>

                {/* Question Prompt */}
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800">
                  <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-snug">
                    {currentQuizQuestion.question}
                  </p>
                </div>

                {/* Single-Select Options */}
                <div className="space-y-2.5">
                  {currentQuizQuestion.options.map((opt, idx) => {
                    const isSelected = quizDraftOption === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setQuizDraftOption(idx);
                        }}
                        className={`w-full min-h-[52px] text-left px-4 py-3.5 rounded-2xl border text-sm font-bold flex items-center gap-3.5 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-sky-500/15 border-sky-500 text-sky-400 shadow-sm'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-sky-500/40'
                        }`}
                      >
                        <span
                          className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                            isSelected
                              ? 'bg-sky-500 text-slate-950'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'
                          }`}
                        >
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span className="flex-1 leading-snug">{opt}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Next / Finish CTA */}
                <div className="flex items-center justify-between gap-3 pt-2">
                  <div className="text-xs text-slate-500 font-semibold">
                    Javobni tanlab tasdiqlaganingizdan keyin keyingi savolga o‘tasiz.
                  </div>
                  <button
                    type="button"
                    disabled={quizDraftOption === null || quizSubmitting}
                    onClick={handleAdvanceOrSubmitQuiz}
                    className="min-h-[46px] px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all shrink-0"
                  >
                    {quizSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : quizStepIndex < activeQuizQuestions.length - 1 ? (
                      <>
                        <span>Keyingi savol</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    ) : (
                      <>
                        <span>Testni Yakunlash</span>
                        <Check className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : quizAttemptResult ? (
              /* FINAL QUIZ SCORE & BREAKDOWN SCREEN */
              <div className="space-y-6">
                <div
                  className={`p-6 rounded-3xl border flex flex-col sm:flex-row items-center gap-6 ${
                    quizAttemptResult.passed
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-rose-500/10 border-rose-500/30'
                  }`}
                >
                  {/* Percentage SVG Ring */}
                  <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
                    <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="10"
                        className="text-slate-200 dark:text-slate-800"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 42}`}
                        strokeDashoffset={`${
                          2 * Math.PI * 42 * (1 - quizAttemptResult.scorePercent / 100)
                        }`}
                        className={quizAttemptResult.passed ? 'text-emerald-400' : 'text-rose-400'}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums">
                        {quizAttemptResult.scorePercent}%
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 text-center sm:text-left">
                    <div
                      className={`inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider ${
                        quizAttemptResult.passed ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {quizAttemptResult.passed ? (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Tabriklaymiz! Testdan O‘tdingiz</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4" />
                          <span>O‘tish Baliga Yetmadi ({quizAttemptResult.passingPercent}% kerak)</span>
                        </>
                      )}
                    </div>
                    <div className="text-lg font-black text-slate-900 dark:text-white tabular-nums">
                      {quizAttemptResult.correctCount} / {quizAttemptResult.totalCount} ta savolga to‘g‘ri javob
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {quizAttemptResult.message ||
                        (quizAttemptResult.passed
                          ? `+${quizAttemptResult.awardedCoins || activeQuizMission.rewardCoins} EcoCoin hisobingizga qo‘shildi.`
                          : `EcoCoin olish uchun kamida ${quizAttemptResult.passingPercent}% natija to‘plang va qaytadan urinib ko‘ring.`)}
                    </p>
                  </div>
                </div>

                {/* Per-Question Breakdown */}
                {quizAttemptResult.results && quizAttemptResult.results.length > 0 && (
                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {quizAttemptResult.results.map((r, i) => (
                      <div
                        key={r.questionId || i}
                        className={`p-3.5 rounded-2xl border text-xs space-y-1 ${
                          r.isCorrect
                            ? 'bg-emerald-500/5 border-emerald-500/20'
                            : 'bg-rose-500/5 border-rose-500/20'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 font-bold text-slate-900 dark:text-white">
                          <span>
                            {i + 1}. {r.question}
                          </span>
                          <span className={r.isCorrect ? 'text-emerald-400 shrink-0' : 'text-rose-400 shrink-0'}>
                            {r.isCorrect ? 'To‘g‘ri' : 'Xato'}
                          </span>
                        </div>
                        {r.explanation && (
                          <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                            {r.explanation}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3">
                  {!quizAttemptResult.passed && (
                    <button
                      type="button"
                      onClick={restartQuizRunner}
                      className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Qaytadan Boshlash</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveQuizMission(null)}
                    className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-black text-xs uppercase tracking-wider cursor-pointer"
                  >
                    Yopish
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ADMIN CREATE / EDIT MISSION MODAL */}
      {modalOpen && canManageMissions && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-7 space-y-5 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-900 dark:text-white">
                {editingMissionId ? 'Missiyani Tahrirlash' : 'Yangi Missiya / Quiz Yaratish'}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMission} className="space-y-4">
              {/* Type Picker */}
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'custom_task', label: 'Topshiriq' },
                    { id: 'quiz', label: 'Quiz Test' },
                    { id: 'channel_subscribe', label: 'Kanal Obuna' },
                  ] as { id: MissionType; label: string }[]
                ).map(t => (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => setForm(prev => ({ ...prev, type: t.id }))}
                    className={`min-h-[42px] py-2.5 px-3 rounded-xl text-xs font-black border cursor-pointer transition-all ${
                      form.type === t.id
                        ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Sarlavha</label>
                  <input
                    required
                    type="text"
                    value={form.title}
                    onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder={
                      form.type === 'quiz'
                        ? 'Masalan: Plastik chiqindilar ekologiyasi'
                        : form.type === 'channel_subscribe'
                        ? 'Masalan: @Ecoheros_channel kanaliga obuna bo‘ling'
                        : 'Masalan: 10 ta daraxt eking'
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">
                    Mukofot (Coin)
                  </label>
                  <input
                    required
                    type="number"
                    min={5}
                    max={10000}
                    value={form.rewardCoins}
                    onChange={e =>
                      setForm(prev => ({ ...prev, rewardCoins: Number(e.target.value) || 0 }))
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono text-amber-400 font-black tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Tavsif</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Missiya shartlari va foydasi haqida yozing..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </div>

              {/* MULTI-QUESTION QUIZ BUILDER + BULK IMPORTER */}
              {form.type === 'quiz' && (
                <div className="space-y-4 p-4 rounded-2xl bg-sky-500/5 border border-sky-500/20">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setQuizBuilderTab('manual')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-black cursor-pointer transition-all ${
                          quizBuilderTab === 'manual'
                            ? 'bg-sky-500 text-slate-950'
                            : 'bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        Savollar ({form.questions.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuizBuilderTab('import')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all ${
                          quizBuilderTab === 'import'
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        <span>Tezkor Import (Matn / Fayl)</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-[11px] font-bold text-sky-400 uppercase whitespace-nowrap">
                        O‘tish bali (%):
                      </label>
                      <input
                        type="number"
                        min={50}
                        max={100}
                        value={form.passingPercent}
                        onChange={e =>
                          setForm(prev => ({
                            ...prev,
                            passingPercent: Math.max(50, Math.min(100, Number(e.target.value) || 70)),
                          }))
                        }
                        className="w-16 px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono font-black text-center text-sky-400 tabular-nums"
                      />
                    </div>
                  </div>

                  {quizBuilderTab === 'manual' ? (
                    <div className="space-y-4">
                      <div className="space-y-3 max-h-[38vh] overflow-y-auto pr-1">
                        {form.questions.map((q, qIdx) => (
                          <div
                            key={q.id}
                            className="p-4 rounded-2xl bg-white dark:bg-slate-950/90 border border-slate-200 dark:border-slate-800 space-y-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-black text-sky-400 uppercase">
                                {qIdx + 1}-savol
                              </span>
                              {form.questions.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setForm(prev => ({
                                      ...prev,
                                      questions: prev.questions.filter((_, idx) => idx !== qIdx),
                                    }))
                                  }
                                  className="text-xs font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>O‘chirish</span>
                                </button>
                              )}
                            </div>

                            <input
                              type="text"
                              value={q.question}
                              onChange={e => {
                                const val = e.target.value;
                                setForm(prev => ({
                                  ...prev,
                                  questions: prev.questions.map((item, idx) =>
                                    idx === qIdx ? { ...item, question: val } : item
                                  ),
                                }));
                              }}
                              placeholder="Savol matnini kiriting..."
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white"
                            />

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {q.options.map((opt, optIdx) => (
                                <div key={optIdx} className="flex items-center gap-2">
                                  <input
                                    type="radio"
                                    name={`correct_${q.id}`}
                                    checked={q.correctIndex === optIdx}
                                    onChange={() =>
                                      setForm(prev => ({
                                        ...prev,
                                        questions: prev.questions.map((item, idx) =>
                                          idx === qIdx ? { ...item, correctIndex: optIdx } : item
                                        ),
                                      }))
                                    }
                                    title="To'g'ri javob sifatida belgilash"
                                    className="accent-emerald-500 w-4 h-4 cursor-pointer shrink-0"
                                  />
                                  <input
                                    type="text"
                                    value={opt}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setForm(prev => ({
                                        ...prev,
                                        questions: prev.questions.map((item, idx) => {
                                          if (idx !== qIdx) return item;
                                          const nextOpts = [...item.options] as [
                                            string,
                                            string,
                                            string,
                                            string,
                                          ];
                                          nextOpts[optIdx] = val;
                                          return { ...item, options: nextOpts };
                                        }),
                                      }));
                                    }}
                                    placeholder={`${String.fromCharCode(65 + optIdx)}-variant`}
                                    className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                                  />
                                </div>
                              ))}
                            </div>

                            <input
                              type="text"
                              value={q.explanation}
                              onChange={e => {
                                const val = e.target.value;
                                setForm(prev => ({
                                  ...prev,
                                  questions: prev.questions.map((item, idx) =>
                                    idx === qIdx ? { ...item, explanation: val } : item
                                  ),
                                }));
                              }}
                              placeholder="Izoh (test yakunida ko‘rinadi, ixtiyoriy)"
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300"
                            />
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setForm(prev => ({
                            ...prev,
                            questions: [
                              ...prev.questions,
                              makeBlankQuestion(prev.questions.length + 1),
                            ],
                          }))
                        }
                        className="w-full min-h-[42px] py-2.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-dashed border-sky-500/40 text-sky-400 text-xs font-black flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Yangi Savol Qo‘shish</span>
                      </button>
                    </div>
                  ) : (
                    /* BULK TEXT / FILE IMPORTER TAB */
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          Telegram, Word yoki saytdan olingan testlarni joylashtiring — tizim va AI avtomatik savollarga ajratadi.
                        </p>
                        <label className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold text-emerald-500 hover:border-emerald-500/50 flex items-center gap-1.5 cursor-pointer">
                          <FileText className="w-3.5 h-3.5" />
                          <span>.txt / .json Fayl Yuklash</span>
                          <input
                            type="file"
                            accept=".txt,.json,.md,.csv,text/plain,application/json"
                            onChange={handleImportFileChange}
                            className="hidden"
                          />
                        </label>
                      </div>

                      <textarea
                        rows={7}
                        value={importRawText}
                        onChange={e => setImportRawText(e.target.value)}
                        placeholder={`Namuna format:\n1. Daraxtlar kuniga nechta odamga yetarli kislorod ishlab chiqaradi?\nA) 1 ta\n*B) 2-4 ta\nC) 10 ta\nD) 20 ta\n\n2. Qaysi chiqindi eng uzoq vaqtda chiriydi?\nA) Qog'oz\nB) Olma po'chog'i\n*C) Shisha va plastik\nD) Barg`}
                        className="w-full px-3.5 py-3 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100 leading-relaxed"
                      />

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={parsingImport || !importRawText.trim()}
                          onClick={() => handleParseBulkQuiz('replace')}
                          className="flex-1 min-h-[42px] px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer"
                        >
                          {parsingImport ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Wand2 className="w-4 h-4" />
                          )}
                          <span>
                            {parsingImport ? 'Ajratilmoqda...' : 'Testlarni Ajratish & Qo‘llash'}
                          </span>
                        </button>
                        {form.questions.some(q => q.question.trim()) && (
                          <button
                            type="button"
                            disabled={parsingImport || !importRawText.trim()}
                            onClick={() => handleParseBulkQuiz('append')}
                            className="min-h-[42px] px-4 py-2.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-400 font-black text-xs cursor-pointer disabled:opacity-50"
                          >
                            + Davomiga Qo‘shish
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* CHANNEL SPECIFIC */}
              {form.type === 'channel_subscribe' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-indigo-400 uppercase">
                      Kanal Username
                    </label>
                    <input
                      type="text"
                      value={form.channelUsername}
                      onChange={e =>
                        setForm(prev => ({ ...prev, channelUsername: e.target.value }))
                      }
                      placeholder="@Ecoheros_channel"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-indigo-400 uppercase">
                      Kanal Havolasi
                    </label>
                    <input
                      type="text"
                      value={form.channelUrl}
                      onChange={e => setForm(prev => ({ ...prev, channelUrl: e.target.value }))}
                      placeholder="https://t.me/Ecoheros_channel"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {/* CUSTOM TASK SPECIFIC */}
              {form.type === 'custom_task' && (
                <label className="flex items-center gap-3 p-3.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.requiresProof}
                    onChange={e =>
                      setForm(prev => ({ ...prev, requiresProof: e.target.checked }))
                    }
                    className="w-4 h-4 accent-emerald-500"
                  />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Rasm / video dalil yuklash talab qilinsin (AI + Admin tekshiradi)
                  </span>
                </label>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="min-h-[42px] px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={savingMission}
                  className="min-h-[42px] px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                >
                  {savingMission && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingMissionId ? 'Saqlash' : 'Yaratish'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
