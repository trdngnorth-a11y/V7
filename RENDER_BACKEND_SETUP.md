# V7.4 Backend Render Deployment

This package is prepared for Render backend deployment.

## Local folder

Replace files inside:

```cmd
C:\Users\Om\Desktop\V7
```

## Render-ready files included

- `server.js` now binds to `0.0.0.0` by default and uses `process.env.PORT`.
- `package.json` includes `npm start`.
- `.node-version` pins Node 20.
- `render.yaml` includes backend deployment settings.

## Test locally from Command Prompt

```cmd
cd C:\Users\Om\Desktop\V7
npm run check
npm start
```

Open:

```text
http://localhost:4000/api/health
http://localhost:4000/api/state
```

Stop server:

```cmd
Ctrl + C
```

## Push to GitHub

```cmd
cd C:\Users\Om\Desktop\V7
git status
git add .
git commit -m "Prepare V7 backend for Render"
git push origin main
```

## Render Web Service settings

- Repository: `trdngnorth-a11y/V7`
- Branch: `main`
- Runtime: `Node`
- Root Directory: leave blank
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/health`

## Post-deploy test

Replace `YOUR-SERVICE` with your Render service name:

```text
https://YOUR-SERVICE.onrender.com/api/health
https://YOUR-SERVICE.onrender.com/api/state
```

Keep this version in PAPER mode for backend testing. Do not use live keys until persistent storage/database handling is finalized.
