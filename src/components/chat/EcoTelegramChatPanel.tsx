import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Send,
  Image as ImageIcon,
  Reply,
  X,
  Search,
  Bot,
  Users,
  Lock,
  Check,
  XCircle,
  ShieldBan,
  ArrowLeft,
  Megaphone,
  Lightbulb,
  MessageSquare,
  UserPlus,
  RefreshCw,
  Copy,
  Gift,
} from 'lucide-react';
import { useEco } from '../../context/EcoContext';
import {
  ChatMessageKind,
  ChatPermissionRequest,
  ChatScope,
  ChatThreadSummary,
  EcoChatMessage,
  RosterStudentEntry,
} from '../../types/eco';

interface EcoTelegramChatPanelProps {
  defaultChannelId?: string;
  allowedScopes?: ChatScope[];
  allowStudentDiscovery?: boolean;
  title?: string;
  compact?: boolean;
}

const ROLE_LABELS_UZ: Record<string, string> = {
  super_admin: 'Super Admin',
  regional_coordinator: 'Viloyat Koordinatori',
  district_coordinator: 'Tuman Koordinatori',
  school_admin: 'Maktab Sardori',
  ambassador: 'Eko-Elchi',
  moderator: 'Moderator',
  sponsor: 'Homiy',
  student: 'O‘quvchi',
};

const KIND_LABELS: Record<ChatMessageKind, string> = {
  chat: 'Oddiy xabar',
  command: 'Buyruq / Topshiriq',
  idea: 'G‘oya almashish',
  bot_notice: '@Ecoheros_bot xabari',
};

