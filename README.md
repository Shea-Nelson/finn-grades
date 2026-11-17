# Finn's School Year

Static parent dashboard for Finn's 2026–27 school year. Open `index.html` through a local web server (the page fetches `data/` at runtime). GitHub Pages can serve this repo from the root with no build.

```bash
python3 -m http.server 4173
```

Then visit `http://127.0.0.1:4173/`.

New gradebook rows belong in `data/assignments.csv`, term averages in `data/summary.json`, and weekly Roblox reports in `data/roblox_weekly.csv`. The page picks those up without a code change. The footer date is the latest assignment due date.

The public page uses the first name Finn only and does not list teachers. Homeroom and Study Hall stay hidden while they have no grades.
