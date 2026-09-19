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

Use Node.js 20 or newer. Configure the environment variables documented in `.env.example`, run `npm install`, build with `npm run build`, and start with `npm start`. Serve the app and `/api/lead-sheet/webhook` at a public HTTPS address that Google Apps Script can reach. Open the admin dashboard through that production address before copying the script, so it contains the correct API URL.

Never commit `.env`, Firebase service-account JSON, MongoDB credentials or signing keys.

## Google Sheet lead connection

1. Open the tab that receives leads from Meta. In **Admin Control Center → Lead Sheet Connection**, paste its full Google Sheet URL, including `#gid=...` when shown. Keep a header row with a phone or mobile column within the first 10 rows of that tab.
2. Select the active Sales employees who should receive leads and save the connection.
3. Click **Copy Apps Script code**. In that Sheet, open **Extensions → Apps Script**, replace the contents of `Code.gs` with the copied code, and save.
4. In the Apps Script editor, select and run `setupGlobalOneLeadSync` once. Authorize the requested Google permissions. This installs edit, form-submit, and one-minute time triggers. Use the connection status on the admin page to confirm a successful API call.

An entirely empty selected lead tab can be connected before Meta writes its first headers and lead. If setup says it cannot find lead column names in a populated tab, confirm that the saved URL points to the lead tab and that its headings include Phone or Mobile. If Meta starts using another tab, save that tab's URL, copy the newly generated script, and run setup again.

Manual edits can send a new row when the edit trigger runs. Meta and other API integrations may add rows without firing a Google Sheets edit trigger, so the one-minute trigger checks for those rows and posts them to the web API. Keep the script installed on the selected Sheet and tab. No service-account sharing or Google Sheets API setup is required for this Apps Script connection.

The detected header row supplies column names. New rows need a valid 10 digit Indian phone number (a `+91` prefix is accepted) and are assigned once across the selected employees. The script sends every source header and value to the API, so Meta custom question columns and answers reach the employee lead details without naming each question in code. Adding, renaming, or moving custom question columns in the same tab does not require a new script; the script resends an assigned row when its source columns or answers change.

The script adds **Assigned Employee**, **Assigned Employee ID**, **GlobalOne Lead ID**, **GlobalOne Sharing Status**, **GlobalOne Notification Status**, and **GlobalOne Synced Hash** columns. **Sharing Status = Done** means the lead and employee assignment were saved in the database; **Not Done** means it has not been assigned. **Notification Status = Accepted** means the push service accepted the notification request, not that a phone displayed it. Failed or pending notifications are retried without changing the owner. The sync hash records which source columns and answers were saved, so changing Meta questions updates existing lead details. Existing rows with an outside Assigned Employee value are left with that owner. Rows without a valid phone number wait for correction. Sheet editors can read the bound Apps Script, including its webhook secret, so grant edit access only to trusted people.

For phone alerts, configure `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_BASE64` on the hosted web server, and have each selected employee open the Android app and allow notifications so its push token registers. The Sheet notification status shows whether Firebase accepted the request; device display also depends on phone notification settings and connectivity.

Assignments are permanent while lead rules are on hold: the 30 minute return, 50 lead cap, delegation, reassignment, archive action, and mandatory call targets are disabled. Call history and employee follow-up updates remain available.

## Android build

From `android-app`, build the employee app for the hosted attendance endpoint:

```powershell
.\gradlew.bat :app:assembleDebug -PATTENDANCE_API_URL=https://mediumslateblue-goose-217733.hostingersite.com/api/attendance
```

For production distribution, configure an Android release signing key and use `assembleRelease`.
