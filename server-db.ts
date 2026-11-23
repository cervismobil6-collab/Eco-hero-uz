import fs from 'fs';
import path from 'path';

export interface RewardSettingsRecord {
  id: string;
  welcomeBonus: number;
  dailyQuiz: number;
  referralInviter: number;
  referralInvitee: number;
  awarenessPost: number;
  wasteSorting: number;
  treeCareWatering: number;
  treePlanting: number;
  gardenProject: number;
  environmentalCampaign: number;
  schoolImprovement: number;
  problemVerified: number;
  problemResolved: number;
  ambassadorTaskBonus: number;
  duplicateWindowHours: number;
  updatedAt: string;
  updatedBy: string;
}

export interface SchoolStudentRatingConfig {
  schoolId: string;
  schoolName: string;
  region: string;
  district: string;
  enabled: boolean;
  minMembersThreshold: number;
  monthlyPrizeTitle: string;
  bonusCoins: number;
  activatedAt?: string;
  activatedByUid?: string;
  updatedAt: string;
}

export interface DistrictStudentRatingConfig {
  key: string;
  region: string;
  district: string;
  enabled: boolean;
  minMembersThreshold: number;
  top1Prize: string;
  top2Prize: string;
  top3Prize: string;
  bonuses: [number, number, number];
  activatedAt?: string;
  activatedByUid?: string;
  updatedAt: string;
}

export interface UnifiedDatabase {
  users: Record<string, any>;
  schools: any[];
  reports: any[];
  ambassadors: any[];
  roleRequests: any[];
  registrationApplications: any[];
  mediaSubmissions: any[];
  ecoTasks: any[];
  rewardSettings: RewardSettingsRecord;
  shopItems: any[];
  shopOrders: any[];
  transactions: any[];
  partners: any[];
  sponsorshipProjects: any[];
  sponsorshipProposals: any[];
  ecoAds: any[];
  referrals: any[];
  broadcasts: any[];
  auditLogs: any[];
  notifications: any[];
  mapLayers?: any[];
  homePosts: any[];
  monthlyAwards: any[];
  ratingConfigs: {
    schoolRatings: Record<string, SchoolStudentRatingConfig>;
    districtStudentRatings: Record<string, DistrictStudentRatingConfig>;
  };
  studentMonthlyAwards: any[];
  chatMessages: any[];
  chatPermissions: any[];
  adRewardClaims: { id: string; userId: string; adId: string; amount: number; claimedAt: string }[];
  ecoMissions: any[];
  missionSubmissions: any[];
  missionCompletions: Record<string, string[]>;
  botStarters: Record<string, { chatId: string; username?: string; firstName?: string; startedAt: string; lastSeenAt?: string }>;
  deletedIds: string[];
  weeklyChallenge: {
    weekKey: string;
    title: string;
    description: string;
    targetActions: number;
    rewardCoins: number;
    participants: Record<string, { uid: string; fullName: string; schoolId?: string; progress: number; joinedAt: string; claimed?: boolean }>;
  };
  registrationSessions: Record<string, any>;
  dailyQuizClaims: Record<string, string>; // key: uid -> YYYY-MM-DD
  qrEcoScans: any[];
  schoolDuels: any[];
  certificates: any[];
  uidAliases: Record<string, string>;
  telegramLinkTokens: Record<
    string,
    { code: string; uid: string; createdAt: string; expiresAt: string }
  >;
  telegramLoginTokens: Record<
    string,
    {
      token: string;
      code: string;
      uid: string;
      telegramId: string;
      createdAt: string;
      expiresAt: string;
    }
  >;
  meta: {
    version: number;
    updatedAt: string;
    lastTelegramUpdateId?: number;
    purgedDemoDataV2?: boolean;
  };
}

export function getPersistentDataDir(): string {
  const raw = String(process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || '').trim();
  if (!raw) return process.cwd();
  const resolved = path.resolve(raw);
  try {
    fs.mkdirSync(resolved, { recursive: true });
    return resolved;
  } catch (err: any) {
    console.error(`[CentralDB ENV ERROR] Could not create DATA_DIR (${resolved}):`, err?.message || err);
    return process.cwd();
  }
}

const DATA_ROOT_DIR = getPersistentDataDir();
const UNIFIED_DB_PATH = path.join(DATA_ROOT_DIR, 'server-unified-db.json');
const UNIFIED_DB_BACKUP_PATH = path.join(DATA_ROOT_DIR, 'server-unified-db.backup.json');
const UNIFIED_DB_SNAPSHOTS_DIR = path.join(DATA_ROOT_DIR, 'db-backups');
const UNIFIED_DB_NONEMPTY_PATH = path.join(UNIFIED_DB_SNAPSHOTS_DIR, 'snapshot-latest-nonempty.json');
const LEGACY_USERS_FILE = path.join(process.cwd(), 'registered-users.json');
const LEGACY_ROLE_REQUESTS_FILE = path.join(process.cwd(), 'role-requests.json');
const LEGACY_SESSIONS_FILE = path.join(process.cwd(), 'server-registration-sessions.json');

const REGION_COORDS: Record<string, { lat: number; lng: number }> = {
  "Toshkent shahri": { lat: 41.3111, lng: 69.2797 },
  "Toshkent viloyati": { lat: 41.05, lng: 69.35 },
  "Samarqand viloyati": { lat: 39.6542, lng: 66.9597 },
  "Farg'ona viloyati": { lat: 40.3864, lng: 71.7864 },
  "Andijon viloyati": { lat: 40.7821, lng: 72.3442 },
  "Namangan viloyati": { lat: 40.9983, lng: 71.6726 },
  "Buxoro viloyati": { lat: 39.7747, lng: 64.4286 },
  "Xorazm viloyati": { lat: 41.5503, lng: 60.6314 },
  "Qashqadaryo viloyati": { lat: 38.86, lng: 65.79 },
  "Surxondaryo viloyati": { lat: 37.2242, lng: 67.2783 },
  "Navoiy viloyati": { lat: 40.0844, lng: 65.3792 },
  "Jizzax viloyati": { lat: 40.1158, lng: 67.8422 },
  "Sirdaryo viloyati": { lat: 40.4915, lng: 68.7811 },
  "Qoraqalpog'iston Respublikasi": { lat: 42.4531, lng: 59.6103 },
};

const SCHOOL_CAMPUS_GALLERY = [
  "/assets/schools/tashkent_campus.jpg",
  "/assets/schools/samarkand_campus.jpg",
  "/assets/schools/fergana_campus.jpg",
  "/assets/schools/bukhara_campus.jpg",
  "/assets/schools/eco_courtyard.jpg",
];

function pickCampusPhotos(school: any): { logoUrl: string; verifiedPhotos: string[] } {
  const id = String(school?.id || "");
  const region = String(school?.region || "").toLowerCase();
  let primary = SCHOOL_CAMPUS_GALLERY[0];

  if (id.includes("samarkand") || region.includes("samarqand")) {
    primary = "/assets/schools/samarkand_campus.jpg";
  } else if (id.includes("margilan") || region.includes("farg") || region.includes("andijon") || region.includes("namangan")) {
    primary = "/assets/schools/fergana_campus.jpg";
  } else if (id.includes("bukhara") || region.includes("buxoro") || region.includes("xorazm") || region.includes("navoiy")) {
    primary = "/assets/schools/bukhara_campus.jpg";
  } else if (id.includes("urgench")) {
    primary = "/assets/schools/eco_courtyard.jpg";
  }

  const existingLogo = String(school?.logoUrl || "").trim();
  const useExistingLogo =
    existingLogo.length > 0 &&
    !existingLogo.includes("w=150") &&
    (existingLogo.startsWith("/assets/") || existingLogo.startsWith("/uploads/") || existingLogo.startsWith("https://"));

  const logoUrl = useExistingLogo ? existingLogo : primary;
  const existingVerified = Array.isArray(school?.verifiedPhotos)
    ? school.verifiedPhotos.filter(
        (u: any) => typeof u === "string" && u.trim().length > 0 && !u.includes("w=150")
      )
    : [];

  const verifiedPhotos =
    existingVerified.length > 0
      ? Array.from(new Set([logoUrl, ...existingVerified]))
      : Array.from(new Set([logoUrl, "/assets/schools/eco_courtyard.jpg"]));

  return { logoUrl, verifiedPhotos };
}

function enrichSchoolProfile(school: any): any {
  if (!school || typeof school !== "object") return school;
  const { logoUrl, verifiedPhotos } = pickCampusPhotos(school);
  const trees = Number(school.treesPlanted || 0);
  const cleanups = Number(school.cleanupsCompleted || 0);
  const coins = Number(school.totalCoins || 0);
  const computedGreen =
    typeof school.greenAreaSqm === "number" && school.greenAreaSqm > 0
      ? school.greenAreaSqm
      : Math.max(480, Math.round(trees * 7.5 + cleanups * 25 + 450));
  const computedEnvScore =
    typeof school.environmentalScore === "number" && school.environmentalScore > 0
      ? school.environmentalScore
      : Math.min(100, Math.max(38, Math.round(trees * 0.1 + cleanups * 0.9 + coins / 1200 + 22)));
  const address =
    typeof school.address === "string" && school.address.trim().length > 0
      ? school.address.trim()
      : `${school.district || "Markaz"}, ${school.region || "O'zbekiston"}`;

  return {
    ...school,
    logoUrl,
    verifiedPhotos,
    address,
    greenAreaSqm: computedGreen,
    environmentalScore: computedEnvScore,
  };
}

const SEED_SCHOOLS: any[] = [];

const SEED_REPORTS: any[] = [];

const SEED_AMBASSADORS: any[] = [];

const SEED_SHOP_ITEMS = [
  {
    id: "shop_phone_01",
    title: "Samsung Galaxy Smartfon (Eko-Ta'lim Nashri)",
    description: "Ekologik monitoring va o'quv dasturlari uchun maxsus smartfon. AI kamera orqali chiqindilarni suratga olish va darslarda foydalanish uchun.",
    priceCoins: 13500,
    category: "education",
    stock: 3,
    imageUrl: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80",
    sponsorName: "IT Park & Yoshlar Ishlari Agentligi",
    features: ["128GB xotira", "AI foto-monitoring", "1 yil kafolat"],
  },
  {
    id: "shop_tablet_02",
    title: "Lenovo Tab Eko-Planshet 10.1 dyuym",
    description: "Elektron darsliklar, eko-loyihalar taqdimoti va onlayn ta'lim uchun zamonaviy yupqa planshet.",
    priceCoins: 10500,
    category: "education",
    stock: 4,
    imageUrl: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=600&q=80",
    sponsorName: "Raqamli Texnologiyalar Vazirligi",
    features: ["10.1' IPS ekran", "Stilus bilan ishlash", "Qalin g'ilof sovg'a"],
  },
  {
    id: "shop_bike_03",
    title: "Trinx Tog' va Shahar Sport Velosipedi",
    description: "Ekologik toza transport tarafdorlari uchun chidamli alyuminiy ramali, 21 tezlikli zamonaviy velosiped.",
    priceCoins: 8200,
    category: "accessories",
    stock: 5,
    imageUrl: "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=600&q=80",
    sponsorName: "Ekologiya va Iqlim O'zgarishi Vazirligi",
    features: ["Alyuminiy korpus", "Diskli tormoz", "Quyoshli chiroq kiritilgan"],
  },
  {
    id: "shop_anc_04",
    title: "Sony / JBL Simsiz Shovqinsiz Quloqchin (ANC)",
    description: "Dars qilish va audio-kitoblar tinglash uchun shovqinni to'suvchi (Active Noise Cancellation) simsiz naushnik.",
    priceCoins: 4200,
    category: "accessories",
    stock: 8,
    imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80",
    sponsorName: "Sanfa Eko Mahsulotlari",
    features: ["35 soat quvvat", "ANC faol shovqin to'sish", "Ergonomik qulaylik"],
  },
  {
    id: "shop_tg_prem_05",
    title: "Telegram Premium 1 yillik rasmiy obunasi",
    description: "Katta hajmli ekologik foto-hisobotlar va videolarni tez yuklash uchun rasmiy Telegram Premium yillik obunasi.",
    priceCoins: 2200,
    category: "education",
    stock: 25,
    imageUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80",
    sponsorName: "ECO HERO Jamg'armasi",
    features: ["12 oylik obuna", "4GB gacha fayl yuborish", "Yulduzcha statusi"],
  },
  {
    id: "shop_books_06",
    title: "'Jadidlar va Milliy Meros' 10 jildlik sara kitoblar to'plami",
    description: "O'zbekiston yoshlari uchun sara tarixiy, badiiy va ilmiy kitoblardan iborat maxsus nashr to'plami.",
    priceCoins: 1850,
    category: "education",
    stock: 15,
    imageUrl: "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=600&q=80",
    sponsorName: "Asaxiy Books & Yoshlar Ittifoqi",
    features: ["10 ta sara jild", "Qattiq muqova", "Eko-qutida taqdim etiladi"],
  },
  {
    id: "shop_solar_helm_07",
    title: "Quyosh panelli velo-ekipirovka & Eko-Dubulg'a",
    description: "Xavfsiz velosiped haydash uchun yorug'lik qaytaruvchi va avtomatik miltillovchi quyosh quvvatli dubulg'a.",
    priceCoins: 1600,
    category: "accessories",
    stock: 12,
    imageUrl: "https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=600&q=80",
    sponsorName: "Yashil Makon Harakati",
    features: ["Quyosh batareyali", "Zarbaga chidamli", "O'lchami moslanadi"],
  },
  {
    id: "shop_tumbler_08",
    title: "Termo-krujka (Eco Tumbler) 500ml Harorat Sensorli",
    description: "Zanglamaydigan oziq-ovqat po'lati. Qopqog'ida LED harorat ko'rsatkichi. Ichimlikni 12 soat issiq va 24 soat sovuq saqlaydi.",
    priceCoins: 950,
    category: "accessories",
    stock: 35,
    imageUrl: "https://images.unsplash.com/photo-1517256064527-09c73fc73e38?auto=format&fit=crop&w=600&q=80",
    sponsorName: "Yashil Makon Harakati",
    features: ["LED sensor qopqoq", "Vakuumli izolyatsiya", "ECO HERO logotipi"],
  },
  {
    id: "shop_tree_kit_09",
    title: "'Yashil Makon' Uyda daraxt ko'chatini o'stirish to'plami",
    description: "Biologik parchalanuvchi idish, ozuqaviy tuproq, tomchilatgich va Sharq archasi yoki eman urug'lari.",
    priceCoins: 650,
    category: "eco_home",
    stock: 40,
    imageUrl: "https://images.unsplash.com/photo-1463320726281-696a485928c7?auto=format&fit=crop&w=600&q=80",
    sponsorName: "Ekologiya Vazirligi",
    features: ["Maxsus qo'llanma", "Barchasi tabiatdan", "98% unib chiqish kafolati"],
  },
  {
    id: "shop_bag_10",
    title: "ECO HERO Premium Paxta Eko-sumkasi",
    description: "100% tabiiy O'zbek paxtasidan tayyorlangan mustahkam ko'p martalik xarid sumkasi.",
    priceCoins: 500,
    category: "accessories",
    stock: 60,
    imageUrl: "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80",
    sponsorName: "Sanfa Eko Mahsulotlari",
    features: ["100% organik paxta", "15 kg gacha ko'taradi", "Mashinada yuviladi"],
  },
  {
    id: "shop_stationery_11",
    title: "Qayta ishlangan qog'ozdan daftar & urug'li qalamlar",
    description: "Ikkilamchi xomashyodan ishlab chiqarilgan daftar va ishlatib bo'lgach tuproqqa ekiladigan gulli qalam!",
    priceCoins: 380,
    category: "stationery",
    stock: 75,
    imageUrl: "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=600&q=80",
    sponsorName: "UzRecycle Jamg'armasi",
    features: ["80 varaq eko-qog'oz", "Unuvchi urug'li 3 dona qalam"],
  },
  {
    id: "shop_tshirt_12",
    title: "Cheklangan Seriyadagi Organik Eko-Futbolka",
    description: "ECO HERO eksklyuziv ramzi tushirilgan, bo'yoqlari tabiiy o'simlik ekstraktidan olingan futbolka.",
    priceCoins: 850,
    category: "accessories",
    stock: 0,
    imageUrl: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=80",
    sponsorName: "Sanfa Eko Mahsulotlari",
    features: ["100% organik paxta", "Cheklangan sonli nashr"],
  },
];

