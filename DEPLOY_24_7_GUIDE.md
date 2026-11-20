# 🌍 ECO HERO 2.0 — 24/7/365 DOIMIY ISHLATISH QO'LLANMASI
**Muallif & Super Admin:** @jasurdost (ID: 8832599080)

Ushbu qo'llanma orqali ECO HERO Telegram boti va Mini App ilovangizni **kompyuter, telefon yoki brauzer butunlay o'chiq bo'lsa ham 24/7 to'xtovsiz** ishlashini ta'minlaysiz.

---

## ❓ Nega brauzer yopilganda bot to'xtab qoladi?
AI Studio — bu faqat ishlab chiqish (Development) platformasi. Siz brauzer sahifasini yopganingizda, Google server resurslarini tejash maqsadida ushbu vaqtinchalik konteynerni uyqu (sleep) rejimiga o'tkazadi. 

**Yechim:** Loyihani 24/7 ishlaydigan doimiy bepul bulutli serverga (Google Cloud Run yoki Render/Railway) joylashtirish.

---

## 🥇 1-USUL: GOOGLE CLOUD RUN (ENG ZO'R VA TAVSIYA ETILADIGAN USUL)
Loyiha allaqachon `Dockerfile` va `deploy-cloudrun.sh` orqali Google Cloud Run uchun 100% tayyorlangan.

### Bosqichlar:
1. Google Cloud SDK o'rnatilgan terminalda loyiha jildida quyidagi buyruqni bering:
   ```bash
   chmod +x deploy-cloudrun.sh
   ./deploy-cloudrun.sh
   ```
   *Yoki qo'lda 1 ta buyruq:*
   ```bash
   gcloud run deploy ecohero-production \
     --source . \
     --region asia-southeast1 \
     --platform managed \
     --allow-unauthenticated \
     --port 3000
   ```

2. Olingan doimiy HTTPS manzilni (masalan: `https://ecohero-production-xxx.a.run.app`) Telegram Botga Webhook sifatida ulang:
   ```bash
   curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://ecohero-production-xxx.a.run.app/api/telegram/webhook"
   ```

3. **Natija:**
   - Brauzeringiz, kompyuteringiz, AI Studio o'chiq bo'lsa ham bot va Mini App 24/7/365 uzluksiz ishlaydi.
   - Har bir yangi foydalanuvchi va hisobot bir zumda qabul qilinadi.

---

## 🥈 2-USUL: RENDER.COM YOKI RAILWAY.APP (BEPUL 24/7 HOSTING)
Agar Google Cloud orqali emas, boshqa qulay bepul xizmat orqali ishlatmoqchi bo'lsangiz:

1. [Render.com](https://render.com) ga kiring va bepul ro'yxatdan o'ting.
2. **New +** -> **Web Service** ni tanlang.
3. EcoHero GitHub reposini ulang.
4. **Environment**: `Docker` (Loyihadagi `Dockerfile` ni avtomatik taniydi).
5. **Environment Variables** ga quyidagilarni kiriting:
   - `NODE_ENV`: `production`
   - `USE_QUICK_TUNNEL`: `false`
   - `PORT`: `3000`
6. **Deploy** ni bosing.
7. Render sizga doimiy havola beradi (masalan: `https://ecohero-app.onrender.com`).
8. Ushbu havolani botingizga Webhook qiling:
   `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://ecohero-app.onrender.com/api/telegram/webhook`

---

## 🥉 3-USUL: FIREBASE HOSTING (FRONTEND UCHUN 24/7 BEPUL CDN)
Mini App interfeysini Google Firebase Hosting-ga yuklash:
```bash
npm run build
firebase deploy --only hosting
```
Natijada sizning Mini App manzilingiz:
`https://bamboo-chalice-gxtlg.web.app` bo'ladi.
Ushbu manzilni `@BotFather` da `/setmenubutton` orqali bot menyusiga qo'ysangiz, foydalanuvchilar har doim ilovaga 100% tezlikda kira oladilar.

---

## 👑 SUPER ADMIN UCHUN TEZKOR BUYRUQLAR:
- Yangi bot tokenini o'rnatish: Mini App ichida **Admin Dashboard -> Telegram Bot** bo'limida token kiritib "Ulash" tugmasini bosing yoki bot chatiga `/token <TOKEN>` yuboring.
- Webhook holatini tekshirish:
  `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
