# Hosting the web app on Render (free)

WashLink's website is a static site: the browser talks straight to Supabase. Render's free static hosting covers it, with
HTTPS and the address `https://washlink.onrender.com`. If that name is taken, Render adds a suffix, such as
`washlink-ab12.onrender.com`. The settings are in `render.yaml` at the repository root. Nothing here has been deployed yet.

Supabase stays on its own free plan. Check the current limits of both free plans before launch. A Supabase free project
that has no activity for about a week can be paused, and you then restore it from the Supabase dashboard.

## 1. Put the code on GitHub

`render.yaml` deploys the `main` branch, so merge `feature/operator-mode` into `main` and push it to GitHub.

## 2. Prepare Supabase

1. Apply the migrations to the production project, including `2026_11_08_opa_operator_mode.sql`. Read
   `docs/b2c/DEPLOYMENT.md` first, and back up the database.
2. In **Project Settings → API**, copy the **Project URL** and the **anon public** key. Never use the `service_role`
   key in the website.

## 3. Create the site on Render

1. Sign up at render.com with your GitHub account. The free plan doesn't need a card.
2. Choose **New → Blueprint** and pick the WashLink repository. Render reads `render.yaml` and shows the `washlink` site.
3. When it asks, fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from step 2. The other settings come from
   `render.yaml`.
4. Choose **Apply**. The first build takes a few minutes. After that, every push to `main` redeploys the site.

The values are built into the site, so after changing one in the Render dashboard, run **Manual Deploy → Clear build
cache & deploy**.

## 4. Point Supabase sign-in emails at the site

In Supabase, open **Authentication → URL Configuration**:

- **Site URL:** `https://washlink.onrender.com`, or your real address if Render added a suffix
- **Redirect URLs:** add the same address followed by `/**`

Without this, the links in confirmation and password-reset emails lead to the wrong place.

## 5. Check the live site

- The landing page loads, and **Create account** offers no washer option.
- On an Android phone in Chrome, **Install the app** appears. On an iPhone, use Safari's **Share → Add to Home Screen**.
- Sign up a test customer, then set up your operator account (`docs/b2c/OPERATOR_MODE.md`).
- If something is blank or blocked, look in the browser console for `Content-Security-Policy`. A new outside service
  (for example Supabase on a custom domain) must be added to the policy in `render.yaml`.

## Adding a domain later

When you buy a domain, add it under the site's **Settings → Custom Domains** on Render, and set the DNS records Render
shows you. Render issues the HTTPS certificate. Then change the Supabase Site URL and Redirect URLs (step 4) to the new
domain.
