import React, { useEffect, useState, useMemo } from 'react';
import {
  Award,
  CheckCircle2,
  ClipboardList,
  Camera,
  Trophy,
  Upload,
  Play,
  AlertTriangle,
  Sparkles,
  Loader2,
  ShieldCheck,
  Crown,
  Calendar,
} from 'lucide-react';
import { useEco } from '../../context/EcoContext';
import { DistrictLeaderboardDetailsResponse } from '../../types/eco';
import { EcoTelegramChatPanel } from '../chat/EcoTelegramChatPanel';
import { resolveMediaUrl } from '../../utils/api';

export const AmbassadorDashboardView: React.FC = () => {
  const {
    user,
    ecoTasks,
    reports,
    mediaSubmissions,
    liveSyncVersion,
    updateEcoTask,
    advanceReportWorkflow,
    resolveReportWithAiVerification,
    uploadMediaFile,
    fetchDistrictLeaderboardDetails,
    setActiveTab,
    showNotification,
  } = useEco();

  const [districtDetails, setDistrictDetails] = useState<DistrictLeaderboardDetailsResponse | null>(null);
  const [lbLoading, setLbLoading] = useState(false);

  const [submittingTaskId, setSubmittingTaskId] = useState<string | null>(null);
  const [completionNote, setCompletionNote] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Before/After AI Resolution state
  const [resolvingReportId, setResolvingReportId] = useState<string | null>(null);
  const [beforeImgUrl, setBeforeImgUrl] = useState('');
  const [afterImgUrl, setAfterImgUrl] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [uploadingResImg, setUploadingResImg] = useState<'before' | 'after' | null>(null);
  const [verifyingAi, setVerifyingAi] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLbLoading(true);
    fetchDistrictLeaderboardDetails({
      region: user.region,
      district: user.district,
    })
      .then(res => {
        if (mounted && res) {
          setDistrictDetails(res);
        }
      })
      .finally(() => {
        if (mounted) setLbLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [fetchDistrictLeaderboardDetails, user.region, user.district, liveSyncVersion]);

  const myTasks = useMemo(
    () => ecoTasks.filter(t => t.assigneeUid === user.uid || t.schoolId === user.schoolId),
    [ecoTasks, user.uid, user.schoolId]
  );

  const assignedReports = useMemo(
    () =>
      reports.filter(
        r =>
          (r.assignedAmbassadorUid === user.uid || r.schoolId === user.schoolId) &&
          ['pending', 'PENDING_REVIEW', 'verified', 'APPROVED', 'ASSIGNED', 'in_progress', 'IN_PROGRESS'].includes(r.status)
      ),
    [reports, user.uid, user.schoolId]
  );

  const handleResolutionFile = (e: React.ChangeEvent<HTMLInputElement>, target: 'before' | 'after') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      showNotification('Fayl hajmi 20 MB dan oshmasligi kerak', 'warning');
      return;
    }
    setUploadingResImg(target);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const up = await uploadMediaFile(reader.result as string, file.name);
        if (up.success && up.url) {
          if (target === 'before') setBeforeImgUrl(up.url);
          else setAfterImgUrl(up.url);
          showNotification(target === 'before' ? 'Avvalgi rasm yuklandi!' : 'Keyingi rasm yuklandi!', 'success');
        } else {
          showNotification(up.error || 'Yuklashda xatolik', 'warning');
        }
      } finally {
        setUploadingResImg(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitAiResolution = async (reportId: string, fallbackBeforeUrl: string) => {
    if (!afterImgUrl) {
      showNotification("Muammo hal qilingandan keyingi rasmni yuklang!", 'warning');
      return;
    }
    setVerifyingAi(true);
    try {
      const res = await resolveReportWithAiVerification(reportId, {
        beforeImageUrl: beforeImgUrl || fallbackBeforeUrl,
        afterImageUrl: afterImgUrl,
        note: resolutionNote.trim() || "O'quvchi bilan hamkorlikda muammo bartaraf etildi",
      });
      if (res.success) {
        setResolvingReportId(null);
        setBeforeImgUrl('');
        setAfterImgUrl('');
        setResolutionNote('');
      }
    } finally {
      setVerifyingAi(false);
    }
  };

  const myMedia = useMemo(() => mediaSubmissions.filter(m => m.userId === user.uid), [mediaSubmissions, user.uid]);

  const ambList = districtDetails?.ambassadorRatings || [];
  const totalAmb = districtDetails?.totalAmbassadorsInDistrict || ambList.length;
  const myAmbRating = districtDetails?.myAmbassadorRating || ambList.find(a => a.id === user.uid) || null;
  const top3Threshold = ambList[2]?.realScore ?? 0;

  const handleEvidenceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const uploaded = await uploadMediaFile(reader.result as string, file.name);
      setIsUploading(false);
      if (uploaded.success && uploaded.url) {
        setEvidenceUrl(uploaded.url);
        showNotification('Dalil fayli yuklandi!', 'success');
      } else {
        showNotification(uploaded.error || 'Yuklashda xatolik', 'warning');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitTaskEvidence = async (taskId: string, relatedReportId?: string) => {
    if (!completionNote.trim()) {
      showNotification('Bajarilgan ish tavsifini kiriting', 'warning');
      return;
    }
    await updateEcoTask(taskId, {
      status: 'submitted',
      evidenceUrl: evidenceUrl || undefined,
      completionNote: completionNote.trim(),
    });
    if (relatedReportId) {
      await advanceReportWorkflow(relatedReportId, 'ambassador_solution', {
        note: completionNote.trim(),
        resolutionEvidenceUrl: evidenceUrl || undefined,
      });
    }
    setSubmittingTaskId(null);
    setCompletionNote('');
    setEvidenceUrl('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 md:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            Eko-Elchi Kabineti · {user.schoolName} · {districtDetails?.district || user.district}
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {user.fullName} — Vazifalar va Tuman Reytingi
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Maktab Sardori biriktirgan topshiriqlar, foto/video faoliyatlar hamda tumaningizdagi barcha Eko-Elchilar o‘rtasidagi to‘liq reyting.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 shrink-0">
          {myAmbRating && (
            <div className="text-right pr-2">
              <div className="text-xl font-black font-mono tabular-nums text-amber-500">
                #{myAmbRating.rank} / {totalAmb}
              </div>
              <div className="text-[11px] text-slate-500">Tumandagi o‘rningiz</div>
            </div>
          )}
          <button
            onClick={() => setActiveTab('media')}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Camera className="w-4 h-4" />
            <span>Foto / Video Yuklash</span>
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">Biriktirilgan vazifalar</div>
          <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white">{myTasks.length}</div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">Tasdiqlangan vazifalar</div>
          <div className="text-2xl font-black font-mono tabular-nums text-emerald-500">
            {myTasks.filter(t => t.status === 'verified').length}
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">Media faoliyatlar</div>
          <div className="text-2xl font-black font-mono tabular-nums text-sky-500">{myMedia.length}</div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">EcoCoin Balans</div>
          <div className="text-2xl font-black font-mono tabular-nums text-amber-500">{(user.ecoCoins || 0).toLocaleString()} ECO</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Tasks Assigned by School Captain */}
        <div className="lg:col-span-6 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-emerald-500" />
              <span>Maktab Sardoridan olingan vazifalar</span>
            </h3>
            <span className="text-xs font-mono tabular-nums text-slate-500">{myTasks.length} ta</span>
          </div>

          {myTasks.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
              Hozircha yangi vazifalar biriktirilmagan.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {myTasks.map(task => (
                <div key={task.id} className="py-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">{task.title}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{task.instructions}</div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Mas’ul sardor: {task.assignedByName || 'Maktab Sardori'} · Mukofot: +{task.rewardCoins} ECO · Holat: <b>{task.status}</b>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {task.status === 'assigned' && (
                        <button
                          onClick={() => updateEcoTask(task.id, { status: 'in_progress' })}
                          className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Play className="w-3 h-3" /> Boshlash
                        </button>
                      )}
                      {(task.status === 'assigned' || task.status === 'in_progress' || task.status === 'needs_revision') && (
                        <button
                          onClick={() => {
                            setSubmittingTaskId(task.id);
                            setCompletionNote(task.completionNote || '');
                            setEvidenceUrl(task.evidenceUrl || '');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                        >
                          Dalil yuklash
                        </button>
                      )}
                      {task.status === 'verified' && (
                        <span className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" /> Tasdiqlandi
                        </span>
                      )}
                    </div>
                  </div>

                  {submittingTaskId === task.id && (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-3">
                      <textarea
                        rows={2}
                        value={completionNote}
                        onChange={e => setCompletionNote(e.target.value)}
                        placeholder="Qanday xavfsiz chora ko‘rildi va natija qanday?"
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-semibold cursor-pointer">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{isUploading ? 'Yuklanmoqda...' : evidenceUrl ? 'Fayl biriktirildi' : 'Foto / Video biriktirish'}</span>
                          <input type="file" accept="image/*,video/*" onChange={handleEvidenceFile} className="hidden" />
                        </label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSubmittingTaskId(null)}
                            className="px-3 py-1.5 rounded-lg text-xs text-slate-500 cursor-pointer"
                          >
                            Bekor qilish
                          </button>
                          <button
                            onClick={() => handleSubmitTaskEvidence(task.id, task.relatedReportId)}
                            className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                          >
                            Topshirish
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Assigned / School Reports -> Before & After Photo AI Verification (+200 / +100 EcoCoin) */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-500 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Muammolarni Hal Qilish (+200 Elchi / +100 O‘quvchi)</span>
              </h4>
              <span className="text-[11px] font-mono text-slate-400">{assignedReports.length} ta</span>
            </div>

            {assignedReports.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">Hozircha biriktirilgan ochiq muammolar yo‘q.</p>
            ) : (
              <div className="space-y-3">
                {assignedReports.map(r => (
                  <div key={r.id} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3 text-xs">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        {r.imageUrl && (
                          <img
                            src={resolveMediaUrl(r.imageUrl)}
                            alt={r.title}
                            className="w-12 h-12 rounded-xl object-cover shrink-0 border border-slate-300 dark:border-slate-600"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 dark:text-white truncate">{r.title}</div>
                          <div className="text-[11px] text-slate-500 line-clamp-2">{r.captainInstructions || r.description}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Xabar bergan: {r.reporterName}</div>
                          {r.isHazardous && (
                            <div className="text-[11px] font-bold text-rose-500 flex items-center gap-1 mt-0.5">
                              <AlertTriangle className="w-3 h-3" /> Xavfli: o‘quvchilar tegishi taqiqlanadi
                            </div>
                          )}
                        </div>
                      </div>

                      {!r.isHazardous && (
                        <button
                          type="button"
                          onClick={() => {
                            if (resolvingReportId === r.id) {
                              setResolvingReportId(null);
                            } else {
                              setResolvingReportId(r.id);
                              setBeforeImgUrl(r.imageUrl || '');
                              setAfterImgUrl('');
                              setResolutionNote('');
                            }
                          }}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shrink-0 cursor-pointer"
                        >
                          {resolvingReportId === r.id ? 'Yopish' : 'Hal Qilish (AI)'}
                        </button>
                      )}
                    </div>

                    {resolvingReportId === r.id && (
                      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-500/30 space-y-3">
                        <div className="text-[11px] font-bold text-emerald-500 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4" />
                          <span>Avvalgi va hal qilingandan keyingi rasmlarni yuklang — AI haqiqiylikni tekshiradi</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <div className="text-[10px] font-bold uppercase text-slate-400">1. Avvalgi holat rasmi</div>
                            {beforeImgUrl && (
                              <img
                                src={resolveMediaUrl(beforeImgUrl)}
                                alt="Avval"
                                className="w-full h-24 object-cover rounded-xl border border-slate-200 dark:border-slate-700"
                              />
                            )}
                            <label className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer hover:border-emerald-500">
                              <Upload className="w-3.5 h-3.5" />
                              <span>{uploadingResImg === 'before' ? 'Yuklanmoqda...' : 'Avvalgi rasmni yangilash'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={e => handleResolutionFile(e, 'before')}
                                className="hidden"
                              />
                            </label>
                          </div>

                          <div className="space-y-1.5">
                            <div className="text-[10px] font-bold uppercase text-slate-400">2. Hal qilingandan keyingi rasm *</div>
                            {afterImgUrl ? (
                              <img
                                src={resolveMediaUrl(afterImgUrl)}
                                alt="Keyin"
                                className="w-full h-24 object-cover rounded-xl border border-emerald-500"
                              />
                            ) : (
                              <div className="w-full h-24 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-[10px] text-slate-400">
                                Keyingi rasm tanlanmagan
                              </div>
                            )}
                            <label className="w-full px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                              <Camera className="w-3.5 h-3.5" />
                              <span>{uploadingResImg === 'after' ? 'Yuklanmoqda...' : 'Keyingi rasmni yuklash'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={e => handleResolutionFile(e, 'after')}
                                className="hidden"
                              />
                            </label>
                          </div>
                        </div>

                        <textarea
                          rows={2}
                          value={resolutionNote}
                          onChange={e => setResolutionNote(e.target.value)}
                          placeholder="O'quvchi bilan qanday hal qilganingiz haqida izoh..."
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs resize-none outline-none"
                        />

                        <button
                          type="button"
                          disabled={verifyingAi || uploadingResImg !== null || !afterImgUrl}
                          onClick={() => handleSubmitAiResolution(r.id, r.imageUrl)}
                          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                        >
                          {verifyingAi ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>AI rasmni tekshirmoqda...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              <span>AI Tekshiruv & Tasdiqlash (+200 / +100 ECO)</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Full District Eco-Ambassadors Ranking (1st to Last) + Month-End TOP-3 Award Tracker */}
        <div className="lg:col-span-6 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                <span>{districtDetails?.district || user.district} · Barcha Eko-Elchilar Reytingi</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                1-o‘rindan oxirgi o‘ringacha to‘liq reyting · Oy oxiri mukofoti ({districtDetails?.lastDayDateLabel || 'Oy oxiri'},{' '}
                <b className="font-mono">{districtDetails?.daysRemainingInMonth ?? '—'} kun</b> qoldi)
              </p>
            </div>
            <Award className="w-5 h-5 text-amber-500 shrink-0" />
          </div>

          {myAmbRating && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <div className="font-bold text-slate-900 dark:text-white">
                  Sizning hozirgi o‘rningiz: <span className="font-mono text-emerald-500">#{myAmbRating.rank} / {totalAmb}</span>
                  {myAmbRating.rank === 1 && ' · 1-o‘rin yetakchisi!'}
                  {myAmbRating.isLast && totalAmb > 1 && ' · Oxirgi o‘rin — faollikni oshiring!'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {myAmbRating.isTop3
                    ? 'Tabriklaymiz! Siz hozir oy oxiridagi TOP-3 mukofot zonasidasiz (promokod chatga keladi).'
                    : `TOP-3 sovrinli o‘ringa kirish uchun yana +${Math.max(1, top3Threshold - myAmbRating.realScore)} ball kerak.`}
                </div>
              </div>
              <div className="font-mono tabular-nums font-black text-emerald-500 text-sm">
                {myAmbRating.realScore.toLocaleString()} ball
              </div>
            </div>
          )}

          {/* Gold / Silver / Bronze TOP-3 Ambassador Podium */}
          {ambList.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {ambList.slice(0, 3).map((amb, idx) => (
                <div
                  key={amb.id}
                  className={`p-3 rounded-2xl border text-xs space-y-1 ${
                    idx === 0
                      ? 'bg-amber-500/10 border-amber-400/50'
                      : idx === 1
                      ? 'bg-slate-200/60 dark:bg-slate-800/70 border-slate-300 dark:border-slate-700'
                      : 'bg-orange-500/10 border-orange-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-black text-amber-500 inline-flex items-center gap-1">
                      <Crown className="w-3.5 h-3.5" /> #{amb.rank}
                    </span>
                    <span className="font-mono tabular-nums font-black text-emerald-500">
                      {amb.realScore.toLocaleString()} ball
                    </span>
                  </div>
                  <div className="font-bold text-slate-900 dark:text-white truncate">{amb.fullName}</div>
                  <div className="text-[11px] text-slate-500 truncate">{amb.schoolName}</div>
                </div>
              ))}
            </div>
          )}

          {lbLoading && ambList.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">Tuman Eko-Elchilari reytingi yuklanmoqda...</div>
          ) : ambList.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">Tumaningizda hozircha Eko-Elchilar topilmadi.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[420px] overflow-y-auto pr-1">
              {ambList.map(amb => (
                <div
                  key={amb.id}
                  className={`py-3 px-2 rounded-xl flex items-center justify-between gap-3 text-xs ${
                    amb.isMe ? 'bg-emerald-500/10' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-8 font-mono tabular-nums font-black ${
                        amb.isTop3 ? 'text-amber-500' : amb.isLast ? 'text-rose-500' : 'text-slate-400'
                      }`}
                    >
                      #{amb.rank}
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                        <span>{amb.fullName}</span>
                        {amb.isMe && <span className="text-emerald-500 font-bold">(Siz)</span>}
                        {amb.rank === 1 && <span className="text-amber-500 font-semibold">· 1-o‘rin</span>}
                        {amb.isLast && <span className="text-rose-500 font-semibold">· Oxirgi</span>}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {amb.schoolName} · {amb.verifiedActivitiesCount} faoliyat · {amb.tasksCompletedCount} vazifa
                      </div>
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <div className="font-bold text-emerald-500">{amb.realScore.toLocaleString()} ball</div>
                    <div className="text-[11px] text-slate-400">
                      {amb.isTop3 ? 'TOP-3 mukofot' : `${amb.ecoCoins.toLocaleString()} ECO`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {districtDetails && districtDetails.monthlyAwards.length > 0 && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-xs space-y-1.5">
              <div className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-500" />
                <span>So‘nggi oy g‘oliblari ({districtDetails.monthlyAwards[0].periodLabel}):</span>
              </div>
              <div className="flex flex-wrap gap-3 text-[11px] font-mono text-slate-500">
                {districtDetails.monthlyAwards[0].topAmbassadors.map(ta => (
                  <span key={ta.id} className="text-amber-500 font-semibold">
                    #{ta.rank} {ta.fullName} (+{ta.bonusCoins} ECO{ta.promoCode ? ` · ${ta.promoCode}` : ''})
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-slate-500">
                Sovg‘angizni tuman sardoriga promokodni ko‘rsatib olishingiz mumkin.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Real-time @Ecoheros_bot Chat with School Captain, Fellow Ambassadors & Permission-Gated Student DMs */}
      <EcoTelegramChatPanel
        allowedScopes={['school_ambassadors', 'student_dm']}
        allowStudentDiscovery={true}
        title="@Ecoheros_bot · Maktab Sardori, Eko-Elchilar & Ruxsatli Suhbat"
      />
    </div>
  );
};
