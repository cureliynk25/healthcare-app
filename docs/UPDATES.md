# CureLiynk — Update Log and What to Do Next

Companion to [FEATURES_ROADMAP.md](FEATURES_ROADMAP.md). That file answers
"what does the app do?"; this one answers "what changed, what must happen
before the next release, and what should we update in future?"

Newest entry first. Written in plain English on purpose — anyone on the team
should be able to read it.

---

## Update — 2026-09-14: security, release hardening and cleanup

A full pass over `mobile/` and `server/`. The app **already built cleanly**
before this work (130 tests passing, TypeScript clean, Android and iOS bundles
exporting), so nothing here was fixing a broken build. It was closing security
holes, removing dead code, and making a misconfigured release fail loudly
instead of quietly.

### 1. The backend had no security headers at all

`helmet`, `compression` and `express-rate-limit` were all listed as
dependencies in `server/package.json` and **none of them were ever switched
on**. Every response left the server with no protective headers and an
`X-Powered-By: Express` banner advertising the stack.

Now mounted in `src/middleware/security.js`:

| Header | Value | Why |
|---|---|---|
| `Content-Security-Policy` | `default-src 'none'` | A JSON body should never be rendered as a page |
| `X-Content-Type-Options` | `nosniff` | Stops a browser re-reading JSON as HTML/JS |
| `X-Frame-Options` | `DENY` | Nothing here is meant to be framed |
| `Referrer-Policy` | `no-referrer` | Keeps API paths out of third-party referrer logs |
| `Permissions-Policy` | geolocation/camera/mic off | Nothing served here needs them |
| `Cache-Control` | `no-store, private` | Responses carry symptoms, medications and locations |
| `Strict-Transport-Security` | 1 year (**production only**) | Harmful on plain `http://localhost`, so it is off in dev |

`X-Powered-By` is gone.

**Verified live**, not just written — the server was started and every header
above confirmed present in the response.

### 2. CORS was open to the entire internet

`app.use(cors())` allowed every origin. It is now an allowlist read from
`ALLOWED_ORIGINS`. Native mobile builds send no `Origin` header, so the app is
unaffected; this only governs browsers. In development an empty list still
allows everything so local work is unchanged. In production an empty list
blocks every browser origin and the server refuses to start.

### 3. Anyone could spend your API budget

`POST /api/v1/chat`, `POST /api/v1/chat/doctors` and all of
`/api/v1/location/*` were **public**. Each call costs real money — chat hits
Gemini, `/doctors` runs a Google Places text search, `/location` forwards to
Nominatim under this server's IP. Anyone who found the URL could run up the
bill, or get the server's IP banned by Nominatim, with no account to throttle
or revoke.

All three now require a valid token. This costs the shipping app nothing: the
Ask AI chat talks to the **Python** assistant (which already required auth),
the doctor-results screen sits behind the app's login guard, and the mobile app
never called `/location` at all — it uses the phone's own geocoder.

### 4. Rate limiting (three tiers, in `src/middleware/rateLimit.js`)

| Scope | Budget | Guards against |
|---|---|---|
| Everything | 300 / 15 min | One client saturating the process |
| `/api/v1/auth/*` | 10 / 15 min | Password guessing, `ADMIN_SECRET_KEY` guessing, reset-email flooding |
| `/api/v1/chat`, `/api/v1/location` | 20 / min | Running up the Gemini and Google Places bill |

Keyed on the account when the caller is signed in, and on the IP otherwise — an
IP-only window would put everyone behind one mobile carrier into a single
shared budget. Successful logins do not consume the auth budget, so a user who
mistypes once and then succeeds is not penalised. Throttled responses use the
same `{ success, message }` shape as every other route and carry `Retry-After`.

**Verified live:** the 11th login attempt returns `429` with `Retry-After: 897`.

### 5. Things that were leaking

- **`db.js` printed the full MongoDB connection string on every boot** —
  username and password included — straight into the hosting dashboard's log
  viewer. It now logs the host only.
- **Gemini's API key travelled in the URL** (`?key=...`), which lands in access
  logs, proxy logs and axios error messages. It now goes in the
  `x-goog-api-key` header.
- **Chat and location errors returned `error.message` to the client**, which is
  written for a developer and routinely names the provider, the quota state or
  a URL with the key still attached. They now log in full and return a fixed
  sentence.
- **The global error handler echoed internal messages.** In production it now
  returns "Internal Server Error" for 5xx; 4xx messages, which are deliberate,
  still pass through.
