import React from 'react';
import { Home, MapPin, Sparkles, ShieldAlert, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEco } from '../../context/EcoContext';

export const MobileNav: React.FC = () => {
  const { activeTab, setActiveTab, triggerHaptic } = useEco();

  if (['ai', 'quiz', 'knowledge', 'innovation'].includes(activeTab)) {
    return null;
  }

  const items = [
    { id: 'home', label: 'Bosh', icon: Home },
    { id: 'map', label: 'Xarita', icon: MapPin },
    { id: 'ai', label: 'Eco AI', icon: Sparkles, isCenter: true },
    { id: 'admin', label: 'Kabinet', icon: ShieldAlert },
    { id: 'profile', label: 'Profil', icon: User },
  ];

  return (
    <div className="fixed bottom-3 sm:bottom-5 left-3 right-3 sm:left-4 sm:right-4 max-w-md mx-auto z-50 xl:hidden">
      <nav
        aria-label="Mobil navigatsiya"
        className="bg-white/92 dark:bg-[#06150F]/92 backdrop-blur-2xl border border-emerald-500/20 shadow-[0_18px_45px_rgba(4,13,10,0.45)] rounded-[28px] px-2 py-1.5"
      >
        <div className="flex items-center justify-between relative">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            if (item.isCenter) {
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    triggerHaptic('medium');
                    setActiveTab(item.id);
                  }}
                  aria-label={item.label}
                  className="relative -mt-9 group cursor-pointer"
                >
                  <motion.div
                    whileTap={{ scale: 0.9 }}
                    className={`w-14 h-14 rounded-2xl rotate-3 flex items-center justify-center shadow-xl transition-all duration-300 border-2 ${
                      isActive
                        ? 'bg-gradient-to-tr from-emerald-400 to-teal-300 text-[#040D0A] border-emerald-200 shadow-emerald-400/40'
                        : 'bg-gradient-to-tr from-emerald-600 to-teal-500 text-white border-white dark:border-[#06150F] shadow-emerald-500/30'
                    }`}
                  >
                    <Icon className="w-6 h-6 -rotate-3" />
                  </motion.div>
                  <span className="block text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mt-1">
                    {item.label}
                  </span>
                </button>
              );
            }

            return (
              <button
                key={item.id}
                onClick={() => {
                  triggerHaptic('light');
                  setActiveTab(item.id);
                }}
                className="relative flex flex-col items-center justify-center min-w-[52px] min-h-[48px] px-2 py-1 rounded-2xl transition-colors cursor-pointer"
              >
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      layoutId="mobile-nav-active"
                      className="absolute inset-0.5 bg-emerald-500/12 dark:bg-emerald-400/15 rounded-2xl border border-emerald-500/30"
                      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                    />
                  )}
                </AnimatePresence>

                <Icon
                  className={`w-5 h-5 relative z-10 transition-colors duration-200 ${
                    isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
                  }`}
                />

                <span
                  className={`text-[9px] font-extrabold tracking-tight mt-0.5 relative z-10 transition-colors ${
                    isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