const SEED_PARTNERS = [
  {
    id: "part_01",
    name: "Ekologiya, atrof-muhitni muhofaza qilish va iqlim o'zgarishi vazirligi",
    category: "Davlat organi",
    logoText: "EKOLOGIYA",
    logoUrl: "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=120&q=80",
    description: "Respublika bo'ylab ekologik nazorat, 'Yashil Makon' dasturini muvofiqlashtirish va yoshlar tashabbuslarini qo'llab-quvvatlash.",
    website: "https://eco.gov.uz",
    projectsSupported: "500+ maktabda 'Yashil Patrul' to'garaklari",
    contactEmail: "info@eco.gov.uz",
    contactPhone: "+998 71 207-07-70",
    contactPerson: "Rustam Ergashev (Bosh mutaxassis)",
    region: "Respublika miqyosida",
    isVerified: true,
    totalDonationUZS: 350000000,
    sponsoredProductsCount: 4,
  },
  {
    id: "part_02",
    name: "Maktabgacha va maktab ta'limi vazirligi",
    category: "Ta'lim",
    logoText: "MAKTAB.UZ",
    logoUrl: "https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=120&q=80",
    description: "10 000 dan ortiq umumta'lim maktablarida ECO HERO integratsiyasi va ekologik madaniyat darslari.",
    website: "https://uzedu.uz",
    projectsSupported: "Eko-Reyting va Maktab olimpiadalari",
    contactEmail: "aloqa@uzedu.uz",
    contactPhone: "+998 71 202-09-09",
    contactPerson: "Nigora Alimova (Ta'lim bo'limi mudiri)",
    region: "Respublika miqyosida",
    isVerified: true,
    totalDonationUZS: 200000000,
    sponsoredProductsCount: 3,
  },
  {
    id: "part_03",
    name: "Yoshlar ishlari agentligi",
    category: "Yoshlar tashkiloti",
    logoText: "YOSHLAR",
    logoUrl: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=120&q=80",
    description: "Eko-loyihalar uchun grantlar, iqtidorli o'quvchilarga IT va ta'lim vaucherlari ajratish.",
    website: "https://yoshlar.gov.uz",
    projectsSupported: "Har oylik 50 mln so'mlik Eko-Grantlar",
    contactEmail: "grant@yoshlar.gov.uz",
    contactPhone: "+998 71 232-15-20",
    contactPerson: "Bobur Mirzayev (Grantlar koordinatori)",
    region: "Respublika miqyosida",
    isVerified: true,
    totalDonationUZS: 150000000,
    sponsoredProductsCount: 2,
  },
  {
    id: "part_04",
    name: "Sanfa Products & Recycling MCHJ",
    category: "Xususiy sektor",
    logoText: "SANFA",
    logoUrl: "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=120&q=80",
    description: "Plastik va qog'oz chiqindilarni qayta ishlash korxonasi, Eco Shop uchun sovg'alar va maktablarga saralash qutilari yetkazib beruvchi.",
    website: "https://sanfa.uz",
    projectsSupported: "Eko-do'kon sovg'alari va 200 ta saralash konteyneri",
    contactEmail: "partners@sanfa.uz",
    contactPhone: "+998 78 140-50-50",
    contactPerson: "Farrux Zokirov (Tijorat direktori)",
    region: "Toshkent shahri",
    isVerified: true,
    totalDonationUZS: 120000000,
    sponsoredProductsCount: 5,
  },
  {
    id: "part_05",
    name: "Green Climate Tech Uzbekistan",
    category: "Yashil texnologiyalar",
    logoText: "G-TECH",
    logoUrl: "https://images.unsplash.com/photo-1509391365360-2e959784a276?auto=format&fit=crop&w=120&q=80",
    description: "Maktablarga mini-quyosh panellari va tomchilatib sug'orish datchiklarini o'rnatuvchi xalqaro loyiha.",
    website: "https://greenclimate.uz",
    projectsSupported: "35 ta maktabda quyosh energiyasi laboratoriyalari",
    contactEmail: "info@greenclimate.uz",
    contactPhone: "+998 71 200-88-22",
    contactPerson: "Dr. Kamol Mahmudov",
    region: "Samarqand & Buxoro viloyatlari",
    isVerified: true,
    totalDonationUZS: 180000000,
    sponsoredProductsCount: 2,
  },
];

const SEED_SPONSORSHIP_PROJECTS = [
  {
    id: "proj_01",
    partnerId: "part_01",
    partnerName: "Ekologiya Vazirligi & Yashil Makon",
    partnerLogoText: "EKOLOGIYA",
    title: "100 000 Tup Daraxt: Maktablar Atrofida Yashil Xiyobonlar",
    description: "Respublikaning 250 ta umumta'lim maktabi hududida mevali va manzarali daraxtzorlar barpo etish, tomchilatib sug'orish quvurlarini o'rnatish.",
    category: "greening",
    targetAmountUZS: 250000000,
    raisedAmountUZS: 210000000,
    inKindItems: "25 000 tup chinor, qayrag'och va sharq archasi ko'chatlari",
    schoolsBenefited: 250,
    treesPlantedOrImpact: "78 400 tup ekildi",
    status: "active",
    startDate: "2026-10-01",
    endDate: "2026-12-15",
    imageUrl: "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "proj_02",
    partnerId: "part_04",
    partnerName: "Sanfa Products & Recycling",
    partnerLogoText: "SANFA",
    title: "Toza Maktab: 1 000 ta Chiqindi Saralash Boksini O'rnatish",
    description: "Har bir sinf xonasiga plastik, qog'oz va organik chiqindilar uchun rang-barang eko-bokslar o'rnatish hamda doimiy olib ketish logistikasi.",
    category: "equipment",
    targetAmountUZS: 120000000,
    raisedAmountUZS: 120000000,
    inKindItems: "1 000 dona maxsus eko-konteyner va 50 000 eko-qop",
    schoolsBenefited: 120,
    treesPlantedOrImpact: "45 tonna plastik qayta ishlandi",
    status: "active",
    startDate: "2026-09-15",
    endDate: "2026-12-30",
    imageUrl: "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "proj_03",
    partnerId: "part_05",
    partnerName: "Green Climate Tech Uzbekistan",
    partnerLogoText: "G-TECH",
    title: "Quyosh Energiyasi: 30 ta Maktab Eko-Laboratoriyasi",
    description: "Elektr ta'minoti tejamkorligini o'rgatish uchun maktab tomiga mini quyosh panellari o'rnatish va amaliy fizika darslariga integratsiya qilish.",
    category: "solar",
    targetAmountUZS: 180000000,
    raisedAmountUZS: 135000000,
    inKindItems: "30 komplekt quyosh panellari va akkumulyator tizimi",
    schoolsBenefited: 30,
    treesPlantedOrImpact: "Yiliga 12 000 kVt yashil elektr tejami",
    status: "active",
    startDate: "2026-10-10",
    endDate: "2027-03-01",
    imageUrl: "https://images.unsplash.com/photo-1509391365360-2e959784a276?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "proj_04",
    partnerId: "part_03",
    partnerName: "Yoshlar Ishlari Agentligi",
    partnerLogoText: "YOSHLAR",
    title: "ECO SHOP: 10 000 ta Yoshlar Sovg'asi va Grantlar",
    description: "Faol eko-o'quvchilar uchun velosipedlar, planshetlar, kitoblar va IT ta'lim vaucherlarini xarid qilish uchun maxsus fond.",
    category: "shop_gifts",
    targetAmountUZS: 150000000,
    raisedAmountUZS: 150000000,
    inKindItems: "150 ta velosiped, 50 ta planshet, 3 000 ta kitob",
    schoolsBenefited: 420,
    treesPlantedOrImpact: "2 400 ta o'quvchi mukofotlandi",
    status: "completed",
    startDate: "2026-08-01",
    endDate: "2026-10-31",
    imageUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80",
  },
];

const SEED_SPONSORSHIP_PROPOSALS = [
  {
    id: "prop_01",
    companyName: "Artel Electronics MCHJ",
    contactPerson: "Umid Vohidov",
    contactEmail: "csr@artelgroup.org",
    contactPhone: "+998 71 202-22-20",
    sponsorshipType: "products",
    productDescription: "100 ta energiya tejovchi suv dispenserlari va filtrlar",
    targetSchoolsOrRegions: "Toshkent shahri va Toshkent viloyati maktablari",
    proposalDetails: "Maktablarda bir martalik plastik butilkalarni kamaytirish maqsadida toza ichimlik suvi dispenserlarini o'rnatib bermoqchimiz.",
    status: "approved",
    submittedAt: "2026-11-02T11:00:00Z",
    reviewedBy: "Super Admin",
    reviewedAt: "2026-11-03T14:20:00Z",
    adminNotes: "Loyiha tasdiqlandi, Eko-Bozor va maktablar ro'yxatiga kiritildi.",
  },
  {
    id: "prop_02",
    companyName: "Orient Finans Bank ATB",
    contactPerson: "Zilola Rahimova",
    contactEmail: "pr@ofb.uz",
    contactPhone: "+998 71 200-80-00",
    sponsorshipType: "funds",
    fundingAmountUZS: 50000000,
    targetSchoolsOrRegions: "Samarqand viloyati",
    proposalDetails: "Samarqand maktablarida 'Yashil Sinflar' tanlovi g'oliblari uchun maxsus mukofot jamg'armasi ajratish.",
    status: "pending",
    submittedAt: "2026-11-05T09:30:00Z",
  },
  {
    id: "prop_03",
    companyName: "Asaxiy Books MCHJ",
    contactPerson: "Firuz Allayev",
    contactEmail: "partner@asaxiy.uz",
    contactPhone: "+998 71 200-01-05",
    sponsorshipType: "products",
    productDescription: "2 000 dona ekologiya va ilmiy ommabop kitoblar to'plami",
    targetSchoolsOrRegions: "Barcha viloyatlar",
    proposalDetails: "ECO SHOP tizimiga o'quvchilar EcoCoin evaziga bepul olishi mumkin bo'lgan jahon bestseller kitoblarini joylashtirish.",
    status: "approved",
    submittedAt: "2026-11-01T15:00:00Z",
    reviewedBy: "Super Admin",
    reviewedAt: "2026-11-02T10:00:00Z",
    adminNotes: "Asaxiy kitoblari ECO SHOP omboriga ulandi.",
  },
];

const SEED_ECO_ADS = [
  {
    id: "ad_01",
    title: "Sanfa Eko-Konteynerlar Bilan Saralang",
    sponsorId: "part_04",
    sponsorName: "Sanfa Products",
    sponsorLogo: "SANFA",
    type: "banner",
    placement: "home_top",
    headline: "Plastik Chiqindilarni Maktabda Saralang — Yangi Sovg'alar Oling!",
    subheadline: "Sanfa va ECO HERO hamkorligidagi 'Toza Sinfxona' umumrespublika tanloviga qo'shiling.",
    imageUrl: "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=1200&q=80",
    ctaText: "Aksiyada qatnashish",
    ctaUrl: "https://sanfa.uz/ecohero",
    isVerifiedSponsor: true,
    startDate: "2026-11-01",
    endDate: "2026-12-31",
    status: "active",
    impressionsCount: 4210,
    clicksCount: 384,
    complianceNote: "Davlat ekologik talablariga mos, bolalar uchun ta'limiy va zararsiz targ'ibot.",
  },
  {
    id: "ad_02",
    title: "Najot Ta'lim: Yashil Dasturchilar IT Granti",
    sponsorId: "part_03",
    sponsorName: "Yoshlar Ishlari Agentligi & Najot Ta'lim",
    sponsorLogo: "IT-EDU",
    type: "banner",
    placement: "shop_top",
    headline: "Tabiatni Sevuvchi O'quvchilar Uchun IT Ta'lim Grantlari!",
    subheadline: "100 ta eng faol ECO HERO foydalanuvchisiga dasturlash va sun'iy intellekt kurslariga to'liq grant beriladi.",
    imageUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
    ctaText: "Grant shartlari",
    ctaUrl: "https://yoshlar.gov.uz/grants",
    isVerifiedSponsor: true,
    startDate: "2026-11-03",
    endDate: "2026-12-20",
    status: "active",
    impressionsCount: 2890,
    clicksCount: 245,
    complianceNote: "Ta'limiy stipendiya va bepul o'quv dasturlari haqidagi ijtimoiy reklama.",
  },
  {
    id: "ad_03",
    title: "Ekologiya Vazirligi: 'Yashil Makon' 2026 Kuzgi Mavsumi",
    sponsorId: "part_01",
    sponsorName: "Ekologiya Vazirligi",
    sponsorLogo: "EKOLOGIYA",
    type: "banner",
    placement: "home_middle",
    headline: "Har Bir Maktabga 100 Tup Ko'chat: Birgalikda Ko'kalamzorlashtiramiz!",
    subheadline: "Maktabingiz uchun bepul ko'chat olish arizasini topshiring va parvarishlang.",
    imageUrl: "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1200&q=80",
    ctaText: "Ariza topshirish",
    ctaUrl: "https://eco.gov.uz/yashil-makon",
    isVerifiedSponsor: true,
    startDate: "2026-10-25",
    endDate: "2026-12-10",
    status: "active",
    impressionsCount: 5120,
    clicksCount: 618,
    complianceNote: "Ijtimoiy umummilliy loyiha. Tijoriy sotuv mavjud emas.",
  },
  {
    id: "ad_post_purchase_01",
    title: "Sanfa Eko-Hamkor: Sovg'a Xarididan Keyingi Maxsus E'lon",
    sponsorId: "part_04",
    sponsorName: "Sanfa Eko Mahsulotlari",
    sponsorLogo: "SANFA",
    type: "banner",
    placement: "post_purchase",
    headline: "Yutgan Sovg'angizni Olish Uchun Maktab Sardoringizga Murojaat Qiling!",
    subheadline: "Tabiatni asraganingiz uchun rahmat! Hamkorlarimizning yangi eko-loyihalari bilan tanishing.",
    imageUrl: "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=1200&q=80",
    ctaText: "Loyihalarni ko'rish",
    ctaUrl: "https://ecohero.uz",
    skipAfterSeconds: 15,
    isVerifiedSponsor: true,
    startDate: "2026-11-01",
    endDate: "2027-06-30",
    status: "active",
    impressionsCount: 0,
    clicksCount: 0,
    complianceNote: "15 soniyadan so'ng o'tkazib yuborish va vaucherni ko'rish mumkin.",
  },
  {
    id: "ad_earn_coins_01",
    title: "Reklama Ko'rib +100 EcoCoin Oling — Green Climate Tech",
    sponsorId: "part_05",
    sponsorName: "Green Climate Tech",
    sponsorLogo: "G-TECH",
    type: "banner",
    placement: "earn_coins",
    headline: "15 Soniya Reklama Ko'ring va Darhol +100 EcoCoin Qo'lga Kiriting!",
    subheadline: "Quyosh energiyasi va yashil maktab dasturlari homiyligida o'quvchilar uchun qo'shimcha tanga xizmati.",
    imageUrl: "https://images.unsplash.com/photo-1509391365360-2e959784a276?auto=format&fit=crop&w=1200&q=80",
    ctaText: "Hamkor sahifasi",
    ctaUrl: "https://greenclimate.uz",
    rewardCoins: 100,
    skipAfterSeconds: 15,
    isVerifiedSponsor: true,
    startDate: "2026-11-01",
    endDate: "2027-06-30",
    status: "active",
    impressionsCount: 0,
    clicksCount: 0,
    complianceNote: "To'liq 15 soniya tomosha qilingach balansingizga avtomatik +100 EcoCoin qo'shiladi.",
  },
];

