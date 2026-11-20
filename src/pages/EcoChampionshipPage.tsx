import React, { useState, useEffect } from 'react';
import {
  Trophy,
  Award,
  Medal,
  ChevronRight,
  Search,
  Filter,
  Users,
  Building2,
  Globe,
  MapPin,
  Calendar,
  CheckCircle2,
  Clock,
  QrCode,
  Download,
  Info,
  ChevronDown,
  Star,
  Zap,
  TrendingUp,
  Target,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { useEco } from '../context/EcoContext';
import {
  CompetitionLevel,
  CompetitionScore,
  CompetitionPeriod,
  ChampionshipResult,
  Certificate,
} from '../types/eco';

export const EcoChampionshipPage: React.FC = () => {
  const { 
    schools, 
    user, 
    triggerHaptic,
    competitionScores,
    competitionPeriods,
    championshipResults,
  } = useEco();
  
  const [activeLevel, setActiveLevel] = useState<CompetitionLevel>('district');
  const [activeTab, setActiveSubTab] = useState<'schools' | 'students'>('schools');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState(user.region || 'Toshkent shahri');
  const [selectedDistrict, setSelectedDistrict] = useState(user.district || 'Chilonzor tumani');

  const currentPeriod = competitionPeriods.find(p => p.status === 'active') || competitionPeriods[0];

  const filteredScores = competitionScores.filter(s => {
    if (s.periodId !== currentPeriod?.id) return false;
    if (s.entityType !== (activeTab === 'schools' ? 'school' : 'student')) return false;
    if (activeLevel === 'district' && s.district !== selectedDistrict) return false;
    if (activeLevel === 'regional' && s.region !== selectedRegion) return false;
    if (searchQuery && !s.entityName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }).sort((a, b) => b.points - a.points);

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 100 } },
  };

  const getRankBadge = (pos: number) => {
    switch (pos) {
      case 1: return <div className="w-10 h-10 rounded-2xl bg-amber-400 flex items-center justify-center shadow-lg shadow-amber-400/20"><Medal className="w-6 h-6 text-white" /></div>;
      case 2: return <div className="w-10 h-10 rounded-2xl bg-slate-300 flex items-center justify-center shadow-lg shadow-slate-300/20"><Medal className="w-6 h-6 text-white" /></div>;
      case 3: return <div className="w-10 h-10 rounded-2xl bg-amber-700 flex items-center justify-center shadow-lg shadow-amber-700/20"><Medal className="w-6 h-6 text-white" /></div>;
      default: return <span className="w-10 text-center font-black text-slate-400 text-lg">#{pos}</span>;
    }
  };

  const getQualificationStatus = (pos: number) => {
    if (pos <= 3) {
      return (
        <motion.span 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-2"
        >
          <Zap className="w-3.5 h-3.5 fill-emerald-500" />
          Qualified
        </motion.span>
      );
    }
    return null;
  };

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12"
    >
      
      {/* 1. Cinematic Hero Header */}
      <motion.section variants={itemVariants} className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-indigo-600 via-emerald-500 to-teal-400 rounded-[48px] blur opacity-25 group-hover:opacity-40 transition duration-1000" />
        <div className="relative p-10 sm:p-16 rounded-[48px] bg-slate-900 border border-white/5 overflow-hidden text-white shadow-2xl">
          <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
            <Trophy className="w-96 h-96 rotate-12 text-emerald-500" />
          </div>
          
          <div className="relative z-10 space-y-8 max-w-3xl">
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-[10px] font-black uppercase tracking-widest text-emerald-400">
              <Calendar className="w-4 h-4" />
              <span>{currentPeriod.name} Musobaqa Mavsumi</span>
            </div>

            <h1 className="text-5xl sm:text-7xl font-black tracking-tighter leading-[0.9] text-balance">
              ECO HERO <br /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-indigo-400">Milliy Chempionati</span>
            </h1>

            <p className="text-lg sm:text-xl text-slate-400 leading-relaxed font-medium max-w-2xl">
              Uch bosqichli ekologik poyga: Tumandan viloyatga, viloyatdan respublika darajasiga ko'tariling. Maktabingiz sharafini himoya qiling!
            </p>

            <div className="flex flex-wrap items-center gap-6 pt-4">
              <div className="flex -space-x-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="w-14 h-14 rounded-full border-4 border-slate-900 bg-slate-800 shadow-xl overflow-hidden ring-1 ring-white/10">
                    <img src={`https://i.pravatar.cc/100?img=${i + 30}`} className="w-full h-full object-cover" alt="" />
                  </div>
                ))}
                <div className="w-14 h-14 rounded-full border-4 border-slate-900 bg-emerald-600 flex items-center justify-center text-[10px] font-black shadow-xl ring-1 ring-white/10">
                  +18k
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-black uppercase tracking-widest text-emerald-400">Active Participants</div>
                <div className="text-sm font-medium text-slate-400">Respublika bo'ylab faol o'quvchilar</div>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* 2. Navigation & Controls */}
      <motion.section variants={itemVariants} className="flex flex-col xl:flex-row xl:items-center justify-between gap-8">
        <div className="flex items-center p-2 rounded-[24px] bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/60 backdrop-blur-xl w-fit">
          {[
            { id: 'district', label: 'Tuman Bosqichi', icon: MapPin },
            { id: 'regional', label: 'Viloyat Bosqichi', icon: Building2 },
            { id: 'national', label: 'Respublika', icon: Globe },
          ].map((level) => {
            const Icon = level.icon;
            const isActive = activeLevel === level.id;
            return (
              <button
                key={level.id}
                onClick={() => {
                  triggerHaptic();
                  setActiveLevel(level.id as CompetitionLevel);
                }}
                className={`relative px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-3 group ${
                  isActive
                    ? 'text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeLevel"
                    className="absolute inset-0 bg-emerald-600 rounded-2xl shadow-xl shadow-emerald-600/20"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <Icon className={`w-4 h-4 relative z-10 transition-colors ${isActive ? 'text-white' : 'group-hover:text-emerald-500'}`} />
                <span className="relative z-10">{level.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-4">
           <div className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xl shadow-black/5">
              <Clock className="w-5 h-5 text-emerald-500" />
              <div className="text-right">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vaqt tugashiga</div>
                <div className="text-sm font-black text-slate-900 dark:text-white font-mono uppercase">12d 04h 22m</div>
              </div>
           </div>
           
           <div className="hidden sm:flex items-center gap-3 px-6 py-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
              <Award className="w-5 h-5" />
              <div className="text-sm font-black uppercase tracking-widest">Season 2.0 Rewards</div>
           </div>
        </div>
      </motion.section>

      {/* 3. Main Data Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        
        {/* Left Sidebar: Context & Filters */}
        <motion.aside variants={itemVariants} className="lg:col-span-4 space-y-8">
          
          <div className="p-8 rounded-[40px] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-8">
            <div className="flex items-center gap-3 pb-6 border-b border-slate-100 dark:border-slate-800">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <Filter className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">
                Ranking Filter
              </h3>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Tanlangan Viloyat</label>
                <div className="relative">
                  <select
                    value={selectedRegion}
                    onChange={(e) => setSelectedRegion(e.target.value)}
                    className="w-full appearance-none px-6 py-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 text-sm font-black text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all cursor-pointer"
                  >
                    <option value="Toshkent shahri">Toshkent shahri</option>
                    <option value="Andijon viloyati">Andijon viloyati</option>
                    <option value="Samarqand viloyati">Samarqand viloyati</option>
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {activeLevel === 'district' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Tanlangan Tuman</label>
                  <div className="relative">
                    <select
                      value={selectedDistrict}
                      onChange={(e) => setSelectedDistrict(e.target.value)}
                      className="w-full appearance-none px-6 py-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 text-sm font-black text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all cursor-pointer"
                    >
                      <option value="Chilonzor tumani">Chilonzor tumani</option>
                      <option value="Yunusobod tumani">Yunusobod tumani</option>
                      <option value="Mirzo Ulug'bek tumani">Mirzo Ulug'bek tumani</option>
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 rounded-3xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 space-y-4">
              <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400 font-black text-[10px] uppercase tracking-widest">
                <Info className="w-4 h-4" />
                <span>Chempionat Qoidalari</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                Tuman miqyosida <b className="text-emerald-600 dark:text-emerald-400">TOP 3</b> talikka kirgan maktablar avtomatik ravishda viloyat bosqichiga yo'llanma oladi. O'quvchilar ballari umumiy maktab hisobiga qo'shiladi.
              </p>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-6">
            <div className="p-8 rounded-[32px] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xl text-center space-y-2">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Maktablar</div>
              <div className="text-4xl font-black text-slate-900 dark:text-white font-mono tracking-tighter">24</div>
            </div>
            <div className="p-8 rounded-[32px] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xl text-center space-y-2">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">O'quvchilar</div>
              <div className="text-4xl font-black text-emerald-600 font-mono tracking-tighter">1.2k</div>
            </div>
          </div>
        </motion.aside>

        {/* Right Rankings Section */}
        <motion.div variants={itemVariants} className="lg:col-span-8 space-y-10">
          
          {/* Sub-Tabs: Schools vs Students */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-8 border-b border-slate-200 dark:border-slate-800 w-full sm:w-auto">
              {[
                { id: 'schools', label: 'Maktablar Reytingi' },
                { id: 'students', label: 'Eng Faol O\'quvchilar' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveSubTab(tab.id as any)}
                  className={`relative pb-4 text-[10px] font-black uppercase tracking-widest transition-all ${
                    activeTab === tab.id
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="activeSubTab"
                      className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-600 rounded-full"
                    />
                  )}
                </button>
              ))}
            </div>

            <div className="relative group min-w-[280px]">
              <Search className="w-4 h-4 absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-emerald-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nomi bo'yicha qidirish..."
                className="w-full pl-12 pr-6 py-4 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all shadow-xl shadow-black/5"
              />
            </div>
          </div>

          {/* Ranking Board */}
          <div className="rounded-[40px] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 dark:bg-white/5 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-white/5">
                    <th className="px-10 py-6 w-24 text-center">Rank</th>
                    <th className="px-10 py-6">{activeTab === 'schools' ? 'Entity Name' : 'Eco Hero'}</th>
                    <th className="px-10 py-6 text-center">Competition Pts</th>
                    <th className="px-10 py-6 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  <AnimatePresence mode="popLayout">
                    {filteredScores.map((score, idx) => {
                      const pos = idx + 1;
                      const isCurrentUser = score.entityName.includes('Siz');
                      return (
                        <motion.tr 
                          key={score.id}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className={`group transition-all hover:bg-slate-50 dark:hover:bg-white/5 ${
                            isCurrentUser ? 'bg-emerald-500/5 dark:bg-emerald-500/10' : ''
                          }`}
                        >
                          <td className="px-10 py-8 whitespace-nowrap">
                            <div className="flex items-center justify-center">
                              {getRankBadge(pos)}
                            </div>
                          </td>
                          <td className="px-10 py-8">
                            <div className="flex items-center gap-6">
                              {activeTab === 'schools' ? (
                                <div className="w-16 h-16 rounded-[24px] bg-slate-100 dark:bg-white/5 flex items-center justify-center text-emerald-600 shrink-0 border border-slate-200 dark:border-white/5">
                                  <Building2 className="w-8 h-8" />
                                </div>
                              ) : (
                                <div className="w-16 h-16 rounded-[24px] bg-slate-100 dark:bg-white/5 flex items-center justify-center text-emerald-600 shrink-0 overflow-hidden border-4 border-white dark:border-slate-800 shadow-xl">
                                  <img src={`https://i.pravatar.cc/100?u=${score.entityId}`} className="w-full h-full object-cover" alt="" />
                                </div>
                              )}
                              <div className="min-w-0 space-y-1">
                                <div className="text-base font-black text-slate-900 dark:text-white tracking-tight truncate">
                                  {score.entityName}
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 font-black uppercase tracking-widest">
                                  <MapPin className="w-3 h-3 text-emerald-500" />
                                  {activeTab === 'schools' ? score.district : score.entityId.includes('Siz') ? 'Champion' : 'Elite Hero'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-10 py-8 text-center whitespace-nowrap">
                            <div className="inline-flex flex-col items-center">
                              <span className="text-xl font-black text-indigo-600 dark:text-indigo-400 font-mono tracking-tighter">
                                {score.points.toLocaleString()}
                              </span>
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Competition Pts</span>
                            </div>
                          </td>
                          <td className="px-10 py-8 text-right whitespace-nowrap">
                            <div className="flex flex-col items-end gap-2">
                              {getQualificationStatus(pos)}
                              {!getQualificationStatus(pos) && (
                                <button className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-emerald-500 transition-colors group/btn">
                                  View Profile <ChevronRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
                                </button>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
            
            {filteredScores.length === 0 && (
              <div className="p-24 text-center space-y-6">
                <div className="w-24 h-24 rounded-[32px] bg-slate-50 dark:bg-white/5 flex items-center justify-center mx-auto text-slate-300 dark:text-slate-700">
                  <Target className="w-12 h-12" />
                </div>
                <div className="space-y-2">
                  <h4 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Ma'lumot topilmadi</h4>
                  <p className="text-sm text-slate-500 max-w-xs mx-auto">Tanlangan hudud yoki tuman bo'yicha hali natijalar shakllanmagan.</p>
                </div>
              </div>
            )}
          </div>

          {/* 4. Hall of Fame / Past Results */}
          <motion.div variants={itemVariants} className="relative group overflow-hidden rounded-[40px]">
             <div className="absolute inset-0 bg-gradient-to-r from-amber-500 to-orange-600 opacity-90" />
             <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
             <div className="relative p-10 flex flex-col md:flex-row items-center justify-between gap-8 text-white">
                <div className="flex items-center gap-6">
                   <div className="w-20 h-20 rounded-[24px] bg-white/20 backdrop-blur-md flex items-center justify-center shadow-2xl">
                      <Award className="w-10 h-10" />
                   </div>
                   <div className="space-y-1">
                      <h4 className="text-2xl font-black uppercase tracking-tighter">O'tgan Oy G'oliblari</h4>
                      <p className="text-sm text-white/80 font-medium">Oktyabr oyi yakunlari bo'yicha eng yaxshi maktablar taqdirlandi.</p>
                   </div>
                </div>
                <button className="px-10 py-5 bg-white text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-2xl">
                   Arxivni Ko'rish
                </button>
             </div>
          </motion.div>

        </motion.div>
      </section>

    </motion.div>
  );
};
