import React, { useState } from 'react';
import { Trophy, Crown, Lock, School as SchoolIcon, TrendingUp, Award } from 'lucide-react';
import { DistrictLeaderboardDetailsResponse, DistrictUserGrowthResponse } from '../../../types/eco';
import { StudentRatingManagerCard } from '../StudentRatingManagerCard';

interface DistrictRatingsSectionProps {
  region: string;
  district: string;
  districtDetails: DistrictLeaderboardDetailsResponse | null;
  detailsLoading: boolean;
  userGrowth: DistrictUserGrowthResponse | null;
  userGrowthForbidden: boolean;
  leaders: any[];
  lbLoading: boolean;
  lbForbidden: boolean;
}

export const DistrictRatingsSection: React.FC<DistrictRatingsSectionProps> = ({
  region,
  district,
  districtDetails,
  detailsLoading,
  userGrowth,
  userGrowthForbidden,
  leaders,
  lbLoading,
  lbForbidden,
}) => {
  const [subTab, setSubTab] = useState<'schools' | 'growth_race' | 'students' | 'coordinators'>('schools');
  const schoolRatings = districtDetails?.schoolRatings || [];
  const top3Schools = schoolRatings.slice(0, 3);

  return (
    <div className="space-y-4">
      {/* Sub-view switcher inside unified ratings section */}
      <div className="p-3 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 flex flex-wrap gap-2">
        {[
          { id: 'schools', label: 'Maktablar TOP-3 & Reyting', icon: SchoolIcon },
          { id: 'growth_race', label: 'Foydalanuvchi Poygasi (TOP-3)', icon: TrendingUp },
          { id: 'students', label: 'O‘quvchilar Oylik Reytingi', icon: Trophy },
          { id: 'coordinators', label: 'Koordinatorlar Reytingi', icon: Award },
        ].map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id as any)}
            className={`px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all ${
              subTab === t.id
                ? 'bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700'
                : 'bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-slate-600 dark:text-slate-300'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* 1. District Schools Ranking */}
      {subTab === 'schools' && (
        <div className="space-y-4">
          {top3Schools.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {top3Schools.map((s, idx) => (
                <div
                  key={s.id}
                  className={`p-4 rounded-2xl border space-y-2 ${
                    idx === 0
                      ? 'bg-amber-500/10 border-amber-500/45'
                      : idx === 1
                      ? 'bg-slate-100 dark:bg-slate-800/30 border-slate-300 dark:border-slate-600'
                      : 'bg-orange-500/10 border-orange-500/35'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-lg bg-black/10 dark:bg-white/10 font-mono text-xs font-black">
                      #{s.rank} O‘RIN
                    </span>
                    <Crown className={`w-4 h-4 ${idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-400' : 'text-orange-400'}`} />
                  </div>
                  <div className="text-sm font-black text-slate-900 dark:text-white truncate">{s.name}</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    Sardor: {s.captainName || s.ambassadorName || '—'}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-black/10 dark:border-white/10 text-xs font-mono tabular-nums">
                    <span>{s.registeredStudentsCount} o‘quvchi</span>
                    <span className="font-black text-emerald-500">{s.realScore.toLocaleString()} ball</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black">Tumandagi barcha maktablar reytingi ({schoolRatings.length})</h3>
              <span className="text-xs font-mono text-emerald-500 tabular-nums">{districtDetails?.periodLabel || ''}</span>
            </div>

            {detailsLoading && schoolRatings.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">Reyting yuklanmoqda...</div>
            ) : schoolRatings.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">Maktablar reytingi topilmadi.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#040D0A] text-[10px] font-black uppercase text-slate-400">
                    <tr>
                      <th className="px-3 py-2.5">#</th>
                      <th className="px-3 py-2.5">Maktab</th>
                      <th className="px-3 py-2.5 text-right">O‘quvchi</th>
                      <th className="px-3 py-2.5 text-right">Hal etilgan</th>
                      <th className="px-3 py-2.5 text-right">EcoCoin</th>
                      <th className="px-3 py-2.5 text-right">Ball</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-emerald-500/15">
                    {schoolRatings.map(s => (
                      <tr key={s.id} className={s.isTop3 ? 'bg-amber-500/5' : ''}>
                        <td className="px-3 py-2.5 font-mono font-black tabular-nums">#{s.rank}</td>
                        <td className="px-3 py-2.5">
                          <div className="font-bold text-slate-900 dark:text-white">{s.name}</div>
                          <div className="text-[11px] text-slate-400">Sardor: {s.captainName || '—'}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{s.registeredStudentsCount}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{s.resolvedReportsCount}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{s.totalCoins.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-black text-emerald-500 tabular-nums">
                          {s.realScore.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Exclusive District Coordinators TOP-3 User-Growth Race */}
      {subTab === 'growth_race' && (
        <div className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-amber-500/40 space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-500">
                <Lock className="w-3.5 h-3.5" />
                <span>Tuman Koordinatorlari maxsus musobaqasi</span>
              </div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Eng ko‘p foydalanuvchi yig‘gan TOP-3 Tuman poygasi
              </h3>
              <p className="text-slate-500 dark:text-slate-400">
                {userGrowth?.prizeNote || 'Platforma va Telegram botga eng ko‘p foydalanuvchi jalb qilgan TOP-3 tuman taqdirlanadi.'}
              </p>
            </div>
            {userGrowth?.myDistrictRank && (
              <div className="px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/35 shrink-0">
                <div className="text-[11px] text-slate-400">Sizning o‘rningiz</div>
                <div className="font-mono font-black text-lg text-amber-500 tabular-nums">
                  #{userGrowth.myDistrictRank.rank} / {userGrowth.totalDistricts} ·{' '}
                  <span className="text-emerald-500">{userGrowth.myDistrictRank.totalJoinedUsers.toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>

          {userGrowthForbidden ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-500">
              Ushbu reyting faqat Tuman Koordinatorlari va Super Admin uchun ko‘rinadi.
            </div>
          ) : !userGrowth || userGrowth.items.length === 0 ? (
            <div className="py-8 text-center text-slate-400">Ma'lumotlar yuklanmoqda...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-[#040D0A] text-[10px] font-black uppercase text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5">O‘rin</th>
                    <th className="px-3 py-2.5">Tuman / Koordinator</th>
                    <th className="px-3 py-2.5 text-right">Maktab</th>
                    <th className="px-3 py-2.5 text-right">O‘quvchi</th>
                    <th className="px-3 py-2.5 text-right">Bot</th>
                    <th className="px-3 py-2.5 text-right">Jami</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-emerald-500/15">
                  {userGrowth.items.map(row => (
                    <tr
                      key={row.id}
                      className={row.isMyDistrict ? 'bg-emerald-500/10 font-bold' : row.isTop3 ? 'bg-amber-500/5' : ''}
                    >
                      <td className="px-3 py-2.5 font-mono font-black tabular-nums">
                        <span className={row.isTop3 ? 'text-amber-500' : 'text-slate-400'}>#{row.rank}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {row.district} {row.isMyDistrict && <span className="text-emerald-500">(Sizning tuman)</span>}
                        </div>
                        <div className="text-[11px] text-slate-400">{row.region} · {row.coordinatorName}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{row.schoolsCount}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{row.totalSchoolStudents.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-sky-500">{row.botUsersCount.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-black text-emerald-500 tabular-nums">
                        {row.totalJoinedUsers.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 3. District Student Monthly Rating & Config */}
      {subTab === 'students' && (
        <StudentRatingManagerCard mode="district" region={region} district={district} />
      )}

      {/* 4. District Coordinators Leaderboard */}
      {subTab === 'coordinators' && (
        <div className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3 text-xs">
          <h3 className="text-sm font-black">Tuman Koordinatorlari reytingi</h3>
          {lbLoading && leaders.length === 0 ? (
            <div className="py-8 text-center text-slate-400">Yuklanmoqda...</div>
          ) : lbForbidden ? (
            <div className="p-4 rounded-xl bg-rose-500/10 text-rose-500">Ruxsat cheklangan.</div>
          ) : leaders.length === 0 ? (
            <div className="py-8 text-center text-slate-400">Ma'lumotlar topilmadi.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-[#040D0A] text-[10px] font-black uppercase text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5">#</th>
                    <th className="px-3 py-2.5">Koordinator / Tuman</th>
                    <th className="px-3 py-2.5 text-right">Maktablar</th>
                    <th className="px-3 py-2.5 text-right">Ball</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-emerald-500/15">
                  {leaders.map((row: any, i: number) => (
                    <tr key={row.id || i}>
                      <td className="px-3 py-2.5 font-mono font-black tabular-nums">#{row.rank || i + 1}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-slate-900 dark:text-white">{row.fullName || row.name}</div>
                        <div className="text-[11px] text-slate-400">{row.region} · {row.district}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{row.schoolsCount || 0}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-black text-emerald-500 tabular-nums">
                        {(row.score || row.points || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