const SEED_SHOP_ORDERS: any[] = [];

const SEED_ROLE_REQUESTS: any[] = [];

const SEED_TRANSACTIONS: any[] = [];

const SEED_AUDIT_LOGS: any[] = [];

const SEED_REFERRALS: any[] = [];

const DEFAULT_REWARD_SETTINGS: RewardSettingsRecord = {
  id: 'default',
  welcomeBonus: 100,
  dailyQuiz: 50,
  referralInviter: 100,
  referralInvitee: 50,
  awarenessPost: 40,
  wasteSorting: 80,
  treeCareWatering: 120,
  treePlanting: 180,
  gardenProject: 250,
  environmentalCampaign: 200,
  schoolImprovement: 150,
  problemVerified: 100,
  problemResolved: 220,
  ambassadorTaskBonus: 90,
  duplicateWindowHours: 24,
  updatedAt: '2026-11-01T08:00:00Z',
  updatedBy: 'super_admin_system',
};

const SEED_REGISTRATION_APPLICATIONS: any[] = [];

const SEED_MEDIA_SUBMISSIONS: any[] = [];

const SEED_ECO_TASKS: any[] = [];

const SEED_MAP_LAYERS = [
  { id: 'schools', label: 'Maktablar', description: "Tasdiqlangan maktablar va Digital Twin nuqtalari", category: 'infrastructure', enabledByDefault: true, isActive: true, requiresPaidApi: false },
  { id: 'problem_locations', label: 'Ekologik muammolar', description: "Barcha tasdiqlangan ekologik muammo nuqtalari", category: 'reports', enabledByDefault: true, isActive: true, requiresPaidApi: false },
  { id: 'waste_reports', label: 'Chiqindi hisobotlari', description: "Maishiy va plastik chiqindi muammolari", category: 'reports', enabledByDefault: true, isActive: true, requiresPaidApi: false },
  { id: 'water_reports', label: 'Suv muammolari', description: "Ariq, kanal va suv havzalari holati", category: 'reports', enabledByDefault: true, isActive: true, requiresPaidApi: false },
  { id: 'green_spaces', label: 'Yashil hududlar', description: "Maktablar va xiyobonlar yashil zonalari", category: 'ecology', enabledByDefault: true, isActive: true, requiresPaidApi: false },
  { id: 'trees', label: 'Daraxtlar', description: "Ekilgan daraxtlar va ko'kalamzorlashtirish nuqtalari", category: 'ecology', enabledByDefault: true, isActive: true, requiresPaidApi: false },
  { id: 'school_rankings', label: 'Maktab reytinglari', description: "Ekologik ball va o'rinlar qatlami", category: 'analytics', enabledByDefault: false, isActive: true, requiresPaidApi: false },
  { id: 'eco_heatmap', label: 'Eko issiqlik xaritasi', description: "Muammolar zichligi (WebGL Heatmap)", category: 'analytics', enabledByDefault: false, isActive: true, requiresPaidApi: false },
  { id: 'district_boundaries', label: 'Viloyat va tuman chegaralari', description: "O'zbekiston hududiy ma'muriy chegaralari", category: 'infrastructure', enabledByDefault: true, isActive: true, requiresPaidApi: false },
];

const SEED_HOME_POSTS = [
  {
    id: 'post_seed_bot_01',
    title: '@Ecoheros_bot Telegram botda yangi tezkor imkoniyatlar!',
    content: "Endi barcha o'quvchilar bot orqali ko'chat ekish hisoboti yuborishi, kunlik EcoCoin olishi va yutgan sovg'alarining QR vaucherlarini tekshirishi mumkin.",
    category: 'bot_news',
    imageUrl: '/assets/schools/eco_courtyard.jpg',
    ctaText: 'Botni ochish (@Ecoheros_bot)',
    ctaUrl: 'https://t.me/Ecoheros_bot',
    authorUid: 'user_tg_8832599080',
    authorName: 'EcoHero Markaziy Jamoasi',
    authorRole: 'super_admin',
    isPinned: true,
    status: 'active',
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
  },
];

const SEED_USERS: Record<string, any> = {};

const SEED_CHAT_MESSAGES: any[] = [];

const SEED_ECO_MISSIONS = [
  {
    id: 'mission_quiz_plastic_01',
    type: 'quiz',
    title: 'Plastik va Chiqindilarni Saralash Testi (5 savol)',
    description: "5 ta savolga javob bering. Yakunda kamida 70% natija ko'rsatsangiz +100 EcoCoin olasiz!",
    rewardCoins: 100,
    passingPercent: 70,
    status: 'active',
    category: 'quiz',
    questions: [
      {
        id: 'q_pl_1',
        question: "Tabiatda oddiy plastik butilka to'liq chirib yo'q bo'lishi uchun o'rtacha necha yil kerak bo'ladi?",
        options: ['5 - 10 yil', '50 yil', '400 - 450 yil', '1 yil'],
        correctIndex: 2,
        explanation: "Plastik butilkalar tabiatda 400–450 yilgacha saqlanib qoladi, shu sababli ularni saralab qayta ishlash juda muhim.",
      },
      {
        id: 'q_pl_2',
        question: 'Qayta ishlash uchun chiqindilarni qaysi rangdagi qutilarga saralash tavsiya etiladi?',
        options: [
          'Barchasini bitta qora qopga solish',
          'Plastik, qog‘oz, shisha va organik chiqindilarni alohida qutilarga',
          'Faqat metallarni ajratish',
          'Suv ariqlariga tashlash',
        ],
        correctIndex: 1,
        explanation: 'Chiqindilarni alohida turlarga ajratish qayta ishlash samaradorligini 3 baravar oshiradi.',
      },
      {
        id: 'q_pl_3',
        question: '1 tonna makulatura (qog‘oz) qayta ishlansa, taxminan nechta katta daraxt saqlab qolinadi?',
        options: ['1 ta daraxt', '5 ta daraxt', '17 ta daraxt', '100 ta daraxt'],
        correctIndex: 2,
        explanation: '1 tonna qog‘ozni qayta ishlash 17 ta katta daraxt va 26 000 litr suvni tejaydi.',
      },
      {
        id: 'q_pl_4',
        question: 'Qaysi chiqindi turi tuproq va yerosti suvlarini og‘ir metallar bilan eng ko‘p zaharlaydi?',
        options: ['Barg xazoni', 'Ishlatilgan batareykalar', 'Karton quti', 'Yog‘och qipig‘i'],
        correctIndex: 1,
        explanation: 'Bitta kichik batareyka 20 kvadrat metr tuproq yoki 400 litr suvni og‘ir metallar bilan ifloslantiradi.',
      },
      {
        id: 'q_pl_5',
        question: 'Plastik paketlardan foydalanishni kamaytirishning eng samarali usuli qaysi?',
        options: [
          'Har safar yangi yupqa paket olish',
          'Paketni yoqib yuborish',
          'Ko‘p martalik mato xalta (eko-sumka) ishlatish',
          'Paketni daryoga tashlash',
        ],
        correctIndex: 2,
        explanation: 'Bitta eko-sumka yiliga o‘rtacha 300–500 ta bir martalik plastik paket o‘rnini bosadi.',
      },
    ],
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    createdByName: 'ECO HERO Admin',
  },
  {
    id: 'mission_quiz_yashil_02',
    type: 'quiz',
    title: 'Yashil Makon va Suvni Asrash Vikorinasi (5 savol)',
    description: "Tabiat, daraxt ekish va suv resurslari bo'yicha 5 ta test. O'tish bali: 70%.",
    rewardCoins: 120,
    passingPercent: 70,
    status: 'active',
    category: 'quiz',
    questions: [
      {
        id: 'q_ym_1',
        question: 'Yangi ekilgan ko‘chatlarni kunning qaysi vaqtida sug‘orish eng foydali?',
        options: [
          'Tush payti quyosh tik kelganda',
          'Ertalab barvaqt yoki kechki salqinda',
          'Faqat yomg‘ir yog‘ganda',
          'Yarim tunda issiq suv bilan',
        ],
        correctIndex: 1,
        explanation: 'Ertalab yoki kechqurun sug‘orilganda suv bug‘lanib ketmaydi va ildizga to‘liq yetib boradi.',
      },
      {
        id: 'q_ym_2',
        question: 'Bitta katta sog‘lom daraxt bir yilda o‘rtacha qancha karbonat angidrid (CO2) gazini yutadi?',
        options: ['1 kg', '22 kg gacha', '500 gram', 'Yutmaydi'],
        correctIndex: 1,
        explanation: 'Bitta yetuk daraxt yiliga ~22 kg CO2 yutib, 2 kishiga yetarli kislorod ishlab chiqaradi.',
      },
      {
        id: 'q_ym_3',
        question: 'O‘zbekistonda suvni eng tejamkor yetkazib beradigan sug‘orish usuli qaysi?',
        options: [
          'Tomchilatib sug‘orish',
          'Ariqdan to‘liq oqizib yuborish',
          'Yo‘llarga sepish',
          'Chelaklab peshinda quyish',
        ],
        correctIndex: 0,
        explanation: 'Tomchilatib sug‘orish suv sarfini 50–65% gacha tejaydi va daraxt o‘sishini tezlashtiradi.',
      },
      {
        id: 'q_ym_4',
        question: 'Kuzda to‘kilgan daraxt barglarini (xazonni) nima qilish to‘g‘ri hisoblanadi?',
        options: [
          'Kuchli olovda yoqib yuborish',
          'Kompost (tabiiy o‘g‘it) tayyorlash',
          'Plastik bilan aralashtirish',
          'Ariqqa tashlab ko‘mish',
        ],
        correctIndex: 1,
        explanation: 'Barglarni yoqish zaharli tutun chiqaradi; ulardan kompost tayyorlansa tuproq unumdorligini oshiradi.',
      },
      {
        id: 'q_ym_5',
        question: 'Maktab hududida havo haroratini yozda 3–5°C ga pasaytirish uchun eng yaxshi chora nima?',
        options: [
          'Ko‘proq asfalt yotqizish',
          'Soya beruvchi daraxtlar va yashil hudud barpo etish',
          'Derazalarni yopib qo‘yish',
          'Plastik soya qo‘yish',
        ],
        correctIndex: 1,
        explanation: 'Daraxt soyasi va transpiratsiya tabiiy konditsioner vazifasini bajaradi.',
      },
    ],
    createdAt: new Date(Date.now() - 86400000 * 2.5).toISOString(),
    createdByName: 'ECO HERO Admin',
  },
  {
    id: 'mission_channel_official_01',
    type: 'channel_subscribe',
    title: 'ECO HERO Rasmiy Kanaliga Obuna',
    description: "Rasmiy Telegram kanalimizga obuna bo'ling va tekshiruvdan so'ng 100 EcoCoin oling!",
    rewardCoins: 100,
    status: 'active',
    category: 'telegram',
    channelUsername: '@Ecoheros_uz',
    channelUrl: 'https://t.me/Ecoheros_uz',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    createdByName: 'ECO HERO Admin',
  },
  {
    id: 'mission_task_trees_10',
    type: 'custom_task',
    title: "10 ta ko'chat eking — 500 EcoCoin oling!",
    description: "Maktab hovlisi yoki mahallangizda 10 ta daraxt ko'chati ekib, rasm dalilini yuklang. Admin tasdiqlagach mukofot beriladi.",
    rewardCoins: 500,
    status: 'active',
    category: 'greening',
    requiresProof: true,
    proofType: 'image',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    createdByName: 'ECO HERO Admin',
  },
];

