# Real photos for the gifts — design (short)

Proposed on 2026-11-20. **Paused by the owner on 2026-11-21:** "leave the pic for now, build without
gift pic, we will add later". The gifts keep their emoji until then. Work so far, for when it resumes:
a matching set of 16 cut-out product photos on one white tile (`scratchpad/gift-photos/final2/`, contact
sheet `scratchpad/gift-photos/judge/sheet.png`), 7 still missing (sticker pack, sweatband, gloves,
lifting straps, wrist wraps, knee sleeves, tank top) and 4 flagged for replacement (guest pass, free
week, duffel bag, yoga mat); photos of the gym's own stock on a white sheet would fill the gaps best.

The owner: "for the gifts and goodies add real items pics with out branding and logos." The 24
default gifts (`server/src/db/rewardDefaults.ts`) show emoji; an admin can already upload a photo
per gift (a data URL, checked like an avatar), but none has.

## Goals

- **A real photo for every default gift**, the 21 items and the 3 services (a coaching scene without
  faces, a calendar, two pairs of shoes), so the store looks the same throughout. Plain items: no
  logos, brand names, readable text, watermarks or recognisable faces. Free photo sites had no
  unbranded product shot for 9 of them (sweatband, shaker, resistance bands, gloves, lifting straps,
  wrist wraps, knee sleeves, tank top, duffel bag); for those the owner chose **"in use" photos**
  (the item worn or in use, still no faces and no logos). The owner can replace any photo with a
  photo of the gym's own stock from Admin.
- **Free-licence photos** (free Unsplash photos under the Unsplash License, or Pexels photos under the
  Pexels License: free for commercial use, no payment), each source, photographer and licence listed
  in `docs/gift-photo-credits.md`.
- **Shipped with the website and the app**, 512×512 WebP of about 15–60 KB each, in
  `client/public/gifts/<name>.webp` (like `client/public/avatars`): served by our own server, inside
  the APK so they show offline, and no member's device ever contacts a photo site.
- **The API accepts these built-in photos by path** (`/gifts/<name>.webp`, exactly the shipped set,
  as it accepts the preset avatars). Emoji and uploaded photos keep working; `GiftImage` shows all
  three.
- **New gyms start with the photos.** For existing data, a one-time update gives each default gift
  its photo only while it still has its default emoji, so an admin's own choice is never replaced.
- The admin's gift form shows the built-in photo, keeps it when the gift is edited, and lets the
  admin pick another built-in photo, an emoji or an upload.

## Non-goals and anti-goals

- Non-goals: photos of the gym's actual stock (the owner can upload those per gift at any time);
  changing gift names, prices or descriptions.
- Anti-goals: any brand or logo in a photo; a photo loaded from another site; replacing a picture an
  admin chose; heavy images in the store list.

## Approaches

- **A, files shipped with the client, referenced by path (picked):** fast, offline, cacheable, no
  third-party requests.
- B, data URLs stored with each gift: no new code path, but every store list would carry about 1 MB
  of images.
- C, links to the photo sites: breaks the server's rule that a gift picture is never an address
  (members' devices would call a third party), and fails offline.

## Calls left to the builder

- How the admin picks a built-in photo (a small grid next to the emoji choice).
- Where the one-time update runs (with the existing start-up data upgrades).
