# AI gift pictures: prompts and how to use them

The gift store shows a picture for each gift once it is added. Until then it shows the gift's emoji. You make the 24 pictures in your own AI image tool; this folder has everything to ask for them, and one command turns the results into store tiles.

## How to make a picture

1. Open your AI image tool. For the 7 branded gifts (their line says *Attach pulsefit-logo.png*) attach `pulsefit-logo.png` from this folder to the request.
2. Send the **style block** followed by the gift's line.
3. Check the result: item alone and whole, plain white background, and (branded gifts) the logo spelled exactly PULSEFIT. If the text is wrong, ask again, or ask for the same item with no logo.
4. Save it as `<file>.png` (or `.jpg` / `.webp`) in a folder named `gift-pictures-incoming` at the top of the project, for example `gift-pictures-incoming/mug.png`. The folder is ignored by git.
5. Run `npm run gift:add`. It cuts each item out (with the rembg tool when it is installed; set its path in `REMBG`), places it on the shared white 512 x 512 tile, writes `client/public/gifts/<file>.webp` and adds the gift to `client/src/data/gift-pictures.json`. A file whose name is not a gift stops the whole run before anything is written.
6. Restart the server. Gifts that still show their original emoji switch to the picture; a gift whose emoji you changed in the admin screen keeps your choice. In the admin gift form a built-in picture can also be picked by hand.

Use only tools whose terms allow commercial use of what they make, and only the PulseFit logo: no other brand anywhere.

## Style block (send with every gift)

> Studio product photo on a pure white background. Soft, even light from the front-left. Three-quarter view. The item alone and whole, centred, with space around it. No people, no hands, no props. No text of any kind except the PulseFit logo where the line below names it. No other brands or logos. Square image.

## The 24 gifts

| File | Gift | Line to add after the style block |
|---|---|---|
| `sticker-pack` | Sticker pack | A small fan of three glossy die-cut stickers and a backing sheet, each sticker showing the PulseFit logo (lime dumbbell tile with the word PULSEFIT). Attach pulsefit-logo.png. |
| `keychain` | Keychain | A metal dumbbell-shaped keychain on a short steel ring, the dumbbell enamelled lime green with the PulseFit logo mark engraved on one end. Attach pulsefit-logo.png. |
| `sweatband` | Sweatband | A pair of plain black terry-cloth wristbands, stacked, no print. |
| `skipping-rope` | Skipping rope | An adjustable speed skipping rope, black cable with lime handles, coiled loosely in a neat loop. |
| `sample-pack` | Supplement sample pack | Three small unbranded foil sachets fanned out, one white, one black, one lime green, plain with no printing or labels. |
| `mug` | Coffee mug | A white ceramic coffee mug with the PulseFit logo printed on the side facing us, handle on the right. Attach pulsefit-logo.png. |
| `water-bottle` | Water bottle | A 750 ml brushed steel water bottle with a black screw cap, plain, no print. |
| `shaker` | Shaker | A clear plastic protein shaker bottle with a black flip lid and a small wire mixing ball visible inside, plain, no print. |
| `towel` | Gym towel | A grey microfibre gym towel, folded in a neat thick rectangle with a lime stripe along one edge. |
| `cap` | Cap | A black baseball cap, three-quarter view, with the PulseFit logo mark embroidered in lime on the front panel. Attach pulsefit-logo.png. |
| `resistance-bands` | Resistance bands | Three loop resistance bands in light, medium and heavy colours (lime, black, grey), stacked in a loose pile. |
| `gloves` | Gym gloves | A pair of black padded half-finger lifting gloves with a wrist strap, one resting slightly over the other, no print. |
| `tshirt` | PulseFit T-shirt | A black breathable training T-shirt laid flat and front-facing, with the PulseFit logo printed in lime on the chest. Attach pulsefit-logo.png. |
| `lifting-straps` | Lifting straps | A pair of cream cotton lifting straps, each with a stitched loop, one coiled and one laid straight. |
| `wrist-wraps` | Wrist wraps | A pair of black stiff wrist wraps rolled up, with a lime hook-and-loop end, no print. |
| `knee-sleeves` | Knee sleeves | A pair of black 7 mm neoprene knee sleeves, one standing upright, one lying beside it, no print. |
| `yoga-mat` | Yoga mat | A lime green 6 mm yoga mat, partly rolled up with the loose end unrolled toward us, plain. |
| `tank-top` | Tank top | A lightweight black tank top laid flat and front-facing, with the PulseFit logo printed in lime on the chest. Attach pulsefit-logo.png. |
| `hoodie` | PulseFit hoodie | A heavyweight charcoal hoodie laid flat, front-facing, hood and pocket visible, with the PulseFit logo printed in lime on the chest. Attach pulsefit-logo.png. |
| `duffel-bag` | Gym duffel bag | A roomy black duffel bag with two handles, a long zip and a lime end pocket for shoes, plain, no print. |
| `foam-roller` | Foam roller | A firm black foam roller, cylinder lying on its side, with a textured ridged surface, plain. |
| `pt-session` | Free personal-training session | A coach's clipboard with a blank sheet and a silver stopwatch resting on it, no writing on the sheet. |
| `free-week` | Free week of membership | A small desk calendar showing a blank week grid, seven squares in one row highlighted in lime, with no year, no month name and no numbers. |
| `guest-pass` | Guest pass for a friend | Two blank rounded membership cards, one lime green and one black, fanned out, with no printing, no logo and no numbers. |

Services have object stand-ins (clipboard and stopwatch, a calendar without a year, two blank cards) so no text can go wrong.