function createDefaultDatabase(): UnifiedDatabase {
  return {
    users: { ...SEED_USERS },
    schools: [...SEED_SCHOOLS],
    reports: [...SEED_REPORTS],
    ambassadors: [...SEED_AMBASSADORS],
    roleRequests: [...SEED_ROLE_REQUESTS],
    registrationApplications: [...SEED_REGISTRATION_APPLICATIONS],
    mediaSubmissions: [...SEED_MEDIA_SUBMISSIONS],
    ecoTasks: [...SEED_ECO_TASKS],
    rewardSettings: { ...DEFAULT_REWARD_SETTINGS },
    shopItems: [...SEED_SHOP_ITEMS],
    shopOrders: [...SEED_SHOP_ORDERS],
    transactions: [...SEED_TRANSACTIONS],
    partners: [...SEED_PARTNERS],
    sponsorshipProjects: [...SEED_SPONSORSHIP_PROJECTS],
    sponsorshipProposals: [...SEED_SPONSORSHIP_PROPOSALS],
    ecoAds: [...SEED_ECO_ADS],
    referrals: [...SEED_REFERRALS],
    broadcasts: [],
    auditLogs: [...SEED_AUDIT_LOGS],
    notifications: [],
    mapLayers: [...SEED_MAP_LAYERS],
    homePosts: [...SEED_HOME_POSTS],
    monthlyAwards: [],
    ratingConfigs: {
      schoolRatings: {},
      districtStudentRatings: {},
    },
    studentMonthlyAwards: [],
    chatMessages: [...SEED_CHAT_MESSAGES],
    chatPermissions: [],
    adRewardClaims: [],
    ecoMissions: [...SEED_ECO_MISSIONS],
    missionSubmissions: [],
    missionCompletions: {},
    botStarters: {},
    deletedIds: [],
    weeklyChallenge: createDefaultWeeklyChallenge(),
    registrationSessions: {},
    dailyQuizClaims: {},
    qrEcoScans: [],
    schoolDuels: [],
    certificates: [],
    uidAliases: {},
    telegramLinkTokens: {},
    telegramLoginTokens: {},
    meta: {
      version: 2,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function getCurrentWeekWindow(now = new Date()): {
  weekKey: string;
  endIso: string;
  daysRemaining: number;
  hoursRemaining: number;
  minutesRemaining: number;
  secondsRemaining: number;
} {
  const tashkentMs = now.getTime() + 5 * 3600 * 1000;
  const tDate = new Date(tashkentMs);
  const utcDay = tDate.getUTCDay(); // 0=Sun..6=Sat
  const diffToMon = (utcDay + 6) % 7;
  const monday = new Date(Date.UTC(tDate.getUTCFullYear(), tDate.getUTCMonth(), tDate.getUTCDate() - diffToMon));
  const nextMonday = new Date(monday.getTime() + 7 * 86400 * 1000);
  const weekKey = monday.toISOString().slice(0, 10);
  const remainingMs = Math.max(0, nextMonday.getTime() - tashkentMs);
  const daysRemaining = Math.floor(remainingMs / (24 * 3600 * 1000));
  const hoursRemaining = Math.floor((remainingMs % (24 * 3600 * 1000)) / (3600 * 1000));
  const minutesRemaining = Math.floor((remainingMs % (3600 * 1000)) / (60 * 1000));
  const secondsRemaining = Math.floor((remainingMs % (60 * 1000)) / 1000);
  return {
    weekKey,
    endIso: new Date(nextMonday.getTime() - 5 * 3600 * 1000).toISOString(),
    daysRemaining,
    hoursRemaining,
    minutesRemaining,
    secondsRemaining,
  };
}

export function createDefaultWeeklyChallenge() {
  const { weekKey } = getCurrentWeekWindow();
  return {
    weekKey,
    title: "Haftalik Yashil Harakat Chellenji",
    description: "Shu hafta davomida kamida 3 ta eko-harakat (missiya, quiz yoki muammo xabari) bajaring va +250 EcoCoin bonusi yuting!",
    targetActions: 3,
    rewardCoins: 250,
    participants: {},
  };
}

const DEMO_USER_IDS = new Set([
  'user_regional_tashkent',
  'user_district_shayxontohur',
  'user_district_chilonzor',
  'user_district_yunusobod',
  'user_school_admin_17',
  'user_school_admin_19',
  'user_school_admin_41',
  'user_ambassador_01',
  'user_ambassador_02',
  'user_ambassador_03',
  'user_ambassador_04',
  'user_ambassador_05',
  'user_ambassador_06',
  'user_student_01',
  'user_student_17_2',
  'user_student_17_3',
  'user_student_chilonzor_1',
  'user_web_1794568950988',
]);

const DEMO_SCHOOL_IDS = new Set([
  'school_tashkent_17',
  'school_tashkent_19',
  'school_tashkent_41',
  'school_tashkent_132',
  'school_samarkand_42',
  'school_margilan_pres',
  'school_bukhara_10',
  'school_andijan_5',
  'school_urgench_2',
  'school_toshkent_shahri_yunusobod_tumani_17',
  'school_chilonzor_101',
]);

const DEMO_REPORT_IDS = new Set(['rep_001', 'rep_002', 'rep_003', 'rep_004', 'rep_005', 'rep_006']);
const DEMO_ORDER_IDS = new Set(['ord_001', 'ord_002', 'ord_003']);
const DEMO_MEDIA_IDS = new Set(['media_seed_01', 'media_seed_02', 'media_seed_03', 'media_1794568951139_5s00']);
const DEMO_APP_IDS = new Set(['app_seed_01', 'app_seed_02', 'app_1794568951160_156l']);

function isDemoOrSmokeId(id?: string): boolean {
  const s = String(id || '');
  return (
    s.startsWith('user_smoke_') ||
    s.startsWith('user_school_admin_179475') ||
    s.startsWith('user_ambassador_179475') ||
    s.startsWith('user_district_coordinator_179475') ||
    s.startsWith('app_1794756') ||
    s.startsWith('hpost_1794756') ||
    s.startsWith('tx_1794756') ||
    s.startsWith('tx_1794568') ||
    s.startsWith('log_1794756') ||
    s.startsWith('log_1794568') ||
    s.startsWith('log_1794644') ||
    s.startsWith('notif_1794756') ||
    s.startsWith('notif_17947559') ||
    s.startsWith('notif_1794644') ||
    s.startsWith('notif_1794568')
  );
}

function purgeDemoRecordsFromDb(db: any): { db: UnifiedDatabase; changed: boolean } {
  if (db?.meta?.purgedDemoDataV2) {
    return { db, changed: false };
  }

  const cleanUsers: Record<string, any> = {};
  for (const [uid, u] of Object.entries(db.users || {}) as [string, any][]) {
    if (DEMO_USER_IDS.has(uid) || isDemoOrSmokeId(uid)) continue;
    if (u?.fullName === 'Test Student') continue;
    cleanUsers[uid] = u;
  }

  const cleanSchools = (Array.isArray(db.schools) ? db.schools : [])
    .filter((s: any) => !DEMO_SCHOOL_IDS.has(s?.id))
    .map((s: any) => enrichSchoolProfile(s));

  const cleanReports = (Array.isArray(db.reports) ? db.reports : []).filter(
    (r: any) => !DEMO_REPORT_IDS.has(r?.id) && !DEMO_USER_IDS.has(r?.reporterUid)
  );

  const cleanAmbassadors = (Array.isArray(db.ambassadors) ? db.ambassadors : []).filter(
    (a: any) => !DEMO_USER_IDS.has(a?.id) && !isDemoOrSmokeId(a?.id)
  );

  const cleanRoleRequests = (Array.isArray(db.roleRequests) ? db.roleRequests : []).filter(
    (r: any) => !String(r?.id || '').startsWith('req_demo_') && !DEMO_USER_IDS.has(r?.userId)
  );

  const cleanApps = (Array.isArray(db.registrationApplications) ? db.registrationApplications : []).filter(
    (a: any) => !DEMO_APP_IDS.has(a?.id) && !isDemoOrSmokeId(a?.id) && !DEMO_USER_IDS.has(a?.userId)
  );

  const cleanMedia = (Array.isArray(db.mediaSubmissions) ? db.mediaSubmissions : []).filter(
    (m: any) => !DEMO_MEDIA_IDS.has(m?.id) && !DEMO_USER_IDS.has(m?.userId)
  );

  const cleanTasks = (Array.isArray(db.ecoTasks) ? db.ecoTasks : []).filter(
    (t: any) => t?.id !== 'task_seed_01' && !DEMO_USER_IDS.has(t?.assigneeUid)
  );

  const cleanOrders = (Array.isArray(db.shopOrders) ? db.shopOrders : []).filter(
    (o: any) => !DEMO_ORDER_IDS.has(o?.id) && !DEMO_USER_IDS.has(o?.userId)
  );

  const cleanTransactions = (Array.isArray(db.transactions) ? db.transactions : []).filter(
    (t: any) => !String(t?.id || '').startsWith('tx_seed_') && !isDemoOrSmokeId(t?.id) && !DEMO_USER_IDS.has(t?.userId)
  );

  const cleanReferrals = (Array.isArray(db.referrals) ? db.referrals : []).filter(
    (r: any) => r?.id !== 'ref_rec_01' && !DEMO_USER_IDS.has(r?.referrerUid)
  );

  const cleanAuditLogs = (Array.isArray(db.auditLogs) ? db.auditLogs : []).filter(
    (l: any) => l?.id !== 'log_001' && l?.id !== 'log_002' && !isDemoOrSmokeId(l?.id)
  );

  const cleanNotifications = (Array.isArray(db.notifications) ? db.notifications : []).filter(
    (n: any) => !isDemoOrSmokeId(n?.id) && !DEMO_USER_IDS.has(n?.userId) && !isDemoOrSmokeId(n?.userId)
  );

  const cleanChatMessages = (Array.isArray(db.chatMessages) ? db.chatMessages : []).filter(
    (m: any) => !String(m?.id || '').startsWith('msg_seed_') && !DEMO_USER_IDS.has(m?.senderUid)
  );

  const cleanHomePosts = (Array.isArray(db.homePosts) ? db.homePosts : [])
    .filter((p: any) => p?.id !== 'post_seed_channel_02' && p?.id !== 'post_seed_web_03' && !isDemoOrSmokeId(p?.id))
    .map((p: any) => {
      if (p?.id === 'post_seed_bot_01') {
        const { schoolId: _si, schoolName: _sn, region: _rg, district: _dt, ...rest } = p;
        return { ...rest, imageUrl: '/assets/schools/eco_courtyard.jpg', authorUid: 'user_tg_8832599080' };
      }
      return p;
    });

  const cleanRegSessions: Record<string, any> = {};
  for (const [sid, sess] of Object.entries(db.registrationSessions || {})) {
    if (sid === '9999990001') continue;
    cleanRegSessions[sid] = sess;
  }

  return {
    changed: true,
    db: {
      ...db,
      users: cleanUsers,
      schools: cleanSchools,
      reports: cleanReports,
      ambassadors: cleanAmbassadors,
      roleRequests: cleanRoleRequests,
      registrationApplications: cleanApps,
      mediaSubmissions: cleanMedia,
      ecoTasks: cleanTasks,
      shopOrders: cleanOrders,
      transactions: cleanTransactions,
      referrals: cleanReferrals,
      auditLogs: cleanAuditLogs,
      notifications: cleanNotifications,
      chatMessages: cleanChatMessages,
      homePosts: cleanHomePosts,
      registrationSessions: cleanRegSessions,
      meta: {
        ...(db.meta || { version: 2 }),
        purgedDemoDataV2: true,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

const CYRILLIC_TO_LATIN_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh',
  ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: "o'", қ: 'q', ғ: "g'", һ: 'h',
};

export function normalizeUzText(input?: string | null): string {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return '';
  let out = '';
  for (const ch of raw) {
    out += CYRILLIC_TO_LATIN_MAP[ch] !== undefined ? CYRILLIC_TO_LATIN_MAP[ch] : ch;
  }
  return out
    .replace(/[\u02BB\u02BC\u2018\u2019\u201B\u0060\u00B4']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeRegionKey(region?: string | null): string {
  const text = normalizeUzText(region);
  if (!text) return '';
  const noQuotes = text.replace(/'/g, '');
  if (noQuotes.includes('toshkent') && (noQuotes.includes('sh.') || noQuotes.includes('shahar') || noQuotes.includes('shahri'))) {
    return 'toshkent_sh';
  }
  if (noQuotes.includes('toshkent') && noQuotes.includes('vil')) {
    return 'toshkent_vil';
  }
  return noQuotes
    .replace(/\b(viloyati|viloyat|vil|shahri|shahar|sh|respublikasi|respublika)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeDistrictKey(district?: string | null): string {
  const text = normalizeUzText(district);
  if (!text) return '';
  return text
    .replace(/'/g, '')
    .replace(/\b(tumani|tuman|tum|t|shahri|shahar|sh)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function extractSchoolIdentity(
  schoolName?: string | null,
  explicitNumber?: string | null
): {
  isPlaceholder: boolean;
  kind: 'general' | 'lyceum' | 'college' | 'presidential';
  number: string;
  nameSlug: string;
} {
  const clean = normalizeUzText(schoolName);
  const cleanNoQuotes = clean.replace(/'/g, '');
  const isPlaceholder =
    !cleanNoQuotes ||
    cleanNoQuotes === 'maktab kiritilmagan' ||
    cleanNoQuotes === 'school_new' ||
    cleanNoQuotes === 'school_custom';

  const kind: 'general' | 'lyceum' | 'college' | 'presidential' =
    /\b(litsey|akademik)\b/.test(cleanNoQuotes)
      ? 'lyceum'
      : /\b(kollej|texnikum|kasb)\b/.test(cleanNoQuotes)
      ? 'college'
      : /\bprezident\b/.test(cleanNoQuotes)
      ? 'presidential'
      : 'general';

  const explicitStr = String(explicitNumber || '').trim();
  const explicitMatch = explicitStr.match(/\d+/);
  const nameNumMatch = cleanNoQuotes.match(/(?:^|\D)(\d{1,5})(?:\D|$)/);
  const number = explicitMatch ? explicitMatch[0] : nameNumMatch ? nameNumMatch[1] : '';

  const strippedWords = cleanNoQuotes
    .replace(/\b(sonli|son|umumiy|orta|talim|ixtisoslashtirilgan|davlat|maktabi|maktab|idum|idumi|umi|sh|tumani|tuman|viloyati|viloyat)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const nameSlug = strippedWords || cleanNoQuotes.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'school';

  return {
    isPlaceholder,
    kind,
    number,
    nameSlug,
  };
}

export function getSchoolCanonicalKey(school: {
  name?: string;
  schoolName?: string;
  number?: string;
  schoolNumber?: string;
  region?: string;
  district?: string;
}): string {
  const name = school?.name || school?.schoolName || '';
  const ident = extractSchoolIdentity(name, school?.number || school?.schoolNumber);
  if (ident.isPlaceholder) return '';
  const regKey = normalizeRegionKey(school?.region || 'Toshkent shahri') || 'toshkent_sh';
  const distKey = normalizeDistrictKey(school?.district || 'Markaziy tumani') || 'markaziy';
  const targetPart = ident.number ? `num_${ident.number}` : `name_${ident.nameSlug}`;
  return `${regKey}__${distKey}__${ident.kind}__${targetPart}`;
}

function getDbRichnessScore(parsed: any): number {
  if (!parsed || typeof parsed !== 'object') return 0;
  const users = Object.keys(parsed.users || {}).length;
  const schools = Array.isArray(parsed.schools) ? parsed.schools.length : 0;
  const starters = Object.keys(parsed.botStarters || {}).length;
  const reports = Array.isArray(parsed.reports) ? parsed.reports.length : 0;
  const media = Array.isArray(parsed.mediaSubmissions) ? parsed.mediaSubmissions.length : 0;
  const txs = Array.isArray(parsed.transactions) ? parsed.transactions.length : 0;
  return users * 100 + schools * 30 + starters * 10 + reports * 5 + media * 5 + txs;
}

function listRecentSnapshotFiles(): string[] {
  try {
    if (!fs.existsSync(UNIFIED_DB_SNAPSHOTS_DIR)) return [];
    const files = fs
      .readdirSync(UNIFIED_DB_SNAPSHOTS_DIR)
      .filter((f) => f.endsWith('.json') && f !== 'snapshot-latest-nonempty.json')
      .sort()
      .reverse();
    return files.map((f) => path.join(UNIFIED_DB_SNAPSHOTS_DIR, f));
  } catch {
    return [];
  }
}

function readValidDbJson(filePath: string): any | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size === 0) return null;
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function loadUnifiedDatabase(): { db: UnifiedDatabase; needsSave: boolean } {
  const defaults = createDefaultDatabase();

  const candidatePaths = [
    UNIFIED_DB_PATH,
    UNIFIED_DB_BACKUP_PATH,
    UNIFIED_DB_NONEMPTY_PATH,
    ...listRecentSnapshotFiles(),
  ];

  let parsed = readValidDbJson(UNIFIED_DB_PATH);
  let recoveredFromBackup = false;

  const primaryScore = getDbRichnessScore(parsed);
  if (!parsed || primaryScore === 0) {
    let bestParsed = parsed;
    let bestScore = primaryScore;
    let bestPath = UNIFIED_DB_PATH;
    for (const candPath of candidatePaths.slice(1)) {
      const cand = readValidDbJson(candPath);
      const score = getDbRichnessScore(cand);
      if (cand && score > bestScore) {
        bestParsed = cand;
        bestScore = score;
        bestPath = candPath;
      }
    }
    if (bestParsed && bestScore > primaryScore) {
      console.warn(
        `[CentralDB] Asosiy baza bo'sh/kam — ${path.basename(bestPath)} (score=${bestScore}) dan avtomatik tiklanmoqda!`
      );
      parsed = bestParsed;
      recoveredFromBackup = true;
    }
  }

  if (parsed) {
    try {
      const deletedSet = new Set<string>(Array.isArray(parsed.deletedIds) ? parsed.deletedIds.map(String) : []);
      const hasShopArray = Array.isArray(parsed.shopItems);
      const loadedShopItems = (hasShopArray ? parsed.shopItems : defaults.shopItems).filter(
        (i: any) => !deletedSet.has(String(i?.id || ''))
      );
      const hasAdsArray = Array.isArray(parsed.ecoAds);
      const loadedAds = (hasAdsArray ? [...parsed.ecoAds] : [...defaults.ecoAds]).filter(
        (a: any) => !deletedSet.has(String(a?.id || ''))
      );
      if (!loadedAds.some((a: any) => a.placement === 'post_purchase')) {
        const seedPost = SEED_ECO_ADS.find((a) => a.placement === 'post_purchase');
        if (seedPost && !deletedSet.has(seedPost.id)) loadedAds.push(seedPost);
      }
      if (!loadedAds.some((a: any) => a.placement === 'earn_coins')) {
        const seedEarn = SEED_ECO_ADS.find((a) => a.placement === 'earn_coins');
        if (seedEarn && !deletedSet.has(seedEarn.id)) loadedAds.push(seedEarn);
      }
      const loadedOrders = (Array.isArray(parsed.shopOrders) ? parsed.shopOrders : []).map((o: any) => {
        if (o.itemImageUrl) return o;
        const matched = loadedShopItems.find((i: any) => i.id === o.itemId);
        return {
          ...o,
          itemImageUrl:
            matched?.imageUrl ||
            'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=600&q=80',
        };
      });

      const currentWeek = getCurrentWeekWindow().weekKey;
      const parsedWeekly =
        parsed.weeklyChallenge && parsed.weeklyChallenge.weekKey === currentWeek
          ? parsed.weeklyChallenge
          : createDefaultWeeklyChallenge();

      const hydrated = {
        ...defaults,
        ...parsed,
        users: { ...(parsed.users || {}) },
        schools: (Array.isArray(parsed.schools) ? parsed.schools : []).map((s: any) => enrichSchoolProfile(s)),
        reports: Array.isArray(parsed.reports) ? parsed.reports : [],
        ambassadors: Array.isArray(parsed.ambassadors) ? parsed.ambassadors : [],
        roleRequests: Array.isArray(parsed.roleRequests) ? parsed.roleRequests : [],
        registrationApplications: Array.isArray(parsed.registrationApplications) ? parsed.registrationApplications : [],
        mediaSubmissions: Array.isArray(parsed.mediaSubmissions) ? parsed.mediaSubmissions : [],
        ecoTasks: Array.isArray(parsed.ecoTasks) ? parsed.ecoTasks : [],
        rewardSettings: {
          ...DEFAULT_REWARD_SETTINGS,
          ...(parsed.rewardSettings || {}),
        },
        shopItems: loadedShopItems,
        shopOrders: loadedOrders,
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
        partners: Array.isArray(parsed.partners) && parsed.partners.length > 0 ? parsed.partners : defaults.partners,
        sponsorshipProjects: Array.isArray(parsed.sponsorshipProjects) && parsed.sponsorshipProjects.length > 0 ? parsed.sponsorshipProjects : defaults.sponsorshipProjects,
        sponsorshipProposals: Array.isArray(parsed.sponsorshipProposals) ? parsed.sponsorshipProposals : defaults.sponsorshipProposals,
        ecoAds: loadedAds,
        referrals: Array.isArray(parsed.referrals) ? parsed.referrals : [],
        broadcasts: Array.isArray(parsed.broadcasts) ? parsed.broadcasts : [],
        auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
        notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
        mapLayers: Array.isArray(parsed.mapLayers) && parsed.mapLayers.length > 0 ? parsed.mapLayers : defaults.mapLayers,
        homePosts: (() => {
          const hasHomePostsArray = Array.isArray(parsed.homePosts);
          return (hasHomePostsArray ? parsed.homePosts : defaults.homePosts).filter(
            (p: any) => !deletedSet.has(String(p?.id || ''))
          );
        })(),
        monthlyAwards: Array.isArray(parsed.monthlyAwards) ? parsed.monthlyAwards : [],
        ratingConfigs: {
          schoolRatings:
            parsed.ratingConfigs?.schoolRatings && typeof parsed.ratingConfigs.schoolRatings === 'object'
              ? parsed.ratingConfigs.schoolRatings
              : {},
          districtStudentRatings:
            parsed.ratingConfigs?.districtStudentRatings &&
            typeof parsed.ratingConfigs.districtStudentRatings === 'object'
              ? parsed.ratingConfigs.districtStudentRatings
              : {},
        },
        studentMonthlyAwards: Array.isArray(parsed.studentMonthlyAwards) ? parsed.studentMonthlyAwards : [],
        chatMessages: Array.isArray(parsed.chatMessages) ? parsed.chatMessages : [],
        chatPermissions: Array.isArray(parsed.chatPermissions) ? parsed.chatPermissions : [],
        adRewardClaims: Array.isArray(parsed.adRewardClaims) ? parsed.adRewardClaims : [],
        ecoMissions: (() => {
          const hasMissionsArray = Array.isArray(parsed.ecoMissions);
          const existingMissions = hasMissionsArray
            ? parsed.ecoMissions.filter(
                (m: any) =>
                  !deletedSet.has(String(m?.id || '')) &&
                  !(m.id === 'mission_quiz_01' && !m.updatedAt && (!Array.isArray(m.questions) || m.questions.length <= 1))
              )
            : defaults.ecoMissions.filter((m: any) => !deletedSet.has(String(m?.id || '')));
          if (!hasMissionsArray) return existingMissions;
          const merged = [...existingMissions];
          for (const seedM of SEED_ECO_MISSIONS) {
            if (!deletedSet.has(seedM.id) && !merged.some((m: any) => m.id === seedM.id)) {
              merged.push(seedM);
            }
          }
          return merged;
        })(),
        missionSubmissions: Array.isArray(parsed.missionSubmissions) ? parsed.missionSubmissions : [],
        missionCompletions:
          parsed.missionCompletions && typeof parsed.missionCompletions === 'object'
            ? parsed.missionCompletions
            : {},
        botStarters:
          parsed.botStarters && typeof parsed.botStarters === 'object' ? parsed.botStarters : {},
        deletedIds: Array.from(deletedSet),
        weeklyChallenge: parsedWeekly,
        registrationSessions: parsed.registrationSessions || {},
        dailyQuizClaims: parsed.dailyQuizClaims || {},
        qrEcoScans: Array.isArray(parsed.qrEcoScans) ? parsed.qrEcoScans : [],
        schoolDuels: Array.isArray(parsed.schoolDuels) ? parsed.schoolDuels : [],
        certificates: Array.isArray(parsed.certificates) ? parsed.certificates : [],
        uidAliases:
          parsed.uidAliases && typeof parsed.uidAliases === 'object' ? parsed.uidAliases : {},
        telegramLinkTokens:
          parsed.telegramLinkTokens && typeof parsed.telegramLinkTokens === 'object'
            ? parsed.telegramLinkTokens
            : {},
        telegramLoginTokens:
          parsed.telegramLoginTokens && typeof parsed.telegramLoginTokens === 'object'
            ? parsed.telegramLoginTokens
            : {},
      };

      const { db: purgedDb, changed } = purgeDemoRecordsFromDb(hydrated);
      return { db: purgedDb, needsSave: changed || recoveredFromBackup };
    } catch (e) {
      console.error('[CentralDB] Error loading unified DB, using defaults:', e);
    }
  }

  return { db: defaults, needsSave: true };
}

const loadedDbResult = loadUnifiedDatabase();
export const centralDb: UnifiedDatabase = loadedDbResult.db;

let highWaterUserCount = Object.keys(centralDb.users || {}).length;
let highWaterSchoolCount = (centralDb.schools || []).length;
let highWaterStarterCount = Object.keys(centralDb.botStarters || {}).length;
let lastRollingSnapshotHour = '';

export function saveCentralDb(options?: { allowShrink?: boolean }) {
  try {
    const curUsers = Object.keys(centralDb.users || {}).length;
    const curSchools = (centralDb.schools || []).length;
    const curStarters = Object.keys(centralDb.botStarters || {}).length;

    // Zero-wipe safety shield: never let accidental empty state overwrite non-empty backups
    if (
      !options?.allowShrink &&
      highWaterUserCount > 0 &&
      curUsers === 0
    ) {
      console.error(
        `[CentralDB SAFETY SHIELD] Blocked accidental empty-users overwrite (had ${highWaterUserCount} users, attempted to save 0).`
      );
      return;
    }

    highWaterUserCount = Math.max(highWaterUserCount, curUsers);
    highWaterSchoolCount = Math.max(highWaterSchoolCount, curSchools);
    highWaterStarterCount = Math.max(highWaterStarterCount, curStarters);

    centralDb.meta.updatedAt = new Date().toISOString();
    const serialized = JSON.stringify(centralDb, null, 2);
    if (!serialized || serialized.length < 20) return;

    const tmpPath = `${UNIFIED_DB_PATH}.tmp`;
    fs.writeFileSync(tmpPath, serialized, 'utf-8');
    fs.renameSync(tmpPath, UNIFIED_DB_PATH);

    const backupTmpPath = `${UNIFIED_DB_BACKUP_PATH}.tmp`;
    fs.writeFileSync(backupTmpPath, serialized, 'utf-8');
    fs.renameSync(backupTmpPath, UNIFIED_DB_BACKUP_PATH);

    if (curUsers > 0 || curSchools > 0 || curStarters > 0) {
      try {
        fs.mkdirSync(UNIFIED_DB_SNAPSHOTS_DIR, { recursive: true });
        const nonEmptyTmp = `${UNIFIED_DB_NONEMPTY_PATH}.tmp`;
        fs.writeFileSync(nonEmptyTmp, serialized, 'utf-8');
        fs.renameSync(nonEmptyTmp, UNIFIED_DB_NONEMPTY_PATH);

        const hourKey = centralDb.meta.updatedAt.slice(0, 13).replace(/[:T]/g, '-');
        if (hourKey !== lastRollingSnapshotHour) {
          lastRollingSnapshotHour = hourKey;
          const snapPath = path.join(UNIFIED_DB_SNAPSHOTS_DIR, `snapshot-${hourKey}.json`);
          fs.writeFileSync(snapPath, serialized, 'utf-8');

          const allSnaps = fs
            .readdirSync(UNIFIED_DB_SNAPSHOTS_DIR)
            .filter((f) => f.startsWith('snapshot-20') && f.endsWith('.json'))
            .sort();
          if (allSnaps.length > 12) {
            for (const stale of allSnaps.slice(0, allSnaps.length - 12)) {
              try {
                fs.unlinkSync(path.join(UNIFIED_DB_SNAPSHOTS_DIR, stale));
              } catch {}
            }
          }
        }
      } catch (snapErr: any) {
        console.warn('[CentralDB] Rolling snapshot warning:', snapErr?.message || snapErr);
      }
    }
  } catch (e) {
    console.error('[CentralDB] Failed to save unified database:', e);
  }
}

export function normalizeSchoolNumber(schoolName?: string, explicitNumber?: string): string {
  const ident = extractSchoolIdentity(schoolName, explicitNumber);
  return ident.number || '';
}

export function getSchoolLiveStudentCount(school: any): number {
  const usersList = Object.values(centralDb.users || {});
  const targetId = String(school?.id || '').trim();
  const targetKey = getSchoolCanonicalKey(school);
  const seenUids = new Set<string>();

  for (const u of usersList as any[]) {
    if (!u || typeof u !== 'object') continue;
    const uid = String(u.uid || u.userId || '').trim();
    if (!uid || seenUids.has(uid)) continue;

    if (targetId && u.schoolId && String(u.schoolId).trim() === targetId) {
      seenUids.add(uid);
      continue;
    }

    if (targetKey) {
      const userSchoolKey = getSchoolCanonicalKey({
        schoolName: u.schoolName,
        schoolNumber: u.schoolNumber,
        region: u.region,
        district: u.district,
      });
      if (userSchoolKey && userSchoolKey === targetKey) {
        seenUids.add(uid);
      }
    }
  }
  return seenUids.size;
}

export function getDistrictLiveParticipantCount(region?: string, district?: string): number {
  const targetDistKey = normalizeDistrictKey(district);
  const targetRegKey = normalizeRegionKey(region);
  if (!targetDistKey) return 0;

  const usersList = Object.values(centralDb.users || {});
  const seenUids = new Set<string>();
  for (const u of usersList as any[]) {
    if (!u || typeof u !== 'object') continue;
    const uDistKey = normalizeDistrictKey(u.district);
    const uRegKey = normalizeRegionKey(u.region);
    if (uDistKey !== targetDistKey) continue;
    if (targetRegKey && uRegKey && uRegKey !== targetRegKey) continue;
    seenUids.add(String(u.uid));
  }
  return seenUids.size;
}

export function reconcileSchoolsAndStudents(persistIfChanged = false): boolean {
  let changed = false;
  if (!Array.isArray(centralDb.schools)) {
    centralDb.schools = [];
    changed = true;
  }

  // 1. Deduplicate existing schools by canonical key (region + district + schoolKind + schoolNumber/name)
  const canonicalMap = new Map<string, any>();
  const idRedirectMap = new Map<string, { targetId: string; targetName: string }>();
  const dedupedSchools: any[] = [];

  for (const rawSchool of centralDb.schools) {
    if (!rawSchool || typeof rawSchool !== 'object') continue;
    const school = enrichSchoolProfile(rawSchool);
    const canonKey = getSchoolCanonicalKey(school) || String(school.id || '');
    const existing = canonicalMap.get(canonKey);

    if (!existing) {
      canonicalMap.set(canonKey, school);
      dedupedSchools.push(school);
    } else {
      changed = true;
      idRedirectMap.set(String(school.id), { targetId: String(existing.id), targetName: String(existing.name) });
      existing.totalCoins = Math.max(Number(existing.totalCoins || 0), 0) + Math.max(Number(school.totalCoins || 0), 0);
      existing.treesPlanted = Number(existing.treesPlanted || 0) + Number(school.treesPlanted || 0);
      existing.cleanupsCompleted = Number(existing.cleanupsCompleted || 0) + Number(school.cleanupsCompleted || 0);
      if ((!existing.ambassadorName || existing.ambassadorName === 'Tayinlanmagan') && school.ambassadorName && school.ambassadorName !== 'Tayinlanmagan') {
        existing.ambassadorName = school.ambassadorName;
      }
      if (!existing.adminEmail && school.adminEmail) existing.adminEmail = school.adminEmail;
      if (String(school.name || '').length > String(existing.name || '').length && /maktab|litsey|kollej/i.test(String(school.name))) {
        // prefer informative name
        if (!/maktab|litsey|kollej/i.test(String(existing.name))) {
          existing.name = school.name;
        }
      }
    }
  }

  if (dedupedSchools.length !== centralDb.schools.length) {
    centralDb.schools = dedupedSchools;
    changed = true;
  }

  const schoolById = new Map<string, any>();
  for (const s of centralDb.schools) {
    schoolById.set(String(s.id), s);
  }

  // 2. Ensure every user with a real schoolName points to their canonical school in centralDb.schools
  for (const u of Object.values(centralDb.users || {}) as any[]) {
    if (!u || typeof u !== 'object') continue;
    const oldSid = String(u.schoolId || '').trim();
    if (oldSid && idRedirectMap.has(oldSid)) {
      const redir = idRedirectMap.get(oldSid)!;
      u.schoolId = redir.targetId;
      u.schoolName = redir.targetName;
      changed = true;
    }

    const sName = String(u.schoolName || '').trim();
    const ident = extractSchoolIdentity(sName, u.schoolNumber);
    const isCentralHq = oldSid === 'central_hq' || normalizeUzText(sName).includes('markaziy boshqarma');
    if (ident.isPlaceholder || isCentralHq) continue;

    const currentSchool = oldSid && schoolById.get(oldSid);
    if (!currentSchool || oldSid === 'school_custom' || oldSid === 'school_new') {
      const linked = findOrCreateSchoolInternal(
        {
          schoolId: currentSchool ? currentSchool.id : undefined,
          schoolName: sName,
          schoolNumber: u.schoolNumber,
          region: u.region || 'Toshkent shahri',
          district: u.district || 'Shayxontohur tumani',
        },
        false
      );
      if (linked) {
        if (u.schoolId !== linked.id || u.schoolName !== linked.name) {
          u.schoolId = linked.id;
          u.schoolName = linked.name;
          u.schoolNumber = linked.number || ident.number || u.schoolNumber || '';
          changed = true;
        }
        schoolById.set(String(linked.id), linked);
      }
    }
  }

  // 3. Re-point duplicate schoolIds in child records
  if (idRedirectMap.size > 0) {
    const collections = [
      centralDb.reports,
      centralDb.mediaSubmissions,
      centralDb.ecoTasks,
      centralDb.shopOrders,
      centralDb.ambassadors,
      centralDb.registrationApplications,
      centralDb.roleRequests,
      centralDb.qrEcoScans,
    ];
    for (const arr of collections) {
      for (const item of arr || []) {
        if (!item || typeof item !== 'object') continue;
        const redir = item.schoolId ? idRedirectMap.get(String(item.schoolId)) : null;
        if (redir) {
          item.schoolId = redir.targetId;
          if ('schoolName' in item) item.schoolName = redir.targetName;
          changed = true;
        }
      }
    }
  }

  // 4. Sync exact live student counts on every school
  for (const s of centralDb.schools) {
    const liveCount = getSchoolLiveStudentCount(s);
    if (s.registeredStudentsCount !== liveCount || s.studentsCount !== liveCount) {
      s.registeredStudentsCount = liveCount;
      s.studentsCount = liveCount;
      changed = true;
    }
  }

  if (changed && persistIfChanged) {
    recalculateSchoolRanks();
    saveCentralDb();
  }
  return changed;
}

export function getLiveSchoolsList(includeAdminEmail = false): any[] {
  reconcileSchoolsAndStudents(false);
  recalculateSchoolRanks();
  return (centralDb.schools || []).map((s: any) => {
    const liveStudents = getSchoolLiveStudentCount(s);
    const enriched = {
      ...s,
      registeredStudentsCount: liveStudents,
      studentsCount: liveStudents,
    };
    if (includeAdminEmail) return enriched;
    const { adminEmail: _ae, ...rest } = enriched;
    return rest;
  });
}

export function computeLiveMetrics() {
  reconcileSchoolsAndStudents(false);
  const usersList = Object.values(centralDb.users || {});
  const schoolsList = centralDb.schools || [];
  const reportsList = centralDb.reports || [];
  const mediaList = centralDb.mediaSubmissions || [];
  const ambassadorsList = centralDb.ambassadors || [];
  const roleRequestsList = centralDb.roleRequests || [];
  const regAppsList = centralDb.registrationApplications || [];
  const shopOrdersList = centralDb.shopOrders || [];
  const regSessions = centralDb.registrationSessions || {};

  const resolvedReports = reportsList.filter((r: any) =>
    ['resolved', 'RESOLVED'].includes(String(r?.status || ''))
  ).length;

  const userTrees = usersList.reduce((acc: number, u: any) => acc + Number(u?.treesPlanted || 0), 0);
  const schoolTrees = schoolsList.reduce((acc: number, s: any) => acc + Number(s?.treesPlanted || 0), 0);
  const approvedTreeMedia = mediaList.filter(
    (m: any) =>
      m?.status === 'APPROVED' &&
      (m?.activityCategory === 'tree_planting' || m?.activityCategory === 'school_garden')
  ).length;
  const treesPlanted = Math.max(schoolTrees, userTrees + approvedTreeMedia);

  const activeAmbassadors = new Set([
    ...ambassadorsList.filter((a: any) => a?.status !== 'revoked').map((a: any) => a.uid || a.id),
    ...usersList.filter((u: any) => u?.role === 'ambassador').map((u: any) => u.uid),
  ]).size;

  const botUserIds = new Set<string>();
  for (const starterKey of Object.keys(centralDb.botStarters || {})) {
    if (starterKey) botUserIds.add(String(starterKey));
  }
  for (const u of usersList as any[]) {
    if (u?.telegramId || u?.telegramChatId || u?.chatId || u?.telegramAuth || u?.telegramUsername) {
      const key = String(u.telegramId || u.telegramChatId || u.chatId || u.uid);
      botUserIds.add(key);
    }
  }
  for (const chatKey of Object.keys(regSessions)) {
    if (chatKey) botUserIds.add(String(chatKey));
  }

  const districtKeys = new Set<string>();
  const regionKeys = new Set<string>();
  for (const s of schoolsList as any[]) {
    const regKey = normalizeRegionKey(s?.region);
    const distKey = normalizeDistrictKey(s?.district);
    if (regKey) regionKeys.add(regKey);
    if (distKey) districtKeys.add(`${regKey}__${distKey}`);
  }
  for (const u of usersList as any[]) {
    const regKey = normalizeRegionKey(u?.region);
    const distKey = normalizeDistrictKey(u?.district);
    if (regKey) regionKeys.add(regKey);
    if (distKey) districtKeys.add(`${regKey}__${distKey}`);
  }

  const schoolCaptainsCount = (usersList as any[]).filter((u: any) => u?.role === 'school_admin').length;
  const pendingApplicationsCount =
    roleRequestsList.filter((r: any) => r?.status === 'pending').length +
    regAppsList.filter((a: any) => a?.status === 'pending').length;

  return {
    totalSchools: schoolsList.length,
    totalUsers: usersList.length,
    botUsersCount: botUserIds.size,
    totalDistricts: districtKeys.size,
    totalRegions: regionKeys.size,
    schoolCaptainsCount,
    pendingApplicationsCount,
    shopOrdersCount: shopOrdersList.length,
    resolvedReports,
    totalReports: reportsList.length,
    treesPlanted,
    activeAmbassadors,
  };
}

export function recalculateSchoolRanks() {
  const sorted = [...centralDb.schools].sort((a, b) => (b.totalCoins || 0) - (a.totalCoins || 0));
  sorted.forEach((s, idx) => {
    s.ratingRank = idx + 1;
  });
}

function findOrCreateSchoolInternal(
  params: {
    schoolId?: string;
    schoolName: string;
    schoolNumber?: string;
    region: string;
    district: string;
    coinsDelta?: number;
    incrementStudents?: boolean;
    treesDelta?: number;
    cleanupsDelta?: number;
    ambassadorName?: string;
    adminEmail?: string;
  },
  shouldSave = true
) {
  const cleanName = String(params.schoolName || '').trim();
  const region = String(params.region || 'Toshkent shahri').trim();
  const district = String(params.district || 'Markaziy tumani').trim();
  const ident = extractSchoolIdentity(cleanName, params.schoolNumber);

  if (ident.isPlaceholder) {
    return null;
  }

  const targetRegKey = normalizeRegionKey(region);
  const targetDistKey = normalizeDistrictKey(district);
  const targetCanonKey = getSchoolCanonicalKey({
    schoolName: cleanName,
    schoolNumber: params.schoolNumber,
    region,
    district,
  });

  let school = centralDb.schools.find((s) => {
    if (
      params.schoolId &&
      params.schoolId !== 'school_custom' &&
      params.schoolId !== 'school_new' &&
      s.id === params.schoolId &&
      normalizeRegionKey(s.region) === targetRegKey &&
      (!targetDistKey || normalizeDistrictKey(s.district) === targetDistKey)
    ) {
      return true;
    }
    const sCanonKey = getSchoolCanonicalKey(s);
    if (sCanonKey && targetCanonKey && sCanonKey === targetCanonKey) {
      return true;
    }
    return false;
  });

  if (!school) {
    const slugRegion = targetRegKey || 'toshkent_sh';
    const slugDistrict = targetDistKey || 'markaziy';
    const slugSchool = ident.number ? `${ident.kind}_${ident.number}` : `${ident.kind}_${ident.nameSlug}`;
    const id = `school_${slugRegion}_${slugDistrict}_${slugSchool}`.slice(0, 80);
    const coords = REGION_COORDS[region] || { lat: 41.2995, lng: 69.2401 };
    const jitter = () => (Math.random() - 0.5) * 0.02;

    const cleanLower = normalizeUzText(cleanName);
    const hasSchoolWord = /\b(maktab|litsey|kollej|texnikum|idum|idumi)\b/.test(cleanLower);
    const displayName = hasSchoolWord
      ? cleanName
      : `${region.split(' ')[0]} ${district.split(' ')[0]} ${ident.number ? `${ident.number}-maktab` : `${cleanName}-maktab`}`;

    school = enrichSchoolProfile({
      id,
      name: displayName,
      number: ident.number || cleanName.slice(0, 20),
      region,
      district,
      address: `${district}, ${region}`,
      totalCoins: Math.max(0, params.coinsDelta || 0),
      registeredStudentsCount: params.incrementStudents ? 1 : 0,
      studentsCount: params.incrementStudents ? 1 : 0,
      treesPlanted: params.treesDelta || 0,
      cleanupsCompleted: params.cleanupsDelta || 0,
      ambassadorName: params.ambassadorName || 'Tayinlanmagan',
      adminEmail: params.adminEmail || '',
      ratingRank: centralDb.schools.length + 1,
      status: 'active',
      createdAt: new Date().toISOString(),
      lat: coords.lat + jitter(),
      lng: coords.lng + jitter(),
    });
    centralDb.schools.push(school);
  } else {
    if (params.coinsDelta) {
      school.totalCoins = (school.totalCoins || 0) + params.coinsDelta;
    }
    if (params.treesDelta) {
      school.treesPlanted = (school.treesPlanted || 0) + params.treesDelta;
    }
    if (params.cleanupsDelta) {
      school.cleanupsCompleted = (school.cleanupsCompleted || 0) + params.cleanupsDelta;
    }
    if (params.ambassadorName && (!school.ambassadorName || school.ambassadorName === 'Tayinlanmagan')) {
      school.ambassadorName = params.ambassadorName;
    }
    const liveCount = getSchoolLiveStudentCount(school);
    school.registeredStudentsCount = Math.max(liveCount, params.incrementStudents ? 1 : 0);
    school.studentsCount = school.registeredStudentsCount;
  }

  if (shouldSave) {
    recalculateSchoolRanks();
    saveCentralDb();
  }
  return school;
}

export function findOrCreateSchool(params: {
  schoolId?: string;
  schoolName: string;
  schoolNumber?: string;
  region: string;
  district: string;
  coinsDelta?: number;
  incrementStudents?: boolean;
  treesDelta?: number;
  cleanupsDelta?: number;
  ambassadorName?: string;
  adminEmail?: string;
}) {
  return findOrCreateSchoolInternal(params, true);
}

function stripOversizedDataUrls(value: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (value.startsWith('data:image/') && value.length > 4000) return '';
    return value;
  }
  if (Array.isArray(value)) return value.map(stripOversizedDataUrls);
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = stripOversizedDataUrls(v);
    }
    return out;
  }
  return value;
}

export function exportCompactBackupSnapshot() {
  reconcileSchoolsAndStudents(false);
  const metrics = computeLiveMetrics();
  const compactUsers: Record<string, any> = {};
  for (const [uid, u] of Object.entries(centralDb.users || {})) {
    compactUsers[uid] = stripOversizedDataUrls(u);
  }
  return {
    id: 'primary_v1',
    version: 2,
    totalUsers: metrics.totalUsers,
    totalSchools: metrics.totalSchools,
    botUsersCount: metrics.botUsersCount,
    usersMap: compactUsers,
    schoolsList: stripOversizedDataUrls(centralDb.schools || []),
    botStartersMap: centralDb.botStarters || {},
    reportsList: stripOversizedDataUrls((centralDb.reports || []).slice(0, 1000)),
    mediaList: stripOversizedDataUrls((centralDb.mediaSubmissions || []).slice(0, 1000)),
    transactionsList: (centralDb.transactions || []).slice(0, 2000),
    extraCollections: stripOversizedDataUrls({
      ambassadors: centralDb.ambassadors || [],
      ecoTasks: centralDb.ecoTasks || [],
      shopOrders: centralDb.shopOrders || [],
      roleRequests: centralDb.roleRequests || [],
      registrationApplications: centralDb.registrationApplications || [],
      referrals: centralDb.referrals || [],
      certificates: centralDb.certificates || [],
      schoolDuels: centralDb.schoolDuels || [],
      qrEcoScans: centralDb.qrEcoScans || [],
      dailyQuizClaims: centralDb.dailyQuizClaims || {},
      missionSubmissions: centralDb.missionSubmissions || [],
      missionCompletions: centralDb.missionCompletions || {},
      uidAliases: centralDb.uidAliases || {},
      weeklyChallenge: centralDb.weeklyChallenge || createDefaultWeeklyChallenge(),
      ratingConfigs: centralDb.ratingConfigs || { schoolRatings: {}, districtStudentRatings: {} },
      studentMonthlyAwards: centralDb.studentMonthlyAwards || [],
      monthlyAwards: centralDb.monthlyAwards || [],
      adRewardClaims: centralDb.adRewardClaims || [],
    }),
  };
}

export function mergeDatabaseSnapshotNonDestructive(snapshot: any): {
  restoredUsers: number;
  restoredSchools: number;
  restoredStarters: number;
  changed: boolean;
} {
  if (!snapshot || typeof snapshot !== 'object') {
    return { restoredUsers: 0, restoredSchools: 0, restoredStarters: 0, changed: false };
  }

  let changed = false;
  let restoredUsers = 0;
  let restoredSchools = 0;
  let restoredStarters = 0;

  if (snapshot.botStartersMap && typeof snapshot.botStartersMap === 'object') {
    if (!centralDb.botStarters) centralDb.botStarters = {};
    for (const [k, starter] of Object.entries(snapshot.botStartersMap) as [string, any][]) {
      if (!k || !starter) continue;
      if (!centralDb.botStarters[k]) {
        centralDb.botStarters[k] = starter;
        restoredStarters += 1;
        changed = true;
      }
    }
  }

  if (Array.isArray(snapshot.schoolsList)) {
    for (const remoteSchool of snapshot.schoolsList) {
      if (!remoteSchool || typeof remoteSchool !== 'object') continue;
      const beforeLen = centralDb.schools.length;
      const linked = findOrCreateSchoolInternal(
        {
          schoolId: remoteSchool.id,
          schoolName: remoteSchool.name,
          schoolNumber: remoteSchool.number,
          region: remoteSchool.region || 'Toshkent shahri',
          district: remoteSchool.district || 'Markaziy tumani',
          ambassadorName: remoteSchool.ambassadorName,
          adminEmail: remoteSchool.adminEmail,
        },
        false
      );
      if (linked) {
        if (centralDb.schools.length > beforeLen) {
          restoredSchools += 1;
          changed = true;
        }
        linked.totalCoins = Math.max(Number(linked.totalCoins || 0), Number(remoteSchool.totalCoins || 0));
        linked.treesPlanted = Math.max(Number(linked.treesPlanted || 0), Number(remoteSchool.treesPlanted || 0));
        linked.cleanupsCompleted = Math.max(Number(linked.cleanupsCompleted || 0), Number(remoteSchool.cleanupsCompleted || 0));
      }
    }
  }

  if (snapshot.usersMap && typeof snapshot.usersMap === 'object') {
    for (const [uid, remoteUser] of Object.entries(snapshot.usersMap) as [string, any][]) {
      if (!remoteUser || typeof remoteUser !== 'object') continue;
      const existing =
        centralDb.users[uid] ||
        findUserByAnyIdentifier({
          uid: remoteUser.uid || uid,
          telegramId: remoteUser.telegramId || remoteUser.chatId,
          phoneNumber: remoteUser.phoneNumber,
          email: isSyntheticEmail(remoteUser.email) ? undefined : remoteUser.email,
        });

      if (!existing) {
        const cleanUser = syncUserStatsConsistency({ ...remoteUser, uid: remoteUser.uid || uid });
        centralDb.users[cleanUser.uid] = cleanUser;
        restoredUsers += 1;
        changed = true;
      } else {
        const mergedCoins = Math.max(Number(existing.ecoCoins || 0), Number(remoteUser.ecoCoins || 0));
        const mergedEarned = Math.max(
          Number(existing.totalCoinsEarned || 0),
          Number(remoteUser.totalCoinsEarned || 0)
        );
        const mergedXp = Math.max(Number(existing.ecoXP || 0), Number(remoteUser.ecoXP || 0));
        const shouldPreferRemoteSchool =
          (!existing.schoolName || existing.schoolName === 'Maktab kiritilmagan') &&
          remoteUser.schoolName &&
          remoteUser.schoolName !== 'Maktab kiritilmagan';

        if (
          mergedCoins > Number(existing.ecoCoins || 0) ||
          mergedEarned > Number(existing.totalCoinsEarned || 0) ||
          (!existing.isOnboarded && remoteUser.isOnboarded) ||
          shouldPreferRemoteSchool
        ) {
          centralDb.users[existing.uid] = syncUserStatsConsistency({
            ...remoteUser,
            ...existing,
            ecoCoins: mergedCoins,
            totalCoinsEarned: mergedEarned,
            ecoXP: mergedXp,
            reportsCount: Math.max(Number(existing.reportsCount || 0), Number(remoteUser.reportsCount || 0)),
            cleanupsCount: Math.max(Number(existing.cleanupsCount || 0), Number(remoteUser.cleanupsCount || 0)),
            treesPlanted: Math.max(Number(existing.treesPlanted || 0), Number(remoteUser.treesPlanted || 0)),
            streakDays: Math.max(Number(existing.streakDays || 1), Number(remoteUser.streakDays || 1)),
            isOnboarded: Boolean(existing.isOnboarded || remoteUser.isOnboarded),
            welcomeBonusClaimed: Boolean(existing.welcomeBonusClaimed || remoteUser.welcomeBonusClaimed),
            ...(shouldPreferRemoteSchool
              ? {
                  schoolId: remoteUser.schoolId,
                  schoolName: remoteUser.schoolName,
                  schoolNumber: remoteUser.schoolNumber,
                  region: remoteUser.region || existing.region,
                  district: remoteUser.district || existing.district,
                }
              : {}),
          });
          changed = true;
        }
      }
    }
  }

  const mergeArrayById = (targetKey: keyof UnifiedDatabase, incomingArr: any[]) => {
    if (!Array.isArray(incomingArr) || incomingArr.length === 0) return;
    const targetArr = Array.isArray(centralDb[targetKey]) ? (centralDb[targetKey] as any[]) : [];
    const seen = new Set(targetArr.map((item) => String(item?.id || '')));
    for (const item of incomingArr) {
      const id = String(item?.id || '');
      if (id && !seen.has(id)) {
        seen.add(id);
        targetArr.push(item);
        changed = true;
      }
    }
    (centralDb as any)[targetKey] = targetArr;
  };

  if (Array.isArray(snapshot.reportsList)) mergeArrayById('reports', snapshot.reportsList);
  if (Array.isArray(snapshot.mediaList)) mergeArrayById('mediaSubmissions', snapshot.mediaList);
  if (Array.isArray(snapshot.transactionsList)) mergeArrayById('transactions', snapshot.transactionsList);

  const extra = snapshot.extraCollections;
  if (extra && typeof extra === 'object') {
    if (Array.isArray(extra.ambassadors)) mergeArrayById('ambassadors', extra.ambassadors);
    if (Array.isArray(extra.ecoTasks)) mergeArrayById('ecoTasks', extra.ecoTasks);
    if (Array.isArray(extra.shopOrders)) mergeArrayById('shopOrders', extra.shopOrders);
    if (Array.isArray(extra.roleRequests)) mergeArrayById('roleRequests', extra.roleRequests);
    if (Array.isArray(extra.registrationApplications)) {
      mergeArrayById('registrationApplications', extra.registrationApplications);
    }
    if (Array.isArray(extra.referrals)) mergeArrayById('referrals', extra.referrals);
    if (Array.isArray(extra.certificates)) mergeArrayById('certificates', extra.certificates);
    if (Array.isArray(extra.schoolDuels)) mergeArrayById('schoolDuels', extra.schoolDuels);
    if (Array.isArray(extra.qrEcoScans)) mergeArrayById('qrEcoScans', extra.qrEcoScans);
    if (Array.isArray(extra.missionSubmissions)) mergeArrayById('missionSubmissions', extra.missionSubmissions);
    if (Array.isArray(extra.monthlyAwards)) mergeArrayById('monthlyAwards', extra.monthlyAwards);
    if (Array.isArray(extra.studentMonthlyAwards)) mergeArrayById('studentMonthlyAwards', extra.studentMonthlyAwards);
    if (Array.isArray(extra.adRewardClaims)) mergeArrayById('adRewardClaims', extra.adRewardClaims);

    if (extra.uidAliases && typeof extra.uidAliases === 'object') {
      centralDb.uidAliases = { ...extra.uidAliases, ...(centralDb.uidAliases || {}) };
    }
    if (extra.dailyQuizClaims && typeof extra.dailyQuizClaims === 'object') {
      centralDb.dailyQuizClaims = { ...extra.dailyQuizClaims, ...(centralDb.dailyQuizClaims || {}) };
    }
    if (extra.missionCompletions && typeof extra.missionCompletions === 'object') {
      for (const [uid, arr] of Object.entries(extra.missionCompletions) as [string, any][]) {
        if (!Array.isArray(arr)) continue;
        centralDb.missionCompletions[uid] = Array.from(
          new Set([...(centralDb.missionCompletions[uid] || []), ...arr])
        );
      }
    }
  }

  if (reconcileSchoolsAndStudents(false)) {
    changed = true;
  }

  if (changed) {
    recalculateSchoolRanks();
    saveCentralDb();
  }

  return { restoredUsers, restoredSchools, restoredStarters, changed };
}

// Reconcile canonical schools and exact student counts right on boot
const reconciledOnBoot = reconcileSchoolsAndStudents(false);
if (!fs.existsSync(UNIFIED_DB_PATH) || loadedDbResult.needsSave || reconciledOnBoot) {
  recalculateSchoolRanks();
  saveCentralDb();
}

export function phoneMatchKey(phone?: string | null): string {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  if (digits.length >= 9) {
    return digits.slice(-9);
  }
  return digits;
}

export function isSyntheticEmail(email?: string | null): boolean {
  const clean = String(email || '').trim().toLowerCase();
  return !clean || clean.endsWith('@telegram.ecohero.uz') || clean.endsWith('@ecohero.uz');
}

export function resolveCanonicalUid(uid?: string | null): string {
  let current = String(uid || '').trim();
  if (!current) return '';
  const seen = new Set<string>();
  const aliases = centralDb.uidAliases || {};
  while (aliases[current] && !seen.has(current)) {
    seen.add(current);
    current = String(aliases[current]).trim();
  }
  return current;
}

export function syncUserStatsConsistency(u: any): any {
  if (!u || typeof u !== 'object') return u;
  const totalEarned = Math.max(Number(u.totalCoinsEarned || 0), Number(u.activityStats?.totalCoinsEarned || 0), Number(u.ecoCoins || 0));
  const reportsCount = Math.max(Number(u.reportsCount || 0), Number(u.activityStats?.reportsCount || 0));
  const cleanupsCount = Math.max(Number(u.cleanupsCount || 0), Number(u.activityStats?.cleanupsCount || 0));
  const treesPlanted = Math.max(Number(u.treesPlanted || 0), Number(u.activityStats?.treesPlanted || 0));
  const streakDays = Math.max(1, Number(u.streakDays ?? u.activityStats?.streakDays ?? 1));
  const computedXp = Math.max(Number(u.ecoXP || 0), totalEarned * 4);
  const computedLevel = Math.max(1, Math.floor(computedXp / 500) + 1);

  u.totalCoinsEarned = totalEarned;
  u.reportsCount = reportsCount;
  u.cleanupsCount = cleanupsCount;
  u.treesPlanted = treesPlanted;
  u.streakDays = streakDays;
  u.ecoXP = computedXp;
  u.level = computedLevel;
  u.activityStats = {
    ...(u.activityStats || {}),
    reportsCount,
    cleanupsCount,
    treesPlanted,
    streakDays,
    totalCoinsEarned: totalEarned,
  };
  return u;
}

export function findUserByAnyIdentifier(identifier: {
  uid?: string;
  telegramId?: string | number;
  chatId?: string | number;
  email?: string;
  phoneNumber?: string;
}) {
  const usersList = Object.values(centralDb.users);
  if (identifier.uid) {
    const rawUid = String(identifier.uid).trim();
    const canonical = resolveCanonicalUid(rawUid);
    if (canonical && centralDb.users[canonical]) {
      return centralDb.users[canonical];
    }
    if (centralDb.users[rawUid]) {
      return centralDb.users[rawUid];
    }
    const byLinked = usersList.find(
      (u: any) =>
        Array.isArray(u?.linkedUids) &&
        (u.linkedUids.includes(rawUid) || (canonical && u.linkedUids.includes(canonical)))
    );
    if (byLinked) return byLinked;
  }
  const tgId = identifier.telegramId ?? identifier.chatId;
  if (tgId !== undefined && tgId !== null && tgId !== '') {
    const tgStr = String(tgId).trim();
    const tgUidCanonical = resolveCanonicalUid(`user_tg_${tgStr}`);
    if (tgUidCanonical && centralDb.users[tgUidCanonical]) {
      return centralDb.users[tgUidCanonical];
    }
    const byTg = usersList.find(
      (u: any) =>
        String(u.telegramId || '') === tgStr ||
        String(u.telegramChatId || '') === tgStr ||
        String(u.chatId || '') === tgStr ||
        u.uid === `user_tg_${tgStr}` ||
        (Array.isArray(u.linkedUids) && u.linkedUids.includes(`user_tg_${tgStr}`))
    );
    if (byTg) return byTg;
  }
  if (identifier.email) {
    const emailLower = String(identifier.email).trim().toLowerCase();
    if (emailLower) {
      const byEmail = usersList.find((u: any) => String(u.email || '').trim().toLowerCase() === emailLower);
      if (byEmail) return byEmail;
    }
  }
  if (identifier.phoneNumber) {
    const key = phoneMatchKey(identifier.phoneNumber);
    if (key.length >= 9) {
      const byPhone = usersList.find((u: any) => phoneMatchKey(u.phoneNumber) === key);
      if (byPhone) return byPhone;
    }
  }
  return null;
}

export function upsertUser(profile: any) {
  const rawUid = String(
    profile.uid || profile.userId || (profile.chatId ? `user_tg_${profile.chatId}` : `user_${Date.now()}`)
  );
  const canonicalRaw = resolveCanonicalUid(rawUid);
  const existing =
    centralDb.users[canonicalRaw] ||
    centralDb.users[rawUid] ||
    findUserByAnyIdentifier({
      uid: rawUid,
      telegramId: profile.telegramId || profile.chatId || profile.telegramChatId,
      phoneNumber: profile.phoneNumber,
      email: profile.email,
    });

  const targetUid = existing?.uid || canonicalRaw || rawUid;
  const linkedSet = new Set<string>([
    targetUid,
    ...(Array.isArray(existing?.linkedUids) ? existing.linkedUids : []),
    ...(Array.isArray(profile.linkedUids) ? profile.linkedUids : []),
  ]);
  if (rawUid && rawUid !== targetUid) {
    linkedSet.add(rawUid);
    if (!centralDb.uidAliases) centralDb.uidAliases = {};
    centralDb.uidAliases[rawUid] = targetUid;
  }

  const merged = syncUserStatsConsistency({
    ...(existing || {}),
    ...profile,
    uid: targetUid,
    userId: targetUid,
    linkedUids: Array.from(linkedSet),
    lastUpdated: new Date().toISOString(),
  });

  centralDb.users[merged.uid] = merged;
  saveCentralDb();
  return merged;
}

const ROLE_PRIVILEGE_RANK: Record<string, number> = {
  student: 1,
  ambassador: 2,
  sponsor: 3,
  school_admin: 4,
  district_coordinator: 5,
  regional_coordinator: 6,
  moderator: 7,
  super_admin: 8,
};

export function mergeUserAccounts(
  primaryUidInput: string,
  secondaryUidInput: string
): any | null {
  const primaryUid = resolveCanonicalUid(primaryUidInput) || String(primaryUidInput || '').trim();
  const secondaryUid = resolveCanonicalUid(secondaryUidInput) || String(secondaryUidInput || '').trim();
  if (!primaryUid || !secondaryUid) return centralDb.users[primaryUid || secondaryUid] || null;
  if (primaryUid === secondaryUid) return centralDb.users[primaryUid] || null;

  const primary = centralDb.users[primaryUid];
  const secondary = centralDb.users[secondaryUid];
  if (!primary && !secondary) return null;
  if (!primary && secondary) {
    return secondary;
  }
  if (primary && !secondary) {
    if (!centralDb.uidAliases) centralDb.uidAliases = {};
    centralDb.uidAliases[secondaryUid] = primaryUid;
    saveCentralDb();
    return primary;
  }

  // Merge balances smartly without duplicating two brand-new welcome bonuses
  const welcomeBonus = Number(centralDb.rewardSettings?.welcomeBonus ?? 100);
  const bothClaimedWelcome = Boolean(primary.welcomeBonusClaimed && secondary.welcomeBonusClaimed);
  const secNonBonusTxCount = (centralDb.transactions || []).filter(
    (t: any) =>
      t?.userId === secondaryUid &&
      !String(t?.reason || '').toLowerCase().includes("ro'yxatdan o'tish")
  ).length;
  const duplicateWelcomeOffset =
    bothClaimedWelcome && secNonBonusTxCount === 0 && Number(secondary.ecoCoins || 0) <= welcomeBonus
      ? Number(secondary.ecoCoins || 0)
      : bothClaimedWelcome
      ? Math.min(welcomeBonus, Number(secondary.ecoCoins || 0))
      : 0;

  const addedEcoCoins = Math.max(0, Number(secondary.ecoCoins || 0) - duplicateWelcomeOffset);
  const addedTotalEarned = Math.max(
    0,
    Number(secondary.totalCoinsEarned || secondary.ecoCoins || 0) - duplicateWelcomeOffset
  );

  const mergedApprovedRoles = Array.from(
    new Set([
      ...(Array.isArray(primary.approvedRoles) ? primary.approvedRoles : [primary.role || 'student']),
      ...(Array.isArray(secondary.approvedRoles) ? secondary.approvedRoles : [secondary.role || 'student']),
    ])
  ).filter(Boolean);

  const primaryRoleRank = ROLE_PRIVILEGE_RANK[String(primary.role || 'student')] || 1;
  const secondaryRoleRank = ROLE_PRIVILEGE_RANK[String(secondary.role || 'student')] || 1;
  const highestRole =
    secondaryRoleRank > primaryRoleRank ? secondary.role : primary.role || 'student';

  const latestStreakDate =
    String(secondary.lastStreakClaimDate || '') > String(primary.lastStreakClaimDate || '')
      ? secondary.lastStreakClaimDate
      : primary.lastStreakClaimDate;

  const preferredName =
    primary.fullName && !['Eko-Qahramon', "O'quvchi", ''].includes(String(primary.fullName).trim())
      ? primary.fullName
      : secondary.fullName || primary.fullName;

  const preferredEmail = !isSyntheticEmail(primary.email)
    ? primary.email
    : !isSyntheticEmail(secondary.email)
    ? secondary.email
    : primary.email || secondary.email || '';

  const preferredSchoolValid = (u: any) =>
    Boolean(u?.schoolName && u.schoolName !== 'Maktab kiritilmagan' && u.schoolId !== 'school_new');

  const schoolOwner = preferredSchoolValid(primary) ? primary : preferredSchoolValid(secondary) ? secondary : primary;

  const linkedSet = new Set<string>([
    primaryUid,
    secondaryUid,
    ...(Array.isArray(primary.linkedUids) ? primary.linkedUids : []),
    ...(Array.isArray(secondary.linkedUids) ? secondary.linkedUids : []),
  ]);

  const merged = syncUserStatsConsistency({
    ...secondary,
    ...primary,
    uid: primaryUid,
    userId: primaryUid,
    fullName: preferredName,
    email: preferredEmail,
    passwordHash: primary.passwordHash || secondary.passwordHash,
    phoneNumber: primary.phoneNumber || secondary.phoneNumber || '',
    telegramId: primary.telegramId || secondary.telegramId,
    telegramChatId: primary.telegramChatId || secondary.telegramChatId || primary.chatId || secondary.chatId,
    chatId: primary.chatId || secondary.chatId || primary.telegramChatId || secondary.telegramChatId,
    telegramUsername: primary.telegramUsername || secondary.telegramUsername || '',
    telegramAuth: Boolean(primary.telegramAuth || secondary.telegramAuth || primary.telegramId || secondary.telegramId),
    schoolId: schoolOwner.schoolId,
    schoolName: schoolOwner.schoolName,
    schoolNumber: schoolOwner.schoolNumber,
    region: schoolOwner.region || primary.region || secondary.region,
    district: schoolOwner.district || primary.district || secondary.district,
    grade: primary.grade || secondary.grade || '',
    role: highestRole,
    approvedRoles: mergedApprovedRoles,
    isVerified: Boolean(primary.isVerified || secondary.isVerified),
    isOnboarded: Boolean(primary.isOnboarded || secondary.isOnboarded),
    welcomeBonusClaimed: Boolean(primary.welcomeBonusClaimed || secondary.welcomeBonusClaimed),
    privacyConsentAccepted: Boolean(primary.privacyConsentAccepted || secondary.privacyConsentAccepted),
    ecoCoins: Number(primary.ecoCoins || 0) + addedEcoCoins,
    totalCoinsEarned: Number(primary.totalCoinsEarned || 0) + addedTotalEarned,
    ecoXP: Math.max(
      Number(primary.ecoXP || 0) + Number(secondary.ecoXP || 0),
      (Number(primary.totalCoinsEarned || 0) + addedTotalEarned) * 4
    ),
    reportsCount: Number(primary.reportsCount || 0) + Number(secondary.reportsCount || 0),
    cleanupsCount: Number(primary.cleanupsCount || 0) + Number(secondary.cleanupsCount || 0),
    treesPlanted: Number(primary.treesPlanted || 0) + Number(secondary.treesPlanted || 0),
    referralCount: Number(primary.referralCount || 0) + Number(secondary.referralCount || 0),
    referralEarnings: Number(primary.referralEarnings || 0) + Number(secondary.referralEarnings || 0),
    streakDays: Math.max(Number(primary.streakDays || 1), Number(secondary.streakDays || 1)),
    ...(latestStreakDate ? { lastStreakClaimDate: latestStreakDate } : {}),
    linkedUids: Array.from(linkedSet),
    lastUpdated: new Date().toISOString(),
  });

  // Re-point all child records from secondaryUid -> primaryUid
  for (const r of centralDb.reports || []) {
    if (r.reporterUid === secondaryUid) r.reporterUid = primaryUid;
    if (r.authorUid === secondaryUid) r.authorUid = primaryUid;
    if (r.assignedAmbassadorUid === secondaryUid) r.assignedAmbassadorUid = primaryUid;
    if (Array.isArray(r.upvotedBy)) {
      r.upvotedBy = Array.from(new Set(r.upvotedBy.map((u: string) => (u === secondaryUid ? primaryUid : u))));
    }
  }
  for (const m of centralDb.mediaSubmissions || []) {
    if (m.userId === secondaryUid) m.userId = primaryUid;
  }
  for (const t of centralDb.ecoTasks || []) {
    if (t.assigneeUid === secondaryUid) t.assigneeUid = primaryUid;
    if (t.assignedByUid === secondaryUid) t.assignedByUid = primaryUid;
  }
  for (const o of centralDb.shopOrders || []) {
    if (o.userId === secondaryUid) o.userId = primaryUid;
  }
  for (const tx of centralDb.transactions || []) {
    if (tx.userId === secondaryUid) tx.userId = primaryUid;
  }
  for (const n of centralDb.notifications || []) {
    if (n.userId === secondaryUid) n.userId = primaryUid;
  }
  for (const rr of centralDb.roleRequests || []) {
    if (rr.userId === secondaryUid) rr.userId = primaryUid;
  }
  for (const app of centralDb.registrationApplications || []) {
    if (app.userId === secondaryUid) app.userId = primaryUid;
  }
  for (const amb of centralDb.ambassadors || []) {
    if (amb.uid === secondaryUid) amb.uid = primaryUid;
  }
  for (const ms of centralDb.missionSubmissions || []) {
    if (ms.userId === secondaryUid) ms.userId = primaryUid;
  }
  if (centralDb.missionCompletions && centralDb.missionCompletions[secondaryUid]) {
    const combined = Array.from(
      new Set([
        ...(centralDb.missionCompletions[primaryUid] || []),
        ...centralDb.missionCompletions[secondaryUid],
      ])
    );
    centralDb.missionCompletions[primaryUid] = combined;
    delete centralDb.missionCompletions[secondaryUid];
  }
  if (centralDb.dailyQuizClaims && centralDb.dailyQuizClaims[secondaryUid]) {
    if (
      !centralDb.dailyQuizClaims[primaryUid] ||
      centralDb.dailyQuizClaims[secondaryUid] > centralDb.dailyQuizClaims[primaryUid]
    ) {
      centralDb.dailyQuizClaims[primaryUid] = centralDb.dailyQuizClaims[secondaryUid];
    }
    delete centralDb.dailyQuizClaims[secondaryUid];
  }
  for (const adClaim of centralDb.adRewardClaims || []) {
    if (adClaim.userId === secondaryUid) adClaim.userId = primaryUid;
  }
  for (const scan of centralDb.qrEcoScans || []) {
    if (scan.studentUid === secondaryUid) scan.studentUid = primaryUid;
    if (scan.scannedByUid === secondaryUid) scan.scannedByUid = primaryUid;
  }
  for (const cert of centralDb.certificates || []) {
    if (cert.uid === secondaryUid) cert.uid = primaryUid;
  }
  for (const ref of centralDb.referrals || []) {
    if (ref.referrerUid === secondaryUid) ref.referrerUid = primaryUid;
    if (ref.referredUid === secondaryUid) ref.referredUid = primaryUid;
  }
  for (const msg of centralDb.chatMessages || []) {
    if (msg.senderUid === secondaryUid) msg.senderUid = primaryUid;
    if (msg.recipientUid === secondaryUid) msg.recipientUid = primaryUid;
  }
  for (const perm of centralDb.chatPermissions || []) {
    if (perm.requesterUid === secondaryUid) perm.requesterUid = primaryUid;
    if (perm.targetUid === secondaryUid) perm.targetUid = primaryUid;
  }
  if (centralDb.weeklyChallenge?.participants?.[secondaryUid]) {
    const secPart = centralDb.weeklyChallenge.participants[secondaryUid];
    const priPart = centralDb.weeklyChallenge.participants[primaryUid];
    if (priPart) {
      priPart.progress = Number(priPart.progress || 0) + Number(secPart.progress || 0);
      priPart.claimed = Boolean(priPart.claimed || secPart.claimed);
    } else {
      centralDb.weeklyChallenge.participants[primaryUid] = {
        ...secPart,
        uid: primaryUid,
      };
    }
    delete centralDb.weeklyChallenge.participants[secondaryUid];
  }

  if (!centralDb.uidAliases) centralDb.uidAliases = {};
  centralDb.uidAliases[secondaryUid] = primaryUid;
  for (const [aliasKey, targetVal] of Object.entries(centralDb.uidAliases)) {
    if (targetVal === secondaryUid) {
      centralDb.uidAliases[aliasKey] = primaryUid;
    }
  }
  delete centralDb.users[secondaryUid];
  centralDb.users[primaryUid] = merged;

  recalculateSchoolRanks();
  saveCentralDb();
  return merged;
}

export function recordTransaction(tx: {
  userId: string;
  amount: number;
  type: 'earn' | 'spend' | 'bonus' | 'adjustment';
  status?: 'pending' | 'approved' | 'rejected';
  reason: string;
  adjustedBy?: string;
  mediaSubmissionId?: string;
  reportId?: string;
}) {
  const record = {
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    userId: tx.userId,
    amount: tx.amount,
    type: tx.type,
    status: tx.status || 'approved',
    reason: tx.reason,
    ...(tx.adjustedBy ? { adjustedBy: tx.adjustedBy } : {}),
    ...(tx.mediaSubmissionId ? { mediaSubmissionId: tx.mediaSubmissionId } : {}),
    ...(tx.reportId ? { reportId: tx.reportId } : {}),
    createdAt: new Date().toISOString(),
  };
  centralDb.transactions.unshift(record);
  if (centralDb.transactions.length > 5000) {
    centralDb.transactions = centralDb.transactions.slice(0, 5000);
  }
  return record;
}

export function getConfiguredReward(key: keyof RewardSettingsRecord): number {
  const val = centralDb.rewardSettings?.[key];
  return typeof val === 'number' && !Number.isNaN(val) ? val : 0;
}

export function getMediaCategoryReward(category: string): number {
  const s = centralDb.rewardSettings || DEFAULT_REWARD_SETTINGS;
  switch (category) {
    case 'tree_planting':
      return Number(s.treePlanting ?? 180);
    case 'tree_care':
      return Number(s.treeCareWatering ?? 120);
    case 'school_garden':
      return Number(s.gardenProject ?? 250);
    case 'waste_sorting':
      return Number(s.wasteSorting ?? 80);
    case 'environmental_campaign':
      return Number(s.environmentalCampaign ?? 200);
    case 'school_improvement':
      return Number(s.schoolImprovement ?? 150);
    case 'awareness_video':
    default:
      return Number(s.awarenessPost ?? 40);
  }
}

export function detectReportHazard(title?: string, description?: string, category?: string): {
  isHazardous: boolean;
  safetyWarning?: string;
  recommendedEscalation?: string;
} {
  const text = `${title || ''} ${description || ''}`.toLowerCase();
  const isElec =
    category === 'electrical_hazard' ||
    /(elektr|kabel|transformator|sim|tok|yuqori kuchlanish|voltage|power line)/i.test(text);
  const isChem =
    category === 'chemical_hazard' ||
    /(kimyo|zahar|kislota|ishqor|simob|batareya|neft|benzin|radiatsiya|chemical|toxic|biohazard)/i.test(text);
  const isFireOrStructure = /(yong'in|portlash|gaz sizib|chuqur o'ra|shisha siniq|tibbiy chiqindi)/i.test(text);

  if (isElec || isChem || isFireOrStructure) {
    return {
      isHazardous: true,
      safetyWarning:
        "DIQQAT XAVFSIZLIK CHORASI: Ushbu holat elektr, kimyoviy yoki jismoniy xavf tug'dirishi mumkin. O'quvchilar va Eko-Elchilarga muammoga mustaqil tegish QAT'IYAN TAQIQLANADI. Masalani maktab ma'muriyati va vakolatli davlat organlariga eskalatsiya qiling.",
      recommendedEscalation: isElec
        ? "Hududiy elektr tarmoqlari / Maktab ma'muriyati"
        : isChem
        ? 'Sanitariya-epidemiologiya xizmati (SES) / FVV'
        : "Maktab ma'muriyati / FVV",
    };
  }
  return { isHazardous: false };
}

export function hasDuplicateActiveAppointment(params: {
  userId: string;
  requestedRole: string;
  schoolId?: string;
  district?: string;
  excludeApplicationId?: string;
}): string | null {
  const pendingOrApproved = (centralDb.registrationApplications || []).find(
    (app) =>
      (!params.excludeApplicationId || app.id !== params.excludeApplicationId) &&
      app.userId === params.userId &&
      app.requestedRole === params.requestedRole &&
      (app.status === 'pending' || app.status === 'approved' || app.status === 'needs_info')
  );
  if (pendingOrApproved) {
    return pendingOrApproved.status === 'approved'
      ? "Sizda ushbu lavozim bo'yicha allaqachon faol tayinlov mavjud."
      : "Sizning ushbu lavozim bo'yicha arizangiz ko'rib chiqilmoqda.";
  }

  // Prevent duplicate active School Captain for the same school
  if (params.requestedRole === 'school_admin' && params.schoolId) {
    const existingCaptain = Object.values(centralDb.users).find(
      (u: any) =>
        u.uid !== params.userId &&
        u.schoolId === params.schoolId &&
        (u.role === 'school_admin' || (Array.isArray(u.approvedRoles) && u.approvedRoles.includes('school_admin')))
    );
    if (existingCaptain) {
      return `Ushbu maktabda allaqachon tasdiqlangan Maktab Sardori (${existingCaptain.fullName}) tayinlangan.`;
    }
  }

  return null;
}

export function hasDuplicateMediaSubmission(params: {
  userId: string;
  fileHash?: string;
  mediaUrl?: string;
}): boolean {
  const windowMs = (centralDb.rewardSettings?.duplicateWindowHours || 24) * 3600 * 1000;
  const now = Date.now();
  return (centralDb.mediaSubmissions || []).some((m) => {
    if (m.status === 'REJECTED') return false;
    if (params.fileHash && m.fileHash && m.fileHash === params.fileHash) {
      return true;
    }
    if (
      params.mediaUrl &&
      m.mediaUrl === params.mediaUrl &&
      m.userId === params.userId &&
      now - new Date(m.createdAt).getTime() < windowMs
    ) {
      return true;
    }
    return false;
  });
}

export function isWithinPeriod(dateStr?: string, period: 'monthly' | 'quarterly' | 'yearly' = 'monthly'): boolean {
  if (!dateStr) return true;
  const ts = new Date(dateStr).getTime();
  if (Number.isNaN(ts)) return true;
  const days = period === 'monthly' ? 31 : period === 'quarterly' ? 92 : 366;
  return Date.now() - ts <= days * 86400 * 1000;
}

export function addAuditLog(entry: {
  actorUid: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetCollection: string;
  targetId: string;
  details?: Record<string, any>;
}) {
  const log = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ...entry,
    timestamp: new Date().toISOString(),
  };
  centralDb.auditLogs.unshift(log);
  if (centralDb.auditLogs.length > 2000) {
    centralDb.auditLogs = centralDb.auditLogs.slice(0, 2000);
  }
  saveCentralDb();
  return log;
}

export function removeDeletedId(id: string) {
  if (!id || !Array.isArray(centralDb.deletedIds)) return;
  centralDb.deletedIds = centralDb.deletedIds.filter((entry) => entry !== id);
}
