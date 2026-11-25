import React, { useState } from 'react';
import { Gift, Target, Trophy } from 'lucide-react';
import giftLeavesImg from '../../assets/images/home_gift_leaves_1795602395449.jpg';
import championshipCupImg from '../../assets/images/home_championship_cup_1795602397115.jpg';
import missionTargetImg from '../../assets/images/home_mission_target_1795602397153.jpg';
import inviteGiftImg from '../../assets/images/home_invite_gift_1795602416207.jpg';

export const EcoGiftLeavesArt: React.FC<{ className?: string }> = ({ className = 'w-14 h-14' }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`relative rounded-2xl overflow-hidden bg-[#061A12] border border-emerald-400/25 shadow-[0_6px_18px_rgba(0,0,0,0.45)] flex items-center justify-center shrink-0 ${className}`}
    >
      {failed ? (
        <Gift className="w-7 h-7 text-amber-400" />
      ) : (
        <img
          src={giftLeavesImg}
          alt="Eko-Bozor sovg'alar"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-300"
        />
      )}
    </div>
  );
};

export const EcoChampionshipTrophyArt: React.FC<{ className?: string }> = ({ className = 'w-24 h-24' }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`relative rounded-2xl overflow-hidden bg-[#061D15] border border-amber-400/35 shadow-[0_8px_24px_rgba(245,158,11,0.2)] flex items-center justify-center shrink-0 ${className}`}
    >
      {failed ? (
        <Trophy className="w-10 h-10 text-amber-400" />
      ) : (
        <img
          src={championshipCupImg}
          alt="EcoHero Chempionat kubogi"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-300"
        />
      )}
    </div>
  );
};

export const EcoTargetArt: React.FC<{ className?: string }> = ({ className = 'w-12 h-12' }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-[#061A12] border border-emerald-400/30 shadow-[0_6px_16px_rgba(16,185,129,0.2)] flex items-center justify-center shrink-0 ${className}`}
    >
      {failed ? (
        <Target className="w-6 h-6 text-emerald-400" />
      ) : (
        <img
          src={missionTargetImg}
          alt="Kunlik missiyalar nishoni"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-300"
        />
      )}
    </div>
  );
};

export const EcoMiniGiftArt: React.FC<{ className?: string }> = ({ className = 'w-11 h-11' }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-[#061A12] border border-emerald-400/30 shadow-[0_6px_16px_rgba(16,185,129,0.18)] flex items-center justify-center shrink-0 ${className}`}
    >
      {failed ? (
        <Gift className="w-5 h-5 text-emerald-400" />
      ) : (
        <img
          src={inviteGiftImg}
          alt="Do'stlarni taklif bonusi"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-300"
        />
      )}
    </div>
  );
};