- **Password reset links were logged to the console when SMTP was unset.** In
  development that is a useful fallback and is kept. In production it silently
  wrote a working account-takeover link into the server log while telling the
  user their email had been sent — it now throws instead, so the caller clears
  the token and reports the failure.
- The reset email interpolated the user's display name into HTML unescaped.
  Now escaped.

### 6. Bugs found and fixed

- **Signing in with a password on a Google-created account returned a 500.**
  Those accounts have no password field, and bcrypt throws rather than
  returning false when the stored hash is `undefined`. Now `comparePassword`
  returns false on a missing hash, and login answers with a clear
  "This account uses Google sign-in."
- **A Gemini answer wrapped in a fenced code block crashed the chat route.**
  The request now asks for `responseMimeType: application/json`, strips a fence
  if one appears anyway, and falls back to returning the text rather than
  throwing.
- **The Gemini call had no timeout**, so a hung connection held the Express
  request open indefinitely. Now 30s.
- **`mobile/lib/api.ts` crashed on any non-JSON response.** A proxy 502 or a
  gateway timeout returns HTML, and the unguarded `.json()` threw a
  `SyntaxError` that no caller was catching. It now degrades to a readable
  message, matching what `lib/medical-api.ts` already did.
- **A pre-existing lint error** in the in-progress voice-input work
  (`setState` inside an effect in `chat-composer.tsx`, flagged by the React
  Compiler rules). The live transcript now arrives through a callback from the
  recognition event instead of being mirrored from state into state — same
  behaviour, one less render per syllable.

### 7. Startup now validates its own configuration

`src/config/env.js` refuses to start when something required is missing, rather
than surfacing it as a 500 on whichever request first needed it — a process
that boots and then fails looks healthy to a deploy pipeline. It checks:

- `MONGO_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET` are set (always)
- `ADMIN_SECRET_KEY`, `GOOGLE_CLIENT_ID`, `ALLOWED_ORIGINS` are set (production)
- secrets are at least 32 characters
- `JWT_SECRET` and `JWT_REFRESH_SECRET` are **different** — sharing one means a
  7-day refresh token is accepted anywhere a 15-minute access token is

It reports every problem at once instead of one per restart.

A complete `server/.env.example` now exists, covering every variable the code
actually reads.

### 8. Dead code and dependencies removed

- `server/src/config/postgres.js` — empty file, this project uses MongoDB
- `server/src/models/ChatHistory.js` — empty file
- `server/src/utils/isMedicalQuery.js` — a nine-word keyword list, unused
- `@googlemaps/google-maps-services-js` — declared but never imported
- `npm audit fix` on the server: **6 vulnerabilities → 0**, including a
  prototype-pollution flaw in mongoose that matters here because the medication
  routes cast user input into update queries

A sweep for unreferenced files across `mobile/` found none — that codebase is
already clean.

### 9. A good prompt that was never connected

`server/src/config/systemPrompt.js` — 105 lines with the emergency protocol
(chest pain, stroke signs, self-harm → call 108 immediately), the
never-diagnose and never-prescribe rules, Assam-endemic disease context and
full Assamese support — **was dead code**. The chat service was sending its own
eight-line prompt instead, with none of those safety rails.

It is now wired in, with the JSON output contract stated last so the response
shape callers expect is unchanged. `FEATURES_ROADMAP.md` described these safety
rules as already built in; as of this update that is actually true.

### 10. Release-build protection

The production bundle was baking in `http://10.181.65.91:5000` — a laptop's LAN
address, over plain HTTP. The build *succeeded*; the app would simply have
failed for every user not sitting on that network. Two changes:

- `eas.json` now sets `EXPO_PUBLIC_API_BASE_URL` and
  `EXPO_PUBLIC_MEDICAL_API_BASE_URL` per build profile, so a developer's `.env`
  cannot reach a `preview` or `production` build. **The values are placeholders
  — see the checklist below.**
- `mobile/lib/api-config.ts` fails the build outright if a placeholder was never
  replaced, and prints a loud warning if a release bundle points at a localhost
  or private-network address. Development is untouched.

The app also installed on the home screen as **"mobile"**. It is now
**"CureLiynk"**.

---

## Before your next release — checklist

These are the things that will bite, in order.

- [ ] **Replace the placeholder URLs in `mobile/eas.json`.** Both profiles
      currently say `https://REPLACE-ME-...`. An EAS build will fail with a
      clear message until you do — that is deliberate, and much better than
      shipping an app pointing at a laptop.
- [ ] **Set `ALLOWED_ORIGINS` in the production `server/.env`.** Your current
      `.env` passes development validation, but production startup will stop
      and tell you this is missing.
