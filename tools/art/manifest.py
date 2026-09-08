"""X3F — every generated asset, its prompt, and where it belongs.

The manifest is the art direction in executable form. docs/ART-DIRECTION.md is
the prose version and the two must agree; this is the one that runs.

WHY A MANIFEST RATHER THAN 40 SHELL COMMANDS. One sentence of style language is
repeated verbatim in every prompt, and that repetition is the entire reason the
set looks like a set rather than a collection. Holding it in one constant makes
that structural instead of a thing somebody has to remember.

RULES BAKED IN HERE, not left to the prompt writer:

  NO TEXT IN ANY IMAGE. Text is HTML so it scales with the type system, stays
  crisp at any panel size, and can be changed without regenerating anything.
  Generated text also comes out subtly wrong and is the fastest way to make a
  product look cheap.

  NOTHING IMPORTANT WITHIN 6% OF AN EDGE. Televisions crop.

  DARK, LOW-CONTRAST INTERIORS. These sit under white text and a bright focus
  ring. A busy or bright asset makes the interface on top of it unreadable.
"""

# The sentence that makes forty images one family. Changing it means
# regenerating everything, which is the correct cost of changing a house style.
# NOTE ON THE ANTI-TEXT CLAUSE. The first pass said only "no text, no watermark"
# and two of ten cards came back with lettering burned into them - one captioned
# "Premium Graphite", because the model read the style description itself as a
# label to render. Naming the failure modes explicitly (caption, label, title,
# signature) is what actually stops it. Do not trim this back to something
# shorter-sounding; it was arrived at by watching it fail.
STYLE = (
    "Style: a deep charcoal ground, one directional rim light from the upper left, "
    "subtle volumetric haze, restrained violet-to-cyan accent glow, fine film grain, "
    "a matte finish, cinematic but not glossy. "
    "ABSOLUTELY NO TEXT ANYWHERE IN THE IMAGE: no words, no letters, no numbers, no "
    "caption, no label, no title, no signature, no watermark, no logo, no lettering "
    "of any kind. No lens flare. Purely a photographic image with no graphic overlay."
)

# Movement plates share a figure treatment so eleven lifts read as one athlete.
FIGURE = (
    "A stylised human figure rendered as a smooth dark sculptural mannequin with a "
    "bright rim light along one edge, no facial features, no clothing detail, "
    "anatomically correct proportions. The resistance band is a single continuous "
    "luminous line under tension. Full body in frame, standing on a dark floor plane."
)

# Game cards leave the right third dark, because a title sits there.
CARD = (
    "Composition: a single clear abstract subject centred slightly left, deep "
    "negative space on the right third, dark enough that white text over it stays "
    "legible."
)


def _m(slug, subject):
    return dict(slug=slug, dir="moves", aspect="4:3", fmt="jpeg",
                prompt=f"{FIGURE} {subject} {STYLE}")


def _c(slug, subject):
    return dict(slug=slug, dir="cards", aspect="16:9", fmt="jpeg",
                prompt=f"{subject} {CARD} {STYLE}")


