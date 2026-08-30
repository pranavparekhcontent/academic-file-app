# RxFlow PWA — Project Accounts, Keys & Deployment Reference

> **Saved On:** July 31, 2026  
> **Status:** All Services Live & Connected (100% Free Tier)  
> **Live PWA App URL:** [https://rxflow-app.pages.dev](https://rxflow-app.pages.dev)  

---

## 1. 🐙 GitHub Repository

- **Username:** `pranavparekhcontent`
- **Personal Access Token (PAT):** `[CONFIGURED_IN_ENV_PAT]`
- **Repository Name:** `rxflow-app`
- **Web URL:** [https://github.com/pranavparekhcontent/rxflow-app](https://github.com/pranavparekhcontent/rxflow-app)
- **Git Remote URL:** `https://pranavparekhcontent@github.com/pranavparekhcontent/rxflow-app.git`

---

## 2. ☁️ Cloudflare Accounts & Live Deployments

- **Account Email:** `pranavparekhcontent@gmail.com`
- **Global API Key / Token:** `[CONFIGURED_CLOUDFLARE_GLOBAL_API_KEY]`
- **Account ID:** `8d9574bee1f9b46318ae428ce5bae19e`
- **PWA Frontend Project Name:** `rxflow-app` (Cloudflare Pages)
- **Live PWA URL:** [https://rxflow-app.pages.dev](https://rxflow-app.pages.dev)
- **Backend Edge Worker Name:** `rxflow-api` (Cloudflare Workers)
- **Live Worker API URL:** [https://rxflow-api.pranavparekhcontent.workers.dev](https://rxflow-api.pranavparekhcontent.workers.dev)
- **API Health Endpoint:** [https://rxflow-api.pranavparekhcontent.workers.dev/api/v2/health](https://rxflow-api.pranavparekhcontent.workers.dev/api/v2/health)

---

## 3. ⚡ Supabase Postgres Database

- **Project ID:** `hspvkmjpcnkqqpoksveo`
- **Dashboard URL:** [https://supabase.com/dashboard/project/hspvkmjpcnkqqpoksveo](https://supabase.com/dashboard/project/hspvkmjpcnkqqpoksveo)
- **REST API Endpoint:** `https://hspvkmjpcnkqqpoksveo.supabase.co`
- **Public Anon Key:** `sb_publishable_3TIM3tXraS5lUi17ODzs3A_wwB1QGEG`
- **Database Schema Migration:** Located at `supabase/migrations/20260729000000_schema_v3.sql`

---

## 4. 🔄 PowerSync Offline Sync Engine

- **Project Name:** `RxFlow` (US Region)
- **Dashboard URL:** [https://dashboard.powersync.com/org/6a6c1f240fc10700078eca75/projects](https://dashboard.powersync.com/org/6a6c1f240fc10700078eca75/projects)
- **PowerSync Instance Service URL:** `https://6a6c503191ecf2aec48ee8ad.powersync.journeyapps.com`

---

## 💰 5. Monthly Running Cost Analysis

| Component | Platform | Selected Plan | Monthly Cost | Quota Allowance |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend PWA Host** | Cloudflare Pages | **Free Tier** | **₹0 / $0.00** | Unlimited bandwidth, 500 builds/mo |
| **Edge API Gateway** | Cloudflare Workers | **Free Tier** | **₹0 / $0.00** | 100,000 API requests / day |
| **Code Storage** | GitHub | **Free Tier** | **₹0 / $0.00** | Unlimited public & private repos |
| **Cloud Database** | Supabase | **Free Tier** | **₹0 / $0.00** | 500 MB database, 50k monthly active users |
| **Offline Sync Engine** | PowerSync | **Free Tier** | **₹0 / $0.00** | 100 concurrent connections, 100k sync ops/mo |
| **TOTAL COST** | | | **₹0 / mo ($0.00)** | *100% Free Tier Execution* |

---

## 🛠️ 6. Quick Cheat-Sheet Commands for Future Updates

### Update PWA Frontend to Cloudflare Pages:
```cmd
cmd /c "npm run build && set CLOUDFLARE_API_KEY=%CLOUDFLARE_API_KEY% && set CLOUDFLARE_EMAIL=pranavparekhcontent@gmail.com && npx wrangler pages deploy dist --project-name rxflow-app"
```

### Push Code Updates to GitHub:
```powershell
powershell -Command "git add .; git commit -m 'Update RxFlow'; git push origin main"
```

### Redeploy Edge API Worker:
```cmd
cmd /c "set CLOUDFLARE_API_KEY=%CLOUDFLARE_API_KEY% && set CLOUDFLARE_EMAIL=pranavparekhcontent@gmail.com && cd worker && npx wrangler deploy"
```

---

## 7. 📄 Smart Attendance Backend API

- **Platform:** Google Apps Script
- **Script ID:** `1Bj-C3uNCGWUqMpYqOZ9WfnAPViM5hsHr62UL3Zxct4AJDBsUgCIP_PQw`
- **Purpose:** Dedicated Backend API for Smart Attendance PWA.
- **Directory:** `smart attendance\google_apps_script`

---

## 8. 📚 Academic File Backend API (Standalone)

- **Platform:** Google Apps Script
- **Script ID:** `1xvnMH15VlaCLh_mOGc9frqg1erI_b5NN9hIlZY7XJX7uPib2xO7r8Tsx`
- **Web App URL:** `https://script.google.com/macros/s/AKfycbxH8oHwujYjOdZ8LwrbtTStHp0ziSISiRKHiPiMfzkc_jcHoyn55mnV-a3BjroM07jD1A/exec`
- **Purpose:** Dedicated Standalone Backend API for Academic File PWA.
- **Directory:** `academic file\google_apps_script`
- **Active Deployment ID:** `AKfycbxH8oHwujYjOdZ8LwrbtTStHp0ziSISiRKHiPiMfzkc_jcHoyn55mnV-a3BjroM07jD1A` (the Web App URL above embeds this ID — keep it unchanged)
- **Update Command (⚠️ push + redeploy ACTIVE — never plain `deploy`, it creates a brand-new unused URL and leaves the live endpoint on the old version):** Run `npx @google/clasp push -f && npx @google/clasp redeploy AKfycbxH8oHwujYjOdZ8LwrbtTStHp0ziSISiRKHiPiMfzkc_jcHoyn55mnV-a3BjroM07jD1A -d "Live update"` inside `academic file\google_apps_script`.

---

## 9. 🎓 Academic File PWA Frontend

- **Repository:** `https://github.com/pranavparekhcontent/academic-file-app.git`
- **Web URL:** [https://github.com/pranavparekhcontent/academic-file-app](https://github.com/pranavparekhcontent/academic-file-app)
- **Live PWA App URL:** [https://academic-file-app.pages.dev](https://academic-file-app.pages.dev)
- **Failover / GitHub Pages:** [https://pranavparekhcontent.github.io/academic-file-app/](https://pranavparekhcontent.github.io/academic-file-app/)
- **Directory:** `e:\PRANAV\pwa apps\academic file`

### Push Academic File PWA Frontend to GitHub:
```powershell
powershell -Command "git add .; git commit -m 'Update Academic File App'; git push origin main"
```

### Push Academic File Central API to Google Apps Script (redeploy ACTIVE endpoint — same URL):
```cmd
cmd /c "cd /d \"e:\PRANAV\pwa apps\academic file\google_apps_script\" && npx @google/clasp push -f && npx @google/clasp redeploy AKfycbxH8oHwujYjOdZ8LwrbtTStHp0ziSISiRKHiPiMfzkc_jcHoyn55mnV-a3BjroM07jD1A -d \"Live update\""
```

> ⚠️ **Deployment rule:** this PWA calls a FIXED web-app URL hardcoded in `appstart\config.js`. Plain `clasp deploy` creates a NEW deployment/URL — the live endpoint stays on the OLD code. Always finish backend updates with `clasp redeploy <active-deployment-id>`, then verify: `clasp deployments` should show the active ID at the newest `@version`.


