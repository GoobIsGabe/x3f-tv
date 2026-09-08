# X3F — art direction and asset manifest

Every generated asset in the app, with the exact prompt, the exact destination, and the
reason it exists. Ready to run the moment the getimg key works.

**Status: built.** Every asset below exists. The manifest is now executable —
`tools/art/manifest.py` holds the prompts and `tools/art/build.py` generates and
processes them, so this document is the prose and that pair is the truth. If they
disagree, the code wins.

```bash
python tools/art/build.py                  # anything missing, then resize + WebP
python tools/art/build.py --only cards     # one group
python tools/art/build.py --only moves:deadlift --force
python tools/art/sprites.py                # shrink the illustrated game art
```

Generated originals are kept in `tools/art/raw/` so reprocessing never costs
another generation.

### What was learned doing it

**"No text, no watermark" is not enough.** Two of the first ten cards came back
with lettering burned in, one captioned *"Premium Graphite"* — the model read the
style description itself as a label to render. Naming the failure modes
individually (caption, label, title, signature, lettering) is what actually stops
it. That clause is in `manifest.py` and should not be trimmed back to something
that reads tidier.

**Movement plates need joint geometry, not exercise names.** The first pass of the
upright row came back as a lateral raise, the tricep press as a row, and the calf
raise flat-footed — because the model has a strong prior for the exercise NAME
that overrides the description. Describing where the hands are relative to the
body, which way the elbows point, and what the pose must NOT be produced correct
images. Three of eleven needed two or three attempts.

**Size the asset to where it is drawn, not to what came back.** The models return
300–600 KB at 1024px+. A card is painted 640 real pixels wide, a medallion 256, an
Android TV banner 640×360. Skipping that step would have added ~15 MB to a bundle
that must stay under 5, and oversized art costs decoded memory on the device as
well as disk.

### Actual output

| Set | Count | On disk |
|---|---|---|
| Game cards | 10 | ~8 KB each |
| Movement plates | 11 | ~10 KB each |
| Backdrop + medallions | 6 | ~7 KB each |
| Phase headers | 3 | ~20 KB each |
| Icon + banner | 2 | 45 KB + 79 KB |
| Illustrated game sprites | 12 | 2489 KB → 239 KB (unchanged art, 90% fewer bytes) |

Whole TV bundle: **2.9 MB**, down from 4.7 MB, while adding 30 new images.

---

## 1. The house style

The app currently reads as "bubbly mobile game" — emoji icons, four-column grid, saturated
purple. Fine on a phone, wrong across a room, and wrong for what the product actually is:
a training system for a brutal twenty-minute program.

**The direction: luminous graphite.**

Physical and tactile, like premium equipment photography crossed with a stylised game.
Deep graphite grounds, one strong rim light, a controlled accent spectrum, restrained
geometry. Everything reads at a glance from eight feet, and nothing reads as decoration.

### The style sentence

Every prompt below carries this sentence verbatim. Repeating one style sentence across a
set is what makes assets look like a family rather than a collection.

> Rendered in a premium graphite style: deep charcoal ground, one directional rim light
> from upper left, subtle volumetric haze, restrained violet-to-cyan accent glow, fine film
> grain, no text, no watermark, no lens flare, no logo, matte finish, cinematic but not
> glossy.

### The palette, and why these values

TV-safe from the start. Rec.709 puts black at 16 and white at 235, and TVs crush outside
that. The old `#06080e` ground rendered as flat crushed black and took every panel edge
with it.

| Role | Hex | Note |
|---|---|---|
| Ground | `#0F1114` | the darkest a TV renders honestly |
| Lift | `#14171E` | |
| Surface | `#1A1E27` | cards sit on their own ground, never on the backdrop |
| Ink | `#ECEEF2` | the brightest a TV renders honestly |
| Violet | `#7C6CFF` | the brand, focus, primary action |
| Cyan | `#35D8F5` | |
| Mint | `#33E2AE` | success |
| Gold | `#FFC94A` | personal bests |
| Hot | `#FF6376` | failure, max effort, the last five reps |
| Amber | `#FF9E4A` | partials |

### Rules every asset obeys

1. **No text inside an image, ever.** Text is HTML, so it scales with the type system,
   stays crisp at any resolution, is translatable, and never renders at the wrong size for
   a panel. Generated text also comes out subtly wrong and it is the fastest way to make a
   product look cheap.
2. **Nothing important within 6% of any edge.** TVs crop.
3. **Dark, low-contrast interiors.** These are backdrops for white text and a bright focus
   ring. A busy or bright asset makes the UI on top of it unreadable — v1.7 already had to
   give every panel its own opaque base for exactly this reason.
4. **JPEG for photographic/painterly, PNG only where transparency is genuinely needed.**
   The APK budget is under 5 MB and roughly half of it is already PNG. Target ≤ 60 KB per
   card, ≤ 120 KB for a full-bleed backdrop.
5. **Look at every image before wiring it in.** Generate one, read it, judge it, then batch.

---

## 2. Manifest

