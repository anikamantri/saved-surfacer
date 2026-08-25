# Saved posts — the harvest list

Hand-harvested from my TikTok Favourites. This file is the pipeline's single source of
truth: `ingest/` reads any line containing a TikTok URL and ignores everything else, so
prose and headings are safe here.

**Format:** `<url>` optionally followed by a TAB and a `YYYY-MM-DD` save date.

No API exposes when *you* saved something — oEmbed has no date at all, and yt-dlp reports
when the *creator* posted. Real save dates only come from TikTok's data export, which takes
1–4 days. Where the date column is blank the pipeline falls back to the upload date and
flags it as `saved_at_is_estimate: true`, so the nudge card never quietly invents a date.

**Note:** exactly half of these are `/photo/` carousels, and `tiktok.com/oembed` returns
HTTP 400 for every one of them. See `docs/brief.md` §6.

https://www.tiktok.com/@izia.line/video/7645972278043364630
https://www.tiktok.com/@ebbas.diary/photo/7649063171847638294
https://www.tiktok.com/@norwegianbackroad/photo/7629768609082002710
https://www.tiktok.com/@planetsecretw/photo/7646794537930657056
https://www.tiktok.com/@jassetgo/photo/7652947896815455510
https://www.tiktok.com/@thegingerwanderlust/video/7413407442161110305
https://www.tiktok.com/@elizlovesfood/video/7662261740402494733
https://www.tiktok.com/@sensitive.vtg/video/7660592980708871437
https://www.tiktok.com/@atelierbrochman/photo/7652702090954935574
https://www.tiktok.com/@rajandroh/video/7673673926156881166
https://www.tiktok.com/@spotsyoumissed/photo/7662423778449837342
https://www.tiktok.com/@szesze.fertitta/video/7654368777370373406
https://www.tiktok.com/@smallbellybigworld/photo/7648532889188994335
https://www.tiktok.com/@getcultured.la/photo/7676640994250575117	2026-08-24
https://www.tiktok.com/@mrs.passengerprincess/video/7676609172825214221	2026-08-24
https://www.tiktok.com/@corner.la/photo/7666549982698278174	2026-08-24
https://www.tiktok.com/@chrissy015_/video/7663636435349540110	2026-08-24
https://www.tiktok.com/@olivia.eatsss/photo/7580924634594315551	2026-08-24
