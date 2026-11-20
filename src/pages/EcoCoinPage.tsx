import React, { useState } from 'react';
import {
  Coins,
  TrendingUp,
  ArrowDownRight,
  ArrowUpRight,
  Sparkles,
  ShoppingBag,
  Award,
  Flame,
  CheckCircle2,
  Share2,
  Copy,
  Zap,
  ChevronRight,
  Wallet,
  Clock,
  Info,
} from 'lucide-react';
import { motion, Variants, AnimatePresence } from 'framer-motion';
import { useEco } from '../context/EcoContext';
import { computeUserStreakState } from '../utils/streak';

export const EcoCoinPage: React.FC = () => {
  const { user, transactions, setActiveTab, claimDailyQuizReward, showNotification } = useEco();
  const [copied, setCopied] = useState(false);

  // Daily Quiz state
  const [quizAnswered, setQuizAnswered] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  const quizQuestion = {
    question: '1 tonna qog\'ozni qayta ishlash orqali qancha tirik daraxtni kesilishdan asrab qolish mumkin?',
    options: [
      { text: '5 ta daraxt', correct: false },
      { text: '17 ta yetuk daraxt', correct: true },
      { text: '3 ta daraxt', correct: false },
      { text: '50 ta daraxt', correct: false },
    ],
    explanation: 'To\'g\'ri javob: 17 ta yetuk daraxt! Shuningdek, 26 000 litr toza suv va 4 000 kVt elektr energiyasi tejaladi.',
  };

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

  const handleAnswerQuiz = async (index: number) => {
    if (quizAnswered) return;
    setSelectedOption(index);
    setQuizAnswered(true);
    if (quizQuestion.options[index].correct) {
      await claimDailyQuizReward(50, 'Kunlik Eko-Viktorina (+50 EcoCoin)');
    }
  };

  const handleCopyReferral = () => {
    navigator.clipboard.writeText(`https://t.me/Ecoheros_bot?start=ref_${user.uid}`);
    setCopied(true);
    showNotification('Taklif havolasi nusxalandi!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportHistory = () => {
    const csvHeader = 'ID,Sana,Turi,Miqdori,Sababi\n';
    const csvRows = transactions
      .map(t => `${t.id},${t.createdAt},${t.type},${t.amount},"${(t.reason || '').replace(/"/g, '""')}"`)
      .join('\n');
    const blob = new Blob([csvHeader + csvRows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ecocoin_tarix_${user.uid}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showNotification('Tranzaksiyalar tarixi yuklab olindi!', 'success');
  };

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12"
    >
      
      {/* 1. Cinematic Header */}
      <motion.section variants={itemVariants} className="flex flex-col md:flex-row md:items-end justify-between gap-8 pb-8 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
            <Wallet className="w-3.5 h-3.5" />
            <span>Eco-Wallet & Impact Economy</span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-black text-slate-900 dark:text-white tracking-tighter leading-[0.9]">
            EcoCoin <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-400">Hamyoni</span>
          </h1>
          <p className="text-lg text-slate-500 dark:text-slate-400 font-medium max-w-xl">
            Atrof-muhitni asrash orqali ishlagan eko-tangalaringizni boshqaring va sovg'alarga almashtiring.
          </p>
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setActiveTab('shop')}
          className="px-8 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-[10px] rounded-2xl flex items-center gap-3 uppercase tracking-widest shadow-2xl transition-all"
        >
          <ShoppingBag className="w-5 h-5" />
          <span>Eko Bozorda Ishlatish</span>
        </motion.button>
      </motion.section>

      {/* 2. Balance & Stats Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Main Balance Card (Cinematic) */}
        <motion.div variants={itemVariants} className="lg:col-span-6 relative group">
           <div className="absolute -inset-1 bg-gradient-to-r from-amber-500 to-orange-400 rounded-[40px] blur opacity-25 group-hover:opacity-40 transition duration-1000" />
           <div className="relative p-10 sm:p-14 rounded-[40px] bg-slate-900 border border-white/5 overflow-hidden text-white shadow-2xl">
              <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
                 <Coins className="w-64 h-64 rotate-12 text-amber-500 fill-amber-500" />
              </div>
              
              <div className="relative z-10 space-y-10">
                 <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-amber-400 uppercase tracking-[0.2em]">Current Balance</span>
                    <Sparkles className="w-6 h-6 text-amber-400" />
                 </div>

                 <div className="space-y-2">
                    <div className="text-7xl sm:text-8xl font-black text-amber-400 font-mono tracking-tighter flex items-baseline gap-4">
                       {user.ecoCoins.toLocaleString()}
                       <span className="text-xl font-black text-white/40 uppercase tracking-widest font-sans">EC</span>
                    </div>
                    <p className="text-sm text-slate-400 font-medium">Platformadagi barcha xaridlar uchun yagona valyuta.</p>
                 </div>

                 <div className="pt-8 border-t border-white/5 flex items-center justify-between">
                    <div className="space-y-1">
                       <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total Earned</div>
                       <div className="text-lg font-black text-emerald-400 font-mono">+{user.totalCoinsEarned?.toLocaleString() || '0'}</div>
                    </div>
                    <div className="text-right space-y-1">
                       <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Status</div>
                       <div className="text-lg font-black text-indigo-400 uppercase tracking-tighter">Verified</div>
                    </div>
                 </div>
              </div>
           </div>
        </motion.div>

        {/* Level & Streak Cards */}
        <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-8">
           <motion.div variants={itemVariants} className="p-8 rounded-[32px] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xl space-y-8 flex flex-col justify-between">
              <div className="space-y-4">
                 <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                       <Award className="w-6 h-6" />
                    </div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Eco Rank</span>
                 </div>
                 <div className="space-y-1">
                    <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">
                       {user.badge}
                    </div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Master of Trees</p>
                 </div>
              </div>

              <div className="space-y-4">
                 <div className="flex justify-between items-end">
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Progress to next level</div>
                    <div className="text-xs font-black text-slate-900 dark:text-white font-mono">
                       {Math.round(((user.totalCoinsEarned || 0) / 1500) * 100)}%
                    </div>
                 </div>
                 <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
                    <motion.div
                       initial={{ width: 0 }}
                       animate={{ width: `${Math.min(((user.totalCoinsEarned || 0) / 1500) * 100, 100)}%` }}
                       className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                    />
                 </div>
              </div>
           </motion.div>

           <motion.div variants={itemVariants} className="p-8 rounded-[32px] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xl space-y-8 flex flex-col justify-between relative overflow-hidden">
              <div className="absolute -right-8 -top-8 p-12 opacity-5 pointer-events-none">
                 <Flame className="w-24 h-24 text-amber-500 fill-amber-500" />
              </div>
              <div className="space-y-4">
                 <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                       <Flame className="w-6 h-6 fill-amber-500/20" />
                    </div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Activity Streak</span>
                 </div>
                 <div className="space-y-1">
                    <div className="text-4xl font-black text-slate-900 dark:text-white font-mono tracking-tighter tabular-nums">
                       {computeUserStreakState({ lastStreakClaimDate: user.lastStreakClaimDate, storedStreakDays: user.streakDays ?? user.activityStats?.streakDays }).currentStreakDays} KUN
                    </div>
                    <p className="text-[10px] text-amber-500 font-black uppercase tracking-widest flex items-center gap-2">
                       <Zap className="w-3 h-3 fill-amber-500" /> Uzluksiz faollik
                    </p>
                 </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                 Har kuni uzluksiz kiring: 1-kun <span className="text-slate-900 dark:text-white font-black">+50</span>, 2-kun <span className="text-slate-900 dark:text-white font-black">+100</span>, 3-kun <span className="text-slate-900 dark:text-white font-black">+300</span>, 7-kunda <span className="text-emerald-500 font-black">+1,000 EcoCoin</span>gacha!
              </p>
           </motion.div>
        </div>

      </section>

      {/* 3. Daily Quiz Widget (Upgraded) */}
      <motion.section variants={itemVariants} className="relative group overflow-hidden rounded-[48px]">
        <div className="absolute inset-0 bg-slate-900" />
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/20 via-transparent to-indigo-600/20" />
        <div className="relative p-10 sm:p-16 space-y-10 text-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-[10px] font-black uppercase tracking-widest text-emerald-400">
              <Sparkles className="w-4 h-4" />
              <span>Kunlik Eko-Viktorina (+50 EcoCoin)</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
               <Clock className="w-4 h-4" />
               New Quiz in 14:22:05
            </div>
          </div>

          <div className="max-w-3xl space-y-4">
            <h3 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight">
              {quizQuestion.question}
            </h3>
            <p className="text-slate-400 font-medium">To'g'ri javobni tanlang va darhol EcoCoin balansingizni oshiring.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {quizQuestion.options.map((opt, idx) => {
              const isSelected = selectedOption === idx;
              const isCorrect = opt.correct;
              const showResult = quizAnswered;

              return (
                <motion.button
                  key={idx}
                  whileHover={!quizAnswered ? { x: 10 } : {}}
                  onClick={() => handleAnswerQuiz(idx)}
                  disabled={quizAnswered}
                  className={`group p-6 rounded-3xl border-2 text-left transition-all relative overflow-hidden ${
                    !showResult 
                      ? 'bg-white/5 border-white/5 hover:border-emerald-500/50' 
                      : isCorrect 
                        ? 'bg-emerald-600 border-emerald-500 text-white shadow-xl shadow-emerald-600/20' 
                        : isSelected 
                          ? 'bg-rose-600 border-rose-500 text-white' 
                          : 'bg-white/5 border-white/5 opacity-40'
                  }`}
                >
                  <div className="flex items-center justify-between relative z-10">
                    <span className="text-sm font-black uppercase tracking-tight">{opt.text}</span>
                    {showResult && isCorrect && <CheckCircle2 className="w-6 h-6 text-white" />}
                  </div>
                </motion.button>
              );
            })}
          </div>

          <AnimatePresence>
             {quizAnswered && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-8 rounded-[32px] bg-white/10 backdrop-blur-md border border-white/10 space-y-4"
                >
                   <div className="flex items-center gap-2 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                      <Info className="w-4 h-4" />
                      Explanation
                   </div>
                   <p className="text-sm font-medium text-slate-200 leading-relaxed max-w-3xl">
                      {quizQuestion.explanation}
                   </p>
                </motion.div>
             )}
          </AnimatePresence>
        </div>
      </motion.section>

      {/* 4. Transactions Table (Upgraded) */}
      <motion.section variants={itemVariants} className="space-y-8">
        <div className="flex items-end justify-between px-2">
           <div className="space-y-2">
              <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Transaction Log</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">History of your impact economy</p>
           </div>
           <button onClick={handleExportHistory} className="flex items-center gap-2 text-[10px] font-black text-emerald-500 uppercase tracking-widest hover:gap-4 transition-all cursor-pointer">
              Export History <ChevronRight className="w-4 h-4" />
           </button>
        </div>

        <div className="rounded-[40px] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-white/5 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-white/5">
                  <th className="px-10 py-6">Description</th>
                  <th className="px-10 py-6">Type</th>
                  <th className="px-10 py-6">Timestamp</th>
                  <th className="px-10 py-6 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {transactions.map(tx => (
                  <tr key={tx.id} className="group hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                    <td className="px-10 py-8">
                      <div className="text-sm font-black text-slate-900 dark:text-white tracking-tight">{tx.reason}</div>
                    </td>
                    <td className="px-10 py-8">
                      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                        tx.type === 'earn'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : tx.type === 'bonus'
                          ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      }`}>
                        {tx.type === 'earn' ? <ArrowDownRight className="w-3.5 h-3.5" /> : tx.type === 'bonus' ? <Sparkles className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                        {tx.type}
                      </div>
                    </td>
                    <td className="px-10 py-8">
                      <div className="text-[10px] font-black text-slate-400 uppercase font-mono tracking-widest">
                        {new Date(tx.createdAt).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    </td>
                    <td className="px-10 py-8 text-right">
                      <div className={`text-sm font-black font-mono tracking-tighter ${tx.amount > 0 ? 'text-emerald-500' : 'text-slate-500'}`}>
                        {tx.amount > 0 ? `+${tx.amount}` : tx.amount} EC
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.section>

      {/* 5. Referral Teaser (Upgraded) */}
      <motion.section variants={itemVariants}>
         <div className="p-10 rounded-[40px] bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 flex flex-col xl:flex-row items-center justify-between gap-10 text-center xl:text-left">
            <div className="flex flex-col xl:flex-row items-center gap-8">
               <div className="w-20 h-20 rounded-[28px] bg-white dark:bg-slate-900 shadow-xl flex items-center justify-center text-emerald-500 border border-slate-100 dark:border-white/5">
                  <Share2 className="w-10 h-10" />
               </div>
               <div className="space-y-2">
                  <h4 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Invite & Earn</h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-medium max-w-md">Do'stlaringizni taklif qiling va har biri uchun <span className="text-emerald-500 font-black">+100 EC</span> bonusga ega bo'ling.</p>
               </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full xl:w-auto">
               <button
                 onClick={handleCopyReferral}
                 className="w-full sm:w-auto px-10 py-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl hover:border-emerald-500 transition-all"
               >
                 <Copy className="w-5 h-5 text-emerald-500" />
                 <span>{copied ? 'Nusxalandi!' : 'Copy Invite Link'}</span>
               </button>
               <button
                 onClick={() => setActiveTab('referral')}
                 className="w-full sm:w-auto px-10 py-5 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-emerald-600/20 active:scale-95 transition-all"
               >
                 Invite System
               </button>
            </div>
         </div>
      </motion.section>

    </motion.div>
  );
};