Destinations are `web/assets/…`; `tools/sync-from-web.py` copies them into the TV bundle.

### 2.1 Home backdrop — 1 image

`web/assets/ui/backdrop.jpg` · 16:9 · replaces `aurora.jpg`

> A vast dark abstract field suggesting slow-moving energy and tension — soft parallel
> filaments of light under deep haze, like a long-exposure photograph of a magnetic field.
> Almost entirely dark; light concentrated in the lower third and upper right, leaving the
> centre and upper left clear for interface elements. Violet and cyan only. Rendered in a
> premium graphite style: deep charcoal ground, one directional rim light from upper left,
> subtle volumetric haze, restrained violet-to-cyan accent glow, fine film grain, no text,
> no watermark, no lens flare, no logo, matte finish, cinematic but not glossy.

### 2.2 Game cards — 8 images

`web/assets/cards/<key>.jpg` · 16:9 · one per game. These replace emoji.

The shared clause for all eight, appended to each:

> Composition: a single clear subject centred slightly left, deep negative space on the
> right third for a title overlay, dark enough that white text over it is legible.
> Rendered in a premium graphite style: deep charcoal ground, one directional rim light
> from upper left, subtle volumetric haze, restrained violet-to-cyan accent glow, fine film
> grain, no text, no watermark, no lens flare, no logo, matte finish, cinematic but not
> glossy.

| Key | Subject prompt |
|---|---|
| `workout` | A single X3-style resistance bar and ground plate standing upright in darkness, band stretched taut and glowing along its length like a drawn bowstring, mint-green light along the tension line. Reverent, still, heavy — the hero card of the whole app. |
| `bloom` | A luminous plant unfurling from a dark seed pod, petals traced in fine violet light, roots dissolving into haze. Organic and slow. |
| `splash` | A slow-motion column of dark water rising, individual droplets caught in cyan rim light against near-black, the surface below mirror-still. |
| `nova` | A distant star field with one bright collapsing core, ribbons of gas spiralling inward, violet and cyan, mostly empty black. |
| `flow` | A single ribbon of light describing one smooth continuous loop in dark space, like a long-exposure light painting of one perfect repetition. |
| `arena` | A dark circular platform under a single overhead shaft of light, empty, faint chalk-dust haze in the beam. Anticipation, not combat. |
| `duel` | Two opposing arcs of light meeting and pressing against each other at the centre of a dark field, equal and straining, violet against cyan. |
| `rhythm` | A row of vertical light bars of varying height receding into haze, like a waveform standing in a dark corridor, cyan. |

### 2.3 Movement plates — 11 images

`web/assets/moves/<slug>.jpg` · 4:3 · one per movement, for the Library and the pre-set
coaching card.

These must match the live form demonstrator's visual language, or the app has two different
ideas of what a body looks like. Shared clause:

> A stylised human figure rendered as a smooth dark sculptural silhouette with a bright
> rim light along one edge, no facial features, no clothing detail, anatomically correct
> proportions. The resistance band is a single continuous luminous line under tension. Side
> or three-quarter view, full body in frame, standing on a dark floor plane. Rendered in a
> premium graphite style: deep charcoal ground, one directional rim light from upper left,
> subtle volumetric haze, restrained violet-to-cyan accent glow, fine film grain, no text,
> no watermark, no lens flare, no logo, matte finish, cinematic but not glossy.

Each is shown at **the top of its range** — the strongest position, which is where the
program says the work happens. Per-movement subject, drawn from the official mechanics
text now in `web/x3f-exercises.js`:

| Slug | Subject |
|---|---|
| `chest-press` | Arms extended forward and slightly downward, stopping short of lockout, band passing behind the back over one shoulder and under the opposite rear deltoid. Not standing on a plate. |
| `tricep-press` | Leaning ~45° forward, upper arms frozen against the torso, forearms extended down and forward, band behind the back. Only the elbows have moved. |
| `overhead-press` | Bar pressed overhead and slightly back, arms forming a rectangle, head visibly through that rectangle, shoulders rolled back. Band running from the bar down to a plate under the midfoot. |
| `front-squat` | Standing tall but knees not locked, bar resting across the front of the shoulders, elbows forward and up, fingertips only on the bar. Band from bar to plate under the midfoot. |
| `pec-crossover` | Arms swept across the body, hands meeting at the sternum, one elbow above the other, looped band crossing behind the upper back. No bar, no plate. |
| `split-squat` | Split stance driving up out of the bottom, rear heel high, rear knee near the floor, torso upright, bar across the shoulders, band under the front foot only. |
| `upright-row` | Bar pulled vertically to mid-chest, elbows high and slightly out, wrists below the elbows, torso upright, band to a plate under the midfoot. |
| `deadlift` | Standing at the top of a hip hinge, knees not locked, flat back, bar tracking close to the thighs, double overhand grip, band doubled to a plate under the midfoot. |
| `bent-row` | Hinged forward about 45° with a flat back, bar pulled to the beltline, elbows driven back past the ribs, band doubled to a plate under the midfoot. |
| `drag-curl` | Bar dragged up close to the torso to mid-chest, elbows travelling backward behind the body, band singled to a plate under the midfoot. |
| `calf-raise` | Risen high onto the balls of both feet, heels well off the back edge of the plate, bar held against the front of the body by the shoulders, band doubled under the balls of the feet. |

