# Deploying LeetCode Tracker

The website runs on **Vercel**, the API on **Render**, the database on **MongoDB Atlas**,
password-reset email goes through **Resend**, and AI through **Google Gemini**. Do the steps
in order; each takes a few minutes.

You'll collect four values along the way. Keep them somewhere safe (a password manager), and
never commit them or paste them into chats:

| Value | From | Used by |
|---|---|---|
| `MONGODB_URI` | Atlas (step 1) | Render |
| `GEMINI_API_KEY` | Google AI Studio (step 2) | Render |
| `RESEND_API_KEY` | Resend (step 3) | Render |
| API address | Render (step 4) | Vercel, the extension |

## 1. Database: a dedicated MongoDB user

Use a **new** database user for production: the development user is shared with another
project, and its password has been shared in a chat.

1. In Atlas, open your project → **Database Access** → **Add New Database User**.
2. Username e.g. `leetcode-tracker-prod`, **Autogenerate Secure Password**, and copy it.
3. Under **Database User Privileges**, choose **Specific Privileges** → role `readWrite` on
   database `leetcode_tracker` only. (It can't touch your other projects' data.)
4. **Network Access** → **Add IP Address** → **Allow access from anywhere** (`0.0.0.0/0`).
   Render's free plan has no fixed IP address, so this is needed; the strong password is what
   protects the database.
5. **Database** → **Connect** → **Drivers**: copy the connection string, put in the new user's
   password, and add the database name before the `?`:
   `mongodb+srv://leetcode-tracker-prod:<password>@cluster0.xxxxx.mongodb.net/leetcode_tracker?retryWrites=true&w=majority`

Production uses its own database (`leetcode_tracker`), so test data from development stays out.

Separately, change the password of the old shared user in your other project, since it was
exposed.

## 2. Gemini: a new API key

1. In [Google AI Studio](https://aistudio.google.com/apikey), **Create API key** and copy it.
2. Delete the old key (it was shared in a chat). Then put the new key in `server/.env` too,
   or AI features stop working locally.

## 3. Resend: email for password resets

1. Sign up at [resend.com](https://resend.com) and create an **API key** with sending access.
2. Until you verify a domain you own, Resend only delivers to **your own** sign-up email
   address. Password reset works for you, but not other users yet. To fix that later, buy a
   domain, verify it in Resend, and set `EMAIL_FROM` on Render to an address on it.

## 4. API on Render

1. In [Render](https://dashboard.render.com): **New** → **Blueprint** → connect GitHub and pick
   this repository. Render reads `render.yaml`.
2. Fill in the values it asks for:
   - `MONGODB_URI`: from step 1
   - `GEMINI_API_KEY`: from step 2
   - `RESEND_API_KEY`: from step 3
   - `CLIENT_URL`: the website address you'll get from Vercel, e.g.
     `https://leetcode-tracker.vercel.app` (choose the project name in step 5 to match; you
     can change this later)
3. **Apply**. The first build takes a few minutes. `JWT_SECRET` is generated for you.
4. Copy the service address, e.g. `https://leetcode-tracker-api.onrender.com`, and open
   `…/api/health`: it should say `"status":"ok","db":"connected"`.

On the free plan the API sleeps after 15 minutes without visits; the next visit wakes it in
about a minute (the website says so while it waits). The Starter plan ($7/month) stays awake.

## 5. Website on Vercel

1. In [Vercel](https://vercel.com/new): import this repository.
2. **Project name**: e.g. `leetcode-tracker` (the address becomes `https://<name>.vercel.app`).
3. **Root Directory**: `client`. Vercel picks up `client/vercel.json` for the rest.
4. **Environment Variables**:
   - `VITE_API_URL` = the Render address + `/api`, e.g. `https://leetcode-tracker-api.onrender.com/api`
   - optional `VITE_CONTACT_EMAIL` = an address to show in the privacy policy
5. **Deploy**.

If the Vercel address differs from what you gave Render as `CLIENT_URL`, update it on Render
(Environment → `CLIENT_URL`) and let it redeploy.

## 6. Check it works

1. Open the website, register, add a problem by pasting a LeetCode link.
2. Try an AI feature (e.g. Get hints).
3. Sign out, use **Forgot password?** with your Resend sign-up email, and follow the link.
4. In Settings, connect your LeetCode username.

## 7. The extension with the live site

In the extension popup, set the API address to the Render address + `/api` and paste a token
created on the live site. Chrome will ask to allow the extension to reach that address.

## Updating

Push to `main` on GitHub: Render and Vercel both rebuild and deploy automatically.