# ── movement plates ─────────────────────────────────────────────────────────
# Each shows the TOP of the range - the strongest position, which is where the
# program says the work happens. Subjects come straight from the official
# mechanics text in web/x3f-exercises.js.
MOVES = [
    _m("chest-press",
       "Side view. Arms extended forward and slightly downward, stopping short of lockout. "
       "The band passes behind the back, over one shoulder and under the opposite rear "
       "deltoid. The figure is NOT standing on a plate."),
    # THE FIRST VERSION READ AS A DEADLIFT at card size, which is the size it is
    # actually seen at: a standing figure holding a bar low in front of the hips is
    # the deadlift silhouette exactly. The tricep press is separated from it by ONE
    # thing - the band comes over the shoulder from BEHIND, not up from the floor -
    # so the cord has to be the loudest object in the frame, and the camera has to
    # be close enough on the torso for the elbow angle to survive being 314 px wide.
    _m("tricep-press",
       "Strict side profile, camera CLOSE on the torso and arms - the figure is cropped at "
       "mid-thigh, filling the frame, NOT a full-length standing figure. Both hands hold one "
       "short straight metal bar horizontally in FRONT OF THE HIPS, a hand's width from the "
       "body. Both elbows are pinned hard against the ribs and point straight down. "
       "THE MOST VISIBLE THING IN THE IMAGE IS THE GLOWING CORD: it leaves the bar, climbs "
       "steeply up the front of the chest, passes OVER the near shoulder and disappears "
       "BEHIND the upper back - a bright unbroken diagonal from hip to shoulder. Nothing "
       "connects the bar to the floor. The floor is bare: NO disc, NO platform, and NO cord "
       "running downward. This is NOT a deadlift and NOT a row - no hip hinge, the spine is "
       "vertical."),
    _m("overhead-press",
       "Three-quarter front view, camera slightly below eye level. The figure stands tall and "
       "holds ONE LONG STRAIGHT HORIZONTAL BAR fully overhead with both hands set wider than "
       "the shoulders, so the two arms and the bar form a clear RECTANGLE above the head. The "
       "head is pushed slightly FORWARD, through that rectangle, and the shoulders are rolled "
       "back. The bar must be clearly visible as a thick horizontal rod. Two bands run from "
       "each end of the bar all the way down the body to a flat round plate under the feet."),
    _m("front-squat",
       "Three-quarter view. Standing tall but knees not locked, a straight bar resting "
       "across the front of the shoulders, elbows forward and up, fingertips only on the "
       "bar. The band runs from the bar to a flat plate beneath the midfoot."),
    _m("pec-crossover",
       "Front view. Arms swept across the body, hands meeting at the sternum, one elbow "
       "above the other. A looped band crosses behind the upper back. No bar and no plate."),
    _m("split-squat",
       "Side view. A split stance driving up out of the bottom, rear heel high, rear knee "
       "close to the floor, torso upright, a straight bar across the shoulders. The band "
       "runs under the FRONT foot only. No plate."),
    _m("upright-row",
       "Front view of a standing figure. Both hands are together at the CENTRE of the chest, "
       "knuckles almost touching the breastbone, gripping one short metal bar. Because the "
       "hands are at the centre of the chest and the elbows are bent sharply, each ELBOW "
       "STICKS OUT SIDEWAYS AND UPWARDS, higher than the hands, like folded wings. The "
       "forearms angle steeply downward and inward. The wrists are close together. Two glowing "
       "cords fall vertically from the bar to a thin disc on the floor between the feet. Both "
       "hands must remain at the midline of the chest and must never be out beside the "
       "shoulders."),
    _m("deadlift",
       "Side view. Standing at the top of a hip hinge, knees soft and not locked, back flat, "
       "a straight bar tracking close to the thighs in a double overhand grip. The band runs "
       "from the bar to a flat plate beneath the midfoot."),
    _m("bent-row",
       "Side view. Hinged forward about 45 degrees with a flat back, a straight bar pulled "
       "to the beltline, elbows driven back past the ribs. The band runs to a flat plate "
       "beneath the midfoot."),
    _m("drag-curl",
       "Side view. A straight bar dragged up close to the torso to mid-chest height, elbows "
       "travelling backward behind the body. The band runs to a flat plate beneath the midfoot."),
    _m("calf-raise",
       "Strict side profile of a figure STANDING ON TIPTOE, like a dancer en pointe or someone "
       "reaching for a high shelf. Only the toes and the balls of the feet touch the ground; "
       "the HEELS ARE RAISED HIGH IN THE AIR, a clear gap of empty space visible beneath each "
       "heel. The ankle is fully extended and the calf muscle is visibly bunched and defined. "
       "The legs are straight and the spine is vertical. A straight bar rests horizontally "
       "against the front of the thighs, arms hanging straight down. Short glowing cords drop "
       "from the bar to a thin disc under the toes. Camera is low, near floor level, so the "
       "lifted heels are the clearest thing in the picture."),
]

# ── game cards ──────────────────────────────────────────────────────────────
CARDS = [
    _c("workout",
       "A single resistance training bar and a flat ground plate standing upright in "
       "darkness, the band stretched taut and glowing along its length like a drawn "
       "bowstring, mint-green light along the tension line. Reverent, still and heavy."),
    _c("bloom",
       "A luminous plant unfurling from a dark seed pod, petals traced in fine violet "
       "light, roots dissolving into haze. Organic and slow."),
    _c("splash",
       "A slow-motion column of dark water rising, individual droplets caught in cyan rim "
       "light against near-black, the surface below mirror-still."),
    _c("nova",
       "A distant star field with one bright collapsing core, ribbons of gas spiralling "
       "inward, violet and cyan, mostly empty black."),
    _c("flow",
       "A single ribbon of light describing one smooth continuous loop in dark space, like "
       "a long-exposure light painting of one perfect repetition."),
    _c("max",
       "A dark circular platform under a single overhead shaft of light, empty, faint "
       "chalk-dust haze in the beam. Anticipation, not combat."),
    _c("zone",
       "A single horizontal beam of light held perfectly steady across a dark field, with "
       "faint tick marks along it, suggesting time being held rather than distance covered."),
    _c("boss",
       "A large dark faceted mass looming in haze, edged in a thin red rim light, with one "
       "small cyan point of light facing it from far below."),
    _c("duel",
       "Two opposing arcs of light meeting and pressing against each other at the centre of "
       "a dark field, equal and straining, violet against cyan."),
    _c("rhythm",
       "A row of vertical light bars of varying height receding into haze, like a waveform "
       "standing in a dark corridor, cyan."),
]