### 2.4 Band emblems — 5 images

`web/assets/bands/<n>.png` · 1:1 · transparent · 256 px

The band names are White / Light Gray / Dark Gray / Black / Elite Black — a purely
*luminance*-based palette sitting in exactly the near-white and near-black regions a TV
renders worst, and invisible to a portion of viewers. **So band identity is never a colour
swatch.** Each band gets a distinct SHAPE, which is what actually carries the meaning:

| Band | Shape | Prompt |
|---|---|---|
| White | circle | A simple flat emblem: a single smooth ring, thin, pale silver-blue `#C9D1E0`. |
| Light Gray | rounded square | A simple flat emblem: a rounded square outline, thin, steel blue `#7FA3C4`. |
| Dark Gray | diamond | A simple flat emblem: a diamond outline, thin, deeper blue `#5C7FB8`. |
| Black | triangle | A simple flat emblem: an upward triangle outline, thin, violet `#7A6ACF`. |
| Elite Black | pentagon | A simple flat emblem: a pentagon outline with a small solid core, thin, magenta-violet `#B85CC4`. |

Shared clause: *"Centred on a fully transparent background, flat vector style, single
colour, even stroke weight, no gradient, no shadow, no text, no background, generous
margin."*

These are generated for polish, but the CSS in `x3f-ui.css` already draws them with
`clip-path` at zero bytes — so if the budget is tight, **skip these**. The CSS versions are
genuinely fine.

### 2.5 Achievement medallions — 5 tier plates

`web/assets/ui/badge-<0..4>.jpg` · 1:1 · replaces the existing five

The wall is ~117 medallions: a forged plate per tier, with a per-family glyph drawn in SVG
on top. Only the five plates are generated.

> A forged circular metal medallion seen straight on, blank centre, concentric milled edge,
> struck rather than cast, catching a single sheen across the upper left. Tier <N> of five:
> <TIER MATERIAL>. Rendered in a premium graphite style: deep charcoal ground, one
> directional rim light from upper left, subtle volumetric haze, restrained violet-to-cyan
> accent glow, fine film grain, no text, no watermark, no lens flare, no logo, matte finish,
> cinematic but not glossy.

Tier materials: 0 dark iron · 1 brushed steel · 2 oxidised bronze · 3 pale gold ·
4 violet-tinted platinum with a faint inner glow.

### 2.6 Program phase cards — 3 images

`web/assets/phase/<1..3>.jpg` · 21:9 · the header of the Progress screen

The program deliberately teaches a new principle per phase, so the app should feel like it
moves through them.

1. **Foundational (weeks 1–4)** — *"A single band at rest, gently curved, one soft light. Beginning, potential, nothing strained yet."*
2. **Strength (weeks 5–8)** — *"A band stretched taut and vibrating, light concentrated along the tension, faint heat haze around it."*
3. **Optimization (weeks 9–12)** — *"A band at extreme stretch, its surface texture visible, light blazing along the line, everything else in deep shadow."*

Plus the style sentence.

### 2.7 Icon and banner — 2 images

`app/src/main/res/drawable-nodpi/icon.png` (1:1, 512) and `banner.png` (16:9, 320×180).
Android TV requires the banner; it is what the user sees on the home row.

> A bold minimal mark: three parallel bars of light of increasing length and increasing
> brightness, arranged as a rising diagonal, suggesting variable resistance. Violet to cyan
> gradient across the three. Centred on a deep charcoal ground with generous margin.
> Flat, geometric, confident, no text, no letters, no logo type, no shadow.

The existing 22 MB `logo.png` master stays where it is; these are the shipped sizes.

---

## 3. Budget

| Set | Images | Est. cost |
|---|---|---|
| Home backdrop | 1 | ~$0.05 |
| Game cards | 8 | ~$0.40 |
| Movement plates | 11 | ~$0.55 |
| Band emblems | 5 | ~$0.25 *(skippable — CSS already draws these)* |
| Medallions | 5 | ~$0.25 |
| Phase cards | 3 | ~$0.15 |
| Icon + banner | 2 | ~$0.10 |
| **Total** | **35** | **≈ $1.75** |

Plus re-rolls. Realistically **$3–5** including a second pass on anything that comes out
wrong. One image gets generated and inspected before each set is batched.

---

## 4. Order of work

1. One movement plate (`deadlift`) — the hardest brief, and the one most likely to come out
   anatomically wrong. If the style holds here it holds everywhere.
2. One game card (`workout`) — the hero, and the tone-setter.
3. The home backdrop.
4. Then batch the remaining sets.

After each set: read the files, check them at the actual size they will be seen, check them
against a dark UI with white text over them, and re-roll anything that is bright in the
middle or busy where text goes.
