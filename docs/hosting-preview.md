# Preview deploys on Vercel with a staging database (D-128)

Installing the app and Web Push need HTTPS, and a phone can't reach the Supabase running on your PC. So every pull request gets a **preview** on Vercel that talks to a **staging** Supabase project in Mumbai. Real people's data never goes here: production gets its own project at launch (Phase 12).

Everything below is done once, in your own accounts. Keep every secret in Vercel and Supabase only, never in Git, chat or email. It takes about 45 minutes. Both services are free at this size.

## 1. Supabase: the staging project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard), then **New project**:
   - **Name:** `holy-auramaxing-staging`.
   - **Region:** South Asia (Mumbai), `ap-south-1`.
   - **Database password:** generate a long one and keep it in your password manager. You need it in step 2.
2. On your PC, in PowerShell in the `holy-auramaxxxing` folder, link the folder to the project and send it every migration:

   ```powershell
   npx supabase login
   npx supabase link --project-ref <the project id from the dashboard address>
   npx supabase db push
   ```

   Or run the launcher with `-PushStaging`, which does the same after asking for the project id. `db push` creates the tables and turns on `pg_net`, `pgmq` and `pg_cron`; the dashboard should then list them under **Database → Extensions**.

3. Under **Project Settings → API keys**, note:
   - the project URL;
   - the **publishable** key;
   - the **secret** key. It's a password: it goes only into Vercel.
4. **Authentication → URL configuration:**
   - **Site URL:** your preview's address (step 3 tells you where to find it).
   - **Redirect URLs:** add `https://*-<your Vercel team slug>.vercel.app/**`.
5. **Authentication → Emails → SMTP settings:** turn on custom SMTP:
   - Host `smtp.gmail.com`, port `465`.
   - Username `holyauramaxing@gmail.com`, and its **app password** (not the account password).
   - Sender `holyauramaxing@gmail.com`, sender name `Holy Auramaxing`.

   Then raise **Authentication → Rate limits → emails** (it stays very low without custom SMTP).

6. **Authentication → Email templates:** copy the four templates and subjects from `supabase/templates/`, as in the README's production notes. Without them, the default Supabase emails would arrive.
7. Google sign-in (optional on staging): **Authentication → Sign In / Providers → Google**, with your OAuth client. Its consent screen is named **Holy Auramaxing**.

## 2. Vercel: the project

1. Go to [vercel.com/new](https://vercel.com/new) and import `Paulzhub/Holy-Auramaxing` from GitHub. The framework is detected as Next.js; keep the default build command.
2. **Settings → Functions → Function region:** Mumbai (`bom1`), next to the database.
3. **Settings → Deployment Protection:** turn **Vercel Authentication** off for previews. Otherwise your phone has to sign in to Vercel before it can open the app, and the install and push checks fail.
4. **Settings → Environment Variables**, for **Preview** (and Production later):

   | Key                                                 | Value                                                                                                  |
   | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
   | `NEXT_PUBLIC_SUPABASE_URL`                          | the staging project URL                                                                                |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`              | the publishable key                                                                                    |
   | `SUPABASE_SECRET_KEY`                               | the secret key                                                                                         |
   | `APP_ENCRYPTION_KEY`                                | 32 random bytes, base64: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
   | `OFFLINE_NOTE_PRIVATE_KEY`                          | `npm run keys:offline-note` (D-123)                                                                    |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys`                                                                     |
   | `VAPID_SUBJECT`                                     | `mailto:holyauramaxing@gmail.com`                                                                      |
   | `CRON_SECRET`                                       | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`                             |
   | `EMAIL_PROVIDER`                                    | `smtp`                                                                                                 |
   | `SMTP_HOST`                                         | `smtp.gmail.com`                                                                                       |
   | `SMTP_PORT`                                         | `465`                                                                                                  |
   | `SMTP_USER`                                         | `holyauramaxing@gmail.com`                                                                             |
   | `SMTP_PASSWORD`                                     | the Gmail app password                                                                                 |
   | `EMAIL_FROM`                                        | `Holy Auramaxing <holyauramaxing@gmail.com>`                                                           |
   | `PASSKEYS_ENABLED`                                  | `false` on previews (see the note below); `true` on production                                         |
   | `IMAGE_SCREENING_PROVIDER`                          | `none` (photos wait unseen), or set `GOOGLE_CLOUD_VISION_API_KEY`                                      |
   - **Use new keys here, not your PC's:** staging, production and your PC each get their own encryption, note and VAPID keys.
   - **Leave `NEXT_PUBLIC_SITE_URL` unset on Preview.** Each branch then uses its own stable address, `holy-auramaxing-git-<branch>-<team>.vercel.app` (`next.config.ts` does this).
   - **Passkeys:** they belong to one fixed domain (the relying party). That's why they're off on previews, whose addresses change, and on for production.
   - **Rate limits** without Upstash are kept per server instance: good enough for staging. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` before launch.

5. **Redeploy** the branch, so the new values are built in. Then open `https://<preview>/api/health`: it should show `"status":"ok","supabase":"ok"`.

## 3. Let the database reach the sender

Notifications are sent when the database calls the app. Tell staging where the preview is. Run this once per preview address, in **Supabase → SQL Editor**:

```sql
select public.notify_configure('https://<preview address>/api/notify/deliver', '<CRON_SECRET>');
```

## 4. On the phones

- **Android (Chrome):**
  1. Open the preview address, sign up and check in once.
  2. The **Install** card appears; tap it. The app opens full-screen from the Home Screen, under the neutral name.
  3. Turn notifications on when asked.
- **iPhone (Safari, iOS 16.4 or later):**
  1. Open the preview address, sign up and check in once.
  2. The card shows how to add the app: **Share**, then **Add to Home Screen**, then **Add**.
  3. Open the app from the Home Screen and check in again: now it asks about notifications.
  4. Turn them on, then send yourself a nudge from a second account. It arrives on the lock screen.
- **Offline:**
  1. Turn on airplane mode and open the app: it shows **You're offline** and still lets you check in.
  2. Turn airplane mode off: within a few seconds the app says it was saved.

## What doesn't run on previews

- **Vercel Cron** (`/api/cron/account-purge`) runs on production deployments only. On staging, accounts waiting for deletion are not purged on their own.
- **Free Supabase projects pause** after a week without use. Un-pause from the dashboard before testing.
