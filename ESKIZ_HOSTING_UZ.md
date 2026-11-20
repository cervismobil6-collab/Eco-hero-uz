# EcoHero Uzbekistan — Eskiz Hosting (1.50$ Tariff / cPanel) To'liq Ishga Tushirish Qo'llanmasi

Eskiz.uz'ning **$1.50 lik cPanel Shared Hosting** tarifi asosan Apache statik fayl serveri sifatida ishlaydi. Agar faqat statik HTML/JS fayllar yuklansa va backend server ulanmasa, `/api/*` so'rovlariga HTML javob qaytadi va quyidagi funksiyalar ishlamay qoladi:
- **EcoHero AI** (Gemini javoblari)
- **Google Maps HD Xarita** (API kalit serverdan olinadi)
- **Ro'yxatdan o'tish / Kirish / Baza (`centralDb`)** va **Telegram Bot**
- **3D CesiumJS** (agar `dist/cesium/` papkasi yuklanmasa)

Endi loyihada barcha muammolar tuzatilgan:
- `npm run build` endi avtomatik ravishda `dist/cesium/` papkasini (barcha 3D modellar va `.wasm`/`.json` fayllar bilan) yaratadi + **CDN zaxira** ham qo'shilgan.
- `public/.htaccess` fayli `/api/*`, `/ws/*` va `/cesium/*` yo'llarini `index.html`ga burib yubormaydi va `.wasm`, `.glb`, `.mjs` MIME turlarini to'g'ri uzatadi.
- Frontend **tashqi 24/7 Backend Server URL (`VITE_API_BASE_URL`)** orqali to'g'ridan-to'g'ri Render / Cloud Run / VPS Node.js serveringizga ulana oladi!

---

## 1-Variant: Eskiz ($1.50 cPanel Frontend) + Bepul Render / Cloud Run 24/7 Backend (Tavsiya etiladi)

### 1-Qadam: Backend Serverni 24/7 Cloud Hostingda Ishga Tushiring
Loyihada tayyor `Dockerfile` va `render.yaml` mavjud:
1. Loyihani **Render.com** (bepul Web Service) yoki **Google Cloud Run**'ga joylang (`npm start` -> `tsx server.ts`).
2. Cloud hosting **Environment Variables** bo'limiga quyidagilarni kiriting:
   - `GEMINI_API_KEY` — EcoHero AI ishlashi uchun Gemini kalitingiz
   - `VITE_GOOGLE_MAPS_API_KEY` (yoki `GOOGLE_MAPS_API_KEY`) — Google Maps HD xarita uchun kalit
   - `TELEGRAM_BOT_TOKEN` — Telegram bot tokeni
   - `CESIUM_ION_TOKEN` — (ixtiyoriy) Cesium 3D Terrain/OsmBuildings uchun
   - `PUBLIC_APP_URL` — masalan, `https://ecohero-backend.onrender.com`
3. Backend URL'ni tekshiring: `https://sizning-backend.onrender.com/api/health` -> JSON `{"status":"ok", ...}` qaytishi kerak.

### 2-Qadam: Eskiz Domeningiz Uchun Frontend Build Qilish
O'z kompyuteringizda backend manzili va Google Maps kalitini bergan holda build qiling:

```bash
VITE_API_BASE_URL="https://sizning-backend.onrender.com" \
VITE_GOOGLE_MAPS_API_KEY="SIZNING_GOOGLE_MAPS_KALITINGIZ" \
npm run build
```

> Eslatma: Endi `dist/` ichida `index.html`, `assets/`, `cesium/` (3D globus fayllari), `sw.js` va `.htaccess` to'liq tayyor bo'ladi.

### 3-Qadam: Google Cloud va Firebase'da Domeningizga Ruxsat Berish (JUDA MUHIM)
Agar o'z domeningizda (`https://sizning-domen.uz`) Google Maps ochilmasa yoki Google bilan kirish xato bersa:
1. **Google Cloud Console -> APIs & Services -> Credentials**:
   - Google Maps API kalitingizning **Website restrictions (HTTP referrers)** ro'yxatiga qo'shing:
     - `https://sizning-domen.uz/*`
     - `https://*.sizning-domen.uz/*`
   - API ro'yxatida **Maps JavaScript API** va **Places API (New)** yoqilganligini tekshiring.
2. **Firebase Console -> Authentication -> Settings -> Authorized domains**:
   - **Add domain** tugmasini bosib `sizning-domen.uz` domeningizni qo'shing.

### 4-Qadam: `dist/` Fayllarini Eskiz cPanel'ga Yuklash
1. Eskiz.uz cPanel -> **File Manager** -> **`public_html`** papkasini oching (eski fayllarni tozalang).
2. Yuqori o'ngdagi **Settings** tugmasidan **"Show Hidden Files (dotfiles)"** katakchasini yoqing (`.htaccess` ko'rinishi uchun!).
3. `dist/` papkasi ichidagi **barcha fayl va papkalarni** (`index.html`, `.htaccess`, `sw.js`, `manifest.json`, `assets/`, `cesium/`, `assets/` rasmlari) `public_html` ichiga yuklang.
4. Brauzerda **Ctrl+Shift+R** (keshni tozalab) domeningizni oching.

### Tezkor Sinov (Qayta build qilmasdan backend ulash):
Agar allaqachon Eskiz'ga statik fayllarni yuklab bo'lgan bo'lsangiz, brauzerda shunday havola bilan kirib backendni darhol ulashingiz mumkin:
`https://sizning-domen.uz/?api=https://sizning-backend.onrender.com`
(Bu manzil brauzer `localStorage` xotirasida avtomatik saqlanadi).

---

## 2-Variant: Agar Eskiz cPanel'da "Setup Node.js App" Mavjud Bo'lsa
Ba'zi Eskiz tariflarida cPanel ichida **Setup Node.js App** bo'ladi:
1. Node.js 20+ versiyasini tanlang.
2. Application root: loyiha papkasi, Startup file: `server.ts` (yoki `npx tsx server.ts` orqali ishga tushiring).
3. Environment Variables bo'limiga `GEMINI_API_KEY`, `VITE_GOOGLE_MAPS_API_KEY`, `TELEGRAM_BOT_TOKEN` larni kiriting.
4. `npm install && npm run build` bajarib ilovani **Restart** qiling.

---

## Tekshirish Ro'yxati (Checklist)
- [ ] `https://sizning-backend.onrender.com/api/health` -> `{"status":"ok"}` qaytaradi
- [ ] `https://sizning-domen.uz/cesium/Cesium.js` -> JavaScript kod ochiladi (HTML sahifa emas!)
- [ ] **EcoHero AI** savolga o'zbek tilida streaming javob beradi
- [ ] **Xarita (2D)** Google Maps HD rejimida ochiladi (Esri/MapLibre zaxirasiga tushib qolmaydi)
- [ ] **Xarita (3D)** CesiumJS globus va maktab binolarini yuklaydi
- [ ] **Kirish / Ro'yxatdan o'tish** xatosiz ishlaydi va tangalar saqlanadi