- [ ] **Deploy both backends behind HTTPS.** The mobile app should never talk
      to `http://`. Android blocks cleartext traffic by default in release
      builds, so this is a hard requirement, not a nice-to-have.
- [ ] **Restrict the API keys in their provider consoles.** `GOOGLE_MAPS_API_KEY`
      and `GEMINI_API_KEY` are now behind authentication and rate limits, but a
      key with no IP restriction is still usable by anyone who obtains it.
- [ ] **Configure SMTP, or hide "Forgot password".** Without `SMTP_HOST`,
      `SMTP_USER` and `SMTP_PASS`, the reset endpoint now fails loudly in
      production instead of quietly logging the link. Either set them or take
      the entry point out of the UI.
- [ ] **Rotate any secret that has been in a log.** `MONGO_URL` was printed on
      every boot and `GEMINI_API_KEY` sat in request URLs. If those logs were
      ever shipped anywhere, treat both as compromised and reissue them.
- [ ] **Decide on `slug` and `scheme`.** Both are still `"mobile"` in
      `app.json`. Left alone on purpose: `slug` ties to the EAS project and
      `scheme` is the OAuth redirect URI registered in Google Cloud Console, so
      changing either needs a matching change on the other side. Worth doing,
      but as its own task.

## Suggested future updates

Ordered by value, not effort.

**1. Move rate limiting into Redis.** The counters live in this process's
memory. That is correct for one instance and silently wrong the moment you run
two — each would enforce its own share of the budget. Do this before you scale
out, not after.

**2. Add tests to the backend.** `server/package.json` still has the default
`"test": "echo ... && exit 1"`. The mobile app has 130 tests; the server has
none, and it is the half holding the auth, the money and the health data. Start
with the auth controller and the medication ownership checks.

**3. Enforce account scoping in a test.** Every medication route filters by
`req.user`, which is correct — but nothing proves it stays correct. One test
that signs in as user A and fails to read user B's medications is worth more
than a dozen unit tests elsewhere.

**4. Add a request ID and structured access log to the Node API.** The Python
assistant already does this (`X-Request-ID`, deliberately omitting the query
text and coordinates from the log line, because a symptom description plus a
location is health data about an identifiable person). The Node API logs with
bare `console.error` and no correlation id. Copy that module's approach —
including what it deliberately leaves out.

**5. Rotate refresh tokens on use.** Today `/auth/refresh-token` returns a new
access token and leaves the refresh token unchanged for its full 7 days.
Issuing a new one each time, and revoking the whole family if an old one
reappears, turns a stolen refresh token from 7 days of quiet access into a
detectable event.

**6. Decide the fate of `client/`.** The React web app in `client/` is **89
tracked files and currently broken**: `src/api/axios.js` has a hardcoded LAN IP
as its base URL *and* every service appends the full path again, producing
`/api/v1/auth/api/v1/auth/login`. Either fix and deploy it, or delete it — it
is the largest piece of dead weight in the repo and it makes "is this used?"
harder to answer for everything around it. Same question for
`CureliynkMedical/frontend/medical-frontend`, a small demo frontend for the
Python service. **Both were left in place** during this pass, because deleting
89 tracked files is a product decision, not a cleanup.

**7. Address the mobile audit warnings.** `npm audit` reports 18 moderate
issues in `mobile/`, all inside Expo's own build toolchain and all transitive.
`npm audit fix --force` would break the SDK 57 pin. The fix is to take Expo's
next SDK release rather than to force anything now.

**8. Small things.** `mobile/assets/cureliynk logo.jpeg` (80 KB) is tracked but
referenced nowhere — delete it or use it. `server/src/services/doctor.service.js`
still reads a legacy `GOOGLE_PLACES_API_KEY` fallback that can go once every
environment has moved to `GOOGLE_MAPS_API_KEY`.

---

## How to check the app is healthy

```bash
# Mobile — all four must pass
cd mobile
npx tsc --noEmit                 # types
npx expo lint                    # lint
npx jest                         # 130 tests
npx expo export --platform all   # the real build check

# Server
cd server
npm audit                        # expect 0 vulnerabilities
npm start                        # startup validates its own config
```

To confirm the security headers are really being sent:

```bash
curl -sD - -o /dev/null http://localhost:5000/health
```

Expect `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
`Cache-Control: no-store`, a `RateLimit` line — and **no** `X-Powered-By`.
`Strict-Transport-Security` appears only when `NODE_ENV=production`.

*Last verified 2026-09-14: mobile 130/130 tests passing, TypeScript and ESLint
clean, Android + iOS production bundles exporting; server 0 vulnerabilities, all
37 modules loading, headers and rate limits confirmed against a running
instance.*
