# Rombo Dishes — Supabase backend (local-first)

This package adds a Supabase database, a server-side order endpoint, a customer cart/checkout, and a private admin dashboard to the original static website.

## What is and isn't live
- The code is prepared, but no Supabase project is connected until you add your own project URL and public anon/publishable key.
- Online M-Pesa is intentionally disabled. The currently available payment choice is cash or M-Pesa at pickup/delivery. No online payment is taken. To enable online STK Push, a separate secure Daraja integration, credentials, callback URL, and testing are required.
- The displayed business details and original marketing menu text should be verified by the restaurant. Add real menu items and prices in the admin dashboard before accepting customer orders.

## A. Install tools on Windows
1. Install Node.js LTS from https://nodejs.org/ (needed for the Supabase CLI via `npx`).
2. Install Git for Windows from https://git-scm.com/download/win if it isn't already installed.
3. Open PowerShell in the extracted `rombo_dishes_supabase` folder: File Explorer → open the folder → click the address bar, type `powershell`, press Enter.
4. Confirm Node works: `node --version` and `npm --version`.

## B. Create a Supabase project
1. Go to https://supabase.com/ and create a project. Save its database password securely; it is not needed in the website.
2. In Project Settings → API (or Connect), copy the Project URL and the **publishable/anon public key**.
3. Open `supabase-config.js` in Notepad or VS Code and replace the two placeholders. Keep the key public/anon only. **Never put a `service_role` or secret key in this file or any browser code.**
4. In the Supabase dashboard, open SQL Editor, create a new query, paste all of `supabase/schema.sql`, and run it.

## C. Create the first admin login
1. In Supabase dashboard → Authentication → Users, choose Add user / Create new user and create an admin email/password. Do not share this password.
2. Copy the new user's UUID from Authentication → Users.
3. In SQL Editor run the following, replacing the sample UUID with that user's real UUID:

   `insert into public.admin_users (user_id) values ('PASTE-ADMIN-USER-UUID-HERE');`

4. Visit `admin.html` in your local site and sign in. Only users added to `public.admin_users` are allowed to manage the menu and view orders.

## D. Deploy the secure order function
The order endpoint must run on Supabase, not as a local browser-only script.

1. In PowerShell, from this project folder, run:

   `npx supabase login`

2. Link this folder to your project (find the project ref in the Supabase dashboard URL):

   `npx supabase link --project-ref YOUR_PROJECT_REF`

3. Deploy the function:

   `npx supabase functions deploy place-order`

The Supabase platform supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Do not copy the service-role key into your website. The function uses server-side menu prices so the browser cannot set its own order total.

## E. Preview locally on Windows
Browsers can behave differently when opening HTML directly as `file://`. Run a local static server instead.

1. In PowerShell, install a simple static server for this terminal session:

   `npx --yes http-server . -p 8080 -c-1`

2. Keep that terminal open. In Chrome/Edge visit:

   `http://127.0.0.1:8080/`

3. Open the admin dashboard at `http://127.0.0.1:8080/admin.html`.
4. Sign in to admin, add real menu items and prices, then refresh the customer homepage. Test an order using your own phone number and a pickup/delivery test address. Confirm it appears in the admin dashboard.
5. Stop the local server with Ctrl+C.

The website runs locally, but the database and Edge Function are hosted by Supabase. The function must be deployed for checkout to work.

## F. M-Pesa status
- **Available in this starter:** customers can choose “Cash or M-Pesa on pickup/delivery”; the order is recorded as unpaid so the restaurant can confirm payment manually.
- **Not yet integrated:** automated online M-Pesa STK Push. Before enabling it, implement a server-side Edge Function that initiates Daraja STK Push, store credentials only as Supabase Edge Function secrets, validate Safaricom callbacks, verify transaction results server-side, and update `payment_status` only after a verified callback. Use Safaricom Daraja sandbox first, then production approval. Do not mark an order paid from a browser response alone.

## Troubleshooting
- “Setup required”: confirm both values in `supabase-config.js` are replaced and saved.
- Menu won't load: ensure `schema.sql` ran and at least one available menu item exists.
- Admin can sign in but sees an authorization error: make sure the exact Auth user UUID is in `public.admin_users`.
- Checkout fails: ensure `place-order` is deployed, function logs in Supabase show no error, and `supabase/config.toml` has `verify_jwt = true`.
- Never commit passwords, database credentials, service-role keys, or Daraja secrets into the website folder or public repository.