# ── interface furniture ─────────────────────────────────────────────────────
UI = [
    dict(slug="backdrop", dir="ui", aspect="16:9", fmt="jpeg", prompt=(
        "A vast dark abstract field suggesting slow-moving energy and tension: soft parallel "
        "filaments of light under deep haze, like a long-exposure photograph of a magnetic "
        "field. Almost entirely dark, with light concentrated in the lower third and upper "
        "right, leaving the centre and upper left clear for interface elements. Violet and "
        "cyan only. " + STYLE)),
]

# Five tiers of achievement medallion. Only the blank plate is generated; the
# per-family glyph is drawn in SVG on top, so 117 badges cost five images.
_TIERS = ["dark iron", "brushed steel", "oxidised bronze", "pale gold",
          "violet-tinted platinum with a faint inner glow"]
for _i, _mat in enumerate(_TIERS):
    UI.append(dict(slug=f"badge-{_i}", dir="ui", aspect="1:1", fmt="jpeg", width=256, prompt=(
        f"A forged circular metal medallion seen straight on, blank in the centre, with a "
        f"concentric milled edge, struck rather than cast, catching a single sheen across "
        f"the upper left. Made of {_mat}. Centred, on a deep charcoal ground. " + STYLE)))

# The program teaches a different principle in each phase, so the header moves
# with you: a band at rest, a band under load, a band at full stretch.
PHASE = [
    dict(slug="1", dir="phase", aspect="16:9", fmt="jpeg", prompt=(
        "A single resistance band at rest, gently curved, lit by one soft light. Beginning, "
        "potential, nothing strained yet. Almost entirely dark. " + STYLE)),
    dict(slug="2", dir="phase", aspect="16:9", fmt="jpeg", prompt=(
        "A single resistance band stretched taut and vibrating, light concentrated along the "
        "line of tension, faint heat haze around it. Almost entirely dark. " + STYLE)),
    dict(slug="3", dir="phase", aspect="16:9", fmt="jpeg", prompt=(
        "A single resistance band at extreme stretch, its surface texture visible, light "
        "blazing along the line, everything else in deep shadow. " + STYLE)),
]

# ── the app's own mark ──────────────────────────────────────────────────────
# Android TV requires a banner: it is what the user sees on the home row.
MARK = [
    dict(slug="icon", dir="mark", aspect="1:1", fmt="png", prompt=(
        "A bold minimal app mark: three parallel bars of light of increasing length and "
        "increasing brightness, arranged as a rising diagonal, suggesting resistance that "
        "grows through a movement. Violet to cyan gradient across the three bars. Centred on "
        "a deep charcoal ground with generous margin. Flat, geometric, confident. "
        "No text, no letters, no lettering of any kind, no logotype, no shadow.")),
    # "on the left third" was not enough: the generated mark came back hard against
    # an EDGE with more than half the frame empty - measured, the bright columns ran
    # 590..639 of 640. This is the one image on the Android TV home row, sitting
    # between Netflix and YouTube at a glance, so composition is the whole job.
    # Say where the mark sits AND where it must not, and give it a margin in the
    # same breath.
    dict(slug="banner", dir="mark", aspect="16:9", fmt="png", prompt=(
        "A wide app banner, 16:9. Three parallel bars of light of increasing length and "
        "increasing brightness, arranged as a rising diagonal, forming one compact mark. "
        "COMPOSITION IS CRITICAL: the mark is CENTRED VERTICALLY and sits in the LEFT HALF "
        "of the frame, with a clear margin of empty space on ALL FOUR SIDES of it - it must "
        "NOT touch or run off any edge, and must not be pushed into a corner. The remaining "
        "right side is a deep charcoal field with soft violet haze. Violet to cyan gradient "
        "across the three bars. Flat, geometric, confident, generous negative space. "
        "No text, no letters, no numbers, no lettering of any kind, no logotype, no "
        "watermark, no signature, no border, no frame.")),
]

# PHASE is generated on request but is NOT in ALL. Its three images were built
# for a phase header that was never implemented, and they spent two years being
# bundled into the APK and precached by the service worker while no page rendered
# them. The prompts stay because the idea is a good one and regenerating costs
# $0.24; shipping pictures nothing displays does not.
#   python tools/art/build.py --only phase     if the header is ever built
ALL = MOVES + CARDS + UI + MARK
