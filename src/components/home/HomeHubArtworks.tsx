import React from 'react';

export const EcoGiftLeavesArt: React.FC<{ className?: string }> = ({ className = 'w-16 h-14' }) => (
  <svg viewBox="0 0 96 80" fill="none" className={className} aria-hidden="true">
    <defs>
      <radialGradient id="giftGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#34D399" stopOpacity="0.45" />
        <stop offset="100%" stopColor="#34D399" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="boxBody" x1="26" y1="30" x2="72" y2="70" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FACC15" />
        <stop offset="100%" stopColor="#D97706" />
      </linearGradient>
      <linearGradient id="boxLid" x1="22" y1="20" x2="74" y2="38" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FDE047" />
        <stop offset="100%" stopColor="#F59E0B" />
      </linearGradient>
      <linearGradient id="ribbonBlue" x1="42" y1="14" x2="56" y2="70" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#38BDF8" />
        <stop offset="100%" stopColor="#0284C7" />
      </linearGradient>
      <linearGradient id="leafGreen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#4ADE80" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>
    </defs>

    <circle cx="48" cy="44" r="34" fill="url(#giftGlow)" />

    {/* Botanical leaves left & right */}
    <path d="M27 56C14 52 8 40 12 29C22 33 30 43 27 56Z" fill="url(#leafGreen)" />
    <path d="M23 64C12 64 5 57 6 48C16 49 24 55 23 64Z" fill="#10B981" />
    <path d="M69 54C82 50 88 38 84 27C74 31 66 41 69 54Z" fill="url(#leafGreen)" />
    <path d="M73 63C84 63 91 56 90 47C80 48 72 54 73 63Z" fill="#10B981" />

    {/* Gift Box Body */}
    <rect x="27" y="34" width="42" height="32" rx="6" fill="url(#boxBody)" />
    <rect x="44" y="34" width="8" height="32" fill="url(#ribbonBlue)" />

    {/* Gift Box Lid */}
    <rect x="24" y="25" width="48" height="11" rx="4" fill="url(#boxLid)" />
    <rect x="44" y="25" width="8" height="11" fill="url(#ribbonBlue)" />

    {/* Ribbon Bow */}
    <path d="M48 25C41 25 35 19 37 14C40 10 47 16 48 25Z" fill="#38BDF8" />
    <path d="M48 25C55 25 61 19 59 14C56 10 49 16 48 25Z" fill="#0EA5E9" />
  </svg>
);

export const EcoChampionshipTrophyArt: React.FC<{ className?: string }> = ({ className = 'w-28 h-24' }) => (
  <svg viewBox="0 0 128 112" fill="none" className={className} aria-hidden="true">
    <defs>
      <radialGradient id="trophyAura" cx="50%" cy="46%" r="50%">
        <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.48" />
        <stop offset="55%" stopColor="#10B981" stopOpacity="0.22" />
        <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="goldCup" x1="40" y1="16" x2="88" y2="78" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FEF08A" />
        <stop offset="45%" stopColor="#FBBF24" />
        <stop offset="100%" stopColor="#B45309" />
      </linearGradient>
      <linearGradient id="goldPedestal" x1="44" y1="78" x2="84" y2="100" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#1F2937" />
        <stop offset="100%" stopColor="#030712" />
      </linearGradient>
    </defs>

    <circle cx="64" cy="52" r="50" fill="url(#trophyAura)" />

    {/* Laurel leaves */}
    <path d="M36 78C20 68 16 46 25 28C30 42 32 58 38 74Z" fill="#F59E0B" opacity="0.9" />
    <path d="M92 78C108 68 112 46 103 28C98 42 96 58 90 74Z" fill="#F59E0B" opacity="0.9" />
    <path d="M26 88C14 82 8 70 11 58C20 64 26 75 26 88Z" fill="#22C55E" />
    <path d="M102 88C114 82 120 70 117 58C108 64 102 75 102 88Z" fill="#22C55E" />

    {/* Trophy Handles */}
    <path d="M41 28H29C25 28 23 35 26 42C29 48 36 51 43 51" stroke="#FBBF24" strokeWidth="5.5" strokeLinecap="round" />
    <path d="M87 28H99C103 28 105 35 102 42C99 48 92 51 85 51" stroke="#FBBF24" strokeWidth="5.5" strokeLinecap="round" />

    {/* Cup Body */}
    <path d="M40 20H88L84 48C82 61 73 69 64 69C55 69 46 61 44 48L40 20Z" fill="url(#goldCup)" />
    <ellipse cx="64" cy="20" rx="24" ry="5.5" fill="#FEF08A" />
    <path d="M58 68H70L72 80H56L58 68Z" fill="#D97706" />

    {/* Pedestal */}
    <rect x="44" y="80" width="40" height="8" rx="3" fill="#F59E0B" />
    <rect x="38" y="86" width="52" height="12" rx="5" fill="url(#goldPedestal)" stroke="#34D399" strokeOpacity="0.4" />

    {/* Center Leaf Shield Emblem */}
    <path d="M64 33C69 37 71 43 68 49C65 53 60 53 58 48C56 42 59 36 64 33Z" fill="#92400E" opacity="0.35" />

    {/* Sparkles */}
    <circle cx="32" cy="18" r="2.2" fill="#FDE047" />
    <circle cx="96" cy="20" r="2" fill="#34D399" />
    <circle cx="64" cy="9" r="2.4" fill="#FEF08A" />
  </svg>
);

export const EcoTargetArt: React.FC<{ className?: string }> = ({ className = 'w-11 h-11' }) => (
  <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
    <defs>
      <radialGradient id="targetGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#FACC15" stopOpacity="0.4" />
        <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle cx="32" cy="32" r="30" fill="url(#targetGlow)" />
    <circle cx="30" cy="34" r="20" fill="#064E3B" stroke="#34D399" strokeWidth="3" />
    <circle cx="30" cy="34" r="13" fill="#0F172A" stroke="#FACC15" strokeWidth="3.5" />
    <circle cx="30" cy="34" r="6" fill="#FACC15" />
    {/* Arrow */}
    <path d="M30 34L52 12" stroke="#4ADE80" strokeWidth="3.2" strokeLinecap="round" />
    <path d="M47 11L53 11L53 17" fill="#34D399" />
  </svg>
);

export const EcoMiniGiftArt: React.FC<{ className?: string }> = ({ className = 'w-9 h-9' }) => (
  <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
    <rect x="10" y="21" width="28" height="20" rx="4" fill="#F59E0B" />
    <rect x="21" y="21" width="6" height="20" fill="#38BDF8" />
    <rect x="8" y="15" width="32" height="7" rx="3" fill="#FACC15" />
    <rect x="21" y="15" width="6" height="7" fill="#38BDF8" />
    <path d="M24 15C19 15 15 11 17 8C19 5 23 9 24 15Z" fill="#38BDF8" />
    <path d="M24 15C29 15 33 11 31 8C29 5 25 9 24 15Z" fill="#0EA5E9" />
  </svg>
);
