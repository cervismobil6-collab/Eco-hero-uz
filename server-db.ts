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
  chatMessages: any[];
  chatPermissions: any[];
  adRewardClaims: { id: string; userId: string; adId: string; amount: number; claimedAt: string }[];
  ecoMissions: any[];
  missionSubmissions: any[];
  missionCompletions: Record<string, string[]>;
  registrationSessions: Record<string, any>;
  dailyQuizClaims: Record<string, string>; // key: uid -> YYYY-MM-DD
  meta: {
    version: number;
    updatedAt: string;
    lastTelegramUpdateId?: number;
    purgedDemoDataV2?: boolean;
  };
}

const UNIFIED_DB_PATH = path.join(process.cwd(), 'server-unified-db.json');
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
    channelUrl: 'https://t.me/Ecoheros_bot',
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
    chatMessages: [...SEED_CHAT_MESSAGES],
    chatPermissions: [],
    adRewardClaims: [],
    ecoMissions: [...SEED_ECO_MISSIONS],
    missionSubmissions: [],
    missionCompletions: {},
    registrationSessions: {},
    dailyQuizClaims: {},
    meta: {
      version: 2,
      updatedAt: new Date().toISOString(),
    },
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

function loadUnifiedDatabase(): { db: UnifiedDatabase; needsSave: boolean } {
  const defaults = createDefaultDatabase();

  if (fs.existsSync(UNIFIED_DB_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(UNIFIED_DB_PATH, 'utf-8'));
      const loadedShopItems =
        Array.isArray(parsed.shopItems) && parsed.shopItems.length > 0 ? parsed.shopItems : defaults.shopItems;
      const loadedAds = Array.isArray(parsed.ecoAds) && parsed.ecoAds.length > 0 ? [...parsed.ecoAds] : [...defaults.ecoAds];
      if (!loadedAds.some((a: any) => a.placement === 'post_purchase')) {
        const seedPost = SEED_ECO_ADS.find((a) => a.placement === 'post_purchase');
        if (seedPost) loadedAds.push(seedPost);
      }
      if (!loadedAds.some((a: any) => a.placement === 'earn_coins')) {
        const seedEarn = SEED_ECO_ADS.find((a) => a.placement === 'earn_coins');
        if (seedEarn) loadedAds.push(seedEarn);
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
        homePosts: Array.isArray(parsed.homePosts) && parsed.homePosts.length > 0 ? parsed.homePosts : defaults.homePosts,
        monthlyAwards: Array.isArray(parsed.monthlyAwards) ? parsed.monthlyAwards : [],
        chatMessages: Array.isArray(parsed.chatMessages) ? parsed.chatMessages : [],
        chatPermissions: Array.isArray(parsed.chatPermissions) ? parsed.chatPermissions : [],
        adRewardClaims: Array.isArray(parsed.adRewardClaims) ? parsed.adRewardClaims : [],
        ecoMissions: (() => {
          const existingMissions = Array.isArray(parsed.ecoMissions) && parsed.ecoMissions.length > 0
            ? parsed.ecoMissions.filter((m: any) => !(m.id === 'mission_quiz_01' && (!Array.isArray(m.questions) || m.questions.length <= 1)))
            : [];
          if (existingMissions.length === 0) return defaults.ecoMissions;
          const merged = [...existingMissions];
          for (const seedM of SEED_ECO_MISSIONS) {
            if (!merged.some((m: any) => m.id === seedM.id)) {
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
        registrationSessions: parsed.registrationSessions || {},
        dailyQuizClaims: parsed.dailyQuizClaims || {},
      };

      const { db: purgedDb, changed } = purgeDemoRecordsFromDb(hydrated);
      return { db: purgedDb, needsSave: changed };
    } catch (e) {
      console.error('[CentralDB] Error loading unified DB, using defaults:', e);
    }
  }

  return { db: defaults, needsSave: true };
}

const loadedDbResult = loadUnifiedDatabase();
export const centralDb: UnifiedDatabase = loadedDbResult.db;

export function saveCentralDb() {
  try {
    centralDb.meta.updatedAt = new Date().toISOString();
    const tmpPath = `${UNIFIED_DB_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(centralDb, null, 2), 'utf-8');
    fs.renameSync(tmpPath, UNIFIED_DB_PATH);
  } catch (e) {
    console.error('[CentralDB] Failed to save unified database:', e);
  }
}

// Save initial DB on boot if file didn't exist or demo purge changed records
if (!fs.existsSync(UNIFIED_DB_PATH) || loadedDbResult.needsSave) {
  recalculateSchoolRanks();
  saveCentralDb();
}

export function normalizeSchoolNumber(schoolName?: string, explicitNumber?: string): string {
  if (explicitNumber && String(explicitNumber).trim()) {
    return String(explicitNumber).trim();
  }
  const match = String(schoolName || '').match(/\d+/);
  return match ? match[0] : '1';
}

export function getSchoolLiveStudentCount(school: any): number {
  const usersList = Object.values(centralDb.users || {});
  const targetId = String(school?.id || '').trim();
  const targetName = String(school?.name || '').trim().toLowerCase();
  const targetDistrict = String(school?.district || '').trim().toLowerCase();
  const targetNumber = String(school?.number || '').trim();

  return usersList.filter((u: any) => {
    if (!u || typeof u !== 'object') return false;
    if (targetId && u.schoolId && String(u.schoolId).trim() === targetId) return true;
    const uName = String(u.schoolName || '').trim().toLowerCase();
    if (targetName && uName && uName === targetName) return true;
    if (
      targetNumber &&
      u.schoolNumber &&
      String(u.schoolNumber).trim() === targetNumber &&
      targetDistrict &&
      String(u.district || '').trim().toLowerCase() === targetDistrict
    ) {
      return true;
    }
    return false;
  }).length;
}

export function getLiveSchoolsList(includeAdminEmail = false): any[] {
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
  const usersList = Object.values(centralDb.users || {});
  const schoolsList = centralDb.schools || [];
  const reportsList = centralDb.reports || [];
  const mediaList = centralDb.mediaSubmissions || [];
  const ambassadorsList = centralDb.ambassadors || [];

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

  return {
    totalSchools: schoolsList.length,
    totalUsers: usersList.length,
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
  const cleanName = String(params.schoolName || '').trim();
  const region = String(params.region || 'Toshkent shahri').trim();
  const district = String(params.district || 'Markaziy tumani').trim();
  const number = normalizeSchoolNumber(cleanName, params.schoolNumber);

  if (!cleanName || cleanName === 'Maktab kiritilmagan') {
    return null;
  }

  const normalizedNameLower = cleanName.toLowerCase().replace(/[^a-z0-9a-zA-Zа-яА-Яўқғҳ]/g, '');

  let school = centralDb.schools.find((s) => {
    if (params.schoolId && s.id === params.schoolId) return true;
    const sameRegion = String(s.region || '').toLowerCase() === region.toLowerCase();
    const sameDistrict = !district || String(s.district || '').toLowerCase() === district.toLowerCase();
    if (!sameRegion) return false;
    const sNum = normalizeSchoolNumber(s.name, s.number);
    if (sameDistrict && number && sNum === number && /\d/.test(cleanName)) return true;
    const sNorm = String(s.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const pNorm = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
    return sNorm && pNorm && (sNorm === pNorm || sNorm.includes(pNorm) || pNorm.includes(sNorm)) && sameDistrict;
  });

  if (!school) {
    const slugRegion = region.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const slugDistrict = district.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const slugSchool = (number || normalizedNameLower || 'school').toLowerCase().replace(/[^a-z0-9]/g, '_');
    const id = `school_${slugRegion}_${slugDistrict}_${slugSchool}`.slice(0, 80);
    const coords = REGION_COORDS[region] || { lat: 41.2995, lng: 69.2401 };
    const jitter = () => (Math.random() - 0.5) * 0.02;

    school = enrichSchoolProfile({
      id,
      name: cleanName.includes('maktab') || cleanName.includes('litsey') || cleanName.includes('kollej')
        ? cleanName
        : `${region.split(' ')[0]} ${district.split(' ')[0]} ${cleanName}-maktab`,
      number,
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
    if (params.incrementStudents) {
      school.registeredStudentsCount = (school.registeredStudentsCount || school.studentsCount || 0) + 1;
      school.studentsCount = school.registeredStudentsCount;
    }
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
  }

  recalculateSchoolRanks();
  saveCentralDb();
  return school;
}

export function findUserByAnyIdentifier(identifier: {
  uid?: string;
  telegramId?: string | number;
  chatId?: string | number;
  email?: string;
  phoneNumber?: string;
}) {
  const usersList = Object.values(centralDb.users);
  if (identifier.uid && centralDb.users[identifier.uid]) {
    return centralDb.users[identifier.uid];
  }
  const tgId = identifier.telegramId ?? identifier.chatId;
  if (tgId !== undefined && tgId !== null && tgId !== '') {
    const tgStr = String(tgId);
    const byTg = usersList.find(
      (u) => String(u.telegramId || '') === tgStr || String(u.chatId || '') === tgStr || u.uid === `user_tg_${tgStr}`
    );
    if (byTg) return byTg;
  }
  if (identifier.email) {
    const emailLower = String(identifier.email).trim().toLowerCase();
    const byEmail = usersList.find((u) => String(u.email || '').trim().toLowerCase() === emailLower);
    if (byEmail) return byEmail;
  }
  if (identifier.phoneNumber) {
    const cleanPhone = String(identifier.phoneNumber).replace(/[^\d]/g, '');
    if (cleanPhone.length >= 9) {
      const byPhone = usersList.find(
        (u) => String(u.phoneNumber || '').replace(/[^\d]/g, '') === cleanPhone
      );
      if (byPhone) return byPhone;
    }
  }
  return null;
}

export function upsertUser(profile: any) {
  const uid = String(profile.uid || profile.userId || (profile.chatId ? `user_tg_${profile.chatId}` : `user_${Date.now()}`));
  const existing = centralDb.users[uid] || findUserByAnyIdentifier({
    telegramId: profile.telegramId || profile.chatId,
    phoneNumber: profile.phoneNumber,
    email: profile.email,
  });

  const merged = {
    ...(existing || {}),
    ...profile,
    uid: existing?.uid || uid,
    userId: existing?.uid || uid,
    lastUpdated: new Date().toISOString(),
  };

  centralDb.users[merged.uid] = merged;
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
