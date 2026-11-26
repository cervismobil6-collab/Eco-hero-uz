import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  QrCode,
  Search,
  Send,
  ShieldCheck,
  AlertTriangle,
  PackageCheck,
  Loader2,
  Gift,
  UserCheck,
  School as SchoolIcon,
  ExternalLink,
} from 'lucide-react';
import QRCode from 'qrcode';
import { useEco } from '../../context/EcoContext';
import { VoucherCheckResult } from '../../types/eco';

export const VoucherVerifierPanel: React.FC = () => {
  const { user, checkVoucherCode, verifyAndForwardVoucher, shopOrders } = useEco();
  const [codeInput, setCodeInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<VoucherCheckResult | null>(null);
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);

  const isSuperOrMod = user.role === 'super_admin' || user.role === 'moderator';

  const extractCodeFromInput = (raw: string) => {
    const trimmed = raw.trim();
    const voucherMatch = trimmed.match(/\/voucher\/([A-Za-z0-9\-_]+)/i);
    if (voucherMatch?.[1]) return voucherMatch[1].toUpperCase();
    const queryMatch = trimmed.match(/[?&]voucher=([A-Za-z0-9\-_]+)/i);
    if (queryMatch?.[1]) return queryMatch[1].toUpperCase();
    return trimmed.toUpperCase();
  };

  useEffect(() => {
    const code = result?.order?.voucherCode;
    if (!code) {
      setQrPreviewUrl(null);
      return;
    }
    const url = `${window.location.origin}/voucher/${code}`;
    QRCode.toDataURL(url, { width: 160, margin: 1 })
      .then(setQrPreviewUrl)
      .catch(() => setQrPreviewUrl(null));
  }, [result?.order?.voucherCode]);

  const handleCheck = async (e?: React.FormEvent, overrideCode?: string) => {
    if (e) e.preventDefault();
    const extracted = extractCodeFromInput(overrideCode ?? codeInput);
    if (!extracted) return;
    setCodeInput(extracted);
    setChecking(true);
    try {
      const res = await checkVoucherCode(extracted);
      setResult(res);
    } finally {
      setChecking(false);
    }
  };

  const handleAction = async (action: 'forward' | 'deliver') => {
    const code = result?.order?.voucherCode;
    if (!code || submitting) return;
    setSubmitting(true);
    try {
      const res = await verifyAndForwardVoucher(code, {
        note: noteInput.trim() || undefined,
        action,
      });
      if (res.success && res.order) {
        setResult({ valid: true, alreadyDelivered: res.order.status === 'delivered', order: res.order });
        setNoteInput('');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const pendingOrForwardedOrders = shopOrders
    .filter(o => o.status !== 'cancelled')
    .slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-500 flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-tight">
                Promokod & QR Vaucher Tekshirgich
              </h3>
              <p className="text-xs text-slate-500 dark:text-emerald-200/70">
                O'quvchi yutgan sovg'a promokodini yoki QR havolasini tekshiring, bazadan tasdiqlang va Super Adminga yuboring.
              </p>
            </div>
          </div>
          <span className="self-start sm:self-center px-3 py-1 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 text-[10px] font-black uppercase tracking-wider">
            {isSuperOrMod ? 'Super Admin / HQ' : 'Maktab Admin Tekshiruvi'}
          </span>
        </div>

        <form onSubmit={e => handleCheck(e)} className="flex flex-col sm:flex-row gap-2.5">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={codeInput}
              onChange={e => setCodeInput(e.target.value)}
              placeholder="Promokod (masalan: ECO-XXXX-1234) yoki QR URL kiriting..."
              className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-mono font-bold outline-none focus:border-emerald-500"
            />
          </div>
          <button
            type="submit"
            disabled={checking || !codeInput.trim()}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] hover:brightness-105 disabled:opacity-50 text-[#04110B] text-xs font-black uppercase tracking-wider border-b-[3px] border-emerald-700 active:translate-y-[1px] flex items-center justify-center gap-2 cursor-pointer"
          >
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            <span>{checking ? 'Tekshirilmoqda...' : 'Bazadan Tekshirish'}</span>
          </button>
        </form>

        {/* Verification Result */}
        {result && (
          <div
            className={`p-4 sm:p-5 rounded-2xl border ${
              result.valid && result.order
                ? 'bg-emerald-500/5 border-emerald-500/30'
                : 'bg-rose-500/5 border-rose-500/30'
            }`}
          >
            {!result.valid || !result.order ? (
              <div className="flex items-center gap-3 text-rose-500">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <div>
                  <h4 className="font-black text-sm uppercase">Haqiqiy Yutuq Topilmadi</h4>
                  <p className="text-xs text-rose-400 font-semibold mt-0.5">{result.error}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col md:flex-row gap-4 items-start">
                  <img
                    src={result.order.itemImageUrl || '/assets/eco/gift_leaves.jpg'}
                    alt={result.order.itemTitle}
                    className="w-20 h-20 rounded-2xl object-cover border border-emerald-500/25 shrink-0"
                  />
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-500 text-white text-[10px] font-black uppercase flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Baza Tasdiqladi: Haqiqiy Yutuq
                      </span>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${
                          result.order.status === 'delivered'
                            ? 'bg-emerald-500/15 text-emerald-500'
                            : result.order.verifiedBySchoolAdmin
                            ? 'bg-sky-500/15 text-sky-500'
                            : 'bg-amber-500/15 text-amber-500'
                        }`}
                      >
                        {result.order.status === 'delivered'
                          ? 'Topshirilgan'
                          : result.order.verifiedBySchoolAdmin
                          ? 'Maktab Admini Tasdiqlagan'
                          : 'Kutilmoqda'}
                      </span>
                    </div>
                    <h4 className="text-base font-black uppercase tracking-tight flex items-center gap-2">
                      <Gift className="w-4 h-4 text-amber-500" />
                      {result.order.itemTitle}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
                        <span>G'olib: {result.order.userName}</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-semibold">
                        <SchoolIcon className="w-3.5 h-3.5 text-sky-500" />
                        <span>{result.order.schoolName}</span>
                      </div>
                      <div className="font-mono font-black text-emerald-500">
                        {result.order.voucherCode}
                      </div>
                    </div>
                  </div>
                  {qrPreviewUrl && (
                    <div className="p-2 rounded-2xl bg-white border border-slate-200 shrink-0 text-center space-y-1">
                      <img src={qrPreviewUrl} alt="QR" className="w-20 h-20 rounded-xl" />
                      <a
                        href={`/voucher/${result.order.voucherCode}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-bold text-emerald-600 inline-flex items-center gap-1 hover:underline"
                      >
                        <span>Tabrik sahifasi</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>

                {result.order.verifiedBySchoolAdmin && (
                  <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs font-semibold text-sky-400">
                    Tekshirgan admin: <b>{result.order.verifiedByName || 'Maktab Admini'}</b> · Super Adminga xabar yuborilgan
                  </div>
                )}

                {result.order.status !== 'delivered' && (
                  <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-emerald-500/15">
                    <input
                      type="text"
                      value={noteInput}
                      onChange={e => setNoteInput(e.target.value)}
                      placeholder="Izoh qo'shing (ixtiyoriy, masalan: o'quvchi guvohnomasi ko'rildi)..."
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-white dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold outline-none focus:border-emerald-500"
                    />
                    <div className="flex flex-wrap gap-2.5">
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleAction('forward')}
                        className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black uppercase tracking-wider border-b-[3px] border-sky-800 active:translate-y-[1px] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        <span>Tasdiqlash & Super Adminga Yuborish</span>
                      </button>
                      {isSuperOrMod && (
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handleAction('deliver')}
                          className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] hover:brightness-105 text-[#04110B] text-xs font-black uppercase tracking-wider border-b-[3px] border-emerald-700 active:translate-y-[1px] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          <PackageCheck className="w-4 h-4" />
                          <span>Sovg'ani Topshirildi Deb Belgilash</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Recent School/Platform Orders List */}
      {pendingOrForwardedOrders.length > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-emerald-300/80">
            So'nggi Vaucherlar (Tezkor Tekshirish)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {pendingOrForwardedOrders.map(order => (
              <button
                key={order.id}
                type="button"
                onClick={() => handleCheck(undefined, order.voucherCode)}
                className="text-left p-3.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] hover:border-emerald-500/50 border border-slate-200 dark:border-emerald-500/20 transition-all space-y-1.5 cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-black text-emerald-500">{order.voucherCode}</span>
                  <span className="text-[10px] font-bold uppercase text-slate-400">{order.status}</span>
                </div>
                <div className="text-xs font-bold truncate">{order.itemTitle}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {order.userName} · {order.schoolName}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
