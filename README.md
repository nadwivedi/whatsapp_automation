# WhatsApp Web Bulk Console (MERN-style)

This project now includes:
- Multi-number WhatsApp Web login via QR scan (`whatsapp-web.js`)
- Message template selection from frontend
- Bulk number input and queued campaign sending
- Per-number daily cap (default `20/day`)

## Architecture

### Backend (`backend/`)
- `models/WaAccount.js`: WhatsApp numbers/sessions + per-day limits.
- `models/MessageTemplate.js`: Saved message templates.
- `models/Campaign.js`: Campaign job + progress counters.
- `models/CampaignMessage.js`: Per-recipient delivery status.
- `services/whatsappSessionManager.js`: QR/session lifecycle + message send.
- `services/campaignQueue.js`: Queue worker (throttled sender, limit-aware).
- `controllers/*.js`: Business logic for accounts, templates, campaigns.
- `routes/*.js`: REST APIs for accounts, templates, campaigns.

### Frontend (`frontend/src`)
- Single dashboard in `App.jsx`:
  - Add/start/stop WhatsApp numbers
  - Scan QR popup
  - Create/select templates
  - Queue bulk campaigns from pasted number list
  - Track queue progress and pause/resume campaigns

### Data Flow
1. Create account in frontend.
2. Backend starts WhatsApp Web session and stores QR.
3. Scan QR from frontend popup.
4. Create/select template and paste recipients.
5. Queue worker sends messages one-by-one with throttle and daily cap.

## Run Locally

## Prerequisites
- Node.js 18+
- MongoDB running locally

## Backend
```bash
cd backend
npm install
npm install
# update .env if needed
npm start
```

## Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend default URL: `http://localhost:5173`  
Backend default URL: `http://localhost:5000`

## Important Notes
- This implementation uses WhatsApp Web automation. Accounts can be rate-limited or banned by WhatsApp if used for spam.
- Keep message volume conservative and only send to opted-in contacts.
- Unlimited messaging is not safe/reliable; use per-number controls and pacing.
