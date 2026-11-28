import React, { useState } from 'react';
import { Gift, Calendar, Trophy, Copy, Check, QrCode, Sparkles } from 'lucide-react';
import { DistrictLeaderboardDetailsResponse, MonthlyAwardRecord } from '../../../types/eco';
import { useEco } from '../../../context/EcoContext';
import { VoucherVerifierPanel } from '../../shop/VoucherVerifierPanel';
import { StudentRatingManagerCard } from '../StudentRatingManagerCard';

interface DistrictRewardsSectionProps {
  region: string;
  district: string;
  districtDetails: DistrictLeaderboardDetailsResponse | null;
  awardHistory: MonthlyAwardRecord[];
  onRefresh: () => Promise<void>;
}

export const DistrictRewardsSection: React.FC<DistrictRewardsSectionProps> = ({
  region,
  district,
  districtDetails,
  awardHistory,
  onRefresh,
}) => {
  const { awardMonthlyTop3, showNotification } = useEco();
  const [awarding, setAwarding] = useState(false);
  const [confirmEarly, setConfirmEarly] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleAwardTop3 = async () => {
    setAwarding(true);
    try {
      const res = await awardMonthlyTop3({ region, district });
      if (res.success) {
        setConfirmEarly(false);
        await onRefresh();
      }
    } finally {
      setAwarding(false);
    }
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedCode(code);
    showNotification(`Promokod nusxalandi: ${code}`, 'success');
    window.setTimeout(() => setCopiedCode(null), 2000);
  };

  const canAwardDirectly = Boolean(districtDetails?.isLastDayOfMonth);
  const alreadyAwarded = Boolean(districtDetails?.alreadyAwardedThisMonth);

  return (
    <div className="space-y-4">
      {/* Month-end School & Ambassador TOP-3 Award Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-[#072419] via-[#051811] to-[#040D0A] border border-emerald-500/30 text-white space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-amber-400">
              <Calendar className="w-3.5 h-3.5" />
              <span>Oy yakuni TOP-3 taqdirlash · {districtDetails?.periodLabel || 'Joriy oy'}</span>
            </div>
            <h2 className="text-lg font-black">Maktablar va Eco Elchilar oylik mukofotlari</h2>
            <p className="text-xs text-slate-300">
              {alreadyAwarded
                ? 'Ushbu oy uchun TOP-3 g‘oliblar allaqachon taqdirlangan va promokodlar tarqatilgan.'
                : `Oy yakunigacha ${districtDetails?.daysRemainingInMonth ?? 0} kun qoldi. G‘oliblarga avtomatik promokod va EcoCoin beriladi.`}
            </p>
          </div>

          {!alreadyAwarded && (
            <div className="shrink-0">
              {canAwardDirectly || confirmEarly ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={awarding}
                    onClick={handleAwardTop3}
                    className="px-4 py-2.5 min-h-[42px] bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Trophy className="w-4 h-4" />
                    <span>{awarding ? 'Taqdirlanmoqda...' : 'TOP-3 ni tasdiqlash'}</span>
                  </button>
                  {confirmEarly && !canAwardDirectly && (
                    <button
                      type="button"
                      onClick={() => setConfirmEarly(false)}
                      className="px-3 py-2.5 min-h-[42px] rounded-xl bg-white/10 text-xs font-bold cursor-pointer"
                    >
                      Bekor
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmEarly(true)}
                  className="px-4 py-2.5 min-h-[42px] rounded-xl bg-amber-500 text-[#04110B] text-xs font-black flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>TOP-3 mukofotini berish</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Voucher / Promo Verifier strictly scoped to District */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-emerald-400 px-1">
          <QrCode className="w-3.5 h-3.5" />
          <span>Tuman sovg‘a vaucherlarini tekshirish</span>
        </div>
        <VoucherVerifierPanel />
      </div>

      {/* District Student TOP-3 Awards Manager */}
      <StudentRatingManagerCard mode="district" region={region} district={district} />

      {/* District Monthly Award History */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3 text-xs">
        <div className="flex items-center gap-2">
          <Gift className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-black">Tuman oylik mukofotlar tarixi ({awardHistory.length})</h3>
        </div>
        {awardHistory.length === 0 ? (
          <div className="py-6 text-center text-slate-400">Hali oylik mukofotlar tarqatilmagan.</div>
        ) : (
          <div className="space-y-3">
            {awardHistory.map(aw => (
              <div
                key={aw.id}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200/80 dark:border-emerald-500/20 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-black text-slate-900 dark:text-white">{aw.periodLabel || aw.periodKey}</div>
                  <div className="text-[11px] text-slate-400 tabular-nums">
                    {aw.awardedByName} · {new Date(aw.awardedAt).toLocaleDateString('uz-UZ')}
                  </div>
                </div>

                {aw.topSchools?.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold uppercase text-emerald-500">TOP-3 Maktablar</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {aw.topSchools.map(s => (
                        <div
                          key={s.id}
                          className="p-2.5 rounded-lg bg-white dark:bg-[#061812] border border-slate-200/80 dark:border-emerald-500/15 space-y-1"
                        >
                          <div className="font-bold truncate">#{s.rank} · {s.name}</div>
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="text-emerald-500 font-bold">+{s.bonusCoins} ECO</span>
                            {s.promoCode && (
                              <button
                                type="button"
                                onClick={() => handleCopy(s.promoCode!)}
                                className="inline-flex items-center gap-1 text-amber-500 hover:underline cursor-pointer"
                              >
                                <span>{s.promoCode}</span>
                                {copiedCode === s.promoCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aw.topAmbassadors?.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold uppercase text-sky-400">TOP-3 Eco Elchilar</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {aw.topAmbassadors.map(a => (
                        <div
                          key={a.id}
                          className="p-2.5 rounded-lg bg-white dark:bg-[#061812] border border-slate-200/80 dark:border-emerald-500/15 space-y-1"
                        >
                          <div className="font-bold truncate">#{a.rank} · {a.fullName}</div>
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="text-emerald-500 font-bold">+{a.bonusCoins} ECO</span>
                            {a.promoCode && (
                              <button
                                type="button"
                                onClick={() => handleCopy(a.promoCode!)}
                                className="inline-flex items-center gap-1 text-amber-500 hover:underline cursor-pointer"
                              >
                                <span>{a.promoCode}</span>
                                {copiedCode === a.promoCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
