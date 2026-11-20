# 🚀 ECO HERO PLATFORMASINI PRODUCTION HOSTING VA GOOGLE CLOUD RUN GA DEPLOY QILISH QO'LLANMASI

Ushbu qo'llanma **ECO HERO** Telegram Mini App loyihasini doimiy, xavfsiz va uzluksiz HTTPS xostingga joylashtirish hamda Cloudflare Quick Tunnel (`trycloudflare.com`) kabi vaqtinchalik havolalardan kelib chiquvchi `net::ERR_NAME_NOT_RESOLVED` va `Cloudflare Error 1033` xatolarini to'liq bartaraf etish bosqichlarini tushuntiradi.

---

## 1. MAVJUD DIAGNOSTIKA VA TUGATILGAN MUAMMOLAR

- **Ildiz sabab**: `trycloudflare.com` ko'rinishidagi ephemera (vaqtinchalik) tunnellar Cloudflare serverlaridan uzilganda yoki server qayta ishga tushganda o'z-o'zidan yo'qolib ketadi. Natijada Telegram Bot tugmalaridagi havola eskirib, `net::ERR_NAME_NOT_RESOLVED` hamda `Cloudflare Error 1033` xatolari kelib chiqqan.
- **Kiritilgan Yechim**:
  1. `server.ts` va backend doimiy Google Cloud Run / Firebase HTTPS doimiy domeniga moslashtirildi (`https://ais-pre-6oy4kc5udqi6che5kvxtg6-217372630663.asia-southeast1.run.app`).
  2. Frontend SPA routing (`/map`, `/rating`, `/profile`) uchun `firebase.json` hamda Express fallback rewrites sozlandi.
  3. Server yoki internet uzilganda avtomatik ravishda tushunarli **"Qayta urinish"** (Retry) banner xabari va `/api/health` monitoring mexanizmi qo'shildi.

---

## 2. FIREBASE HOSTING GA DEPLOY QILISH (FRONTEND)

O'zbekiston hududida yuqori tezlik va 99.9% uptime ta'minlash uchun frontendni Firebase Hosting doimiy HTTPS domeniga joylashtirish mumkin.

### Bosqichlar:
1. Loyiha papkasida frontendni build qiling:
   ```bash
   npm run build
   ```
2. Firebase CLI orqali Firebase loyihasiga kiring:
   ```bash
   npx firebase login
   ```
3. Firebase Hosting xizmatiga deploy qiling:
   ```bash
   npx firebase deploy --only hosting
   ```
4. Muvaffaqiyatli deploy qilingach, sizga doimiy HTTPS manzil beriladi (Masalan: `https://bamboo-chalice-gxtlg.web.app` yoki `https://bamboo-chalice-gxtlg.firebaseapp.com`).

---

## 3. GOOGLE CLOUD RUN GA BACKEND DEPLOY QILISH (SERVER & BOT)

Node.js + Express backend va Telegram Bot polling xizmatini Google Cloud Run da joylashtirish uchun loyihaga `Dockerfile` hamda `.dockerignore` fayllari qo'shildi.

### Bosqichlar:
1. Google Cloud CLI orqali loyihani build va deploy qiling:
   ```bash
   gcloud run deploy ecohero-backend \
     --source . \
     --platform managed \
     --region asia-southeast1 \
     --allow-unauthenticated \
     --set-env-vars TELEGRAM_BOT_TOKEN="8090554523:AAG7qgQ..."
   ```
2. Cloud Run muvaffaqiyatli ishga tushgach, doimiy HTTPS domen beriladi (Masalan: `https://ecohero-backend-xxx.a.run.app`).

---

## 4. TELEGRAM BOT (BOTFATHER) MINI APP MANZILINI SOZLASH

Doimiy domen olingandan so'ng, Telegram BotMenu tugmasini bir marta sozlab qo'yasiz:

1. Telegramda **@BotFather** botiga kiring.
2. `/mybots` tugmasini bosing va o'zingizning botingizni tanlang.
3. **Bot Settings** -> **Menu Button** -> **Configure menu button** bo'limiga o'ting.
4. Doimiy HTTPS Mini App manzilingizni kiriting:
   `https://ais-pre-6oy4kc5udqi6che5kvxtg6-217372630663.asia-southeast1.run.app` (yoki Firebase Hosting manzilingiz).
5. Bot nomi: `🌍 ECO HERO` deb belgilang.

---

## 5. ENVIRONMENT VARIABLES (ATROF-MUHIT O'ZGARUVCHILARI)

`.env` yoki Cloud Run parametrlarida quyidagi o'zgaruvchilarni ko'rsatish tavsiya etiladi:

| O'zgaruvchi | Tavsifi |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot tokeningiz |
| `APP_URL` | Doimiy HTTPS Mini App manzili |
| `FIREBASE_HOSTING_URL` | Frontend Firebase Hosting URL (ixtiyoriy) |
| `GEMINI_API_KEY` | Eco AI tahlili uchun Google Gemini API kaliti |
| `USE_QUICK_TUNNEL` | Quick tunnelni o'chirish uchun `false` qoldiring |

---

## 6. SINOV VA VERIFIKATSIYA

- **Healthcheck Test**: Browserda `https://<DOMAIN>/api/health` manziliga kiring. Javob: `{"status":"ok", "service":"EcoHero Uzbekistan Platform"}` bo'lishi kerak.
- **SPA Test**: Browserda to'g'ridan-to'g'ri `https://<DOMAIN>/rating` yoki `https://<DOMAIN>/map` manzillarini ochib ko'ring (404 xatosi chiqmasligi kerak).
- **Offline / Retry Test**: Mobil qurilmadagi internetni o'chirib ko'ring — yuqori qismida tushunarli **"Qayta urinish"** banneringiz paydo bo'ladi.
