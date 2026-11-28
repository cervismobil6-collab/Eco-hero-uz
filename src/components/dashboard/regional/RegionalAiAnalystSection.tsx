import React, { useRef, useState } from 'react';
import { Sparkles, Send, AlertCircle, Trash2 } from 'lucide-react';
import { RegionalAiAnalystMessage, RegionalCommandSummaryResponse } from '../../../types/eco';
import regionalAiAnalystImg from '../../../assets/images/regional_ai_analyst_1795859013540.jpg';

interface RegionalAiAnalystSectionProps {
  region: string;
  summary: RegionalCommandSummaryResponse | null;
  onAskAiAnalyst: (payload: {
    question: string;
    history?: { role: 'user' | 'assistant'; text: string }[];
    region?: string;
  }) => Promise<{ success: boolean; reply?: string; modelUsed?: string; generatedAt?: string; error?: string }>;
}

const SUGGESTED_PROMPTS = [
  "Qaysi tuman hozir eng sust ishlayapti va asosiy sababi nimada?",
  "Viloyatda hal qilinmagan xavfli ekologik muammolar qayerda to‘plangan?",
  "Eng faol TOP-5 tuman va maktab koordinatorlari bo‘yicha qisqacha tahlil bering",
  "Keyingi hafta uchun viloyat bo‘ylab aniq ekologik tadbirlar rejasini tuzing",
];

export const RegionalAiAnalystSection: React.FC<RegionalAiAnalystSectionProps> = ({
  region,
  summary,
  onAskAiAnalyst,
}) => {
  const [messages, setMessages] = useState<RegionalAiAnalystMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const sendQuestion = async (questionText: string) => {
    const clean = questionText.trim();
    if (!clean || loading) return;

    const userMsg: RegionalAiAnalystMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: clean,
      createdAt: new Date().toISOString(),
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setErrorMsg(null);
    setLoading(true);

    window.setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 50);

    try {
      const res = await onAskAiAnalyst({
        question: clean,
        history: nextHistory.slice(-8).map(m => ({ role: m.role, text: m.text })),
        region,
      });

      if (!res.success || !res.reply) {
        setErrorMsg(res.error || 'AI tahlil xizmati hozircha javob bera olmadi.');
        return;
      }

      const aiMsg: RegionalAiAnalystMessage = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        text: res.reply,
        createdAt: res.generatedAt || new Date().toISOString(),
        modelUsed: res.modelUsed,
      };
      setMessages(prev => [...prev, aiMsg]);
      window.setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 60);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Real Photo AI Header */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-[#040D0A] text-white shadow-xl">
        <img
          src={regionalAiAnalystImg}
          alt="Viloyat AI Tahlilchisi"
          className="absolute inset-0 w-full h-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#040D0A] via-[#041D14]/90 to-[#040D0A]/70" />
        <div className="relative p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#00F5A0]">
              <Sparkles className="w-4 h-4" />
              <span>AI Tahlilchi · Jonli Firebase Ma&apos;lumotlari Asosida</span>
            </div>
            <h2 className="text-lg sm:text-xl font-black tracking-tight">
              {region} — Strategik Ekologik Tahlil Yordamchisi
            </h2>
            <p className="text-xs text-emerald-100/75 max-w-2xl">
              Tabiiy tilda savol bering: tizim viloyatingizdagi {summary?.totals.districtsTotal ?? 0} ta tuman,{' '}
              {summary?.totals.schoolsCount ?? 0} ta maktab va {summary?.totals.totalReports ?? 0} ta muammo statistikasi asosida aniq javob beradi.
            </p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setErrorMsg(null);
              }}
              className="px-3.5 py-2 min-h-[40px] rounded-xl bg-white/10 hover:bg-rose-500/20 text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Suhbatni tozalash</span>
            </button>
          )}
        </div>
      </div>

      {/* Chat & Prompt Container */}
      <div className="rounded-3xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 overflow-hidden flex flex-col">
        {/* Suggested Prompts */}
        <div className="p-3.5 border-b border-slate-200 dark:border-emerald-500/15 flex flex-wrap gap-2">
          {SUGGESTED_PROMPTS.map(prompt => (
            <button
              key={prompt}
              type="button"
              disabled={loading}
              onClick={() => sendQuestion(prompt)}
              className="px-3 py-2 min-h-[38px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-[11px] font-bold text-slate-700 dark:text-emerald-100 hover:border-emerald-400 transition-all text-left cursor-pointer disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Conversation Log */}
        <div ref={scrollRef} className="p-4 space-y-3 min-h-[320px] max-h-[480px] overflow-y-auto">
          {messages.length === 0 && !errorMsg && (
            <div className="py-12 text-center space-y-2">
              <Sparkles className="w-8 h-8 text-emerald-500 mx-auto" />
              <div className="text-sm font-black text-slate-800 dark:text-white">
                Viloyat faoliyati bo‘yicha savolingizni bering
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Yuqoridagi tezkor savollardan birini bosing yoki pastdagi maydonga o‘zingiz xohlagan savolni yozing.
              </p>
            </div>
          )}

          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] font-bold'
                    : 'bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-slate-800 dark:text-slate-100'
                }`}
              >
                <div>{msg.text}</div>
                <div
                  className={`text-[10px] mt-1.5 opacity-65 ${
                    msg.role === 'user' ? 'text-[#04110B]' : 'text-slate-400'
                  }`}
                >
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="px-4 py-3 rounded-2xl bg-slate-100 dark:bg-[#040D0A] border border-emerald-500/25 text-xs font-bold text-emerald-500">
                Viloyat ko‘rsatkichlari tahlil qilinmoqda...
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-bold flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Input Form */}
        <form
          onSubmit={e => {
            e.preventDefault();
            sendQuestion(input);
          }}
          className="p-3.5 border-t border-slate-200 dark:border-emerald-500/15 flex items-center gap-2.5 bg-slate-50 dark:bg-[#040D0A]"
        >
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Masalan: Qaysi tuman maktablarida faollik oshishi kerak?"
            className="flex-1 px-4 py-2.5 min-h-[44px] rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold outline-none focus:border-emerald-400"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 min-h-[44px] rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700 text-xs font-black inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Tahlil Qilish</span>
          </button>
        </form>
      </div>
    </div>
  );
};