function formatTimeShort(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

function makeStudentDmChannelId(uidA: string, uidB: string): string {
  const pair = [String(uidA), String(uidB)].sort();
  return `student_dm:${pair[0]}:${pair[1]}`;
}

export const EcoTelegramChatPanel: React.FC<EcoTelegramChatPanelProps> = ({
  defaultChannelId,
  allowedScopes,
  allowStudentDiscovery = false,
  title = 'EcoHero Jonli Suhbat & Topshiriqlar',
  compact = false,
}) => {
  const {
    user,
    wsConnected,
    liveSyncVersion,
    subscribeChatEvents,
    fetchChatThreads,
    fetchChatMessages,
    sendChatMessage,
    fetchChatPermissions,
    requestChatPermission,
    respondChatPermission,
    updateChatSettings,
    fetchRosterDirectory,
    uploadMediaFile,
    showNotification,
  } = useEco();

  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [selectedChannelId, setSelectedChannelId] = useState<string>(defaultChannelId || '');
  const [messages, setMessages] = useState<EcoChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [mobileView, setMobileView] = useState<'list' | 'chat'>(defaultChannelId ? 'chat' : 'list');

  // Composer state
  const [draftText, setDraftText] = useState('');
  const [messageKind, setMessageKind] = useState<ChatMessageKind>('chat');
  const [attachedImageUrl, setAttachedImageUrl] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [replyTo, setReplyTo] = useState<EcoChatMessage | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Student-to-Student Discovery & Permissions
  const [permissions, setPermissions] = useState<ChatPermissionRequest[]>([]);
  const [allowStudentMessages, setAllowStudentMessages] = useState<boolean>(user.allowStudentMessages !== false);
  const [peerStudents, setPeerStudents] = useState<RosterStudentEntry[]>([]);
  const [showPeerFinder, setShowPeerFinder] = useState(false);
  const [permissionNote, setPermissionNote] = useState('');
  const [busyPermId, setBusyPermId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadThreadsAndPerms = useCallback(async () => {
    setThreadsLoading(true);
    try {
      const [rawThreads, permRes, rosterRes] = await Promise.all([
        fetchChatThreads(),
        fetchChatPermissions(),
        allowStudentDiscovery ? fetchRosterDirectory() : Promise.resolve(null),
      ]);

      const scopedThreads = allowedScopes?.length
        ? rawThreads.filter(t => allowedScopes.includes(t.scope))
        : rawThreads;

      setThreads(scopedThreads);
      if (permRes.success) {
        setPermissions(permRes.permissions);
        setAllowStudentMessages(permRes.allowStudentMessages);
      }
      if (rosterRes?.peerStudents) {
        setPeerStudents(rosterRes.peerStudents);
      }

      setSelectedChannelId(prev => {
        if (defaultChannelId && scopedThreads.some(t => t.channelId === defaultChannelId)) {
          return defaultChannelId;
        }
        if (prev && scopedThreads.some(t => t.channelId === prev)) {
          return prev;
        }
        return scopedThreads[0]?.channelId || '';
      });
    } finally {
      setThreadsLoading(false);
    }
  }, [fetchChatThreads, fetchChatPermissions, fetchRosterDirectory, allowStudentDiscovery, allowedScopes, defaultChannelId]);

  useEffect(() => {
    loadThreadsAndPerms();
  }, [loadThreadsAndPerms, liveSyncVersion]);

  useEffect(() => {
    if (defaultChannelId) {
      setSelectedChannelId(defaultChannelId);
      setMobileView('chat');
    }
  }, [defaultChannelId]);

  const activeThread = useMemo(
    () => threads.find(t => t.channelId === selectedChannelId) || null,
    [threads, selectedChannelId]
  );

  // Sync messageKind default whenever switching threads
  useEffect(() => {
    if (!activeThread) return;
    if (!activeThread.allowedMessageKinds.includes(messageKind)) {
      setMessageKind(activeThread.allowedMessageKinds[0] || 'chat');
    }
    setReplyTo(null);
  }, [activeThread?.channelId]);

  // Load messages for selected thread
  useEffect(() => {
    if (!selectedChannelId) {
      setMessages([]);
      return;
    }
    let active = true;
    setMessagesLoading(true);
    fetchChatMessages(selectedChannelId)
      .then(res => {
        if (!active) return;
        if (res.success) {
          setMessages(res.messages);
        }
      })
      .finally(() => {
        if (active) setMessagesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedChannelId, fetchChatMessages]);

  // Auto-scroll when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, selectedChannelId]);

  // Subscribe to real-time WebSocket frames
  useEffect(() => {
    return subscribeChatEvents(evt => {
      if (evt.type === 'chat:message' && evt.message) {
        const msg = evt.message;
        // Update thread preview
        setThreads(prev => {
          const exists = prev.some(t => t.channelId === msg.channelId);
          if (!exists) {
            // Re-fetch thread list cleanly if a new DM channel just appeared
            loadThreadsAndPerms();
            return prev;
          }
          const updated = prev.map(t =>
            t.channelId === msg.channelId ? { ...t, lastMessage: msg } : t
          );
          return [...updated].sort((a, b) => {
            const ta = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
            const tb = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
            return tb - ta;
          });
        });

        if (msg.channelId === selectedChannelId) {
          setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
        }
      } else if ((evt.type === 'chat:permission_updated' || evt.type === 'chat:permission_update') && evt.permission) {
        const perm = evt.permission;
        setPermissions(prev => [perm, ...prev.filter(p => p.id !== perm.id)]);
        loadThreadsAndPerms();
      }
    });
  }, [subscribeChatEvents, selectedChannelId, loadThreadsAndPerms]);

  const incomingPendingPermissions = useMemo(
    () =>
      permissions.filter(
        p => p.status === 'pending' && String(p.targetUid) === String(user.uid)
      ),
    [permissions, user.uid]
  );

  const filteredThreads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(
      t =>
        t.title.toLowerCase().includes(q) ||
        t.subtitle.toLowerCase().includes(q) ||
        (t.lastMessage?.text || '').toLowerCase().includes(q)
    );
  }, [threads, searchQuery]);

  const filteredPeers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return peerStudents.filter(p => {
      if (!q) return true;
      return (
        p.fullName.toLowerCase().includes(q) ||
        (p.schoolName || '').toLowerCase().includes(q) ||
        (p.district || '').toLowerCase().includes(q)
      );
    });
  }, [peerStudents, searchQuery]);

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showNotification('Faqat rasm faylini tanlang', 'warning');
      return;
    }
    setIsUploadingImage(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const up = await uploadMediaFile(reader.result as string, file.name);
      setIsUploadingImage(false);
      if (up.success && up.url) {
        setAttachedImageUrl(up.url);
      } else {
        showNotification(up.error || 'Rasm yuklanmadi', 'warning');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeThread || isSending) return;
    const clean = draftText.trim();
    if (!clean && !attachedImageUrl) return;

    setIsSending(true);
    const res = await sendChatMessage({
      channelId: activeThread.channelId,
      scope: activeThread.scope,
      messageKind,
      text: clean,
      imageUrl: attachedImageUrl || undefined,
      recipientUid: activeThread.recipientUid,
      replyToId: replyTo?.id,
    });
    setIsSending(false);

    if (res.success && res.message) {
      const sent = res.message;
      setDraftText('');
      setAttachedImageUrl('');
      setReplyTo(null);
      setMessages(prev => (prev.some(m => m.id === sent.id) ? prev : [...prev, sent]));
      setThreads(prev =>
        prev.map(t => (t.channelId === sent.channelId ? { ...t, lastMessage: sent } : t))
      );
    }
  };

  const handleRespondPermission = async (permId: string, action: 'approve' | 'reject' | 'block') => {
    setBusyPermId(permId);
    const res = await respondChatPermission(permId, action);
    setBusyPermId(null);
    if (res.success) {
      await loadThreadsAndPerms();
    }
  };

  const handleRequestPeerChat = async (peer: RosterStudentEntry) => {
    const res = await requestChatPermission(peer.uid, permissionNote.trim() || undefined);
    if (res.success) {
      setPermissionNote('');
      setShowPeerFinder(false);
      await loadThreadsAndPerms();
      const dmCh = makeStudentDmChannelId(user.uid, peer.uid);
      setSelectedChannelId(dmCh);
      setMobileView('chat');
    }
  };

  const handleToggleStudentSetting = async () => {
    const next = !allowStudentMessages;
    const res = await updateChatSettings(next);
    if (res.success && typeof res.allowStudentMessages === 'boolean') {
      setAllowStudentMessages(res.allowStudentMessages);
    }
  };

  const studentDmLocked =
    activeThread?.scope === 'student_dm' &&
    user.role !== 'super_admin' &&
    activeThread.permissionStatus !== 'approved';

  return (
    <div className="rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 overflow-hidden">
      {/* Top Toolbar */}
      <div className="px-4 py-3.5 border-b border-slate-200 dark:border-emerald-500/15 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-emerald-500/[0.04] to-transparent">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white truncate">{title}</h3>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-emerald-300/80 shrink-0">
              <span
                className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-500' : 'bg-amber-500'}`}
                aria-hidden="true"
              />
              <span>{wsConnected ? 'Jonli WS' : 'Ulanmoqda'}</span>
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Xabarlar real vaqtda hamda Telegram bot (@Ecoheros_bot) orqali sinxronlanadi
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {allowStudentDiscovery && (
            <>
              <button
                type="button"
                onClick={handleToggleStudentSetting}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                  allowStudentMessages
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-slate-200 dark:border-emerald-500/20 text-slate-500'
                }`}
              >
                {allowStudentMessages ? 'Xabar so‘rovlari: Yoqilgan' : 'Xabar so‘rovlari: O‘chirilgan'}
              </button>
              <button
                type="button"
                onClick={() => setShowPeerFinder(v => !v)}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-2 border-emerald-700 text-xs font-black inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>O‘quvchi topish</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={loadThreadsAndPerms}
            title="Yangilash"
            className="p-2 rounded-xl border border-slate-200 dark:border-emerald-500/20 text-slate-500 hover:text-emerald-500 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${threadsLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Incoming Student Permission Requests Banner */}
      {incomingPendingPermissions.length > 0 && (
        <div className="px-4 py-3 bg-amber-500/5 border-b border-slate-200 dark:border-emerald-500/15 space-y-2">
          <div className="text-xs font-bold text-amber-600 dark:text-amber-400">
            Suhbatlashish uchun ruxsat so‘rovlari ({incomingPendingPermissions.length})
          </div>
          <div className="divide-y divide-slate-200/70 dark:divide-emerald-500/15">
            {incomingPendingPermissions.map(perm => (
              <div key={perm.id} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 dark:text-white truncate">
                    {perm.requesterName}{' '}
                    <span className="font-normal text-slate-500">
                      · {perm.requesterSchoolName}{perm.requesterGrade ? ` · ${perm.requesterGrade}` : ''}
                    </span>
                  </div>
                  {perm.note && <div className="text-[11px] text-slate-500 truncate">“{perm.note}”</div>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={busyPermId === perm.id}
                    onClick={() => handleRespondPermission(perm.id, 'approve')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" /> Ruxsat berish
                  </button>
                  <button
                    type="button"
                    disabled={busyPermId === perm.id}
                    onClick={() => handleRespondPermission(perm.id, 'reject')}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-emerald-500/20 text-slate-600 dark:text-slate-300 font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Rad
                  </button>
                  <button
                    type="button"
                    disabled={busyPermId === perm.id}
                    onClick={() => handleRespondPermission(perm.id, 'block')}
                    className="px-2.5 py-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <ShieldBan className="w-3.5 h-3.5" /> Bloklash
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Peer Student Discovery Drawer */}
      {allowStudentDiscovery && showPeerFinder && (
        <div className="p-4 bg-slate-50 dark:bg-[#040D0A] border-b border-slate-200 dark:border-emerald-500/15 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                Boshqa o‘quvchiga yozish uchun ruxsat so‘rang
              </div>
              <div className="text-[11px] text-slate-500">
                Faqat qabul qiluvchi tasdiqlaganidan keyingina yozishish ochiladi
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowPeerFinder(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <input
            type="text"
            value={permissionNote}
            onChange={e => setPermissionNote(e.target.value)}
            placeholder="Salomlashish yoki murojaat sababi (ixtiyoriy)..."
            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-500"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto pr-1">
            {filteredPeers.slice(0, 24).map(peer => {
              const existingPerm = permissions.find(
                p =>
                  (p.requesterUid === user.uid && p.targetUid === peer.uid) ||
                  (p.requesterUid === peer.uid && p.targetUid === user.uid)
              );
              const existingChannel = makeStudentDmChannelId(user.uid, peer.uid);
              return (
                <div
                  key={peer.uid}
                  className="p-3 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white truncate">{peer.fullName}</div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {peer.schoolName || 'Maktab'}{peer.grade ? ` · ${peer.grade}` : ''}
                    </div>
                  </div>
                  {existingPerm?.status === 'approved' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedChannelId(existingChannel);
                        setShowPeerFinder(false);
                        setMobileView('chat');
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-bold shrink-0 cursor-pointer"
                    >
                      Yozish
                    </button>
                  ) : existingPerm?.status === 'pending' ? (
                    <span className="text-[11px] font-semibold text-amber-500 shrink-0">Kutilmoqda</span>
                  ) : existingPerm?.status === 'blocked' ? (
                    <span className="text-[11px] font-semibold text-rose-500 shrink-0">Bloklangan</span>
                  ) : peer.allowStudentMessages === false ? (
                    <span className="text-[11px] text-slate-400 shrink-0">Yopiq</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRequestPeerChat(peer)}
                      className="px-2.5 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white font-bold shrink-0 cursor-pointer transition-colors"
                    >
                      Ruxsat so‘rash
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2-Pane Telegram-Style Split */}
      <div className={`grid grid-cols-1 lg:grid-cols-12 ${compact ? 'min-h-[440px]' : 'min-h-[540px]'}`}>
        {/* Left Pane: Thread List */}
        <div
          className={`lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-emerald-500/15 flex flex-col ${
            mobileView === 'chat' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="p-3 border-b border-slate-200 dark:border-emerald-500/15">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Suhbat yoki ism qidirish..."
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-emerald-500/10 max-h-[520px]">
            {threadsLoading && filteredThreads.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">Kanallar yuklanmoqda...</div>
            ) : filteredThreads.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 space-y-2">
                <p>Hozircha faol suhbat kanallari topilmadi.</p>
                {allowStudentDiscovery && (
                  <button
                    type="button"
                    onClick={() => setShowPeerFinder(true)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold cursor-pointer"
                  >
                    O‘quvchiga ruxsat so‘rash
                  </button>
                )}
              </div>
            ) : (
              filteredThreads.map(thread => {
                const isSelected = thread.channelId === selectedChannelId;
                return (
                  <button
                    key={thread.channelId}
                    type="button"
                    onClick={() => {
                      setSelectedChannelId(thread.channelId);
                      setMobileView('chat');
                    }}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/10 dark:bg-emerald-500/15'
                        : 'hover:bg-slate-50 dark:hover:bg-emerald-500/5'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-[#040D0A] flex items-center justify-center shrink-0 overflow-hidden border border-slate-200 dark:border-emerald-500/25">
                      {thread.viaBot ? (
                        <Bot className="w-5 h-5 text-sky-500" />
                      ) : thread.isGroup ? (
                        <Users className="w-5 h-5 text-emerald-500" />
                      ) : thread.recipientAvatar ? (
                        <img
                          src={thread.recipientAvatar}
                          alt={thread.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                          {thread.title.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {thread.title}
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                          {formatTimeShort(thread.lastMessage?.createdAt)}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {thread.lastMessage
                          ? `${thread.lastMessage.senderName}: ${
                              thread.lastMessage.text || 'Rasm yuborildi'
                            }`
                          : thread.subtitle}
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 truncate">
                        {thread.viaBot && <span className="text-sky-500 font-semibold">@Ecoheros_bot</span>}
                        {thread.viaBot && thread.recipientTelegramUsername && <span aria-hidden="true">·</span>}
                        {thread.recipientTelegramUsername && (
                          <span className="font-mono text-slate-500">{thread.recipientTelegramUsername}</span>
                        )}
                        {thread.scope === 'student_dm' && (
                          <span
                            className={`font-semibold ${
                              thread.permissionStatus === 'approved'
                                ? 'text-emerald-500'
                                : thread.permissionStatus === 'blocked'
                                ? 'text-rose-500'
                                : 'text-amber-500'
                            }`}
                          >
                            {thread.permissionStatus === 'approved'
                              ? 'Ruxsat berilgan'
                              : thread.permissionStatus === 'pending'
                              ? 'Ruxsat kutilmoqda'
                              : thread.permissionStatus === 'blocked'
                              ? 'Bloklangan'
                              : 'Ruxsat kerak'}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Active Telegram Conversation */}
        <div
          className={`lg:col-span-8 flex flex-col bg-slate-50/50 dark:bg-[#040D0A] ${
            mobileView === 'list' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {!activeThread ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs text-slate-500 space-y-2">
              <MessageSquare className="w-8 h-8 text-slate-400" />
              <div className="font-bold text-slate-700 dark:text-slate-300">Suhbat kanalini tanlang</div>
              <p>Chap tarafdan guruh yoki shaxsiy suhbatni oching.</p>
            </div>
          ) : (
            <>
              {/* Active Thread Header */}
              <div className="px-4 py-3 bg-white dark:bg-[#061812] border-b border-slate-200 dark:border-emerald-500/15 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setMobileView('list')}
                    className="lg:hidden p-1.5 rounded-lg border border-slate-200 dark:border-emerald-500/20 text-slate-500 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 dark:text-white truncate flex items-center gap-2">
                      <span>{activeThread.title}</span>
                      {activeThread.viaBot && (
                        <span className="text-[11px] font-mono text-sky-500 font-semibold">@Ecoheros_bot</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {activeThread.subtitle}
                      {activeThread.recipientTelegramUsername ? ` · ${activeThread.recipientTelegramUsername}` : ''}
                      {activeThread.recipientTelegramLinked ? ' · Telegram ulangan' : ''}
                    </div>
                  </div>
                </div>
              </div>

              {/* Message Feed */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[400px] min-h-[300px]">
                {messagesLoading ? (
                  <div className="py-12 text-center text-xs text-slate-500">Xabarlar yuklanmoqda...</div>
                ) : messages.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-500">
                    Bu suhbatda hali xabar yo‘q. Birinchi xabarni yozing!
                  </div>
                ) : (
                  messages.map(msg => {
                    const isMine = String(msg.senderUid) === String(user.uid);
                    const isCommand = msg.messageKind === 'command';
                    const isIdea = msg.messageKind === 'idea';
                    const isBotNotice = msg.viaBot || msg.messageKind === 'bot_notice';

                    return (
                      <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[85%] sm:max-w-[72%] rounded-2xl px-4 py-2.5 space-y-1.5 border text-xs ${
                            isMine
                              ? 'bg-emerald-600 text-white border-emerald-500'
                              : isCommand
                              ? 'bg-amber-500/10 text-slate-900 dark:text-white border-amber-500/40'
                              : isIdea
                              ? 'bg-sky-500/10 text-slate-900 dark:text-white border-sky-500/30'
                              : 'bg-white dark:bg-[#061812] text-slate-900 dark:text-white border-slate-200 dark:border-emerald-500/20'
                          }`}
                        >
                          {/* Sender & Kind Line (Zero-pill clean typography) */}
                          <div
                            className={`flex flex-wrap items-center gap-1.5 text-[11px] ${
                              isMine ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {isBotNotice ? (
                              <>
                                <span className={`font-mono font-bold ${isMine ? 'text-sky-100' : 'text-sky-500'}`}>
                                  {msg.botHandle || '@Ecoheros_bot'} nomidan
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className={`font-bold ${isMine ? 'text-white' : 'text-slate-800 dark:text-slate-200'}`}>
                                  {msg.senderName} ({ROLE_LABELS_UZ[msg.senderRole] || msg.senderRole})
                                </span>
                              </>
                            ) : (
                              <>
                                <span className={`font-bold ${isMine ? 'text-white' : 'text-slate-800 dark:text-slate-200'}`}>
                                  {msg.senderName}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{ROLE_LABELS_UZ[msg.senderRole] || msg.senderRole}</span>
                              </>
                            )}
                            {isCommand && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className={`font-bold ${isMine ? 'text-amber-200' : 'text-amber-600 dark:text-amber-400'}`}>
                                  Rasmiy buyruq
                                </span>
                              </>
                            )}
                            {isIdea && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className={`font-bold ${isMine ? 'text-sky-100' : 'text-sky-500'}`}>
                                  G‘oya
                                </span>
                              </>
                            )}
                          </div>

                          {/* Reply Quote */}
                          {msg.replyPreview && (
                            <div
                              className={`px-2.5 py-1.5 rounded-lg text-[11px] ${
                                isMine ? 'bg-black/20 text-emerald-50' : 'bg-slate-100 dark:bg-[#040D0A] text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              <div className="font-bold">{msg.replyPreview.senderName}</div>
                              <div className="truncate">{msg.replyPreview.text}</div>
                            </div>
                          )}

                          {/* Image Attachment */}
                          {msg.imageUrl && (
                            <button
                              type="button"
                              onClick={() => setLightboxImage(msg.imageUrl || null)}
                              className="block w-full overflow-hidden rounded-xl border border-black/10 cursor-pointer"
                            >
                              <img
                                src={msg.imageUrl}
                                alt="Biriktirilgan rasm"
                                referrerPolicy="no-referrer"
                                className="max-h-56 w-full object-cover"
                              />
                            </button>
                          )}

                          {/* Message Body */}
                          {msg.text && <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>}

                          {/* Verifiable Monthly Award Promo Code Box */}
                          {msg.promoCode && (
                            <div className="mt-2 p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-between gap-2.5">
                              <div className="min-w-0">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1">
                                  <Gift className="w-3 h-3 shrink-0" />
                                  <span>Mukofot Promokodi</span>
                                </div>
                                <div className="font-mono font-black text-xs text-slate-900 dark:text-amber-300 truncate">
                                  {msg.promoCode}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard?.writeText(msg.promoCode || '').catch(() => {});
                                  showNotification(`Promokod nusxalandi: ${msg.promoCode}`, 'success');
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] inline-flex items-center gap-1 shrink-0 cursor-pointer"
                              >
                                <Copy className="w-3 h-3" />
                                <span>Nusxalash</span>
                              </button>
                            </div>
                          )}

                          {/* Footer: Time & Reply Action */}
                          <div
                            className={`flex items-center justify-end gap-2 text-[10px] font-mono tabular-nums ${
                              isMine ? 'text-emerald-100' : 'text-slate-400'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setReplyTo(msg)}
                              className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                            >
                              <Reply className="w-3 h-3" />
                              <span>Javob</span>
                            </button>
                            <span aria-hidden="true">·</span>
                            <span>{formatTimeShort(msg.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer or Student Permission Gate */}
              <div className="p-3 bg-white dark:bg-[#061812] border-t border-slate-200 dark:border-emerald-500/15 space-y-2.5">
                {studentDmLocked ? (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <Lock className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>
                        {activeThread.permissionStatus === 'pending'
                          ? 'Suhbatlashish uchun ruxsat so‘rovingiz yuborilgan. Qabul qiluvchi tasdiqlashini kuting.'
                          : activeThread.permissionStatus === 'blocked'
                          ? 'Ushbu foydalanuvchi bilan yozishish bloklangan.'
                          : activeThread.permissionStatus === 'disabled_by_recipient'
                          ? 'Bu o‘quvchi boshqa o‘quvchilardan xabar qabul qilishni o‘chirib qo‘ygan.'
                          : 'O‘quvchilar bir-biriga yozishi uchun avval qabul qiluvchi ruxsat berishi kerak.'}
                      </span>
                    </div>
                    {activeThread.recipientUid &&
                      ['not_requested', 'rejected'].includes(String(activeThread.permissionStatus || 'not_requested')) && (
                        <button
                          type="button"
                          onClick={async () => {
                            await requestChatPermission(activeThread.recipientUid!);
                            await loadThreadsAndPerms();
                          }}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shrink-0 cursor-pointer"
                        >
                          Ruxsat so‘rash
                        </button>
                      )}
                  </div>
                ) : (
                  <form onSubmit={handleSend} className="space-y-2">
                    {/* Message Kind Segmented Switch */}
                    {activeThread.allowedMessageKinds.length > 1 && (
                      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-[#040D0A] rounded-xl w-fit border border-transparent dark:border-emerald-500/15">
                        {activeThread.allowedMessageKinds.map(kind => (
                          <button
                            key={kind}
                            type="button"
                            onClick={() => setMessageKind(kind)}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              messageKind === kind
                                ? 'bg-white dark:bg-[#061812] text-slate-900 dark:text-emerald-300 shadow-sm border border-emerald-500/20'
                                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            {kind === 'command' && <Megaphone className="w-3 h-3 text-amber-500" />}
                            {kind === 'idea' && <Lightbulb className="w-3 h-3 text-sky-500" />}
                            {kind === 'bot_notice' && <Bot className="w-3 h-3 text-sky-500" />}
                            <span>{KIND_LABELS[kind]}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Reply Banner */}
                    {replyTo && (
                      <div className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#040D0A] flex items-center justify-between gap-2 text-[11px]">
                        <div className="min-w-0 truncate">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">{replyTo.senderName}: </span>
                          <span className="text-slate-600 dark:text-slate-300">{replyTo.text || 'Rasm'}</span>
                        </div>
                        <button type="button" onClick={() => setReplyTo(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Image Attachment Preview */}
                    {attachedImageUrl && (
                      <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20">
                        <img
                          src={attachedImageUrl}
                          alt="Yuklangan rasm"
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 rounded-lg object-cover shrink-0"
                        />
                        <div className="text-[11px] text-slate-500 flex-1">Rasm xabarga biriktirildi</div>
                        <button
                          type="button"
                          onClick={() => setAttachedImageUrl('')}
                          className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    <div className="flex items-end gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImagePick}
                        className="hidden"
                      />
                      <button
                        type="button"
                        disabled={isUploadingImage}
                        onClick={() => fileInputRef.current?.click()}
                        title="Rasm biriktirish"
                        className="p-2.5 rounded-xl border border-slate-200 dark:border-emerald-500/20 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-emerald-500/10 shrink-0 cursor-pointer disabled:opacity-50"
                      >
                        <ImageIcon className="w-4 h-4" />
                      </button>

                      <textarea
                        rows={1}
                        value={draftText}
                        onChange={e => setDraftText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                          }
                        }}
                        placeholder={
                          isUploadingImage
                            ? 'Rasm yuklanmoqda...'
                            : activeThread.viaBot
                            ? '@Ecoheros_bot nomidan xabar yozing...'
                            : messageKind === 'command'
                            ? 'Rasmiy buyruq yoki topshiriq yozing...'
                            : messageKind === 'idea'
                            ? 'G‘oyangiz yoki taklifingizni yozing...'
                            : 'Xabar yozing...'
                        }
                        className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-500 resize-none"
                      />

                      <button
                        type="submit"
                        disabled={isSending || isUploadingImage || (!draftText.trim() && !attachedImageUrl)}
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] hover:brightness-105 disabled:opacity-50 text-[#04110B] text-xs font-black border-b-2 border-emerald-700 inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        <Send className="w-4 h-4" />
                        <span className="hidden sm:inline">{isSending ? 'Yuborilmoqda' : 'Yuborish'}</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Lightbox Modal for Chat Images */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        >
          <div className="relative max-w-3xl max-h-[85vh]">
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="absolute -top-10 right-0 p-2 text-white hover:text-emerald-400 cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={lightboxImage}
              alt="Katta ko‘rinish"
              referrerPolicy="no-referrer"
              className="max-h-[80vh] rounded-2xl object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};
