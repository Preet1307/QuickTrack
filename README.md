# QuickTrack — Full-Stack Fitness Tracker

A complete client/server fitness tracking app: registration, login (JWT-based
auth with hashed passwords), a calorie/workout log, a monthly calendar view,
a weekly intake-vs-burn chart, and placeholder Google Health / Strava device
connections.

## Stack

- **Backend:** Node.js + Express, JWT auth (`jsonwebtoken`), password hashing
  (`bcryptjs`), a small JSON-file data store (`backend/data/db.json`) — swap
  this for Postgres/MySQL/Mongo for real production use, the function
  signatures in `backend/db.js` are the seam to do that behind.
- **Frontend:** Plain HTML/CSS/JS (no build step), served as static files by
  the same Express server and talking to the API over `fetch`.

## Project layout

```
QuickTrack/
  backend/
    server.js          entry point — mounts routes, serves the frontend
    db.js               data access layer (JSON file store)
    middleware/auth.js  JWT verification middleware
    routes/auth.js      register / login / me
    routes/logs.js       meal & workout entries, weekly + monthly summaries
    routes/devices.js    Google Health / Strava connect toggle
    data/db.json         the actual data (gitignore this in real use)
    package.json
    .env.example
  frontend/
    index.html
    styles.css
    app.js
```

## Running it locally

```bash
cd backend
cp .env.example .env      # then edit JWT_SECRET and GEMINI_API_KEY
npm install
npm start
```

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

- **Data store:** a flat JSON file, read/written synchronously on each
  request. That's fine for a demo or a single small deployment, but it isn't
  safe for concurrent writes at scale — move to a real database before
  putting this in front of real users.
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
