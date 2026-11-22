#!/bin/bash
# ==============================================================================
# ECO HERO 2.0 — 24/7 GOOGLE CLOUD RUN PRODUCTION DEPLOY SCRIPT
# ==============================================================================
# Ushbu skript ECO HERO platformasi va Telegram Botini Google Cloud Run-ga joylaydi.
# Natija: Brauzer, kompyuter yoki AI Studio yopilsa ham bot 24/7/365 to'xtamasdan ishlaydi!
# ==============================================================================

set -e

PROJECT_ID="bamboo-chalice-gxtlg"
SERVICE_NAME="ecohero-production"
REGION="asia-southeast1"

echo "🌿 ECO HERO 2.0 — 24/7 Bulutli Deploy boshlanmoqda..."
echo "📍 Loyiha: $PROJECT_ID"
echo "🌍 Hudud: $REGION"
echo ""

# 1. Loyiha loyihaga o'rnatiladi
gcloud config set project $PROJECT_ID

# 2. Kerakli API larni faollashtirish
echo "🔧 Google Cloud xizmatlari faollashtirilmoqda..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

# 3. Cloud Run-ga konteynerni build qilish va deploy qilish
echo "🚀 Google Cloud Run-ga joylashtirilmoqda (24/7 rejim)..."
gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --port 3000 \
  --min-instances 1 \
  --max-instances 10 \
  --memory 512Mi \
  --cpu 1 \
  --set-env-vars NODE_ENV=production,USE_QUICK_TUNNEL=false

# 4. Olingan doimiy HTTPS manzilni chiqarish
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)')

echo ""
echo "🎉 TABRIKLAYMIZ! ECO HERO 24/7 ISHCHI HOLATDA JOYLASHTIRILDI!"
echo "🌐 Doimiy 24/7 HTTPS URL: $SERVICE_URL"
echo ""

# 5. Telegram Webhookni avtomatik ulash
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ]; then
  echo "🤖 Telegram Webhook faollashtirilmoqda..."
  WEBHOOK_URL="${SERVICE_URL}/api/telegram/webhook"
  if [ -n "${TELEGRAM_WEBHOOK_SECRET:-}" ]; then
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
      -H "Content-Type: application/json" \
      -d "{\"url\":\"${WEBHOOK_URL}\",\"secret_token\":\"${TELEGRAM_WEBHOOK_SECRET}\",\"drop_pending_updates\":true}"
  else
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${WEBHOOK_URL}&drop_pending_updates=true"
  fi
  echo ""
  echo "✅ Telegram Bot va Mini App endi 24/7 to'liq mustaqil ishlamoqda!"
else
  echo "⚠️ TELEGRAM_BOT_TOKEN muhit o'zgaruvchisi berilmagan. Token va TELEGRAM_WEBHOOK_SECRET ni Cloud Run Secrets'ga qo'shing."
fi

echo "=============================================================================="
