# ECO HERO — Production Deployment & Hosting Qo'llanmasi

Ushbu yagona qo'llanma **ECO HERO** platformasi (React + Vite frontend, Express + WebSocket + Telegram Bot backend) ni **24/7/365** xavfsiz HTTPS muhitida ishga tushirish usullarini jamlaydi.

---

## 1. Majburiy Muhit O'zgaruvchilari (`.env` / Cloud Secrets)

Production muhitida quyidagi o'zgaruvchilarni kiriting (barcha ro'yxat `.env.example` da mavjud):

| O'zgaruvchi | Tavsifi |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `SESSION_SECRET` | **Majburiy.** Kamida 32 ta tasodifiy belgi (`openssl rand -hex 32`) |
| `TELEGRAM_BOT_TOKEN` | `@BotFather` dan olingan bot tokeni (hech qachon kod/JSON faylga yozilmaydi) |
| `TELEGRAM_BOT_USERNAME` | Bot username (`@` belgisiz) |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram Webhook tekshiruvi uchun maxfiy kalit (`X-Telegram-Bot-Api-Secret-Token`) |
| `SUPER_ADMIN_EMAILS` | Vergul bilan ajratilgan tasdiqlangan Super Admin email manzillari |
| `SUPER_ADMIN_TELEGRAM_IDS` | Vergul bilan ajratilgan Super Admin Telegram ID raqamlari |
| `GEMINI_API_KEY` | EcoHero AI va muammolarni tahlil qilish uchun Google Gemini API kaliti |
| `PUBLIC_APP_URL` | Doimiy HTTPS domen (`https://ecohero.uz`) |
| `USE_QUICK_TUNNEL` | Productionda `false` |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps HD xarita API kaliti |
| `CESIUM_ION_TOKEN` | 3D Cesium globus uchun token (ixtiyoriy) |

---

## 2. Google Cloud Run (24/7 Docker Deploy — Tavsiya etiladi)

Loyihada `Dockerfile` va `deploy-cloudrun.sh` tayyorlangan:

```bash
chmod +x deploy-cloudrun.sh
./deploy-cloudrun.sh
```

Yoki qo'lda deploy:

```bash
gcloud run deploy ecohero-production \
  --source . \
  --region asia-southeast1 \
  --platform managed \
  --allow-unauthenticated \
  --port 3000
```

Deploydan so'ng Telegram Webhook'ni `secret_token` bilan ulang:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<DOMAIN>/api/telegram/webhook","secret_token":"<TELEGRAM_WEBHOOK_SECRET>","drop_pending_updates":true}'
```

---

## 3. Render.com / Railway (Bepul 24/7 Backend)

Loyihada `render.yaml` mavjud:
1. Render.com'da **New + -> Web Service** tanlab GitHub repozitoriyni ulang (`buildCommand` va `startCommand: npx tsx server.ts` avtomatik olinadi).
2. **Environment Variables** bo'limiga `SESSION_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `SUPER_ADMIN_EMAILS`, `SUPER_ADMIN_TELEGRAM_IDS`, `GEMINI_API_KEY`, `PUBLIC_APP_URL` larni kiriting.
3. `https://<DOMAIN>/api/health` manzili `{"status":"ok"}` qaytarishini tekshiring.

---

## 4. Eskiz.uz ($1.50 cPanel Frontend) + Tashqi Node.js Backend

Agar frontendni Eskiz cPanel'da joylashtirsangiz (static hosting `/api/*` ni bajara olmaydi):

1. Backendni Cloud Run yoki Render'ga deploy qiling (`https://api.sizning-domen.uz`).
2. Frontendni build qiling:
   ```bash
   VITE_API_BASE_URL="https://api.sizning-domen.uz" \
   VITE_GOOGLE_MAPS_API_KEY="<MAPS_KEY>" \
   npm run build
   ```
3. `dist/` papkasi ichidagi barcha fayllarni (yashirin `.htaccess`, `cesium/`, `assets/`, `index.html`) cPanel `public_html/` ga yuklang.
4. **Google Cloud Console** (HTTP referrers) va **Firebase Console -> Authentication -> Authorized domains** ro'yxatiga domeningizni qo'shing.

---

## 5. Firebase Hosting (Frontend CDN)

```bash
npm run build
npx firebase deploy --only hosting
```

---

## 6. Sinov va Tekshiruv Ro'yxati

- [ ] `https://<DOMAIN>/api/health` -> `{"status":"ok"}` JSON qaytaradi
- [ ] `https://<DOMAIN>/rating` va `/map` -> SPA rewrite 404 bermaydi
- [ ] `https://<DOMAIN>/cesium/Cesium.js` -> JS fayl yuklanadi
- [ ] Telegram Webhook `secret_token`siz so'rovlarga `403` qaytaradi
- [ ] `@BotFather -> Menu Button` da doimiy HTTPS manzil ko'rsatilgan
