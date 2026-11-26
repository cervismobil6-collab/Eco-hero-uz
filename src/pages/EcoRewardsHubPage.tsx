import React, { useState } from 'react';
import {
  Award,
  Copy,
  Check,
  Gift,
  Users,
  Sparkles,
  Coins,
  BookOpen,
  Target,
  Recycle,
  Lightbulb,
  Building2,
  ChevronRight,
  Flame,
  Globe,
} from 'lucide-react';
import { motion, Variants } from 'framer-motion';
import { useEco } from '../context/EcoContext';
import dailyQuestChestImg from '../assets/images/daily_quest_chest_1795179383259.jpg';

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
      transition: { staggerChildren: 0.05 },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  };

  const rewardModules = [
    {
      id: 'referral',
      title: 'Eco Invite',
      subtitle: "Do'stlarni taklif",
      description: "Har bir tasdiqlangan do'st uchun 100 EcoCoin oling.",
      icon: Users,
      color: 'text-emerald-400',
      reward: '+100 EC',
      actionText: 'Taklif qilish',
      tabKey: 'referral',
    },
    {
      id: 'quiz',
      title: 'Eco Quiz',
      subtitle: 'Kunlik viktorina',
      description: "Har kuni savollarga javob berib EcoCoin yig'ing.",
      icon: BookOpen,
      color: 'text-sky-400',
      reward: '+50 EC',
      actionText: 'Boshlash',
      tabKey: 'quiz',
    },
    {
      id: 'missions',
      title: 'Missiyalar',
      subtitle: 'Amaliy vazifalar',
      description: 'Daraxt parvarishi, saralash va eko-topshiriqlar.',
      icon: Target,
      color: 'text-amber-400',
      reward: '+300 EC',
      actionText: "Ko'rish",
      tabKey: 'tasks',
    },
    {
      id: 'creator',
      title: 'Eco Creator',
      subtitle: 'Ijodiy tanlov',
      description: "Ekologik poster va videoroliklar bilan g'olib bo'ling.",
      icon: Sparkles,
      color: 'text-emerald-300',
      reward: '+500 EC',
      actionText: 'Yuborish',
      tabKey: 'creator',
    },
    {
      id: 'recycle',
      title: 'Eco Recycle',
      subtitle: 'Qayta ishlash',
      description: "Plastik va qog'oz topshirib raqamli chek oling.",
      icon: Recycle,
      color: 'text-teal-400',
      reward: '+Bonus',
      actionText: 'Punktlar',
      tabKey: 'recycle',
    },
    {
      id: 'knowledge',
      title: 'Akademiya',
      subtitle: "O'rgan va ishla",
      description: "Qisqa darslarni ko'ring va testdan o'ting.",
      icon: Flame,
      color: 'text-orange-400',
      reward: '+40 EC',
      actionText: 'Darslar',
      tabKey: 'knowledge',
    },
    {
      id: 'school_battle',
      title: '3 Bosqichli Liga',
      subtitle: 'Tuman · Viloyat',
      description: "Maktabingiz reytingini ko'taring va sovrin yuting.",
      icon: Building2,
      color: 'text-amber-300',
      reward: 'Kuboklar',
      actionText: 'Reyting',
      tabKey: 'championship',
    },
    {
      id: 'ambassador',
      title: 'Eko-Elchi',
      subtitle: 'Liderlik dasturi',
      description: 'Maktabda eko-jamoa tuzing va faollarni boshqaring.',
      icon: Award,
      color: 'text-sky-300',
      reward: 'Elchi',
      actionText: 'Ariza',
      tabKey: 'ambassador',
    },
    {
      id: 'innovation',
      title: 'Eko-Startap',
      subtitle: "G'oyalar tanlovi",
      description: 'Ekologik muammoni hal etuvchi loyihangizni yuboring.',
      icon: Lightbulb,
      color: 'text-yellow-400',
      reward: '+3000 EC',
      actionText: 'Yuborish',
      tabKey: 'innovation',
    },
    {
      id: 'market',
      title: 'Eko-Bozor',
      subtitle: "Sovg'alar",
      description: "Yig'ilgan EcoCoinlarni real sovg'alarga almashtiring.",
      icon: Gift,
      color: 'text-emerald-400',
      reward: "Sovg'alar",
      actionText: 'Ochish',
      tabKey: 'shop',
    },
  ];

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-5 sm:space-y-8 pb-24"
    >
      {/* Compact Header */}
      <motion.section
        variants={itemVariants}
        className="p-4 sm:p-6 rounded-3xl bg-gradient-to-br from-[#062118] via-[#04140F] to-[#020A07] border border-emerald-500/25 text-white shadow-lg"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 max-w-xl">
            <img
              src={dailyQuestChestImg}
              alt="Mukofotlar markazi"
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border border-emerald-400/35 shadow-lg shrink-0"
            />
            <div className="space-y-1 min-w-0">
              <p className="text-xs font-semibold text-emerald-400">Mukofotlar markazi · EcoHero</p>
              <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight text-balance">
                Asrang, yig&apos;ing va sovrin yuting
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 leading-snug">
                Ekologik vazifalarni bajarib EcoCoin to&apos;plang va maktabingizni chempionatda oldinga olib chiqing.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="px-4 py-2.5 rounded-2xl bg-black/40 border border-emerald-500/20 flex items-center gap-3">
              <Coins className="w-6 h-6 text-amber-400 fill-amber-400 shrink-0" />
              <div>
                <div className="text-[10px] text-emerald-400 font-semibold">Balans</div>
                <div className="text-lg font-extrabold font-mono tabular-nums">
                  {user.ecoCoins.toLocaleString()} EC
                </div>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('shop')}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
            >
              <Gift className="w-4 h-4" />
              <span>Eko-Bozor</span>
            </button>
          </div>
        </div>
      </motion.section>

      {/* Referral Quick Sharing */}
      <motion.section
        variants={itemVariants}
        className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-500 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Do'stingizni taklif qiling</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Har bir ro'yxatdan o'tgan do'st uchun +100 EcoCoin</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
          <div className="flex-1 lg:w-64 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/15 text-xs font-mono text-slate-500 truncate">
            {referralLink}
          </div>
          <button
            onClick={handleCopyLink}
            className="min-h-[44px] px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copiedLink ? 'Nusxalandi' : 'Havolani nusxalash'}</span>
          </button>
        </div>
      </motion.section>

      {/* Compact 2-Column Mobile Grid of Reward Modules */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">Mukofot yo'nalishlari</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{rewardModules.length} ta modul</span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
          {rewardModules.map((mod) => (
            <button
              key={mod.id}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setActiveTab(mod.tabKey as any);
              }}
              className="group text-left p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 hover:border-emerald-400/60 transition-all cursor-pointer flex flex-col justify-between gap-3 h-full shadow-sm"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/15 ${mod.color}`}>
                    <mod.icon className="w-4.5 h-4.5" />
                  </div>
                  <span className="text-[11px] font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
                    {mod.reward}
                  </span>
                </div>

                <div>
                  <div className="text-[11px] text-slate-400 truncate">{mod.subtitle}</div>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-400 transition-colors truncate">
                    {mod.title}
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-1 leading-snug">
                    {mod.description}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-emerald-500/15 flex items-center justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <span>{mod.actionText}</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Championship Callout */}
      <motion.section
        variants={itemVariants}
        className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-emerald-950 via-[#06251A] to-teal-950 border border-emerald-500/30 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
            <Globe className="w-6 h-6 text-emerald-300" />
          </div>
          <div>
            <h4 className="text-base sm:text-lg font-extrabold">3 Bosqichli Liga</h4>
            <p className="text-xs text-slate-300">Tuman, viloyat va respublika reytinglarida jonli natijalarni kuzating.</p>
          </div>
        </div>
        <button
          onClick={() => setActiveTab('championship')}
          className="min-h-[44px] w-full sm:w-auto px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold text-xs transition-all cursor-pointer"
        >
          Chempionatga o'tish
        </button>
      </motion.section>
    </motion.div>
  );
};

