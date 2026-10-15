# Grand Canal reproduction — audit, results and known gaps

Reference: https://www.grandcanal.ca (captured 2026-10-15). Local copy: `npm run serve`.

## 1. Reference audit

**Platform.** Wix, classic editor. Wix serves two *separate* layouts chosen by user agent:
a desktop layout (fixed ~980px content column with full-width strips) to desktops and
tablets, and a phone layout (`width=320` viewport) to phones. Both are reproduced; phones
get theirs at the same URL, as on Wix.

**Routes (40 pages, 80 page files).** From the live sitemaps: `/`, `/about-us`, `/care`,
`/our-services`, `/amenities`, `/dining-services`, `/floor-plans`, `/our-location`,
`/gallery`, `/faq`, `/blogs`, `/sitemap`, `/thankyou`, `/retirement-residence-welland-lp`
and 26 posts under `/blog/...`. Plus `/review`, a 301 redirect to the Google review form
(kept as a redirect). Three linked PDFs under `/_files/ugd/` keep their URLs.

**Components and interactions found.** Header (sticky, hides on scroll down on desktop),
menu (plain links, CSS hover states, no dropdowns in use), phone hamburger menu, hero
slideshows (home: 9 slides, landing page: 8; crossfade every 3s), pro-galleries (home
grids; `/gallery` horizontal sliders with arrows) opening a full-screen viewer, a classic
auto-rotating gallery with zoom (`/our-services`), a muted autoplay video (`/our-location`),
lead forms on every page (two on the home page), a Flipfolio floor-plan widget iframe
(`/floor-plans`), HTML-embed iframes in two blog posts, blog list/post widgets.

**Integrations (all kept, on the same pages as on Wix).** Google Tag Manager
(GTM-MMM4KCZ), GA4 (G-TT2RXNJRKM), Google Ads conversion on `/thankyou`
(AW-358930201), WhatConverts call tracking (dynamic number insertion), ClickCease,
Crazy Egg (landing page), BoomChat widget (home), Organization + FAQ structured data,
Google and Bing site verification. Source: Wix custom code + marketing integrations,
frozen in `tools/embeds.json`.

**Phone.** Main number verified in the live server HTML and header: **289-480-0125**.
Note: in a browser, WhatConverts swaps it for tracking-pool numbers (289-216-228x); the
copy keeps the real number in the HTML and keeps WhatConverts, so swapping continues in
production exactly as today.

## 2. Fidelity results

Measured with `npm run check` against full-page screenshots of the live site (desktop at
1920px, iPhone 13), plus spot checks at 1024 and 1440px:

- **80/80** page files have exactly the same page height as the live pages.
- Pixel difference: **median 0.16%**, max 11.9%. Everything above ~3% is a slideshow
  showing a different slide at screenshot time (home, landing page) or the video frame.
