# QuickTrack — Fitness Tracker

A complete client/server fitness tracking app: registration, login (JWT-based
auth with hashed passwords), a calorie/workout log, a monthly calendar view,
a weekly intake-vs-burn chart, and placeholder Google Health / Strava device
connections.
<<<<<<< HEAD
=======

## Stack

- **Backend:** Node.js + Express, JWT auth (`jsonwebtoken`), password hashing
  (`bcryptjs`), and MySQL persistence through `mysql2`.
- **Frontend:** Plain HTML/CSS/JS (no build step), served as static files by
  the same Express server and talking to the API over `fetch`.

## Project layout

```
QuickTrack/
  backend/
    server.js          entry point — mounts routes, serves the frontend
    db.js               MySQL data access layer
    sql/users.sql       SQL schema for the QTusers table
    middleware/auth.js  JWT verification middleware
    routes/auth.js      register / login / me
    routes/logs.js       meal & workout entries, weekly + monthly summaries
    routes/devices.js    Google Health / Strava connect toggle
    package.json
    .env.example
  frontend/
    index.html
    styles.css
    app.js
```

## Running it locally

1. Start your local MySQL Server.
2. In MySQL Workbench, connect to that server and create a schema named
   `QuickTrack` (or choose another name and use it for `DB_NAME` below).
3. Configure the MySQL connection in `backend/.env`:

If `backend/.env` does not exist yet, copy `.env.example` to `.env` first.
Keep existing `.env` settings and append the database settings below.

```bash
cd backend
npm install
```

Add these values to `backend/.env` (do not replace your existing app secrets):

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your-mysql-password
DB_NAME=quicktrack
DB_CONNECTION_LIMIT=10
```

The app creates its tables in that schema when it starts, and stores app data
there. `backend/db.js` is the MySQL access code; it is not a data file. For an
older checkout that still has a local `backend/data/db.json`, optionally import
its existing records once before starting the server:

```bash
npm run migrate:json
```

Then start the server:

```bash
npm start
```

In MySQL Workbench, use the same host, port, and user as `backend/.env`, then
refresh the configured schema to inspect the `QTusers`, `logs`, `devices`, and
`supplements` tables. The `password_hash` column contains password hashes, not
plain-text passwords.

When a meal or workout is submitted without a kcal value, the backend asks
Gemini for a whole-number estimate. Keep `GEMINI_API_KEY` in `backend/.env` so
it is never exposed to the browser. Users can still enter a kcal value when
they have a more accurate number.

### Google registration

Create a Web application OAuth client in Google Cloud, add
`http://localhost:3000/api/auth/google/callback` as an authorized redirect URI,
then set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
`GOOGLE_REDIRECT_URI` in `backend/.env`. Restart the backend after changing
these values. Google users are created with starter profile values and can
immediately use the app.

### Email verification

Password registration requires a verified email address. Configure the SMTP
values in `backend/.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
and `EMAIL_FROM`) before registering users. For Gmail, use an App Password,
not the normal Google account password.

The server starts on `http://localhost:3000` by default (change `PORT` in
`.env`) and serves both the API (under `/api`) and the frontend from the same
origin, so there's no CORS configuration to fight with in normal use.

Open `http://localhost:3000` in a browser, register an account, and start
logging.

## Deploying only the frontend to Vercel

The frontend can be deployed as a static Vercel project while the API and MySQL
stay on your computer for personal use. In Vercel, import the repository and
set **Root Directory** to `frontend`; no build command or output directory is
needed.

The frontend's `config.js` points API requests to `http://localhost:3000/api`.
This setup only works in a browser on the same computer where the backend and
MySQL are running. Start the backend with `cd backend` and `npm start` before
using the Vercel site. Other visitors' browsers would interpret `localhost` as
their own computers, not yours. To make the app available to other people, host
the backend and database online and change `frontend/config.js` to the hosted
API URL. Never put API keys or database credentials in frontend files.

## API summary

| Method | Path                         | Auth | Description                          |
|--------|------------------------------|------|---------------------------------------|
| POST   | `/api/auth/register`         | –    | Create an account, returns JWT        |
| POST   | `/api/auth/login`            | –    | Log in, returns JWT                   |
| GET    | `/api/auth/me`                | ✓    | Current user's profile                |
| PATCH  | `/api/auth/me`                | ✓    | Update editable profile fields        |
| GET    | `/api/logs/target`            | ✓    | Estimated daily calorie target        |
| GET    | `/api/logs/day/:date`         | ✓    | Entries + totals for one date         |
| POST   | `/api/logs/entry`             | ✓    | Add a food or workout entry           |
| DELETE | `/api/logs/entry/:id`         | ✓    | Remove an entry                       |
| POST   | `/api/ai/chat`                 | ✓    | Ask SmartChoice for personalized guidance |
| GET    | `/api/logs/week`              | ✓    | Last 7 days, consumed vs. burned      |
| GET    | `/api/logs/month/:year/:month`| ✓    | Per-day net calories for the calendar |
| GET    | `/api/devices`                | ✓    | Connection status for linked devices  |
| POST   | `/api/devices/:key/toggle`    | ✓    | Toggle a device's connected state     |

Protected routes expect `Authorization: Bearer <token>`.

## Notes on the parts that are intentionally simplified

- **Data store:** MySQL. Keep its credentials in `backend/.env` and do not
  expose the database server publicly for local development.
- **Device sync:** the Google Health / Strava buttons flip a stored boolean
  through a real API endpoint, but they don't perform an actual OAuth flow.
  Both providers require a server-held client secret and a callback URL, so
  wiring up live sync means adding an OAuth redirect + callback route behind
  `POST /api/devices/:key/toggle` — the front end is already set up to call
  it.
- **Calorie targets** are a simplified Mifflin-St Jeor estimate and don't
  account for sex or activity level beyond a flat multiplier. They're shown
  as a starting point, not medical guidance — the UI says as much, especially
  given the medications field on the profile.
>>>>>>> 0faa208 (Prepare QuickTrack frontend for Vercel)
