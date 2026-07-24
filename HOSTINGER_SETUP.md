# Hostinger + MongoDB Atlas Setup

## Local Test First

1. Copy `.env.example` to `.env`.
2. Create a MongoDB Atlas cluster and database user.
3. Add your current IP address in Atlas Network Access.
4. Set `MONGODB_URI` in `.env`.
5. Set a long random `CLIENT_API_KEY`.
6. Run:

```bash
npm install
npm run build
npm start
```

7. Check the server:

```bash
curl -H "Authorization: Bearer YOUR_CLIENT_API_KEY" http://localhost:3000/api/health
```

Local URLs:

- ERP home page: `http://localhost:3000/`
- Employee web login: `http://localhost:3000/employee/login`
- Employee dashboard: `http://localhost:3000/employee/dashboard`
- HR dashboard: `http://localhost:3000/hr`
- Marketing dashboard: `http://localhost:3000/marketing`
- Admin dashboard: `http://localhost:3000/admin`
- Android APK: `http://localhost:3000/downloads/GlobalOne-Employee.apk`

## Hostinger Node.js App Settings

Production site: `https://mediumslateblue-goose-217733.hostingersite.com`

Use the GitHub repository deployment:

- Framework preset: `Express`
- Branch: `main`
- Root directory: `./`
- Node version: `20.x`
- Install command: `npm install`
- Build command: `npm run build`
- Start command: `npm start`
- Entry file: `server.js`
- Output directory: `dist`

## Hostinger Environment Variables

Add these in Hostinger's Node.js app environment settings:

```env
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER_HOST/attendance_system?retryWrites=true&w=majority
CLIENT_API_KEY=change-this-long-random-key
ADMIN_API_KEY=
DASHBOARD_SESSION_SECRET=change-this-independent-long-random-secret
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

Do not commit a real `.env` file.

Paste the Firebase service-account file contents into `FIREBASE_SERVICE_ACCOUNT_JSON` as one JSON value in Hostinger. Do not upload the private JSON file to GitHub.

## MongoDB Atlas Network Access

For quick testing, Atlas can allow access from anywhere with:

```text
0.0.0.0/0
```

For production, restrict access if Hostinger provides stable outbound IPs for your plan.

## Android API Usage

Use the hosted API URL and the same client key:

```http
POST https://mediumslateblue-goose-217733.hostingersite.com/api/attendance
Authorization: Bearer YOUR_CLIENT_API_KEY
Content-Type: application/json

{
  "action": "getEmployees"
}
```

`X-API-Key: YOUR_CLIENT_API_KEY` also works.

## Notes

The browser must receive the client key to call the API, so treat `CLIENT_API_KEY` as a shared client access key, not a private server secret. Keep `ADMIN_API_KEY` separate if you want update/delete actions to require a stronger HR-only key.
