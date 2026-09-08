# Android WebView Performance on a Low-End Google TV

**Scope.** Reference for the X3F TV app: one `Activity`, one full-screen `WebView`, all UI as
HTML/CSS/JS loaded from `file:///android_asset/`, running on a Hisense Google TV.
`minSdk 24`, `targetSdk 34`, `compileSdk 34` (see `app/build.gradle`).

**Status legend used throughout this document:**

- **[FACT]** — verified against a primary source (AOSP source, Chromium source/docs, Android or
  Chrome developer docs, MDN). Source linked.
- **[REPORTED]** — from a credible secondary source (blog, forum, vendor doc). Treat as a strong
  hypothesis, not gospel.
- **[UNVERIFIED]** — plausible inference or widely repeated claim I could not confirm from a
  primary source in this pass. **Measure before relying on it.**
- **[MEASURE]** — a number that is device-specific by nature. The doc tells you how to get it.

---

## 0. Executive summary — the 12 highest-leverage changes for this app

Ordered by expected frames-per-second recovered per hour of work.

1. **Delete every `backdrop-filter: blur()` on a full-viewport element.** `index.html`,
   `launcher.html`, `nova.html`, `splash.html` all use `.scrim{position:fixed;inset:0;
   backdrop-filter:blur(6..10px)}` and then animate its `opacity`. That is a full-screen
   readback + separable Gaussian blur + recomposite **every frame the opacity transition runs**.
   Replace with a flat `rgba()` scrim, or a pre-blurred static image, or `filter: blur()` baked
   into a snapshot. See §3.1.
2. **Stop pushing BLE force with `evaluateJavascript` at ~60 Hz.** `MainActivity.injectForce()`
   builds a new JS source string per sample and calls `evaluateJavascript` (throttled to 16 ms).
   Each call is a UI-thread → renderer IPC plus a fresh script parse/compile. Move to
   `WebViewCompat.addWebMessageListener` + `replyProxy.postMessage` (structured data, no
   compile), or hold the latest value in a `@JavascriptInterface` getter the page polls once per
   rAF. See §9.3.
3. **Serve the app from `WebViewAssetLoader` on `https://appassets.androidplatform.net/`
   instead of `file:///android_asset/`.** `file://` is an opaque origin: no `fetch`, no
   `XMLHttpRequest`, no service worker, no module workers, and `addWebMessageListener` origin
   rules cannot match it. This one change unlocks items 2, 4 and 12. See §1.6.
4. **Collapse the multi-page app into one document with client-side routing.** Every
   `web.loadUrl(...)` today destroys the JS heap, the compiled code, the decoded image cache in
   the renderer, the `AudioContext`, and the BLE state in the page — and WebView has **no
   back/forward cache at all** (Chromium explicitly declined to support it). See §10.
5. **Pin the layout to real device pixels.** On Android TV the WebView viewport is commonly
   960×540 CSS px at `devicePixelRatio` 2 (TV design baseline is 960×540 dp). Decide
   deliberately whether you want 960 CSS px @2x or 1920 CSS px @1x — the second halves canvas
   pixel counts and raster cost at the price of hairline crispness. See §2.
6. **Audit `will-change` / `translateZ(0)` and remove all speculative promotions.** Each
   promoted layer costs `width × height × 4` bytes of GPU texture: a full-screen layer at
   1920×1080 is **8.3 MB**; at 2× DPR of a 960×540 layout it is the same 8.3 MB. Two or three
   4096×4096 layers exhaust a mobile GPU budget outright.
7. **Animate only `transform` and `opacity`.** They are the only two properties the compositor
   can handle without layout or paint. Everything else (including `box-shadow`, `filter`,
   `width`, `top`, `background-position`) repaints.
8. **One rAF loop for the whole page.** Currently every page plus `x3f-fx.js`, `x3f-form.js`,
   `x3f-hype.js`, `x3f-nav.js` runs its own `requestAnimationFrame` loop. Merge into a single
   scheduler that ticks subscribers; you pay one callback dispatch and one style/layout flush
   instead of N.
9. **Set `getContext('2d', {alpha:false})` on any canvas that covers opaque background**, and
   cap `DPR` at 1 for large full-screen canvases on TV. The code already caps at 2
   (`Math.min(devicePixelRatio||1,2)`); at 960×540 CSS that is a 1920×1080 backing store per
   canvas = **8.3 MB** each.
10. **Pre-render static canvas art once to an offscreen canvas / `ImageBitmap`** and `drawImage`
    it, instead of re-stroking paths each frame. Never call `drawImage` with a scale factor in
    the hot loop — cache the scaled copy.
11. **Add `content-visibility:auto` + `contain-intrinsic-size` to off-screen cards/rows** in
    `library.html`, `routine.html`, `progress.html`. Chrome's own case study went from 232 ms to
    30 ms of initial rendering with this one property.
12. **Turn on a permanent in-page frame monitor** (rAF delta histogram + `long-animation-frame`
    PerformanceObserver) that can be revealed with a hidden remote-control chord, so you can
    diagnose the TV without a laptop attached. See §7.

---

## 1. WebView settings that matter, and how to set them in Java

Current app code, for reference (`app/src/main/java/com/goob/x3ftv/MainActivity.java`, ~line 119):

```java
WebSettings ws = web.getSettings();
ws.setJavaScriptEnabled(true);
ws.setDomStorageEnabled(true);
ws.setMediaPlaybackRequiresUserGesture(false);
web.setBackgroundColor(0xFF05030F);
web.addJavascriptInterface(new Bridge(), "X3F");
```

That is the minimum. Below is what each knob actually does.

### 1.1 Hardware acceleration — the one that must never be wrong

