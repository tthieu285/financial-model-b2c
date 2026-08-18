# God's Eyes · Financial Model — B2C Homecare (Children)

An interactive Year 1 financial model for the B2C model (in-home eye exams + glasses/treatment sales for children). Built with plain HTML/CSS/JS — no build step, no external dependencies (no CDN) — just copy these 4 files to any static host and it works.

This is a **new, standalone** build, separate from the B2B model currently live at https://tthieu285.github.io/financial-model/ — that repo/site is untouched.

## Files

- `index.html` — page structure
- `style.css` — styling
- `script.js` — default assumptions (`DEFAULTS`) + the calculation engine (`calcModel`)
- `app.js` — UI rendering + interaction (live input updates, 3 scenario buttons, add/remove rows…)

## Verified against the Excel reference

Every formula has been checked against `gods_eyes_b2c_tre_em_financial_model.xlsx` down to the cent. For example, on the default Base case scenario:

- Revenue/visit: $158.264 (exam $22.40 + treatment/glasses $135.864)
- Month 1 revenue: $11,236.744 — Month 1 EBITDA: -$3,830.157
- Total Year 1 revenue: $239,477.49 — Total Year 1 EBITDA: -$16,718.47 (margin -7.0%)
- Q4 EBITDA: +$6,329
- Year 1 ending cash: Base $103,281.53 · Conservative $94,977.07 · Optimistic $111,585.99

If the numbers ever drift noticeably from these figures without changing any input, that's likely a bug — check `script.js`.

## Deploying to GitHub Pages (new repo)

1. Create a new GitHub repo, e.g. named **`financial-model-b2c`** (any name works) — public, no need for a default README/gitignore since these files already include one.
2. In a terminal, from the folder containing these 4 files, run:

   ```bash
   git init
   git add index.html style.css script.js app.js README.md
   git commit -m "Init B2C financial model"
   git branch -M main
   git remote add origin https://github.com/<your-username>/financial-model-b2c.git
   git push -u origin main
   ```

3. On GitHub, go to the repo → **Settings → Pages** → under "Build and deployment" → Source: **Deploy from a branch** → Branch: **main** / folder **/(root)** → **Save**.
4. Wait 1-2 minutes — the site will be live at: `https://<your-username>.github.io/financial-model-b2c/`

(Same process as the B2B build — just a different repo name.)

## Admin — Save as Default

The Assumptions panel has a section **H. Admin — Save as Default**, gated behind a PIN (default `2468`, set in `ADMIN_CONFIG.pin` near the top of `script.js` — this is a **soft deterrent only**, not real security, since it's plain text in a static file anyone can view-source). Once unlocked, filling in your GitHub owner/repo/branch/file path and a Personal Access Token and clicking **Save as Default** will:

1. Fetch the current `script.js` from your repo (GitHub Contents API `GET`).
2. Regenerate just the `DEFAULTS` object with the page's current input values, using the `DEFAULTS:START` / `DEFAULTS:END` marker comments in `script.js` so the rest of the file (the calculation engine, etc.) is left untouched.
3. Commit the updated file straight back to the repo (GitHub Contents API `PUT`), so the next time anyone loads the page (after GitHub Pages redeploys, usually within a minute or two) they see your new numbers as the defaults.

Security notes:
- The PAT is only ever held in the page/browser memory for that one request — it is sent directly from your browser to `api.github.com` and is **never written to localStorage or anywhere else**.
- Owner/Repo/Branch/File path (not sensitive) **are** remembered in your browser's localStorage so you don't have to retype them each visit.
- Use a fine-grained PAT scoped to just this one repo's **Contents: Read and write** permission — don't use a classic PAT with broad `repo` scope if you can avoid it.
- This tool updates an **existing** `script.js` in an already-deployed repo (it needs the current file's SHA to commit safely) — it won't create a brand-new repo for you.

## What's NOT included in this version

- No other in-browser state persistence beyond the Admin section above — refreshing the page (without using Save as Default) resets all inputs to whatever `DEFAULTS` currently is in `script.js`.

## Notes for future edits

- The treatment/glasses mix share (section B) must always total 100% — the page shows a warning if it drifts, but doesn't block input.
- Rows can be added/removed in 4 tables: treatment mix, monthly fixed overhead, headcount, and the CapEx schedule.
- "Active Months" (section A) lets you mark any month as closed (holiday/ramp-up) — that month's visits drop to 0, but fixed overhead and staff cost still apply.

---
*Built by Claude (Cowork) — 2026-08-18.*
