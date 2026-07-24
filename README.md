# Global Birth ERP

Full ERP platform containing the Hostinger-ready React/Node application, MongoDB services, management dashboards, Android employee source and a downloadable APK.

## Repository layout

- `src/client` — React homepage and dashboards
- `src/server` — Express APIs, MongoDB models and services
- `android-app` — Android Studio employee application
- `public/downloads/GlobalOne-Employee.apk` — directly downloadable Android APK
- `HOSTINGER_SETUP.md` — production deployment instructions
- `.env.example` — required environment-variable template

## Local development

```bash
npm install
npm run build
npm start
```

Open `http://localhost:3000`.

## Production deployment

Use Node.js 20 or newer. Configure the environment variables documented in `.env.example`, run `npm install`, build with `npm run build`, and start with `npm start`.

Never commit `.env`, Firebase service-account JSON, MongoDB credentials or signing keys.

## Android build

From `android-app`, provide the hosted attendance endpoint and shared client key:

```powershell
.\gradlew.bat :app:assembleDebug -PATTENDANCE_API_URL=https://mediumslateblue-goose-217733.hostingersite.com/api/attendance -PATTENDANCE_API_KEY=YOUR_CLIENT_API_KEY
```

For production distribution, configure an Android release signing key and use `assembleRelease`.
