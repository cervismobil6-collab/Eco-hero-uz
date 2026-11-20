import React, { useState } from 'react';
import {
  Award,
  Share2,
  Copy,
  Check,
  Gift,
  Users,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  Coins,
  BookOpen,
  Target,
  CheckCircle2,
  Recycle,
  Lightbulb,
  Building2,
  ChevronRight,
  Star,
  Flame,
  Globe,
  Zap,
} from 'lucide-react';
import { motion, Variants } from 'framer-motion';
import { useEco } from '../context/EcoContext';

export const EcoRewardsHubPage: React.FC = () => {
  const { user, setActiveTab, triggerHaptic, showNotification } = useEco();
  const [copiedLink, setCopiedLink] = useState(false);

  const referralLink = `https://t.me/Ecoheros_bot?start=ref_${user.referralCode || user.uid.slice(-6)}`;

  const handleCopyLink = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(referralLink).catch(() => {});
    }
    triggerHaptic('light');
    setCopiedLink(true);
    showNotification('Taklif havolasi nusxalandi!', 'success');
    setTimeout(() => setCopiedLink(false), 3000);
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

  const rewardModules = [
    {
      id: 'referral',
      title: 'Eco Invite',
      subtitle: 'Smart Referral',
      description: 'Do\'stlaringizni taklif qiling va har bir tasdiqlangan foydalanuvchi uchun 100 EcoCoin oling.',
      icon: Users,
      color: 'text-emerald-500',
      reward: '+100 EC',
      actionText: 'Invite Friends',
      tabKey: 'referral',
    },
    {
      id: 'quiz',
      title: 'Eco Quiz',
      subtitle: 'Daily Knowledge',
      description: 'Har kuni 5 ta ekologik savolga javob bering, bilimingizni sinang va tangalar yig\'ing.',
      icon: BookOpen,
      color: 'text-sky-500',
      reward: '+50 EC',
      actionText: 'Start Quiz',
      tabKey: 'quiz',
    },
    {
      id: 'missions',
      title: 'Eco Mission',
      subtitle: 'Action Tasks',
      description: 'Maktab bog\'ini parvarish qilish, chiqindilarni saralash va amaliy eko-vazifalar.',
      icon: Target,
      color: 'text-amber-500',
      reward: '+300 EC',
      actionText: 'View Tasks',
      tabKey: 'tasks',
    },
    {
      id: 'creator',
      title: 'Eco Creator',
      subtitle: 'Content Contest',
      description: 'Ekologik posterlar, videokliplar va maqolalar tayyorlab o\'z ijodingizni namoyish eting.',
      icon: Sparkles,
      color: 'text-purple-500',
      reward: '+500 EC',
      actionText: 'Submit Art',
      tabKey: 'creator',
    },
    {
      id: 'recycle',
      title: 'Eco Recycle',
      subtitle: 'Material Banking',
      description: 'Plastik va qog\'oz chiqindilarni hamkor qabul punktlariga topshiring va raqamli chek oling.',
      icon: Recycle,
      color: 'text-teal-500',
      reward: 'Variable',
      actionText: 'Find Points',
      tabKey: 'recycle',
    },
    {
      id: 'knowledge',
      title: 'Learn & Earn',
      subtitle: 'Education Academy',
      description: 'Ekologiya bo\'yicha qisqa ma\'rifiy videolarni ko\'ring va testdan o\'tib mukofot oling.',
      icon: Flame,
      color: 'text-rose-500',
      reward: '+40 EC',
      actionText: 'Start Lessons',
      tabKey: 'knowledge',
    },
    {
      id: 'school_battle',
      title: 'School Battle',
      subtitle: 'National League',
      description: 'Respublika bo\'yicha maktabingiz reytingini ko\'taring va oy g\'olibi bo\'ling.',
      icon: Building2,
      color: 'text-indigo-500',
      reward: 'Cups & Bonus',
      actionText: 'Leaderboard',
      tabKey: 'championship',
    },
    {
      id: 'ambassador',
      title: 'Eco Ambassador',
      subtitle: 'Leadership Program',
      description: 'Maktabingizda eko-jamoa tuzing va yangi maktablarni platformaga jalb qiling.',
      icon: Award,
      color: 'text-blue-500',
      reward: 'Elite Status',
      actionText: 'Apply Now',
      tabKey: 'ambassador',
    },
    {
      id: 'innovation',
      title: 'Eco Innovation',
      subtitle: 'Startup Pitch',
      description: 'Ekologik muammolarni hal qilish bo\'yicha o\'z innovatsion loyihangizni taqdim eting.',
      icon: Lightbulb,
      color: 'text-orange-500',
      reward: '+3000 EC',
      actionText: 'Pitch Idea',
      tabKey: 'innovation',
    },
    {
      id: 'market',
      title: 'Eco Market',
      subtitle: 'Redeem Shop',
      description: 'Yig\'gan EcoCoin tangalaringizni smartfon, velosiped va kitoblarga almashtiring.',
      icon: Gift,
      color: 'text-emerald-600',
      reward: 'Real Gifts',
      actionText: 'Open Shop',
      tabKey: 'shop',
    },
  ];

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12"
    >
      
      {/* 1. Cinematic Header */}
      <motion.section variants={itemVariants} className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-emerald-600 to-teal-400 rounded-[48px] blur opacity-25 group-hover:opacity-40 transition duration-1000" />
        <div className="relative p-10 sm:p-20 rounded-[48px] bg-slate-900 border border-white/5 overflow-hidden text-white shadow-2xl">
          <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
             <Zap className="w-96 h-96 text-emerald-500" />
          </div>
          
          <div className="relative z-10 space-y-10 max-w-3xl">
             <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-[10px] font-black uppercase tracking-widest text-emerald-400">
                <Sparkles className="w-4 h-4" />
                <span>Impact Rewards Ecosystem</span>
             </div>

             <h1 className="text-5xl sm:text-7xl font-black tracking-tighter leading-[0.9] text-balance">
                Asrang, <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-indigo-400">Yig'ing</span> va <br /> G'olib bo'ling.
             </h1>

             <p className="text-lg sm:text-xl text-slate-400 leading-relaxed font-medium">
                Ekologik faoliyat modullari orqali bilimingizni oshiring, eko-vazifalarni bajaring va sovg'alar yuting.
             </p>

             <div className="flex flex-wrap items-center gap-6 pt-4">
                <div className="px-8 py-4 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 flex items-center gap-4">
                   <Coins className="w-8 h-8 text-amber-400 fill-amber-400" />
                   <div>
                      <div className="text-[10px] text-emerald-400 uppercase font-black tracking-widest">Sizning Balansingiz</div>
                      <div className="text-2xl font-black font-mono">{user.ecoCoins.toLocaleString()} EC</div>
                   </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setActiveTab('shop')}
                  className="px-10 py-5 rounded-2xl bg-white text-slate-900 font-black text-[10px] uppercase tracking-widest shadow-2xl flex items-center gap-3 active:bg-slate-50 transition-colors"
                >
                   <Gift className="w-5 h-5 text-emerald-600" />
                   <span>Eco Market</span>
                </motion.button>
             </div>
          </div>
        </div>
      </motion.section>

      {/* 2. Referral Quick Sharing (Glassmorphism) */}
      <motion.section variants={itemVariants}>
         <div className="p-10 rounded-[40px] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-8">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8">
               <div className="flex items-center gap-6">
                  <div className="w-16 h-16 rounded-[24px] bg-emerald-500/10 flex items-center justify-center text-emerald-600 border border-emerald-500/20">
                     <Users className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                     <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Eco Invite</h3>
                     <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Do'stingizni taklif qiling va ikkovingiz ham bonusga ega bo'ling.</p>
                  </div>
               </div>

               <div className="flex flex-col sm:flex-row items-center gap-4 w-full xl:w-auto">
                  <div className="w-full sm:flex-1 px-6 py-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 text-sm font-mono text-slate-500 truncate min-w-0">
                     {referralLink}
                  </div>
                  <button
                    onClick={handleCopyLink}
                    className="w-full sm:w-auto px-10 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] rounded-2xl uppercase tracking-widest shadow-xl shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
                  >
                    {copiedLink ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
                  </button>
               </div>
            </div>
         </div>
      </motion.section>

      {/* 3. Reward Modules Grid */}
      <section className="space-y-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 px-4">
           <div className="space-y-2">
              <h3 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Reward Ecosystem</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">10 interactive ways to earn impact points</p>
           </div>
           <div className="flex items-center gap-2 text-[10px] font-black text-emerald-500 uppercase tracking-widest">
              <ShieldAlert className="w-4 h-4" />
              Verified Accounts Only
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {rewardModules.map((mod) => (
            <motion.div
              key={mod.id}
              whileHover={{ y: -10 }}
              onClick={() => {
                triggerHaptic('light');
                setActiveTab(mod.tabKey as any);
              }}
              className="group p-8 rounded-[40px] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 transition-all cursor-pointer flex flex-col justify-between space-y-8 shadow-xl"
            >
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 group-hover:scale-110 transition-transform ${mod.color}`}>
                    <mod.icon className="w-7 h-7" />
                  </div>
                  <div className="px-4 py-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest border border-amber-500/20 shadow-sm">
                    {mod.reward}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="space-y-0.5">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{mod.subtitle}</div>
                    <h4 className="text-2xl font-black text-slate-900 dark:text-white group-hover:text-emerald-500 transition-colors uppercase tracking-tight">
                      {mod.title}
                    </h4>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium line-clamp-3">
                    {mod.description}
                  </p>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-50 dark:border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">{mod.actionText}</span>
                <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-white/5 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-sm">
                   <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* 4. Global Leaderboard Teaser */}
      <motion.section variants={itemVariants} className="p-12 rounded-[48px] bg-gradient-to-br from-indigo-600 to-emerald-600 text-white overflow-hidden relative group">
         <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
         <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
            <div className="flex items-center gap-8 text-center md:text-left">
               <div className="w-24 h-24 rounded-[32px] bg-white/20 backdrop-blur-md flex items-center justify-center shadow-2xl border border-white/20">
                  <Globe className="w-12 h-12" />
               </div>
               <div className="space-y-2">
                  <h4 className="text-3xl font-black uppercase tracking-tighter">Global Impact Board</h4>
                  <p className="text-indigo-100 font-medium max-w-md">Barcha maktablar va viloyatlar o'rtasidagi umumiy reytingni kuzatib boring.</p>
               </div>
            </div>
            <button
              onClick={() => setActiveTab('championship')}
              className="px-12 py-5 bg-white text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-2xl active:scale-95 transition-all"
            >
               Open Championship
            </button>
         </div>
      </motion.section>

    </motion.div>
  );
};
