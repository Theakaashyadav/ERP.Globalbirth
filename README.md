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

## Google Sheet lead connection

1. Configure the existing Firebase service account on the server. Enable the Google Sheets API for its Google Cloud project.
2. In **Admin Control Center → Lead Sheet Connection**, paste the Google Sheet link, including the tab (`gid`) you want to import.
3. Share that Sheet with the service account email shown on the page as **Editor**. A private Sheet link alone does not grant read and write access.
4. Select the active Sales employees who should receive leads and save. The server checks the Sheet about every 10 seconds. Use **Check Sheet now** to test the connection.

The first row supplies column names. New rows need a valid 10 digit Indian phone number (a `+91` prefix is accepted) and are assigned once across the selected employees. The server adds **Assigned Employee**, **Assigned Employee ID**, and **GlobalOne Lead ID** columns, and writes the owner back to the Sheet. Existing rows with an Assigned Employee value are left as they are. Rows without a valid phone number wait for correction. All original columns appear in the employee lead details. Apps Script is not required.

Assignments are permanent while lead rules are on hold: the 30 minute return, 50 lead cap, delegation, reassignment, archive action, and mandatory call targets are disabled. Call history and employee follow-up updates remain available.

## Android build

From `android-app`, provide the hosted attendance endpoint and shared client key:

```powershell
.\gradlew.bat :app:assembleDebug -PATTENDANCE_API_URL=https://mediumslateblue-goose-217733.hostingersite.com/api/attendance -PATTENDANCE_API_KEY=YOUR_CLIENT_API_KEY
```

For production distribution, configure an Android release signing key and use `assembleRelease`.