**[FACT]** The manifest already has `android:hardwareAccelerated="true"` on `<application>`.
Keep it. Hardware acceleration is enabled by default for the whole app from API 14 onward and
can be toggled at application, activity, window and view level
(<https://developer.android.com/develop/ui/views/graphics/hardware-accel>).

**[FACT]** Three things silently drop WebView into *software draw*, which Chromium documents as
"very slow", using more memory, with "known missing features, such as `<video>` or `<webgl>`",
and "not maintained or well tested"
(<https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/docs/software_draw_deprecated.md>):

1. `android:hardwareAccelerated="false"` in the manifest.
2. `setLayerType(View.LAYER_TYPE_SOFTWARE, null)` on the WebView **or any ancestor View**.
3. Calling `webview.onDraw()` / `webview.draw()` yourself (e.g. to snapshot into a Bitmap).

**Rule for this app: never call `setLayerType` on the WebView at all.**
`LAYER_TYPE_HARDWARE` is also wrong — it forces the WebView into an intermediate FBO the size of
the view, doubling full-screen VRAM for no benefit, and `LAYER_TYPE_NONE` is already the correct
default. The one legitimate use of `LAYER_TYPE_SOFTWARE` on a WebView is as a workaround for a
specific driver rendering bug, and it should be considered a bug report, not an optimisation.

**[FACT]** WebView does **not** get its own GPU process. Chromium's WebView compatibility doc
lists "No separate GPU process" as an architectural difference from Chrome
(<https://chromium.googlesource.com/chromium/src/+/refs/heads/main/android_webview/docs/web-platform-compatibility.md>).
On Android, Chromium uses "an in-process GPU implementation that runs as a thread in the Browser
process" (<https://www.chromium.org/developers/design-documents/gpu-accelerated-compositing-in-chrome/>).
Practical consequence: **WebView's GPU work shares a thread with your app process.** A GPU stall
caused by a full-screen blur is not isolated from your app the way it would be in Chrome.

### 1.2 `setRenderPriority` — dead, do not use

**[FACT]** AOSP `WebSettings.java` marks it `@Deprecated` with the text:

> "It is not recommended to adjust thread priorities, and this will not be supported in future versions."

(<https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/webkit/WebSettings.java>)

**[REPORTED]** Multiple secondary sources date the deprecation to API 17/18 and describe it as a
no-op on modern WebView. Either way: **it does nothing on a Google TV. Delete any call to it.**

The modern replacement is not a thread priority but a **process** priority:

### 1.3 `setRendererPriorityPolicy` — the real priority knob (API 26+)

**[FACT]** From AOSP `WebView.java`
(<https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/webkit/WebView.java>):

| Constant | Value | Meaning (verbatim from AOSP javadoc) |
|---|---|---|
| `RENDERER_PRIORITY_WAIVED` | 0 | bound with `Context#BIND_WAIVE_PRIORITY`; renderers "will be strong targets for out of memory killing" |
| `RENDERER_PRIORITY_BOUND` | 1 | "bound with the default priority for services" |
| `RENDERER_PRIORITY_IMPORTANT` | 2 | bound with `Context#BIND_IMPORTANT` |

```java
public void setRendererPriorityPolicy(@RendererPriority int rendererRequestedPriority,
                                      boolean waivedWhenNotVisible)
```

**[FACT]** AOSP javadoc: *"The default policy is to set the priority to
`RENDERER_PRIORITY_IMPORTANT` regardless of visibility, and this should not be changed unless the
caller also handles renderer crashes with `WebViewClient#onRenderProcessGone`."*

**Recommendation for this app:** leave the default. The app is single-WebView and always
foreground; the default is already the highest priority. Do **not** set
`waivedWhenNotVisible=true` — during a workout the screen may dim or an overlay may appear and
you do not want the renderer becoming an OOM target mid-set.

### 1.4 `setOffscreenPreRaster` (API 23+)

**[FACT]** `ApiSince=23` per the .NET/Android binding metadata
(<https://learn.microsoft.com/en-us/dotnet/api/android.webkit.websettings.offscreenpreraster>).

**[FACT]** AOSP javadoc: rasters tiles when the WebView is offscreen but attached to a window;
*"Offscreen WebViews in this mode use more memory"*, with the guidance that the WebView size
should not exceed the device screen size and that it should be limited to a small number of
WebViews.

**Recommendation for this app: leave it OFF (default).** It is designed for the case of several
WebViews in a pager where one is about to be swiped in. This app has exactly one always-visible
WebView, so the setting buys nothing and costs memory. Enable it only if you later add a
pre-warmed second WebView for cross-fades.

```java
if (Build.VERSION.SDK_INT >= 23) ws.setOffscreenPreRaster(false); // explicit is better
```

### 1.5 Cache mode

**[FACT]** From AOSP `WebSettings.java` — note the constant values, which are frequently
misquoted online:

```java
public static final int LOAD_DEFAULT             = -1; // default
public static final int LOAD_NORMAL              =  0; // @deprecated, same as LOAD_DEFAULT since Honeycomb
public static final int LOAD_CACHE_ELSE_NETWORK  =  1; // use cache even if expired
public static final int LOAD_NO_CACHE            =  2; // never use cache
public static final int LOAD_CACHE_ONLY          =  3; // never use network
```

For a 100 % local `android_asset` app, cache mode is close to irrelevant — the HTTP cache is not
in the path for `file://` or for `WebViewAssetLoader`-intercepted requests. Set it only if you
later fetch remote content:

```java
ws.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK); // TV: prefer stale over a spinner
```

**Do not** set `LOAD_CACHE_ONLY` globally — the OTA update check in `doCheckUpdate()` uses
`HttpURLConnection` directly, so it is unaffected, but any future in-page fetch would break.

### 1.6 DOM storage, local content, and origins

**[FACT]** `setDomStorageEnabled` defaults to **false** in AOSP. The app correctly sets it true —
`localStorage` is how progress is persisted.

**[FACT]** Android's official guidance is to stop using `file://` for in-app content
(<https://developer.android.com/develop/ui/views/layout/webapps/load-local-content>):
`file://` and `data:` URLs are **opaque origins** that "cannot access powerful web APIs" —
`fetch()` and `XMLHttpRequest` do not work, and CORS does not apply. The recommended
replacement is `WebViewAssetLoader`, which serves the same `assets/` folder over
`https://appassets.androidplatform.net/`.

```java
// build.gradle:  implementation "androidx.webkit:webkit:1.12.0"   (or newer)
final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
        .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
        .addPathHandler("/res/",    new WebViewAssetLoader.ResourcesPathHandler(this))
        .build();

web.setWebViewClient(new WebViewClientCompat() {
    @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
        return loader.shouldInterceptRequest(r.getUrl());
    }
});
web.loadUrl("https://appassets.androidplatform.net/assets/launcher.html");
```

What this unlocks, all of which the app currently cannot use:

- `fetch()` / `XMLHttpRequest` for loading JSON exercise data instead of inlining it.
- **Service worker** — irrelevant for asset loading here, but it is the only way to keep a
  script alive across full-document navigations (it still cannot hold audio; see §9.4).
- `WebViewCompat.addWebMessageListener` with an origin allowlist — the fast, non-compiling JS
  bridge. Origin rules cannot match an opaque `file://` origin.
- ES modules and module workers, which are blocked on opaque origins in some configurations.
- Sane `localStorage` partitioning (a real origin instead of the `file://` bucket).

**Cost:** every subresource now goes through `shouldInterceptRequest` on a background thread.
That is a real per-request cost but it is a fixed startup cost for a fixed set of files, not a
per-frame cost. **[MEASURE]** if startup regresses.

Keep these at their secure defaults — the docs are explicit that they should be `false` on all
API levels:

```java
ws.setAllowFileAccessFromFileURLs(false);
ws.setAllowUniversalAccessFromFileURLs(false);
```

**[FACT]** `setAllowFileAccess` default is `true` for `targetSdkVersion` Q and below, `false` for
R and above (AOSP javadoc). This app targets 34, so it is already `false` — another reason the
`file://` approach is on borrowed time.

### 1.7 Media playback without a gesture

**[FACT]** AOSP: `setMediaPlaybackRequiresUserGesture` — *"Default is true."* The app sets it
`false`, which is correct for a TV app where there is no meaningful "tap".

**[FACT]** Chrome's autoplay policy has covered the Web Audio API since **Chrome 71**; an
`AudioContext` created before a user gesture starts in the `suspended` state and needs
`resume()` (<https://developer.chrome.com/blog/autoplay/>).

**[UNVERIFIED]** Whether `setMediaPlaybackRequiresUserGesture(false)` also lifts the *Web Audio*
gate (as opposed to only the `<audio>`/`<video>` gate) is not documented in a primary source I
could confirm. Chromium routes the WebView setting into its `AutoplayPolicy`, which suggests it
does, but **do not rely on it**. Write the defensive version:

```js
// Always safe: works whether or not the native flag covers Web Audio.
const ac = new AudioContext({latencyHint: 'interactive'});
function armAudio() {
  if (ac.state !== 'running') ac.resume();
}
addEventListener('keydown', armAudio, {once:false});   // D-pad counts as a gesture
addEventListener('pointerdown', armAudio);
// Belt and braces: the native side can also force it right after onPageFinished.
```

### 1.8 Viewport settings

**[FACT]** From the Android web-app targeting guide
(<https://developer.android.com/develop/ui/views/layout/webapps/targeting>): WebView's default
viewport width in wide-viewport mode is **980 px**, but wide viewport mode is off unless you call
`setUseWideViewPort(true)`. With it off, "layout width always matches WebView control width"
(AOSP javadoc) — which is what you want for a fixed-size TV UI.

```java
ws.setUseWideViewPort(false);     // layout width == control width
ws.setLoadWithOverviewMode(false);// default; no zoom-to-fit
ws.setTextZoom(100);              // ignore the TV's system font-size setting
ws.setSupportZoom(false);
ws.setBuiltInZoomControls(false);
ws.setDisplayZoomControls(false);
```

`setTextZoom(100)` is worth calling explicitly: Google TV exposes an accessibility font-size
control, and a user who has bumped it will otherwise get every `font-size` in your CSS scaled,
breaking a pixel-tuned TV layout.

### 1.9 Settings that are obsolete or harmful — delete on sight

| Call | Status |
|---|---|
| `setRenderPriority(...)` | **[FACT]** deprecated in AOSP, "will not be supported in future versions" |
| `setEnableSmoothTransition(...)` | **[FACT]** AOSP: *"This method is now obsolete, and will become a no-op in future."* |
| `setAppCacheEnabled(...)` | Removed from the SDK; AppCache is gone from Chromium |
| `setDatabaseEnabled(...)` | **[FACT]** AOSP: *"WebSQL is deprecated and this method will become a no-op…"* |
| `setPluginState(...)` | Long dead |
| `setLayerType(LAYER_TYPE_SOFTWARE)` | **[FACT]** forces software draw — see §1.1 |
| `setLoadsImagesAutomatically(false)` / `setBlockNetworkImage(true)` | Only useful for a network-bound page; pointless for local assets |

### 1.10 Startup cost

**[FACT]** `WebViewCompat.startUpWebView(context, config, callback)` (androidx.webkit **1.16.0+**)
moves WebView provider initialisation to a background thread and chunks the UI-thread portion
(<https://developer.android.com/develop/ui/views/layout/webapps/optimize-webview-startup>). The
doc warns about **implicit** startup triggers that pull the whole Chromium init onto the UI
thread early: `WebSettings.getUserAgentString()` on the main thread, and
`setContentView()`/`inflate()` on XML containing a `<WebView>` tag. **Android does not publish a
millisecond figure** — **[MEASURE]** on the Hisense.

For this app the WebView *is* the critical path (it is the entire UI), so the guidance is: call
`startUpWebView` as early as possible in `Application.onCreate()`, do **not** wait for the
callback, and construct the WebView in code rather than inflating it from XML.

**[FACT]** Always call `WebView.destroy()` in `onDestroy()` after removing it from its parent.
Android's memory guide describes a WebView as a "heavy anchor" holding native resources and a
whole renderer process, and notes that GC cleanup "can be significantly delayed"
(<https://developer.android.com/topic/performance/memory/guide/webview-memory>).

### 1.11 Recommended full settings block for this app

```java
WebSettings ws = web.getSettings();

// --- functional ---
ws.setJavaScriptEnabled(true);
ws.setDomStorageEnabled(true);
ws.setMediaPlaybackRequiresUserGesture(false);

// --- fixed-size TV layout, no zoom, no system font scaling ---
ws.setUseWideViewPort(false);
ws.setLoadWithOverviewMode(false);
ws.setTextZoom(100);
ws.setSupportZoom(false);
ws.setBuiltInZoomControls(false);
ws.setDisplayZoomControls(false);

// --- security defaults, stated explicitly ---
ws.setAllowFileAccess(false);
ws.setAllowContentAccess(false);
ws.setAllowFileAccessFromFileURLs(false);
ws.setAllowUniversalAccessFromFileURLs(false);
ws.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

// --- memory ---
if (Build.VERSION.SDK_INT >= 23) ws.setOffscreenPreRaster(false);

// --- rendering ---
// Never call web.setLayerType(...). Never call ws.setRenderPriority(...).
web.setBackgroundColor(0xFF05030F);   // avoids a white flash between navigations
web.setOverScrollMode(View.OVER_SCROLL_NEVER);
web.setVerticalScrollBarEnabled(false);
web.setHorizontalScrollBarEnabled(false);

// --- debug builds only ---
if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
    WebView.setWebContentsDebuggingEnabled(true);
}
```

**[FACT]** The debuggability guard above is the exact pattern Chrome's docs recommend, because
"Enabling web contents debugging allows the state of any WebView in the app to be inspected and
modified by the user via adb. This is a security liability and should not be enabled in
production builds." (AOSP `WebView.java` javadoc.)

---

## 2. The TV viewport: 960 CSS px is probably what you have

This is the single most misunderstood thing about HTML on Android TV.

**[FACT]** Android's own TV design guidance says to design at **960 × 540 dp** ("Always design at
MDPI resolution at 960px × 540px, where at MDPI 1px = 1dp"), with assets authored at 1080p, a 5 %
overscan safe area, 48 dp left/right and 24–27 dp top/bottom margins, a 12-column grid of 52 dp
columns with 20 dp gutters
(<https://developer.android.com/design/ui/tv/guides/styles/layouts>).

**[FACT]** A 1080p Android television reports `DENSITY_XHIGH` (320 dpi); 4K TV panels are
described as 2× a 1080p `DENSITY_XHIGH` screen (same source family / `DisplayMetrics`).

**[REPORTED]** Developers packaging web apps for Android TV consistently report the WebView
laying out at **960 × 540 CSS px on HD, 4K and 8K sets alike**, i.e. `devicePixelRatio ≈ 2`
regardless of panel resolution
(<https://forum.ionicframework.com/t/android-tv-webview-resolution-seems-to-be-1-2-hd-960x540-for-all-devices-hd-4k-8k/246839>).

**[MEASURE] — do this first, before any other tuning.** Put this on the launcher page and read it
off the TV screen:

```js
document.title = [
  'inner',  innerWidth + 'x' + innerHeight,
  'dpr',    devicePixelRatio,
  'screen', screen.width + 'x' + screen.height,
  'avail',  screen.availWidth + 'x' + screen.availHeight,
].join(' ');
document.body.insertAdjacentHTML('afterbegin',
  '<pre style="position:fixed;left:8px;top:8px;z-index:9999;color:#0f0;font:14px monospace">'
  + document.title + '</pre>');
```

### Why it matters so much

Every raster and every canvas backing store scales with **device** pixels, not CSS pixels.

| Layout choice | CSS px | DPR | Device px rastered | Full-screen layer VRAM (4 B/px) |
|---|---|---|---|---|
| Default TV behaviour | 960 × 540 | 2 | 1920 × 1080 | **8.29 MB** |
| Forced 1× | 1920 × 1080 | 1 | 1920 × 1080 | **8.29 MB** |
| Canvas capped at DPR 1 in a 960 layout | 960 × 540 | 1 | 960 × 540 | **2.07 MB** |

**[FACT]** Layer texture cost is `width × height × 4` bytes for RGBA; a 2048×2048 layer costs
16 MB and a 4096×4096 layer costs 64 MB, and "two or three" 4096×4096 layers "exhaust the mobile
GPU budget entirely"
(<https://www.browser-rendering.com/compositing-and-gpu-acceleration/hardware-acceleration-limits/gpu-memory-limits-in-chrome-compositing/>).
When you blow the budget the compositor evicts tiles, re-rasters them synchronously on a raster
worker and stalls the frame; in the worst case it falls back to software raster. Both break the
16.6 ms budget.

### The lever

The app's canvases currently do `DPR = Math.min(devicePixelRatio||1, 2)` (in `bloom.html`,
`duel.html`, `flow.html`, `nova.html`, `rhythm.html`, `splash.html`, `x3f-fx.js`,
`x3f-form.js`). On a TV that resolves to **2**, so each full-bleed canvas allocates a 1920×1080
backing store and every `fillRect`/`drawImage` touches 2.07 M pixels.

For a TV viewed from 2–3 m, **DPR 1 is visually indistinguishable for canvas particle/effect
layers** and quarters the fill cost. Text and vector UI should stay at native DPR (that is CSS,
not canvas, so it costs nothing extra).

```js
// TV heuristic: full-bleed effect canvases render at 1x, small crisp canvases at native.
const IS_TV = matchMedia('(pointer: none)').matches || innerWidth <= 1280;
const bigCanvas = (cv) => cv.clientWidth * cv.clientHeight > 300000;
function dprFor(cv){ return (IS_TV && bigCanvas(cv)) ? 1 : Math.min(devicePixelRatio||1, 2); }
```

**[UNVERIFIED]** `matchMedia('(pointer: none)')` as a TV detector — Android TV WebView should
report no pointer, but confirm on the Hisense; a safer signal is a flag injected by
`MainActivity` (`window.__x3fIsTV = true`) since you control the shell.

### Forcing a 1× viewport (if you decide you want 1920 CSS px)

There are three levers and they interact badly:

1. `<meta name="viewport" content="width=1920">` in the page.
2. `webView.setInitialScale(int)` from Java.
3. `ws.setUseWideViewPort(true)` (required for the meta tag to be honoured at all).

**[REPORTED]** `setInitialScale()` has a long-standing bug where the scale is applied to the first
page load but not to subsequent `loadUrl()` navigations. For a multi-page app that does full
document navigations (this one), that is a trap: your launcher will be right and every game page
will be wrong. Another argument for §10 (single document).

**Recommendation:** do **not** fight the platform. Accept 960 × 540 CSS px, treat it as the
design grid (it is literally Android's own TV design grid), size everything in `vh`/`vw` and
`clamp()`, and control cost by capping canvas DPR instead.

---

## 3. What is expensive in a WebView on a TV

TV SoCs (Amlogic / MediaTek / Realtek class) have GPUs roughly an order of magnitude weaker than
a mid-range phone of the same year, driving a **1920 × 1080 or higher** framebuffer, with slow
LPDDR4 and often no more than ~1.5–2 GB of RAM. Fill rate and memory bandwidth are the binding
constraints, not JS execution.

Ordered from most to least dangerous.

### 3.1 `backdrop-filter` — the number one offender

**What it does per frame:** copies the region of the *backdrop* behind the element out of the
framebuffer, applies the filter (a two-pass separable Gaussian for `blur`), then composites the
element over it. The cost scales with **blur radius × pixel area of the element**.

**[REPORTED]** Blur radius and element area jointly drive GPU time on low-end Android; a 12 px
blur on a 300 × 200 card is negligible, but a large-radius blur across a big surface needs frame
budget watching, and **animating** anything that re-triggers the backdrop copy "will tank
performance on anything below a flagship device"
(<https://empire-ui.com/blog/backdrop-filter-css>, <https://www.f22labs.com/blogs/how-css-properties-affect-website-performance/>).

**In this codebase.** `grep` finds `backdrop-filter` in `arena.html`, `bloom.html`,
`calibrate.html`, `duel.html`, `flow.html`, `index.html`, `launcher.html`, `nova.html`,
`rhythm.html`, `routine.html`, `splash.html`, `x3f-form.js`, `x3f-fx.js`. The worst instances:

```css
/* index.html:72 and launcher.html:72 */
.scrim{position:fixed;inset:0;z-index:40;...;background:rgba(4,2,12,.82);backdrop-filter:blur(6px)}

/* nova.html:42 — full-viewport, 10px blur, AND an opacity transition */
.scrim{position:fixed;inset:0;background:rgba(6,4,18,.78);
       backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
       opacity:0;transition:opacity .25s;...}

/* splash.html:51 — same shape, 9px */
```

A `position:fixed;inset:0` element is **the entire framebuffer**: 1920 × 1080 = 2.07 M pixels
read, blurred twice (horizontal + vertical pass at radius r ⇒ ~2 × (2r+1) texture samples per
pixel), and written back, **on every frame of the 250 ms opacity transition** — roughly 15 frames
at 60 Hz. At blur(10px) that is on the order of 2.07 M × 42 samples ≈ 87 M texture fetches per
frame. A TV GPU will not do that in 16.6 ms.

**Fixes, in order of preference:**

1. **Drop the blur on full-screen scrims entirely.** Raise the scrim alpha instead
   (`rgba(4,2,12,.92)`). Visually, at 2 m viewing distance, nobody can tell.
2. If you want the glass look, **blur once into an image**: draw the page state to a canvas at
   1/8 scale, apply `filter:blur(2px)` to that small canvas, then upscale it with CSS
   `transform:scale(8)`. Blurring a 240 × 135 surface is 64× cheaper than blurring 1920 × 1080,
   and the upscale is free (bilinear on the GPU).
3. Keep `backdrop-filter` **only** on genuinely small chips — the `.status` pill
   (`index.html:25`) and `.chip` (`splash.html:38`) are small enough to be defensible.
   **[MEASURE]** anyway.
4. Never animate a property on an element that has `backdrop-filter`. If the scrim must fade,
   fade a sibling solid overlay and toggle the blurred layer's `visibility` at the ends.

### 3.2 `filter: blur()` on live content

Same Gaussian, applied to the element's own rendering rather than the backdrop. Slightly cheaper
(no framebuffer readback) but still paint-bound and still scales with area × radius.
`filter` is **not** a compositor-only property; changing it repaints.

**Safe pattern:** pre-blur at authoring time into a PNG/WebP, or blur a small canvas and scale it
up (§3.1 #2). If you must blur live content, blur a **downscaled copy**.

### 3.3 `box-shadow`, especially with `border-radius`

**[REPORTED]** Chrome cannot optimise the combination of `box-shadow` + `border-radius`, making
paint "very expensive"; large blur radii across many layered shadows on many elements add up
badly on low-powered devices, and animating shadow blur/spread forces a repaint every frame
(<https://tobiasahlin.com/blog/how-to-animate-box-shadow/>,
<https://www.sitepoint.com/css-box-shadow-animation-performance/>).

**In this codebase.** `index.html` and `launcher.html` have **12 `box-shadow` declarations each**;
`routine.html` 7, `nova.html` 5, `arena.html` and `splash.html` 4. `index.html:25` and
`launcher.html:25` transition `box-shadow` directly:

```css
transition: transform .12s, box-shadow .12s, border-color .12s
```

Every D-pad focus move therefore triggers a **repaint** of the focused and the previously focused
card, not just a recomposite. On a TV where the user is holding down the D-pad and scrolling a
row, that is a repaint per 120 ms.

**The fix (the standard one, and it is genuinely free):** put the shadow on a pseudo-element and
animate *its* opacity.

```css
.card { position: relative; }
.card::after {
  content: "";
  position: absolute; inset: 0; border-radius: inherit;
  box-shadow: 0 0 0 3px var(--focus), 0 12px 34px rgba(120,80,255,.45);
  opacity: 0;
  transition: opacity .12s linear;   /* compositor-only */
  pointer-events: none;
}
.card:focus-within::after, .card.sel::after { opacity: 1; }
/* and the lift: */
.card { transition: transform .12s ease-out; }
.card.sel { transform: translateZ(0) scale(1.06); }
```

Static shadows at rest cost essentially nothing (they are baked into the layer's raster once).
It is **animating** them that hurts.

### 3.4 Large repaints and paint area

Paint cost is proportional to the number of device pixels re-rastered. On a TV that means a
full-screen invalidation is 2.07 M pixels through the raster path. Common accidental causes:

- Changing a property on a `position:fixed;inset:0` element (see scrims above).
- Changing `background` / `background-position` on the `<body>`.
- Changing `color` or `text-shadow` on a large text block.
- A CSS keyframe animation on a non-composited property anywhere near the top of the stacking
  order (it can invalidate everything painted under it).
- `border-radius` + `overflow:hidden` on a large scrolling container — forces a mask.

**Diagnostic without DevTools:** temporarily set `* { outline: 1px solid rgba(255,0,0,.15) }` —
no. Better: use the **on-device** overdraw and rendering visualisers (§7.5), which need no laptop.

### 3.5 Layout thrash

**[FACT]** Layout is "almost always scoped to the entire document"; a Chrome DevTools trace in
Google's own article showed "over 28 milliseconds … spent inside layout for each frame" on a
1,618-element DOM, against a 16 ms budget
(<https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing>).

**[FACT]** The complete list of geometry reads that force a synchronous layout, from Paul Irish's
canonical list (<https://gist.github.com/paulirish/5d52fb081b3570c81e3a>):

- **Element box metrics:** `offsetLeft`, `offsetTop`, `offsetWidth`, `offsetHeight`,
  `offsetParent`, `clientLeft`, `clientTop`, `clientWidth`, `clientHeight`,
  `getClientRects()`, `getBoundingClientRect()`
- **Scrolling:** `scrollBy()`, `scrollTo()`, `scrollIntoView()`, `scrollIntoViewIfNeeded()`,
  `scrollWidth`, `scrollHeight`, `scrollLeft`, `scrollTop`
- **Focus:** `focus()`  ← **this is the TV killer, see below**
- **Other element APIs:** `computedRole`, `computedName`, `innerText`
- **Window:** `scrollX`, `scrollY`, `innerHeight`, `innerWidth`,
  `visualViewport.height/width/offsetTop/offsetLeft`
- **Document:** `elementFromPoint()`
- **Forms:** `input.focus()`, `input.select()`, `textarea.select()`
- **Mouse events:** `layerX`, `layerY`, `offsetX`, `offsetY`
- **`getComputedStyle()`**
- **Range:** `range.getClientRects()`, `range.getBoundingClientRect()`
- **SVG:** `computeCTM()`, `getBBox()`, `getCharNumAtPosition()`, `getComputedTextLength()`,
  `getEndPositionOfChar()`, `getExtentOfChar()`, `getNumberOfChars()`, `getRotationOfChar()`,
  `getStartPositionOfChar()`, `getSubStringLength()`, `selectSubString()`, `instanceRoot`

**Why `focus()` matters here.** `x3f-nav.js` implements D-pad navigation. The classic pattern is:

```js
// BAD: write, read, write — forced synchronous layout per keypress
el.classList.add('sel');                 // write (invalidates style+layout)
el.scrollIntoView({block:'center'});     // read + write  → forced layout
const r = el.getBoundingClientRect();    // read          → forced layout again
```

**Fix:** batch. Read all geometry first, then write all styles, and prefer a single
`transform: translate3d()` on the *track* over `scrollIntoView` on the *item*:

```js
// GOOD: one read pass (cached at load), one write pass, compositor-only motion
const offsets = items.map(el => el.offsetLeft);   // read once, on resize only
function select(i) {
  track.style.transform = `translate3d(${-(offsets[i] - centreX)}px,0,0)`; // write
  prev.classList.remove('sel'); items[i].classList.add('sel');             // write
}
```

### 3.6 Big canvases

See §2 for the pixel arithmetic and §5 for the canvas playbook. The short version: a full-bleed
canvas at DPR 2 on a TV is a 1920 × 1080 surface, 8.29 MB of backing store, and every
`clearRect` + redraw touches all of it. Multiple such canvases stack linearly.

### 3.7 Many `requestAnimationFrame` loops

The browser runs **one** animation-frame callback list per document, so N loops do not create N
frames — but they do create N callback invocations, N chances to force layout, and N independent
`Date.now()`/state updates that the engine cannot coalesce or reason about.

`grep -c requestAnimationFrame` in `app/src/main/assets/` shows loops in every page plus
`x3f-fx.js` (2), `x3f-hype.js` (3), `x3f-nav.js` (3), `x3f-form.js` (2). So a game page can have
**5–7 concurrent rAF loops**.

**Fix — one scheduler:**

```js
// x3f-tick.js
const subs = new Set();
let running = false, last = 0;
function frame(t) {
  const dt = last ? Math.min(t - last, 100) : 16.7;   // clamp after a stall
  last = t;
  for (const fn of subs) { try { fn(t, dt); } catch (e) {} }
  if (subs.size) requestAnimationFrame(frame); else running = false;
}
export function onTick(fn) {
  subs.add(fn);
  if (!running) { running = true; last = 0; requestAnimationFrame(frame); }
  return () => subs.delete(fn);
}
```

Rules for subscribers: **no DOM reads inside a tick** (cache geometry on resize), and no
`style.left/top/width` writes — `transform` and `opacity` only.

### 3.8 CSS animations on non-composited properties

**[FACT]** "Today there are only two properties for which that is true — transforms and opacity"
(<https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count>). That
article also gives the budget target: **~4–5 ms in compositing** during a scroll or transition.

Anything else — `width`, `height`, `top`, `left`, `margin`, `padding`, `box-shadow`, `filter`,
`background-color`, `border-radius`, `color`, `clip-path` — goes through layout and/or paint each
frame.

Common substitutions:

| Instead of | Use |
|---|---|
| `width`/`height` animation | `transform: scaleX()/scaleY()` on a wrapper (compensate children with inverse scale) |
| `top`/`left` | `transform: translate3d()` |
| `box-shadow` fade | pseudo-element `opacity` (§3.3) |
| `background-color` cross-fade | two stacked layers, cross-fade `opacity` |
| gradient sweep / progress bar fill | `transform: scaleX()` with `transform-origin: left` |
| `filter: brightness()` pulse | overlay a white layer, animate its `opacity` |

**Progress/force meter specifically** (this app's core UI): drive it with `scaleX`, never `width`.

```css
.meter-fill { transform-origin: left center; will-change: transform; }
```
```js
fill.style.transform = `scaleX(${Math.min(1, force / target)})`;
```

---

## 4. Getting GPU-composited animation reliably

### 4.1 The only two safe properties

`transform` and `opacity`. **[FACT]**, see §3.8.

### 4.2 What actually promotes an element to its own layer

**[FACT]** Chromium's compositing triggers, verbatim from the design doc
(<https://www.chromium.org/developers/design-documents/gpu-accelerated-compositing-in-chrome/>):

- Layer has 3D or perspective transform CSS properties
- Layer is used by `<video>` element using accelerated video decoding
- Layer is used by `<canvas>` element with a 3D context or accelerated 2D context
- Layer is used for a composited plugin
- Layer uses a CSS animation for its opacity or uses an animated webkit transform
- Layer uses accelerated CSS filters
- Layer has a descendant that is a compositing layer
- Layer has a sibling with a lower z-index which has a compositing layer

Note the last two: **promotion is contagious.** Promoting one card can promote its ancestors and
any lower-z sibling that overlaps it. That is the mechanism behind "layer explosion".

**[FACT]** Blink mitigates this by **squashing** multiple overlapping RenderLayers into a single
backing store, but squashing has limits and cannot always apply.

### 4.3 `will-change`: use it, but as a scalpel

**[FACT]** MDN's warnings, quoted:

> "Don't apply `will-change` to too many elements … Overusing the property can cause the page to slow down instead of improving it's performance."

> "`will-change` is intended to be used as a last resort to try to deal with existing performance problems."

> "adding `will-change` directly to a stylesheet implies that the targeted elements are always a few moments away from changing and the browser will keep the optimizations for a much longer time than it would have otherwise."

(<https://developer.mozilla.org/en-US/docs/Web/CSS/will-change>)

**Memory arithmetic to make the cost concrete.** Each promoted layer needs a texture of
`w × h × 4` bytes:

| Element | CSS size @ DPR 2 | Device px | VRAM |
|---|---|---|---|
| Focus card | 268 × 160 | 536 × 320 | 0.69 MB |
| A row of 5 cards, each promoted | — | — | **3.4 MB** |
| Full-screen scrim | 960 × 540 | 1920 × 1080 | **8.29 MB** |
| 20 promoted library tiles | 196 × 120 each | 392 × 240 | **3.0 MB** |

Add the compositor's own tile memory on top of that. On a 1.5 GB TV where the WebView renderer
already sits at tens of MB, a careless `.card{will-change:transform}` across a 40-tile library
is a real OOM risk.

**The correct pattern — promote on demand, demote immediately:**

```js
function hint(el)   { el.style.willChange = 'transform, opacity'; }
function unhint(el) { el.style.willChange = 'auto'; }

card.addEventListener('transitionstart', () => hint(card));
card.addEventListener('transitionend',   () => unhint(card));
card.addEventListener('transitioncancel',() => unhint(card));
```

For D-pad UIs, hint the **next** candidate on key-down and unhint the old one on
`transitionend`. Never leave `will-change` in a static stylesheet for a class that applies to
more than a handful of nodes at once.

**`transform: translateZ(0)` vs `will-change: transform`.** `translateZ(0)` is the older hack. It
promotes unconditionally and permanently, and it also silently changes stacking context and can
blur text (the layer is rastered independently). **[REPORTED]** One Android TV Cordova write-up
chose `translateZ(0)` over `will-change` specifically because overusing `will-change` "causes
enough overhead to decrease the performance" and because older WebViews had patchy `will-change`
support (<https://blog.hao.dev/improving-css-performance-of-cordova-apps-on-android-tvs/>).
On a Google TV with an updatable modern WebView, `will-change` support is not a concern —
prefer `will-change`, applied dynamically.

### 4.4 Avoiding layer explosion — a checklist

- Never put a promoting property on a class that matches > ~10 elements simultaneously.
- Keep animated elements **on top** in z-order. An animated layer forces everything overlapping
  it above in z-order into layers too.
- Do not nest promoted elements inside promoted elements.
- Prefer moving **one** container (`transform` on the row track) over moving N children.
- Give animated elements a `transform` in their resting state too (`translate3d(0,0,0)`) so the
  layer doesn't get created and destroyed on every interaction — but only if you have *also*
  bounded how many such elements exist.
- Remember: `position:fixed`, `filter`, `backdrop-filter`, `opacity < 1` animations, `<canvas>`,
  `<video>` and `mix-blend-mode` are all implicit promoters.

### 4.5 `content-visibility` — the biggest cheap win for list screens

**[FACT]** `content-visibility: auto` makes the browser skip **styling, layout, painting and
hit-testing** for off-screen subtrees; `contain-intrinsic-size` supplies a placeholder size so
scrollbars don't jump. Supported in Chrome/Edge 85+. Chrome's own case study measured initial
rendering "going from **232ms** to **30ms**" (≈7×), and Facebook reported "up to 250ms
improvement in navigation times"
(<https://web.dev/articles/content-visibility>).

Apply to any repeated card in `library.html`, `routine.html`, `progress.html`:

```css
.tile {
  content-visibility: auto;
  contain-intrinsic-size: auto 196px 260px;  /* w h, remembers last rendered size */
}
```

**Caveat for a D-pad app:** hit-testing is skipped for off-screen content, and so is layout — so
`el.getBoundingClientRect()` on an off-screen tile returns a placeholder. Your focus engine must
navigate by index/model, not by geometry, or must `scrollIntoView` before measuring. This app's
`x3f-nav.js` should be checked against that.

Related, and cheaper to reason about: `contain: layout paint` on any self-contained widget (the
force meter, the rep counter) tells the engine that changes inside cannot affect layout outside,
scoping the layout invalidation.

---

## 5. Canvas performance

### 5.1 Sizing: DPR on a TV

Covered in §2. The decision table:

| Canvas role | Recommended backing size |
|---|---|
| Full-bleed particle / background FX (`bloom`, `splash`, `nova` bg) | **DPR 1** — 960 × 540 |
| Mid-size gameplay canvas | DPR 1 on TV, DPR 2 elsewhere |
| Small crisp readouts (force dial, sparkline) | native DPR, capped at 2 |
| Anything with text drawn into it | native DPR (text at 1× on a big TV looks soft) |

Always set the transform after resizing, and always resize by assigning `.width`/`.height`
(which also clears the canvas):

```js
function fit(cv, dpr) {
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width === (w*dpr|0) && cv.height === (h*dpr|0)) return false;  // avoid needless clear
  cv.width = w * dpr | 0; cv.height = h * dpr | 0;
  cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  return true;
}
```

The `if` guard matters: reassigning `canvas.width` reallocates the backing store and resets all
context state even when the size is unchanged. The current `resize()` functions in the game pages
do not guard, so any spurious resize event costs a full reallocation.

### 5.2 Context creation flags

**[FACT]** from MDN (<https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext>):

- **`alpha: false`** — "If set to `false`, the browser now knows that the backdrop is always
  opaque, which can speed up drawing of transparent content and images." **Use this on every
  full-bleed canvas that paints its own background.** It also lets the compositor skip blending
  the canvas layer against what is below it.
- **`desynchronized: true`** — "hints the user agent to reduce the latency by desynchronizing the
  canvas paint cycle from the event loop." Useful for a latency-sensitive force meter.
  **[UNVERIFIED]** on Android WebView specifically — it can produce tearing and is a hint only.
  **[MEASURE]**; ship it only if it visibly helps.
- **`willReadFrequently: true`** — "will force the use of a software (instead of hardware
  accelerated) 2D canvas". **Never set this on an animating canvas.** It is only for canvases you
  `getImageData()` from repeatedly and never animate. Note `x3f-fx.js:87` uses
  `createImageData` — check whether that canvas would benefit, but it is a one-shot noise
  generator, so leave it hardware-accelerated and just do it once.
- `colorType: 'float16'` — increases memory. Do not use.

```js
const ctx = cv.getContext('2d', { alpha: false });
```

### 5.3 Pre-rendering to an offscreen canvas

**[FACT]** MDN's canvas optimisation guidance
(<https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas>):

- "If you find yourself repeating some of the same drawing operations on each animation frame,
  consider offloading them to an offscreen canvas."
- Avoid sub-pixel coordinates: "Sub-pixel rendering occurs when you render objects on a canvas
  without whole values" and it "forces the browser to do extra calculations to create the
  anti-aliasing effect." Use `Math.floor()` / `| 0`.
- Do not scale in `drawImage()`: "Cache various sizes of your images on an offscreen canvas when
  loading as opposed to constantly scaling them."
- Use layered canvases for static + dynamic content.
- Use CSS `background` on a `<div>` for large static backgrounds instead of painting them.
- "CSS transforms are faster since they use the GPU" — scale the canvas with CSS, not by
  redrawing at a larger size.
- Batch draw calls; minimise context state changes; **avoid `shadowBlur`**; avoid text rendering
  in the hot loop; use `requestAnimationFrame`, not `setInterval`.

Concrete pattern for this app's sprites (`assets/bloom/*.png`, `assets/splash/*.png`):

```js
// Build every size you will ever draw, once, at load.
const sprites = new Map();
async function bake(url, sizes) {
  const img = await createImageBitmap(await (await fetch(url)).blob());
  for (const s of sizes) {
    const c = document.createElement('canvas');
    c.width = s; c.height = Math.round(s * img.height / img.width);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    sprites.set(url + '@' + s, c);          // draw this, unscaled, in the loop
  }
  img.close();
}
```

Note `fetch()` requires §1.6 (`WebViewAssetLoader`); with `file://` you must fall back to
`new Image()` + `createImageBitmap(img)` after `decode()`.

### 5.4 `ImageBitmap`

`createImageBitmap()` decodes and (optionally) resizes an image **off the main thread**, giving
you a GPU-friendly, already-decoded object that `drawImage` can blit without a decode step. It
avoids the classic first-frame hitch where an `<img>` decodes lazily inside the rAF callback.

```js
// Decode ahead of the first frame instead of during it.
const bmp = await createImageBitmap(imgEl, { resizeWidth: 256, resizeQuality: 'high' });
ctx.drawImage(bmp, x, y);
// bmp.close() when done — ImageBitmaps hold GPU memory until explicitly closed.
```

**Always call `.close()`.** An `ImageBitmap` is not garbage-collected promptly; leaking a few
1920×1080 bitmaps is 8 MB each.

**[UNVERIFIED]** Exact Android WebView version that shipped `createImageBitmap` — I could not
confirm a version number from a primary source in this pass. It is Chromium ≥ 50-era and will be
present on any Google TV with an updatable WebView, but feature-detect:

```js
const hasBitmap = typeof createImageBitmap === 'function';
```

### 5.5 `OffscreenCanvas`

**[FACT]** Android WebView and Chrome for Android list OffscreenCanvas support from **version 69**
(<https://caniwebview.com/features/mdn-offscreencanvas/>).

**[REPORTED]** Full coverage arrived later: "in WebView 91 most things are supported, but there
are still 4 not supported, and in WebView 120 everything is supported." Treat WebView ≥ 120 as
the safe floor for full OffscreenCanvas + worker rendering.

**[FACT]** `transferControlToOffscreen()` is one-way: after transfer, `getContext()` on the
original `<canvas>` throws `InvalidStateError`
(<https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/transferControlToOffscreen>).

**Two distinct uses — do not confuse them:**

1. **Worker rendering** (`canvas.transferControlToOffscreen()` → `postMessage` to a Worker). This
   moves *all* canvas drawing off the main thread, so a JS stall in the UI does not stall the
   animation. Workers support `requestAnimationFrame`. **This is the right architecture for a
   game page whose main thread is also handling BLE force messages and D-pad input.**
2. **Pure offscreen buffering** (`new OffscreenCanvas(w,h)` on the main thread) — a drop-in
   replacement for a detached `<canvas>` used as a scratch buffer. No threading benefit, slightly
   lighter than a DOM canvas.

Worth doing for `nova.html` / `bloom.html` / `splash.html` if profiling shows main-thread
contention. **Not** worth doing before you have measured, because the force-value plumbing has to
be forwarded to the worker.

### 5.6 Canvas rules of thumb for this app

- One clear per frame: `ctx.clearRect(0,0,w,h)` is generally cheaper than `fillRect` when the
  context is `alpha:true`; with `alpha:false` a `fillRect` of the background colour is required
  and is fine. **[FACT]** MDN lists "Try different canvas clearing methods" as a thing to
  benchmark — it is device-dependent. **[MEASURE]**
- Never `save()`/`restore()` per particle. Set state once per batch.
- Never set `ctx.font`, `ctx.shadowBlur`, or `ctx.filter` inside a per-particle loop.
- Round all coordinates: `ctx.drawImage(s, x|0, y|0)`.
- Prefer a single `path` with many `moveTo/lineTo` and one `stroke()` over N `stroke()` calls.
- Keep particle counts adaptive: measure frame time and shed particles when the 90th-percentile
  frame exceeds 20 ms (see §7.2 for the monitor that gives you that number).

---

## 6. Images: WebP and AVIF on a TV

### 6.1 What `minSdk 24` can actually rely on

The important nuance: **on Android 5.0 (API 21) and later, WebView is a separately updatable
component** delivered through Play. What matters is therefore not your `minSdk` but the WebView
version on the device.

**[FACT]** WebView packaging by OS version
(<https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/docs/faq.md>,
<https://developer.chrome.com/docs/webview>):

- Android 7, 8, 9: "WebView is built into Chrome" — the Chrome APK provides the WebView.
- Android 10+: separate `Android System WebView` app, still sharing most code with Chrome.
- Google "no longer supports devices running Android 5-9"; those devices are frozen on the last
  supported WebView release and receive no further updates.

Practical rule for this app:

- A **Google TV** (Android TV OS 11/12/14) has an **updatable, recent WebView**, almost certainly
  Chromium ≥ 120. **[MEASURE]** it once, print it, and gate features on it.
- A device stuck on API 24–28 (which `minSdk 24` permits) may have a **frozen** WebView. Do not
  ship AVIF-only assets.

```java
// Log the actual WebView version — do this once at boot and surface it to JS.
PackageInfo pi = WebViewCompat.getCurrentWebViewPackage(getApplicationContext());
String wv = (pi != null) ? pi.versionName : "unknown";   // may be null on odd devices
web.evaluateJavascript("window.__x3fWebView='" + wv + "'", null);
```

**[FACT]** `getCurrentWebViewPackage()` "can return `null` if the device is set up incorrectly;
doesn't support using `WebView` … or lacks an updatable `WebView` implementation."

### 6.2 WebP

**[FACT]** Chrome for Android has supported WebP since **version 18**
(<https://caniwebview.com/features/web-feature-webp/>); the same table marks Android WebView as
supported without a version number.

**[REPORTED]** Android platform-level WebP support: lossy from Android 4.0, lossless + alpha from
4.2.1; **animated** WebP requires a Chromium 32+ engine
(<https://developers.google.com/speed/webp/faq>).

**Conclusion: WebP is a safe default for every image in this app.** Any WebView old enough to
lack it is older than `minSdk 24` allows.

Convert the existing assets — `assets/ui/aurora.jpg`, `badge-0..4.jpg`, and the PNG sprites in
`assets/bloom/` and `assets/splash/`:

```bash
# lossy for photos/backgrounds
cwebp -q 82 -m 6 aurora.jpg -o aurora.webp
# lossless with alpha for sprites
cwebp -lossless -alpha_q 100 -m 6 petal.png -o petal.webp
```

Expect roughly 25–35 % smaller than JPEG at equal quality and 20–30 % smaller than PNG for
sprites **[UNVERIFIED as an exact figure for these specific assets — measure]**. The win on a TV
is not bandwidth (assets are local) but **decode time and peak decode memory** during page load,
which is on the critical path of every full-document navigation this app performs.

### 6.3 AVIF

**[FACT]** Chrome for Android supports AVIF from **version 85**
(<https://caniwebview.com/features/web-feature-avif/>); the same table marks Android WebView as
supported (no version number given).

**[REPORTED]** — and this is the important part — AVIF on Android decodes **in software**. A
Chromium media-dev thread notes that because it happens in software, "the performance on mobile
CPUs is unusably bad" for larger images, and Android enablement was gated behind a dynamic
feature module for the AV1 decoder
(<https://groups.google.com/a/chromium.org/g/media-dev/c/9uHYfktPtSc>).

**Recommendation: do not use AVIF in this app.** A TV SoC's CPU is weaker than the phones that
comment referred to, the assets are local (so file size is nearly free), and AVIF decode would
land squarely on the page-load critical path. **WebP is the right format here.** If you ever want
AVIF, feature-detect and use `<picture>`:

```html
<picture>
  <source srcset="aurora.avif" type="image/avif">
  <source srcset="aurora.webp" type="image/webp">
  <img src="aurora.jpg" alt="" decoding="async" fetchpriority="low">
</picture>
```

### 6.4 Image hygiene that matters more than format

- **Author at the size you display.** A 1920-wide JPEG scaled into a 268 dp card wastes decode
  time and memory (`w × h × 4` bytes decoded, regardless of file size). `aurora.jpg` shown as a
  full-screen background at 960 × 540 CSS / 1920 × 1080 device px decodes to **8.29 MB** of
  bitmap.
- Use `decoding="async"` on non-critical images and `loading="lazy"` on off-screen ones.
- Prefer CSS gradients over gradient images — zero decode, and they raster into the layer.
- Prefer a single sprite sheet + `background-position` (or one `ImageBitmap` + `drawImage`
  sub-rects) over many small files: fewer decodes, fewer GPU texture uploads.
- Never animate `background-image` swapping — each swap is a decode + upload.

---

## 7. Measuring frame cost from inside the page (no DevTools attached)

This is the section that pays for itself on a TV, where attaching a laptop is a chore.

### 7.1 rAF delta histogram — works everywhere, zero dependencies

```js
// x3f-perf.js — always compiled in; UI only revealed by a remote-control chord.
(function () {
  const N = 240;                       // ~4 s at 60 Hz
  const d = new Float32Array(N);
  let i = 0, last = 0, worst = 0, frames = 0, longFrames = 0;

  function tick(t) {
    if (last) {
      const dt = t - last;
      d[i++ % N] = dt;
      frames++;
      if (dt > 20) longFrames++;
      if (dt > worst) worst = dt;
    }
    last = t;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  window.__x3fPerf = function () {
    const a = Array.from(d).filter(Boolean).sort((x, y) => x - y);
    const q = p => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;
    return {
      fps:  a.length ? (1000 / (a.reduce((s, v) => s + v, 0) / a.length)).toFixed(1) : 0,
      p50:  q(.50).toFixed(1),
      p90:  q(.90).toFixed(1),
      p99:  q(.99).toFixed(1),
      worst: worst.toFixed(1),
      jankPct: frames ? (100 * longFrames / frames).toFixed(1) : 0,
    };
  };
})();
```

**How to read it.** `p50` near 16.7 with `p90` near 16.7 is a healthy 60 Hz. `p50` 16.7 with
`p90` 33 means you drop roughly one frame in ten — usually a GC pause or a periodic repaint.
`p50` 33 means you are locked at 30 fps: something structural (fill rate, a full-screen blur) is
over budget every frame.

**Caveat [FACT-adjacent, important]:** the rAF timestamp measures the *interval between frame
callbacks*, not the *work in your callback*. If the compositor is the bottleneck and your JS is
trivial, deltas still stretch — which is exactly what you want on a TV, because it catches GPU
stalls that a JS-only profiler misses. To separate the two, also time your own callback:

```js
const t0 = performance.now();
render();
const jsMs = performance.now() - t0;     // your JS+forced-layout share of the frame
```

If `jsMs` is 3 ms but the delta is 33 ms, the problem is paint/composite, not your code.

### 7.2 `long-animation-frame` (LoAF) — the good one

**[FACT]** The Long Animation Frames API shipped in **Chrome 123** (origin trial 116–122). It
reports rendering updates delayed beyond **50 ms**, aggregating *all* tasks that made up the
frame plus the rendering work, and attributes each contributing script over **5 ms** with
`invoker`, `invokerType`, `sourceURL`, `sourceFunctionName`, `sourceCharPosition`, and
`forcedStyleAndLayoutDuration` (which is literally your layout-thrash meter). Entry fields
include `startTime`, `duration`, `renderStart`, `styleAndLayoutStart`, `blockingDuration`,
`firstUIEventTimestamp` (<https://developer.chrome.com/docs/web-platform/long-animation-frames>).

```js
if (window.PerformanceObserver &&
    PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')) {
  new PerformanceObserver(list => {
    for (const e of list.getEntries()) {
      const worst = (e.scripts || []).sort((a,b) => b.duration - a.duration)[0];
      console.warn('LoAF', e.duration.toFixed(0) + 'ms',
        'render', (e.duration - (e.renderStart - e.startTime)).toFixed(0),
        'blocking', e.blockingDuration.toFixed(0),
        worst ? `${worst.sourceURL}:${worst.sourceFunctionName} ${worst.duration.toFixed(0)}ms` : '',
        worst ? `forcedLayout ${worst.forcedStyleAndLayoutDuration?.toFixed(0)}ms` : '');
    }
  }).observe({ type: 'long-animation-frame', buffered: true });
}
```

**[UNVERIFIED]** Whether the Hisense's WebView is ≥ 123. The `supportedEntryTypes` guard above
degrades safely. Feature-detect, never assume.

### 7.3 `longtask` — the fallback

**[FACT]** The Long Tasks API has existed since **Chrome 58**; the `buffered: true` flag lets you
pick up long tasks that occurred during document construction; `longtask` is supported on all
Blink platforms including Android WebView
(<https://groups.google.com/a/chromium.org/g/blink-dev/c/cX5ahS7nCFw/m/WHmxn8-uAwAJ>).

```js
if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
  new PerformanceObserver(l => {
    for (const e of l.getEntries()) console.warn('longtask', e.duration.toFixed(0)+'ms', e.name);
  }).observe({ type: 'longtask', buffered: true });
}
```

Threshold is **50 ms**, same as LoAF. `longtask` tells you a task was long; LoAF tells you *which
script* and whether it was rendering or scripting. Use LoAF when available, `longtask` as the
floor.

### 7.4 Getting the numbers off the TV

Three routes, in increasing order of effort:

1. **Draw it on screen.** A hidden `<pre>` toggled by a D-pad chord (e.g. Up-Up-Down-Down on the
   launcher) that renders `__x3fPerf()` every second. Zero tooling. **Do this.**
2. **Log to logcat via `WebChromeClient.onConsoleMessage`.** The app already installs a
   `WebChromeClient`; forward console messages:

   ```java
   @Override public boolean onConsoleMessage(ConsoleMessage m) {
       android.util.Log.d("X3FWEB", m.messageLevel() + " " + m.message()
               + " @" + m.sourceId() + ":" + m.lineNumber());
       return true;
   }
   ```
   Then `adb logcat -s X3FWEB`. Works over network adb, no DevTools needed.
3. **Persist to `localStorage`** a rolling ring buffer of the last N bad frames, and add a
   "diagnostics" screen that dumps it. Survives an app restart, which matters when you are
   chasing a stall that happens 20 minutes into a workout.

### 7.5 On-device system-level meters (no page changes)

**[FACT]** From Android's rendering-inspection guide:

```bash
adb shell setprop debug.hwui.profile true            # on-screen bar graph
adb shell setprop debug.hwui.profile.show_bars true
adb shell setprop debug.hwui.overdraw show           # overdraw heatmap
# blue = 1x, green = 2x, pink = 3x, red = 4x+  → keep the UI blue/true-colour
adb shell setprop debug.hwui.overdraw false          # off
```

```bash
adb shell dumpsys gfxinfo com.goob.x3ftv --reset
# ...run a workout for 30 s...
adb shell dumpsys gfxinfo com.goob.x3ftv framestats > frames.txt
```

The green line in the bar graph is **16.67 ms**. Bar segments map to: Swap Buffers (CPU waiting
on GPU → too much GPU work), Command Issue, Sync & Upload (bitmap uploads → large graphics),
Draw, Measure/Layout, Input Handling & Animation, Misc/VSync delay.

**[UNVERIFIED — important caveat]** How faithfully `gfxinfo` reflects *WebView's internal*
compositor frames is not documented. WebView draws through a draw functor invoked on the app's
HWUI render thread, so app-level frame stats do capture the cost of getting WebView's output on
screen, but Chromium's own raster/composite scheduling is not fully visible there. Use `gfxinfo`
to confirm "the app is dropping frames" and use §7.1/§7.2 to find *why* inside the page.

### 7.6 Memory

```bash
adb shell dumpsys meminfo --all com.goob.x3ftv
# the WebView renderer is a SEPARATE process; find it with:
adb shell dumpsys activity processes com.goob.x3ftv   # look for SandboxedProcessService
```

**[FACT]** Android's WebView memory guide is explicit that most WebView memory lives in the
**renderer** process, not your app process — their worked example showed the app process barely
moving while the renderer jumped to **~55 MB** after allocating 1000 `<div>`s, from a ~18.9 MB
baseline (<https://developer.android.com/topic/performance/memory/guide/webview-memory>). It also
notes that V8 allocations often show under "Private Other"/"Unknown" rather than "Native Heap"
because Chromium uses PartitionAlloc.

In-page, `performance.memory` (`usedJSHeapSize`) is Chromium-only and coarse, but it is free and
it will tell you whether a game page is leaking across sets:

```js
const mb = () => (performance.memory ? (performance.memory.usedJSHeapSize/1048576).toFixed(1) : '?');
```

---

## 8. Remote-debugging the TV's WebView from a PC

### 8.1 One-time app change

**[FACT]** (<https://developer.chrome.com/docs/devtools/remote-debugging/webviews>)

```java
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
    if (0 != (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE)) {
        WebView.setWebContentsDebuggingEnabled(true);
    }
}
```

The `FLAG_DEBUGGABLE` guard means release builds are unaffected. Note this app's `release`
buildType currently uses the **debug signing config** but is not `debuggable`, so the flag will
be false in release — correct. If you need to debug a release build once, temporarily add
`debuggable true` to the release buildType, then remove it.

### 8.2 Enable developer options + ADB on the Google TV

**[FACT/REPORTED — menu paths drift between Google TV launcher versions; these are the two you
will encounter]**

Older Android TV path (Google's Cast docs):
1. **Settings → Device → About**
2. Scroll to **Build** and click it repeatedly until "You are now a developer" appears
   (7 presses).
3. **Settings → Preferences → Developer options**
4. Enable **USB debugging** (and, where present, **Network debugging** / **ADB debugging**).

Newer Google TV path (Hisense sets ship this shape):
1. **Settings → System → About**
2. Click **Android TV OS build** (or **Build**) **7 times**.
3. **Settings → System → Developer options**
4. Enable **USB debugging**. Some Google TV builds also expose **Wireless debugging**.

Find the IP: **Settings → Network & Internet → (your network) → IP address**, or
**Settings → System → About → Status**.

### 8.3 Connect over the network

**[FACT/REPORTED]** Two regimes, and which one you get depends on the OS version:

**Legacy TCP/IP ADB (most Android TV / Google TV boxes, port 5555):**
```bash
adb connect 192.168.1.50:5555
# accept "Allow USB debugging?" on the TV → tick "Always allow from this computer" → OK
adb devices                 # should list 192.168.1.50:5555   device
```
Some retail sets require you to bootstrap over USB first:
```bash
adb usb                     # with a USB cable attached
adb tcpip 5555
# unplug the cable
adb connect 192.168.1.50:5555
```
**[REPORTED]** Google-issued *developer* Android TV units listen on port **4321** instead:
`adb connect <ip>:4321` (<https://developers.google.com/cast/docs/android_tv_receiver/debugging>).

**Modern Wireless debugging (Android 11+ pairing):** uses TLS pairing + mDNS discovery and a
**dynamic** port, not 5555. If the TV shows a "Wireless debugging → Pair device with pairing
code" screen:
```bash
adb pair 192.168.1.50:37455      # port + code shown on the TV
adb connect 192.168.1.50:41233   # the (different) connect port shown on the TV
```

Multiple devices connected? Address explicitly: `adb -s 192.168.1.50:5555 <cmd>`.

### 8.4 Open DevTools

**[FACT]**

1. Launch the X3F app on the TV so its WebView exists.
2. On the PC, open **`chrome://inspect/#devices`** in Chrome.
3. Ensure **Discover USB devices** is ticked. For a network-attached device it should appear
   automatically once `adb devices` sees it, because `chrome://inspect` talks to your local adb
   server.
4. The TV appears under **Remote Target**, with the WebView listed as
   `WebView in com.goob.x3ftv`.
5. Click **inspect**.

If it does not appear:

- Check `adb devices` first — `chrome://inspect` is only as good as your adb connection.
- Tick **Discover network targets → Configure** and add `127.0.0.1:9222`, then forward:
  ```bash
  adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
  # find <pid>:
  adb shell "cat /proc/net/unix | grep webview_devtools"
  ```
  (The generic `localabstract:chrome_devtools_remote` is Chrome's socket; WebView's is
  `webview_devtools_remote_<pid>`.)
- Confirm `setWebContentsDebuggingEnabled(true)` actually ran (log it).

### 8.5 WebView DevTools (on-device, no PC)

**[FACT]** (<https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/docs/developer-ui.md>)

```bash
adb shell am start -a "com.android.webview.SHOW_DEV_UI"
```

This opens WebView's own on-device UI: a **Flag UI** for toggling Chromium features and field
trials on the device without rebuilding, a crash UI, and WebView provider switching. Useful on a
TV for A/B-ing a rendering flag without a rebuild cycle. Navigating it with a D-pad is painful
but possible.

### 8.6 Useful adb one-liners for this app

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.goob.x3ftv/.MainActivity
adb logcat -s X3FWEB:D chromium:D                      # page console + Chromium
adb shell dumpsys meminfo com.goob.x3ftv | head -40
adb shell dumpsys gfxinfo com.goob.x3ftv | grep -A5 "Janky frames"
adb shell "dumpsys window | grep -i mDisplayId -A3"    # panel size / density sanity check
adb shell wm size; adb shell wm density                 # the numbers behind §2
adb shell cmd webviewupdate query                       # which WebView provider is active
```

`adb shell wm size` and `adb shell wm density` are the fastest way to settle the §2 question
before you write any JS.

---

## 9. Audio: Web Audio on Android TV WebView

### 9.1 Support

**[FACT]** Chrome for Android supports AudioWorklet from **version 66**; caniwebview marks Android
WebView as supported (no version number given)
(<https://caniwebview.com/features/web-feature-audio-worklet/>).
Core Web Audio (`AudioContext`, `GainNode`, `BufferSource`) has been in Chromium-based WebView
since the very first Chromium WebView.

**[UNVERIFIED]** AudioWorklet's exact WebView floor. `x3f-music.js` should feature-detect
`ac.audioWorklet` and fall back to `AudioBufferSourceNode` scheduling — which is what a
metronome/rep-cue engine wants anyway.

### 9.2 Latency — what to expect and how to configure

**[FACT]** `new AudioContext({ latencyHint })` accepts `"interactive"` (default, lowest latency,
highest power), `"balanced"`, `"playback"` (highest latency, lowest power), or a number of
seconds. The browser may not honour the request; check `AudioContext.baseLatency` afterwards
(<https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext>).

- `baseLatency` — seconds of processing latency from `AudioDestinationNode` into the host audio
  subsystem.
- `outputLatency` — estimate from handing a buffer to the host to the first sample reaching the
  output device.

**[FACT]** Android's CDD (14, §5.6) sets these bars: general handheld devices must achieve a mean
**continuous round-trip latency ≤ 300 ms** over 5 measurements and mean **tap-to-tone ≤ 300 ms**;
Media Performance Class devices must hit **≤ 80 ms** for both
(<https://source.android.com/docs/compatibility/14/android-14-cdd>).

**[UNVERIFIED but strongly expected]** A television is **worse** than any of those numbers,
because on top of the Android audio HAL you have the panel's own audio processing chain, and if
audio is routed over HDMI/eARC to a soundbar or ARC receiver you add that device's buffering.
**Assume 150–400 ms of end-to-end latency on a TV and design around it.** Do not build anything
that requires sub-100 ms audio/visual sync.

**Design consequences for this app:**

- **Never** use audio as the timing master for a rep cue. Drive timing from
  `performance.now()`/rAF and treat audio as decoration that may arrive late.
- Schedule ahead: use `AudioContext.currentTime + lookahead` with `source.start(when)` rather
  than "play now". A 100–200 ms lookahead scheduler eliminates jitter.
- For a metronome, pre-schedule the next 4–8 beats on a `setInterval(25ms)` scheduler tick —
  the classic "A Tale of Two Clocks" pattern.
- Measure and expose the real numbers at boot:
  ```js
  console.log('baseLatency', ac.baseLatency, 'outputLatency', ac.outputLatency,
              'sampleRate', ac.sampleRate, 'state', ac.state);
  ```
  **[MEASURE]** on the Hisense with and without a soundbar attached.

### 9.3 Autoplay and unlocking

**[FACT]** `setMediaPlaybackRequiresUserGesture(false)` is set in `MainActivity` — good, that
covers `<audio>`/`<video>`.
**[FACT]** Web Audio has been under the autoplay policy since Chrome 71; contexts created without
a gesture start `suspended` and need `resume()`.
**[UNVERIFIED]** whether the WebView flag also lifts the Web Audio gate (§1.7).

**Robust unlock for a TV (where the "gesture" is a D-pad press):**

```js
// x3f-audio.js
let ac = null;
export function audio() {
  if (!ac) ac = new AudioContext({ latencyHint: 'interactive' });
  if (ac.state === 'suspended') ac.resume();          // safe to call repeatedly
  return ac;
}
// Any remote key counts as activation.
addEventListener('keydown', () => audio(), true);
addEventListener('pointerdown', () => audio(), true);
// Report failure loudly rather than silently having no sound.
setTimeout(() => { if (ac && ac.state !== 'running') console.warn('AudioContext stuck:', ac.state); }, 3000);
```

Also: **the WebView prerender API kills pages that play audio.** Android's speculative-loading doc
lists audio playback among the "disallowed APIs" that terminate a prerender
(<https://developer.android.com/develop/ui/views/layout/webapps/speculative-loading>). If you
adopt prerendering (§10.4), your audio init must be deferred until activation.

### 9.4 Keeping audio alive across page navigations — the honest answer

**Short answer: you cannot, in the current architecture.**

A full document navigation destroys the document. Every JS object in it — including the
`AudioContext` and all its nodes — is torn down with the document. There is no browser mechanism
that keeps a page's `AudioContext` alive across a same-WebView navigation:

- **[FACT]** WebView has **no back/forward cache**. Chromium's Intent to Ship states plainly:
  *"We will not support Android WebView as the cost of integrating WebView embedding APIs with
  back-forward cache is too high, while history navigation optimisations have limited benefit for
  WebView given its nature."* (Rakina Zata Amni, bfcache-dev, 19 Nov 2020,
  <https://groups.google.com/a/chromium.org/g/bfcache-dev/c/0zTVPni5F9g>). So even
  `history.back()` re-creates the document from scratch.
- A **Service Worker** survives navigations, but service workers have no access to Web Audio (no
  `AudioContext` in a worker global scope). It cannot hold your music.
- A **SharedWorker** survives navigations and could hold *state* (e.g. playback position, the
  decoded buffer bytes), but likewise cannot own an `AudioContext`.
- **[REPORTED]** Developers repeatedly find that the only workable recovery is to
  destroy and re-create the `AudioContext` and its node graph, rather than trying to preserve it
  across a lifecycle boundary.

**Therefore there are exactly three viable options:**

| Option | Continuity | Effort | Verdict |
|---|---|---|---|
| **A. Single document + client-side routing** | Perfect — the `AudioContext` never goes away | Medium (§10) | **Do this** |
| **B. Play music natively** (Android `MediaPlayer`/`ExoPlayer` in `MainActivity`, controlled from JS via the bridge) | Perfect, and survives even an app-level page reload | Low–medium | **Good interim step**; also gets you real gapless playback and audio focus handling |
| **C. Re-create the `AudioContext` on every page and resume from a saved offset** | Audible gap of ~200–600 ms plus the whole page-load cost; music restarts mid-phrase | Low | Only acceptable if music is ambient loops |

Option **B** is genuinely attractive here and is a small amount of Java. It also lets you do the
things a TV app should do — request audio focus, duck for system sounds, respond to the remote's
transport keys — none of which Web Audio can do:

```java
// MainActivity — native music, controlled from the page.
private MediaPlayer music;
@JavascriptInterface public void musicPlay(String assetName, float vol, boolean loop) {
    ui.post(() -> {
        try {
            if (music == null) music = new MediaPlayer();
            music.reset();
            AssetFileDescriptor afd = getAssets().openFd(assetName);
            music.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            afd.close();
            music.setLooping(loop);
            music.setVolume(vol, vol);
            music.prepare();
            music.start();
        } catch (Exception ignored) {}
    });
}
@JavascriptInterface public void musicVolume(float v) { ui.post(() -> { if (music != null) music.setVolume(v, v); }); }
@JavascriptInterface public void musicStop()          { ui.post(() -> { if (music != null) music.stop(); }); }
```

Keep short SFX (rep ping, PR fanfare) in Web Audio — they are latency-tolerant and cheap to
re-create — and put the **bed music** in `MediaPlayer`. That combination survives navigations
today with no architectural change.

### 9.5 The JS→native bridge and audio

Two notes that bite:

**[FACT]** `addJavascriptInterface` methods run on **a different thread** from the one that
constructed the object (Android's WebView guide). Any `MediaPlayer` call must therefore be
posted to the UI thread — as above.

**[FACT]** WebView is strictly single-threaded per instance: calls from a non-UI thread are
posted to the UI thread "and block if needed"
(<https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/docs/threading.md>). The
existing `injectForce()` correctly uses `web.post(...)`, so it does not block the BLE callback
thread — keep that.

**The evaluateJavascript problem.** `injectForce()` does this at up to 60 Hz:

```java
final String js = "window.__x3fForce=" + (Math.round(force*100)/100.0) + ";";
web.post(() -> web.evaluateJavascript(js, null));
```

Every call: allocates a Java String, marshals it across a JNI boundary, IPCs it to the renderer
process, **parses and compiles it as a fresh script**, executes it, and IPCs a result back.
V8's compilation cache may help with an identical source string, but the number changes every
sample, so **every single sample is a cache miss**.

**[UNVERIFIED — the per-call cost in µs on this SoC is not documented; MEASURE it]** — but the
structure is unambiguously worse than the alternatives:

**Better option 1 — the page pulls, native holds (works today, no androidx dependency):**

```java
private volatile double lastForce = 0;
private void injectForce(double f) { lastForce = f; }        // no WebView call at all
private class Bridge {
    @JavascriptInterface public double force() { return lastForce; }
}
```
```js
// in the single rAF tick — exactly one bridge crossing per frame
const f = (window.X3F && X3F.force) ? X3F.force() : (window.__x3fForce || 0);
```
This drops from ~60 script compilations per second to ~60 **direct method calls** per second,
and it naturally aligns force sampling with frame timing. It also removes a whole class of
"force updated between frames and nothing rendered it" jitter.

**Better option 2 — `WebMessageListener` (requires §1.6's real origin):**

```java
if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
    WebViewCompat.addWebMessageListener(web, "x3fBridge",
        new HashSet<>(Arrays.asList("https://appassets.androidplatform.net")),
        (view, message, sourceOrigin, isMainFrame, replyProxy) -> { /* JS → native */ });
}
```
```js
window.x3fBridge.onmessage = e => { latestForce = +e.data; };
```
**[FACT]** Requires WebView 82 + androidx.webkit 1.3.0; the listener callback runs on the app's
**main thread**; binary payloads are possible via `WebMessageCompat.TYPE_ARRAY_BUFFER` (WebView
feature `WEB_MESSAGE_ARRAY_BUFFER`), which is ~33 % more efficient than Base64 for byte data
(<https://developer.android.com/develop/ui/views/layout/webapps/native-api-access-jsbridge>).
Messages are structured data, **not** source code — no parse, no compile.

Recommendation: **option 1 now** (five lines, zero risk), **option 2 after the AssetLoader
migration**, and always coalesce to one read per animation frame.

---

## 10. Full document navigation vs a single-page app

This is the architectural decision with the largest total effect on this app.

### 10.1 What a `loadUrl()` navigation actually destroys

The app navigates between `launcher.html`, `bloom.html`, `nova.html`, `splash.html`,
`library.html`, `routine.html`, `progress.html`, `arena.html`, `duel.html`, `flow.html`,
`rhythm.html`, `calibrate.html`, `index.html` with full document loads. Each one throws away:

| Thing destroyed | Cost to rebuild |
|---|---|
| The DOM and its style/layout trees | Full parse + style resolution + layout of the new document |
| V8 heap, all JS objects and closures | Re-parse + re-compile every `<script>` in the page |
| **JIT-optimised code** for hot functions (particle loops, force smoothing) | Back to the interpreter; the hot loop must re-warm over hundreds of frames |
| Decoded image bitmaps for shared assets (`logo.png`, `assets/ui/*.jpg`) | Re-decode; e.g. a full-screen background is 8.29 MB of bitmap re-decoded |
| Compositor layers and all their GPU textures | Re-raster everything visible |
| **`AudioContext` and the whole node graph** | Music stops; §9.4 |
| `window.__x3fForce` and every bit of page-side BLE state | The shell re-pushes it, but there is a window where it is 0 |
| The compiled CSS Object Model | Re-parse of every stylesheet (they are inline `<style>` blocks here, so this is coupled to HTML parse) |
| Any pending `setTimeout`/rAF | Silently dropped |

**[FACT]** And none of it is recoverable from a back/forward cache, because **WebView has none**
(§9.4). A bfcache hit in Chrome gives an effectively 0 ms navigation; WebView never gets that.

### 10.2 Quantifying it

**[MEASURE] — the exact numbers are device-specific. Here is the measurement, which takes 10
minutes and is worth doing before committing to a rewrite:**

Add to every page, at the very end of `<body>`:

```js
addEventListener('load', () => requestAnimationFrame(() => requestAnimationFrame(() => {
  const n = performance.getEntriesByType('navigation')[0];
  const paint = performance.getEntriesByType('paint');
  const fcp = (paint.find(p => p.name === 'first-contentful-paint') || {}).startTime;
  console.log('NAV', location.pathname,
    'responseEnd',   n.responseEnd.toFixed(0),
    'domInteractive',n.domInteractive.toFixed(0),
    'domComplete',   n.domComplete.toFixed(0),
    'loadEnd',       n.loadEventEnd.toFixed(0),
    'FCP',           fcp ? fcp.toFixed(0) : 'n/a');
})));
```

Read it with `adb logcat -s X3FWEB` via the `onConsoleMessage` forwarder in §7.4.
Then compare against a client-side route change instrumented the same way.

**[UNVERIFIED — order-of-magnitude expectation, stated as a hypothesis to test, not a fact]** On a
low-end TV SoC with local assets, a full navigation to a 35 KB HTML page with inline CSS/JS and a
few sprites plausibly costs **250–700 ms** to first contentful paint and **another few hundred
ms** before the animation loop reaches steady-state frame times (JIT warm-up, image decode,
first raster). A client-side route change that swaps a DOM subtree and starts an already-compiled
render loop plausibly costs **10–40 ms**. **If your measurement disagrees, trust your
measurement.**

### 10.3 What you gain by going single-document

- **Audio continuity** (§9.4 option A) — the headline win.
- **Warm JIT.** The particle/physics loops stay optimised across screens.
- **One decode of shared assets.** The logo, the aurora background, the badge images decode once
  for the whole session.
- **Persistent BLE state.** `window.__x3fForce`, calibration, baseline, connection status all
  survive screen changes; `MainActivity` no longer has to re-push everything on every
  `onPageFinished`.
- **One `AudioContext`, one rAF scheduler, one perf monitor** (§3.7, §7).
- **Instant transitions.** You can cross-fade between screens with `opacity` — compositor-only —
  instead of a white/dark flash.
- **Simpler native shell.** `MainActivity`'s `isLauncher(currentUrl)` / back-button URL logic
  collapses into a single "tell the page to go back" message.

### 10.4 What you lose, and how to keep it

| Lost | Mitigation |
|---|---|
| Hard memory reset between games | Explicit teardown per screen: cancel rAF subscriptions, `close()` ImageBitmaps, null out big arrays, `canvas.width = 0` to release backing stores |
| Natural CSS scoping (each page has its own `<style>`) | Namespace by a root class (`.screen-nova .card{}`), or use one shared design-token stylesheet + per-screen partials |
| Crash isolation (a bad page reload fixed it) | Add a "soft reset" that rebuilds the screen module; keep `WebViewClient.onRenderProcessGone` handling in the shell |
| Simple URL-based navigation for the native back key | `history.pushState` per screen + `popstate`, or a plain screen stack in JS with a `window.__x3fBack()` the shell calls |
| Incremental loading (only the current page's code is parsed) | Split screens into ES modules and `import()` them lazily — but note this needs §1.6 (modules do not load from opaque `file://` origins reliably) |

**Migration path that does not require a big-bang rewrite:**

1. §1.6 — move to `WebViewAssetLoader`. Nothing else changes; all pages keep working.
2. Extract the common chrome (status pill, bar-connection indicator, nav) into a shared module.
3. Build `shell.html` that owns: the `AudioContext`/music, the rAF scheduler, the perf monitor,
   the force plumbing, and a `<main>` mount point.
4. Convert one screen at a time into a module exporting `mount(root, ctx)` / `unmount()`.
   Keep the remaining pages reachable by full navigation during the transition.
5. When the last screen is converted, delete the navigation code in `MainActivity`.

### 10.5 If you must keep multi-page navigation

**[FACT]** WebView 2024/2025 shipped a **speculative loading** API set that materially reduces
navigation cost (<https://developer.android.com/develop/ui/views/layout/webapps/speculative-loading>):

| Feature | Scope | API | Cost |
|---|---|---|---|
| Preconnect | Profile | `Profile.preconnect(url)` (UI thread) | Low; ~30 s connection TTL |
| Prefetch | Profile | `Profile.prefetchUrlAsync(...)` (any thread) | Medium; caches **main HTML only** |
| Prerender | WebView | `WebViewCompat.prerenderUrlAsync(...)` (UI thread) | **High** (CPU + memory + network) |

Key constraints, all **[FACT]** from that page:

- **HTTPS only.** `file://` is not supported — another reason for §1.6.
- Prefetch **skips `shouldInterceptRequest()` entirely** for the background request, so your
  AssetLoader interception (and any header injection) does not run for the prefetched HTML. At
  navigation time `shouldInterceptRequest` *is* called for the main HTML: return `null` to use
  the prefetch cache, or a response to bypass it.
- Tuning: `profile.getPrefetchCache().setMaxPrefetches(10)`,
  `setPrefetchTtlSeconds(60)`, `profile.setMaxPrerenders(2)`.
- Prerender is cancelled under memory pressure and **terminated by disallowed APIs including
  audio playback and alerts**.
- `prerenderUrlAsync` must be called on the UI thread; `prefetchUrlAsync` from any thread.
- Android does not publish millisecond gains for these — it claims "significant reduction in web
  content loading latency" and "instant transitions" for prerender. **[MEASURE]**

Realistic use here: when the launcher's focus lands on a game tile, `prerenderUrlAsync` that
game's URL. By the time the user presses OK it is already rendered. **But** on a memory-tight TV,
prerendering a canvas-heavy game page doubles the renderer's working set, and the audio
restriction directly conflicts with §9. **Verdict: the SPA (§10.3) is the better answer for this
app; treat prerender as the fallback if the rewrite is deferred.**

Cheaper mitigations that work today with `file://`:

- **Preload the shared stuff in every page's `<head>`** so decode starts immediately:
  ```html
  <link rel="preload" as="image" href="assets/ui/aurora.webp">
  <link rel="preload" as="script" href="x3f-fx.js">
  ```
- **Set `web.setBackgroundColor()` to the page background** (already done: `0xFF05030F`) so the
  inter-page flash is dark, not white.
- **Inline critical CSS** (already the case — each page has a `<style>` block).
- **Shrink the per-page JS.** `x3f-form.js` is 30 KB and `x3f-progress.js` 28 KB; if a page does
  not need them, do not include them — every byte is re-parsed on every navigation.

---

## 11. Quick reference: do / don't

**Do**

- `transform` and `opacity` for all motion.
- `will-change` applied by JS immediately before an animation, removed on `transitionend`.
- `content-visibility:auto` + `contain-intrinsic-size` on repeated off-screen cards.
- One rAF scheduler per document.
- `getContext('2d', {alpha:false})`; integer coordinates; cached pre-scaled sprites.
- Cap canvas DPR at 1 for full-bleed effect layers on TV.
- WebP for all images.
- `WebViewAssetLoader` on `https://appassets.androidplatform.net/`.
- Native `MediaPlayer` for bed music; Web Audio for short SFX.
- `WebView.destroy()` in `onDestroy()`.
- Feature-detect everything (`PerformanceObserver.supportedEntryTypes`,
  `WebViewFeature.isFeatureSupported`, `typeof createImageBitmap`).

**Don't**

- `backdrop-filter` on anything the size of the screen.
- `transition: box-shadow`.
- `setLayerType(LAYER_TYPE_SOFTWARE)` anywhere in the view hierarchy.
- `setRenderPriority`, `setEnableSmoothTransition`, `setDatabaseEnabled`.
- `will-change` in a static stylesheet on a repeated class.
- `willReadFrequently:true` on an animating canvas.
- AVIF.
- Geometry reads interleaved with style writes inside a rAF callback.
- One `evaluateJavascript` per BLE sample.
- Assume the TV lays out at 1920 CSS px. **Measure it.**

---

## 12. Open questions to resolve on the actual Hisense

Each of these is a **[MEASURE]** that changes a decision above.

1. `innerWidth × innerHeight` and `devicePixelRatio` in the WebView. (§2)
2. `adb shell wm size` / `wm density` — the platform's view of the same question.
3. WebView version string from `WebViewCompat.getCurrentWebViewPackage()`. Gates LoAF (≥ 123),
   full OffscreenCanvas (≥ 120), `addWebMessageListener` (≥ 82). (§6.1, §7.2)
4. `PerformanceObserver.supportedEntryTypes` — which of `long-animation-frame`, `longtask`,
   `event`, `paint` exist. (§7)
5. Frame time p50/p90/p99 on the heaviest screen (`nova.html`) with and without the full-screen
   `backdrop-filter`. This is the single measurement that validates optimisation #1. (§3.1)
6. `ac.baseLatency`, `ac.outputLatency`, `ac.sampleRate` — with TV speakers and with a soundbar
   over ARC. (§9.2)
7. Whether `setMediaPlaybackRequiresUserGesture(false)` alone lets an `AudioContext` reach
   `running` without any key press. (§1.7)
8. `dumpsys meminfo` for the app process **and** the sandboxed renderer process, on the launcher
   and on the heaviest game screen. (§7.6)
9. Full-navigation FCP for each page, via the navigation-timing snippet in §10.2.
10. Whether `content-visibility:auto` breaks `x3f-nav.js` focus movement (off-screen tiles have
    no real layout). (§4.5)

---

## Sources

Primary (Android / Chromium / Google):

- AOSP `WebSettings.java` — <https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/webkit/WebSettings.java>
- AOSP `WebView.java` — <https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/webkit/WebView.java>
- Hardware acceleration — <https://developer.android.com/develop/ui/views/graphics/hardware-accel>
- WebView memory — <https://developer.android.com/topic/performance/memory/guide/webview-memory>
- Build web apps in WebView — <https://developer.android.com/develop/ui/views/layout/webapps/webview>
- Load in-app content — <https://developer.android.com/develop/ui/views/layout/webapps/load-local-content>
- Support different screens in web apps — <https://developer.android.com/develop/ui/views/layout/webapps/targeting>
- Optimize WebView startup — <https://developer.android.com/develop/ui/views/layout/webapps/optimize-webview-startup>
- JSBridge / WebMessageListener — <https://developer.android.com/develop/ui/views/layout/webapps/native-api-access-jsbridge>
- Speculative loading in WebView — <https://developer.android.com/develop/ui/views/layout/webapps/speculative-loading>
- Managing WebView objects — <https://developer.android.com/develop/ui/views/layout/webapps/managing-webview>
- TV layouts / design grid — <https://developer.android.com/design/ui/tv/guides/styles/layouts>
- Inspect GPU rendering — <https://developer.android.com/topic/performance/rendering/inspect-gpu-rendering>
- Android CDD 14 §5.6 audio latency — <https://source.android.com/docs/compatibility/14/android-14-cdd>
- Android audio latency overview — <https://source.android.com/docs/core/audio/latency>
- Cast: Android TV debugging — <https://developers.google.com/cast/docs/android_tv_receiver/debugging>
- Chromium WebView FAQ — <https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/docs/faq.md>
- Chromium WebView web-platform compatibility — <https://chromium.googlesource.com/chromium/src/+/refs/heads/main/android_webview/docs/web-platform-compatibility.md>
- Chromium WebView software draw deprecated — <https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/docs/software_draw_deprecated.md>
- Chromium WebView threading — <https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/docs/threading.md>
- Chromium WebView DevTools — <https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/docs/developer-ui.md>
- GPU accelerated compositing in Chrome — <https://www.chromium.org/developers/design-documents/gpu-accelerated-compositing-in-chrome/>
- Intent to Ship: same-site bfcache on Android (the "no WebView bfcache" statement) — <https://groups.google.com/a/chromium.org/g/bfcache-dev/c/0zTVPni5F9g>
- Intent to Implement/Ship: buffered flag for longtasks — <https://groups.google.com/a/chromium.org/g/blink-dev/c/cX5ahS7nCFw/m/WHmxn8-uAwAJ>
- AVIF on Android (software decode cost) — <https://groups.google.com/a/chromium.org/g/media-dev/c/9uHYfktPtSc>
- Autoplay policy in Chrome — <https://developer.chrome.com/blog/autoplay/>
- Remote debugging WebViews — <https://developer.chrome.com/docs/devtools/remote-debugging/webviews>
- Long Animation Frames API — <https://developer.chrome.com/docs/web-platform/long-animation-frames>
- WebView overview — <https://developer.chrome.com/docs/webview>
- Compositor-only properties & layer count — <https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count>
- Layout thrashing — <https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing>
- content-visibility — <https://web.dev/articles/content-visibility>
- WebP FAQ — <https://developers.google.com/speed/webp/faq>

MDN:

- `will-change` — <https://developer.mozilla.org/en-US/docs/Web/CSS/will-change>
- Optimizing canvas — <https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas>
- `HTMLCanvasElement.getContext()` — <https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext>
- `OffscreenCanvas` — <https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas>
- `transferControlToOffscreen()` — <https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/transferControlToOffscreen>
- `AudioContext()` constructor / `latencyHint` — <https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext>
- Autoplay guide — <https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay>

Secondary (treat as [REPORTED]):

- What forces layout/reflow (Paul Irish) — <https://gist.github.com/paulirish/5d52fb081b3570c81e3a>
- GPU memory limits in Chrome compositing — <https://www.browser-rendering.com/compositing-and-gpu-acceleration/hardware-acceleration-limits/gpu-memory-limits-in-chrome-compositing/>
- Improving CSS performance of Cordova apps on Android TVs — <https://blog.hao.dev/improving-css-performance-of-cordova-apps-on-android-tvs/>
- How to animate box-shadow (Tobias Ahlin) — <https://tobiasahlin.com/blog/how-to-animate-box-shadow/>
- CSS box-shadow animation performance (SitePoint) — <https://www.sitepoint.com/css-box-shadow-animation-performance/>
- backdrop-filter cost — <https://empire-ui.com/blog/backdrop-filter-css>
- How CSS properties affect performance — <https://www.f22labs.com/blogs/how-css-properties-affect-website-performance/>
- Can I WebView — OffscreenCanvas / AVIF / WebP / AudioWorklet — <https://caniwebview.com/>
- Android TV WebView reports 960×540 (Ionic forum) — <https://forum.ionicframework.com/t/android-tv-webview-resolution-seems-to-be-1-2-hd-960x540-for-all-devices-hd-4k-8k/246839>
- `setOffscreenPreRaster` / `setRenderPriority` API-level metadata — <https://learn.microsoft.com/en-us/dotnet/api/android.webkit.websettings.offscreenpreraster>, <https://learn.microsoft.com/en-us/dotnet/api/android.webkit.websettings.setrenderpriority>
- TV Labs Android platform notes — <https://docs.tvlabs.ai/platform/platforms/android>

---

*Written 2026-09-07 against `x3f-tv` @ `6466b42`. Everything marked [UNVERIFIED] or [MEASURE] is
an instruction to go and check on the device, not a conclusion.*
