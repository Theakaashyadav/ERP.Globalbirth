# Hostinger Setup

## Local test first

1. Copy `.env.example` to `.env`.
2. Set a long random `CLIENT_API_KEY`.
3. For Hostinger MySQL testing, set:
   - `DB_CLIENT=mysql`
   - `HOSTINGER_DB_HOST`
   - `HOSTINGER_DB_PORT`
   - `HOSTINGER_DB_USER`
   - `HOSTINGER_DB_PASSWORD`
   - `HOSTINGER_DB_NAME`
4. Import `database/schema.mysql.sql` into the Hostinger database.
5. Run:

```bash
npm install
npm run build
npm start
```

6. Check the server:

```bash
curl -H "Authorization: Bearer YOUR_CLIENT_API_KEY" http://localhost:3000/api/health
```

The web frontend loads `/attendance-config.js` from the Node server, so it uses the same `CLIENT_API_KEY` automatically.

Local URLs:

- Employee login: `http://localhost:3000/`
- Employee dashboard: `http://localhost:3000/employee/dashboard`
- HR dashboard: `http://localhost:3000/hr`

## Android API usage

Use the hosted API URL and the same client key:

```http
POST https://your-domain.com/api/attendance
Authorization: Bearer YOUR_CLIENT_API_KEY
Content-Type: application/json

{
  "action": "getEmployees"
}
```

`X-API-Key: YOUR_CLIENT_API_KEY` also works if that is easier in the Android app.

## Hostinger upload

1. Upload the project files.
2. Do not upload `.env` through public file manager paths.
3. In Hostinger Node.js app/environment settings, add the same variables from `.env`.
4. Set the startup command to:

```bash
npm start
```

5. Build the frontend before uploading, or run this once in Hostinger terminal if available:

```bash
npm run build
```

6. After deploy, verify:

```bash
curl -H "Authorization: Bearer YOUR_CLIENT_API_KEY" https://your-domain.com/api/health
```

## Notes

The browser must receive the client key to call the API, so treat `CLIENT_API_KEY` as a shared client access key, not a private server secret. Use strong employee PINs and keep `ADMIN_API_KEY` separate if you want update/delete actions to require a stronger HR-only key.
