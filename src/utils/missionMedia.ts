import { EcoMission } from '../types/eco';
import plantingPhoto from '../assets/images/mission_photo_planting_1795603120304.jpg';
import earthPhoto from '../assets/images/mission_photo_earth_1795603120184.jpg';
import englishPhoto from '../assets/images/mission_photo_english_1795603120960.jpg';
import booksPhoto from '../assets/images/mission_photo_books_1795603120993.jpg';
import biologyPhoto from '../assets/images/mission_photo_biology_1795603144271.jpg';
import mathPhoto from '../assets/images/mission_photo_math_1795603145270.jpg';
import logicPhoto from '../assets/images/mission_photo_logic_1795603145582.jpg';
import russianPhoto from '../assets/images/mission_photo_russian_1795603145306.jpg';
import ecologyPhoto from '../assets/images/mission_photo_ecology_1795603146094.jpg';

export type SubjectCategoryKey =
  | 'tasks'
  | 'ecology'
  | 'english'
  | 'russian'
  | 'biology'
  | 'geography'
  | 'math'
  | 'logic'
  | 'literature';

export const MISSION_ADMIN_CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'greening', label: "Topshiriq (Daraxt / Amaliy)" },
  { value: 'ecology', label: 'Ekologiya' },
  { value: 'english', label: 'Ingliz tili' },
  { value: 'russian', label: 'Rus tili' },
  { value: 'biology', label: 'Biologiya' },
  { value: 'geography', label: 'Geografiya' },
  { value: 'math', label: 'Matematika' },
  { value: 'logic', label: 'Mantiqiy savollar' },
  { value: 'literature', label: 'Asar va kitob testlari' },
  { value: 'telegram', label: 'Telegram kanal' },
];

export function resolveMissionSubjectKey(mission: EcoMission): SubjectCategoryKey {
  const cat = String(mission.category || '').toLowerCase().trim();
  const text = `${cat} ${mission.title || ''} ${mission.description || ''}`.toLowerCase();

  if (cat === 'english' || /ingliz|english|a2|b1|b2|grammar|vocabulary/i.test(text)) {
    return 'english';
  }
  if (cat === 'russian' || /rus tili|russian|русск/i.test(text)) {
    return 'russian';
  }
  if (cat === 'biology' || /biolog|hujayra|genetik|anatom|botanik/i.test(text)) {
    return 'biology';
  }
  if (cat === 'geography' || /geograf|yer|okean|qit'a|materik|iqlim/i.test(text)) {
    return 'geography';
  }
  if (cat === 'math' || /matemat|algebra|geometriya|tenglama|hisob/i.test(text)) {
    return 'math';
  }
  if (cat === 'logic' || /mantiq|shaxmat|jumboq|logic/i.test(text)) {
    return 'logic';
  }
  if (cat === 'literature' || /asar|kitob|navoiy|adabiyot|bobur|qodiriy|roman/i.test(text)) {
    return 'literature';
  }
  if (mission.type === 'custom_task' || mission.type === 'channel_subscribe' || cat === 'greening' || cat === 'tasks' || cat === 'telegram') {
    return 'tasks';
  }
  if (cat === 'ecology' || /ekolog|plastik|chiqindi|yashil|suv|tabiat|qayta/i.test(text)) {
    return 'ecology';
  }
  return 'ecology';
}

export function resolveMissionPhoto(mission: EcoMission): string {
  if (mission.imageUrl && mission.imageUrl.trim()) {
    return mission.imageUrl.trim();
  }
  const key = resolveMissionSubjectKey(mission);
  const titleLower = `${mission.title || ''} ${mission.category || ''}`.toLowerCase();

  if (key === 'english') return englishPhoto;
  if (key === 'russian') return russianPhoto;
  if (key === 'biology') return biologyPhoto;
  if (key === 'geography') return earthPhoto;
  if (key === 'math') return mathPhoto;
  if (key === 'logic') return logicPhoto;
  if (key === 'literature') return booksPhoto;
  if (key === 'tasks') {
    if (/daraxt|ko'chat|ekish|greening/i.test(titleLower)) return plantingPhoto;
    return ecologyPhoto;
  }
  if (/daraxt|ko'chat|yashil/i.test(titleLower)) return plantingPhoto;
  return ecologyPhoto;
}

export function resolveMissionBadgeMeta(mission: EcoMission): {
  label: string;
  pillClass: string;
} {
  const key = resolveMissionSubjectKey(mission);
  if (mission.type === 'custom_task') {
    return {
      label: 'Topshiriq',
      pillClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/35',
    };
  }
  if (mission.type === 'channel_subscribe') {
    return {
      label: 'Kanal',
      pillClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-400/35',
    };
  }
  if (key === 'literature') {
    return {
      label: 'Kitob testi',
      pillClass: 'bg-violet-500/20 text-violet-300 border-violet-400/35',
    };
  }
  return {
    label: 'Test',
    pillClass: 'bg-sky-500/20 text-sky-300 border-sky-400/35',
  };
}
