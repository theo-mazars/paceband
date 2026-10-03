# PaceBand

Enter a pace, a start time and a distance, and get the expected passage time at every
checkpoint. Optionally enter a second, slower pace to see a fast and a slow estimate side by side.

It is a static site: plain HTML, CSS and JavaScript, no build step and no dependencies.
Fonts are self-hosted, so the page makes no third-party requests.

## What it does

- Distance presets (5K, 10K, half marathon, marathon; in miles mode 5 mi, 10 mi, half, marathon) or any custom distance. Switching units from the defaults lands on round numbers: 5:30 /km becomes 9:00 /mi, and a checkpoint every 5 km becomes every mile.
- Pace as `min:sec` per kilometre or per mile; on a phone keypad, `530` is read as `5:30`. Defaults: half marathon, 5:30 /km, 09:00 start,
  a checkpoint every 5 km.
- "Add a slower pace" shows two columns of race time and time of day, one per pace.
- Mobile first: one column on phones, large touch targets, and the share and copy buttons pinned to the bottom of the screen. Two columns from 54rem up.
- Checkpoints can be rebuilt from a spacing, then renamed, moved, removed or added one by one.
- "Copy share link" copies a URL that restores the whole sheet. "Copy as text" copies a plain-text table.

Times assume an even pace from the gun. Real races rarely run that way, so treat them as targets.

## Share links

All state lives in the query string; there is no server-side storage. Opening a link with no
parameters shows the defaults. The address bar updates as you edit, so you can also copy it
from there. You can write links by hand:

| Parameter | Meaning | Example |
|---|---|---|
| `u` | Display unit: `km` or `mi` | `u=mi` |
| `d` | Total distance **in kilometres** | `d=21.0975` |
| `p` | Pace, per the chosen unit | `p=5:30` |
| `p2` | Optional slower pace (turns on the two-pace view) | `p2=6:00` |
| `s` | Start time, `HHMM` | `s=0900` |
| `i` | Checkpoint spacing **in kilometres**, used when `c` is absent | `i=5` |
| `c` | A checkpoint, **in kilometres**, with an optional name after `\|`. Repeat for each one. | `c=5&c=12.5\|Aid+station` |

Example: `/?d=10&p=5:00&p2=5:30&s=0800&c=5&c=7.5|Water`

Anything invalid in a link is ignored and the default is used instead.

## Run locally

```sh
python3 -m http.server -d public 8080
# then open http://localhost:8080
```

Or with Docker:

```sh
docker build -t paceband .
docker run --rm -p 8080:80 paceband
```

## Deploy with Dokploy

1. Push this repository to GitHub, GitLab, Gitea or Bitbucket (or use any Git URL).
2. In Dokploy, create a project, then **Create Service → Application**.
3. Under **Provider**, pick your Git provider, the repository and the branch.
4. Set **Build Type** to **Dockerfile**, with **Dockerfile Path** `Dockerfile` and
   **Docker Context Path** `.`.
5. Open the **Domains** tab, add your domain, set the **container port** to `80`, and turn on
   HTTPS with Let's Encrypt if you want a certificate.
6. Click **Deploy**.

For automatic redeploys on every push, enable auto deploy for the application or add Dokploy's
webhook to your Git provider.

Menu labels can change between Dokploy versions; the settings that matter are the Dockerfile
build type and container port `80`.

The image is `nginx:stable-alpine` serving `public/`, with a `/healthz` endpoint for the
container healthcheck. Security headers, including a strict Content Security Policy, are set in
`nginx.conf`. If you add an external script, font or analytics, widen that policy.

## Layout

```
public/
  index.html     page markup
  styles.css     styles and font-face declarations
  app.js         calculation, rendering and URL state
  favicon.svg
  fonts/         Barlow and Barlow Condensed (SIL Open Font License, see OFL-LICENSE.txt)
Dockerfile
nginx.conf
```
