# Gift pictures: where they come from and the licence

The pictures in `client/public/gifts/` were made with AI on 2026-11-21. The owner approved this ("if possible the you generate by your using other ai website or somwhere alse, i'm approving you"; "Yes, PulseFit logo" on the branded items).

## Service and model

- **Service:** AI Horde (https://aihorde.net), a free volunteer-run image service. It was used anonymously with its public anonymous key `0000000000`, so no account and no API key of our own.
- **Model:** `Flux.1-Schnell fp8 (Compact)`, the AI Horde build of FLUX.1 [schnell] by Black Forest Labs (8-bit weights of the same model; https://github.com/Haidra-Org/AI-Horde-image-model-reference). Licence: Apache-2.0.
- **Settings:** 1024 x 1024 px, 4 steps, sampler k_euler, CFG 1, a fixed seed per try (1 to 5).
- **Sent:** only the prompt text from `prompts.md` (style block + the gift's line), with no personal data and no files. The service takes text only, so "Attach pulsefit-logo.png." became a written description of the logo. For the 17 plain gifts the style block's "except the PulseFit logo where the line below names it" was left out, because FLUX reads it as a cue to write the name. That clause names nothing for a plain gift.

## Processing

`npm run gift:add` cut each picture out with rembg using the `birefnet-general` model (BiRefNet, MIT licence: https://github.com/ZhengPeng7/BiRefNet), then placed it on the shared white 512 x 512 tile. rembg's default model (BRIA RMBG-2.0) is non-commercial (CC BY-NC 4.0), so the script names BiRefNet.

## The pictures used

Seed per gift: cap 1, duffel-bag 1, foam-roller 1, gloves 1, guest-pass 3, hoodie 1, keychain 1, knee-sleeves 4, lifting-straps 1, mug 3, pt-session 2, resistance-bands 1, sample-pack 1, shaker 3, skipping-rope 1, sticker-pack 4, sweatband 2, tank-top 3, towel 1, tshirt 3, water-bottle 1, wrist-wraps 2, yoga-mat 1.

`free-week` has no picture and keeps its emoji: all five tries printed made-up words on the calendar (one said "YEAR").

## Commercial use

- AI Horde terms (https://aihorde.net/terms), "Image License": "The website claims no rights on the outputs you generate, you are free to use them and are accountable for their use which must not go against the provisions set in this license." None of the terms' forbidden uses apply to product pictures of gym gifts.
- FLUX.1 [schnell] model card (https://huggingface.co/black-forest-labs/FLUX.1-schnell): "Released under the apache-2.0 licence, the model can be used for personal, scientific, and commercial purposes." Licence text: https://github.com/black-forest-labs/flux/blob/main/model_licenses/LICENSE-FLUX1-schnell (Apache License, Version 2.0).
- The model card's out-of-scope list (illegal use, harm to minors, false information, personal data, harassment, non-consensual imagery, automated decisions, disinformation) does not cover these pictures.
- AI Horde terms, "Image Sharing": anonymous text-to-image results and their prompts are shared with the LAION non-profit. The prompts are the public gift descriptions only.

## Not used

- Pollinations (https://pollinations.ai/terms): its no-key endpoint only serves the NVIDIA Sana model, whose licence was listed as CC BY-NC-SA 4.0 (non-commercial) and which we could not pin to a version. Its terms say "Model licences vary; verify before commercial use." Its FLUX models need a key.
- The official FLUX.1 [schnell] Space on Hugging Face (same model and licence) works without an account, but it allows only a few anonymous runs a day. Its three test images were not used.

The only logo in the pictures is PulseFit's own. There are no other brands.
