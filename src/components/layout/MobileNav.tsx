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
    <div className="fixed bottom-4 sm:bottom-6 left-3 right-3 sm:left-4 sm:right-4 max-w-md mx-auto z-50 xl:hidden">
      <nav className="bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl border border-white/20 dark:border-slate-800 shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-[28px] sm:rounded-[32px] px-2 py-1.5 sm:py-2">
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
                  className="relative -mt-12 group"
                >
                  <motion.div
                    whileHover={{ y: -5 }}
                    whileTap={{ scale: 0.9 }}
                    className={`w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 border-4 border-white dark:border-slate-900 ${
                      isActive 
                        ? 'bg-gradient-to-tr from-emerald-600 to-teal-400 text-white' 
                        : 'bg-slate-900 dark:bg-emerald-600 text-white'
                    }`}
                  >
                    <Icon className="w-7 h-7" />
                  </motion.div>
                  <AnimatePresence>
                    {isActive && (
                      <motion.span
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-black text-emerald-500 uppercase tracking-widest whitespace-nowrap"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
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
                className="relative flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all"
              >
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      layoutId="mobile-nav-active"
                      className="absolute inset-1 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-2xl border border-emerald-500/20"
                      transition={{ type: 'spring', stiffness: 300, damping: 30, duration: 0.5 }}
                    />
                  )}
                </AnimatePresence>
                
                <Icon className={`w-5 h-5 relative z-10 transition-colors duration-300 ${
                  isActive ? 'text-emerald-500' : 'text-slate-400 dark:text-slate-500'
                }`} />
                
                {isActive && (
                   <motion.span 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="text-[9px] font-black uppercase tracking-tighter mt-1 text-emerald-500 relative z-10"
                   >
                    {item.label}
                   </motion.span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