- No horizontal overflow at 1440/1920; at 1024px both the live site and the copy overflow
  by the same 196px (Wix's fixed desktop width).
- Text, images, crops, colours, fonts and spacing come from the rendered Wix DOM and CSS,
  not from a re-implementation.

Interactions (`npm test`): **20/20 pass**: slideshow autoplay/arrows/dots, desktop header
hide/show on scroll, phone layout routing, phone menu open/close, gallery slider arrows,
gallery viewer (photo, title, next, Esc), services gallery rotation + zoom, video autoplay,
form validation and submit message, `/review` redirect, 527 internal links and assets.

## 3. Phone calls

- **264** tap-to-call links across the 80 page files; **0** visible numbers left unlinked.
- The header "Call: 289·480·0125" is now a one-tap `tel:+12894800125` link on desktop and
  phone layouts (previously plain text on desktop). Links inherit the original styling, so
  nothing looks different.
- All existing `tel:` links normalised to E.164 (`tel:+12894800125`).
- Two blog posts show a different number, **905-218-3650 / (905) 218-3650**. It is linked to
  itself (content unchanged); you may want to confirm or update it.
- **"Call Us Now" was not added as visible text.** The header phone line sits in a
  fixed-width box; relabelling it "Call Us Now: 289·480·0125" would wrap and push the
  header layout, which the brief rules out. A sticky mobile call bar was also not added
  (it would cover content). Both are one-line changes if you want them.

## 4. Performance (homepage, Lighthouse 12.6, trackers blocked in both runs)

| | Live (Wix) mobile | Copy mobile | Live desktop | Copy desktop |
|---|---|---|---|---|
| Performance score | 70 | **95** | 78 | **99** |
| First Contentful Paint | 3.0 s | **1.5 s** | 1.0 s | **0.5 s** |
| Largest Contentful Paint | 8.2 s | **2.8 s** | 3.8 s | **0.9 s** |
| Speed Index | 3.0 s | **1.5 s** | 1.0 s | **0.6 s** |
| Total Blocking Time / CLS | 40 ms / 0 | 0 ms / 0 | 0 ms / 0 | 0 ms / 0 |
| Requests | 248 | **45** | 265 | **57** |
| Transfer size | 2,870 KB | **738 KB** | 2,684 KB | **1,033 KB** |
| JavaScript | 949 KB | **5 KB** | 790 KB | **5 KB** |
| HTML | 199 KB | **24 KB** | 191 KB | **25 KB** |

Caveat: the copy was measured from `localhost` and the live site over the internet;
Lighthouse's simulated throttling narrows but does not remove that difference. Re-measure
after deployment. On desktop the copy downloads more image bytes above the fold (725 KB vs
420 KB): it eagerly loads a taller first screen and serves sharper full-width photos on
wide screens.

What changed technically (no visual changes):
- Wix runtime removed (React, Thunderbolt, platform workers, ~0.8–0.95 MB JS per page),
  replaced by `site.js` (15 KB).
- Images self-hosted as WebP at the exact crops Wix used; full-width photos get
  768/1280/1600/1920w `srcset`; below-the-fold images lazy-load; above-the-fold keep
  `fetchpriority`.
- Large CSS blocks moved to content-hashed files cached for a year; duplicates removed.
- Open-licence fonts self-hosted with `font-display: swap`.
- Video: Wix's player had picked the 1080p file (83 MB) for wide screens; the copy uses
  720p (42 MB, desktop) and 480p (18 MB, phones), streamed only while in view.
- Static hosting config with long-lived caching; no functions, no build step on Vercel.

## 5. Known gaps and decisions needed

**Before launch**
1. **Forms are not connected.** They posted to Wix's backend. Validation works; submitting
   shows "Online form submission is not connected on this copy of the site. Please call us
   at 289-480-0125." Setting `window.GC_FORM_ENDPOINT` to a form handler (e.g. a Vercel
   function + Resend) makes them post JSON and go to `/thankyou`, which fires the Ads
   conversion as today. reCAPTCHA (part of Wix forms) is gone; add spam protection
   (honeypot/rate limit) with the endpoint.
2. **Commercial fonts still load from Wix's CDN.** Avenir, Brandon Grotesque, DIN Next,
   Helvetica, Proxima Nova and Tahoma web fonts (24 files, listed in `build-report.json`)
   are licensed by Wix for Wix-hosted sites, so they were not copied. They render today
   because they are fetched from Wix; license them (or choose substitutes in the visual
   pass) before the Wix site is cancelled.
3. **Wix-hosted iframes**: images, video and PDFs are self-hosted, but two blog posts embed
   HTML iframes from Wix's file host (`usrfiles.com`); those will stop working if the Wix
   account is closed. The Flipfolio floor-plan widget and Google Maps are third-party
   iframes and are unaffected.

**Not reproducible as a static copy**
- Blog search results (`/blogs/search`), post likes, comments and view counters: these
  were Wix backend features. Counters and dates are frozen as captured.
- The gallery viewer is rebuilt to match Wix's layout and type (light grey screen, photo
  left, title right, arrows, close, full-screen). The heart "like" button is omitted.
- Services gallery rotation uses a 4 s interval; Wix's exact setting could not be read.
- Desktop header hide/show thresholds were measured on the live site (about 2x header
  height), not read from settings.

**Integration notes**
- Universal Analytics (UA-210075004-1) was not carried over: Google stopped processing UA
  data in July 2024.
- Two custom-code tags (Google Ads "Conversion code" AW-10777982505 and Crazy Egg) target
  Wix page IDs `dywzt` and `khh30`, which match no current page; they don't fire anywhere
  on the live site either. They are kept in `tools/embeds.json` for reference.
- The site's own "Whatconverts drop down" custom script throws a console error on pages
  without that dropdown, as it does on the live site.

**Infrastructure**
- The project was meant to live on `F:\ARCHIVE WORK\04 SEAN\245 Grand Canal`, but F: is
  full; it lives at `C:\Users\Rems 2021\Projects\grand-canal`.
- Markup and class names are Wix's generated ones. Fine for parity; the visual pass will
  be easier after moving pages into a component/template format.
