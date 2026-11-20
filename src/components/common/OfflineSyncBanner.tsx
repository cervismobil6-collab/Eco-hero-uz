import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, CheckCircle2, CloudUpload } from 'lucide-react';
import { useEco } from '../../context/EcoContext';
import { getPendingReports, removePendingReport } from '../../services/offlineQueue';
import { apiUrl, isHtmlContentType } from '../../utils/api';

export const OfflineSyncBanner: React.FC = () => {
  const { isOnline, syncBootstrap, showNotification } = useEco();
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const checkPending = async () => {
    try {
      const pending = await getPendingReports();
      setPendingCount(pending.length);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    checkPending();
    const interval = setInterval(checkPending, 8000);
    return () => clearInterval(interval);
  }, []);

  // When internet comes back online, trigger auto-sync
  useEffect(() => {
    if (isOnline && pendingCount > 0 && !isSyncing) {
      handleSync();
    }
  }, [isOnline, pendingCount]);

  const handleSync = async () => {
    if (!isOnline || isSyncing) return;
    setIsSyncing(true);
    try {
      const pending = await getPendingReports();
      let successCount = 0;

      for (const rep of pending) {
        try {
          const res = await fetch(apiUrl('/api/reports/submit'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clientReportId: rep.id,
              title: rep.title,
              description: rep.description,
              category: rep.category,
              severity: rep.severity,
              region: rep.region,
              district: rep.district,
              address: rep.address,
              lat: rep.lat,
              lng: rep.lng,
              imageUrl: rep.imageUrl,
              imageBase64: rep.imageBase64,
              authorUid: rep.authorUid,
              authorName: rep.authorName,
              authorSchool: rep.authorSchool,
              authorTelegramId: rep.authorTelegramId,
            }),
          });

          if (res.ok && !isHtmlContentType(res)) {
            await removePendingReport(rep.id);
            successCount++;
          }
        } catch (itemErr) {
          console.warn('[OfflineSyncBanner] Report sync deferred:', itemErr);
        }
      }

      await checkPending();
      if (successCount > 0) {
        await syncBootstrap();
        showNotification(`${successCount} ta oflayn hisobot serverga muvaffaqiyatli sinxronlandi!`, 'success');
      }
    } catch (err) {
      console.error('[OfflineSyncBanner] Sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // If online and nothing pending, don't show banner
  if (isOnline && pendingCount === 0) {
    return null;
  }

  return (
    <aside aria-label="Tarmoq holati" className="sticky top-0 z-40 bg-gradient-to-r from-amber-600 via-emerald-700 to-amber-700 text-white px-4 py-2.5 shadow-lg border-b border-white/20 text-xs">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          {!isOnline ? (
            <>
              <WifiOff className="w-4 h-4 shrink-0 text-amber-200 animate-pulse" />
              <span>
                <b>Oflayn Rejim:</b> Internet uzilgan. Ma'lumotlar IndexedDB keshidan yuklanmoqda.
              </span>
            </>
          ) : (
            <>
              <CloudUpload className="w-4 h-4 shrink-0 text-emerald-300" />
              <span>
                Internet tiklandi. <b>{pendingCount} ta</b> oflayn kiritilgan hisobot serverga yuklanishga tayyor.
              </span>
            </>
          )}

          {pendingCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-white/20 font-bold text-[10px]">
              {pendingCount} ta kutmoqda
            </span>
          )}
        </div>

        {pendingCount > 0 && isOnline && (
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="px-3 py-1 bg-white text-slate-900 rounded-lg font-bold hover:bg-white/90 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sinxronlanmoqda...' : 'Hozir yuklash'}</span>
          </button>
        )}
      </div>
    </aside>
  );
};
