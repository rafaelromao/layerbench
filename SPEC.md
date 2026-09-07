# LayoutMaster — v1 Specification
Keyboard layout analyzer with faithful ZMK layer semantics (multi-alpha-layer aware)

> Implemented twice: Elixir + Phoenix LiveView on `main`, TypeScript static SPA on `ts-implementation` (D10, §10). Sections 2–9 and 11 describe behavior and are stack-neutral; both implementations must satisfy them, and parity between them is asserted by tests.

---

## 1. Context

Existing alt-layout analyzers (cyanophage playground, Keysolve, Oxeylyzer, Genkey, a200/cmini, KLA Next) assume one static letter→key map on a 30–34 key grid. They cannot evaluate layouts whose alphabet spans **two or more alpha layers** reached through ZMK layer behaviors, nor layouts using **adaptive ("magic") keys, repeat keys, multi-letter macros, layers armed by macro side effects, or combos**. Romak / Magic Romak (24 keys, `1333+2`, EN + PT-BR) is the motivating case: its author had to strip accents, drop the second alpha layer and hand-tune three analyzers to get approximate numbers.

Goal: a nice-looking, responsive, static web app that **simulates how a corpus is actually typed** on the keymap (physical key presses, including thumb layer taps), then computes the Keyboard Layouts Doc (3rd ed.) metrics on the resulting *physical key stream*. Every rule is configurable, removable or addable. Corpus/language configurable (EN + PT-BR in v1). Columnar stagger default; row stagger (ANSI/ISO, angle mod) supported.

### Decisions taken in the requirements interview (binding for v1)

| # | Decision |
|---|---|
| D1 | Layout input: **native JSON format + classic 3-row text import**. keymap-drawer YAML import = v1.x. ZMK `.keymap` import = v2. |
| D2 | Simulator: **intent-based, timing-free** state machine modeling *all* relevant ZMK behaviors (§5). No tapping-term races; sticky timeouts never expire; adaptive idle windows always satisfied. |
| D3 | When a symbol can be produced several ways, **the user chooses the typing path per symbol** in the UI (tool enumerates alternatives; context-dependent producers such as magic/repeat keys are toggled per symbol). |
| D4 | Case: **case-folded by default**; optional **shift modeling** (sticky shift, shifted twin layers, caps word, sentence case) available in v1. |
| D5 | N-gram universe: **two views**; default = all alpha keystrokes *including* layer/shift/repeat/magic thumb taps, *excluding* space; toggle to include space (using the layout's declared space key). |
| D6 | Presentation: metrics with **Doc ch.13 bands** (editable); **composite weighted score optional**, off by default; presets set weights. |
| D7 | New rules via a **declarative rule composer** (UI + JSON). JS plugins = v2. |
| D8 | Corpora: per language a **general** corpus (Leipzig/MonkeyRacer-style) **+ the author's work corpora** (`romak/analysis/corpus_en.txt`, `corpus_pt.txt`), EN+PT-BR **mix slider**, custom paste/upload. |
| D9 | Geometry default **3x5+2 (34 keys)**; presets `1333+2`, `3x5+3`, `3x6+3`, ANSI, ISO (+ angle mod), custom editor. |
| D10 | Stack (revised 2026-09-07): **TypeScript, static single-page app, no server** — pnpm workspace with the engine in `packages/core` (pure TypeScript, runs in a worker and in Node), corpus build in `packages/corpora`, UI in `apps/web` (React + TanStack Router + Tailwind/daisyUI). The engine runs in a **Web Worker**; analyses never block the interface. **Storage = the browser (IndexedDB) plus, optionally, a repository the user owns**, reached with a fine-grained token that lives only in that browser — see §4.3/§10. Deployed as static files (GitHub Pages). *The Elixir + Phoenix LiveView implementation (revision 2026-09-05) lives on `main` and is the behavioral reference; this stack reproduces it, with parity asserted against reports dumped from it.* |
| D11 | v1 UI: **all six views** (Analyze, Edit, Compare [2-way], Rules, Corpus, Library). |
| D12 | **English UI only**, no i18n layer. |

### Non-goals (v1)
Optimizer/generator; numbers/symbols/nav layers; real timing model; home-row-mod timing analysis; backend/accounts; ZMK `.keymap` parsing; JS rule plugins; alt-fingering overrides; UI translation.

---

## 2. Reference analysis (what we adopt, what we fix)

### 2.1 Keyboard Layouts Doc, 3rd edition — canonical definitions
Source: `docs.google.com/document/d/1W0jhfqJI2ueJ2FNseR4YAFpNfsUM-_FlREHbpNGmC2o` (ch. 1–2, 4–8, 12, 13, 16.4).

- **Fingering**: standard; angle mod (ANSI: left bottom row shifts one to the left, left pinky loses a key, left index gains one; ISO: whole left bottom row shifts). Row stagger: top row +0.25U, bottom row +0.5U relative to home row.
- **SFB**: consecutive keys, same finger. Distance by Pythagoras on key coordinates (1U adjacent, ≈2U over the home row; row-stagger diagonals asymmetric). Prefer SFBs on index/middle.
- **SFS**: same finger separated by 1..n keys. Combined "finger movement/speed": SFB weight 1, skip-1 0.5, skip-2 0.25, skip-3 0.125. Genkey/Oxeylyzer omit the square root (squared distance) to punish 2U jumps 4×.
- **Distance**: track each finger's *previous key*, not distance-from-home; inter-word skipgrams count; SFB distance = Σ freq × distance.
- **Scissors**: FSB = 2 rows apart *and* the finger that "prefers being higher" is lower. Preference: index prefers lower; middle prefers higher than all; ring higher than index & pinky, lower than middle; pinky lower than middle & ring, higher than index. HSB = same with 1 row apart; FSS/HSS skipgram variants. Adjacent-finger scissors matter most. Keysolve counts every ring–middle row jump.
- **LSB**: adjacent-finger bigram, horizontal distance ≥ 2U (center column ↔ middle; outer pinky ↔ ring); semi-adjacent (ring ↔ index) ≥ 3.5U. LSS skipgram variant. Row stagger shifts distances by 0.25/0.5/0.75U → LSB sets differ between matrix and row stagger; angle mod adds LSBs.
- **Trigram stats**: alternate (L R L / R L R); roll (2+1 or 1+2, the same-hand pair on different fingers; in/out); 3roll/onehand (same hand, same direction); redirect (same hand, direction change); weak redirect (redirect without index). Roll comfort: same row, longer finger higher, no lateral stretch, strong fingers, adjacent, inward.
- **Thumb letters**: thumbs are slower to double-tap → repeats on thumb penalized.
- **Stat table**: SFB, SFS, Scissors, Alt, Roll, Redir, In:out-roll, Pinky-off (top/bottom-row pinky use), Hand use. Band upper bounds (ch. 13.4):

| Stat | Min | Very low | Low | Mid low | Mid | Mid high | High | Very high | Max |
|---|---|---|---|---|---|---|---|---|---|
| Alt (↑ good) | 23.9 | 26.8 | 29.7 | 32.6 | 35.4 | 38.3 | 41.2 | 44.1 | 47 |
| Roll (↑) | 37.8 | 39.7 | 41.5 | 43.3 | 45.2 | 47 | 48.8 | 50.6 | 52.5 |
| In:out (↑) | 0.8 | 1.2 | 1.7 | 2.1 | 2.6 | 3 | 3.5 | 3.9 | 4.4 |
| SFB (↓) | 0.525 | 0.625 | 0.735 | 0.875 | 1.075 | 1.375 | – | – | – |
| SFS (↓) | 5.3 | 5.7 | 6.1 | 6.5 | 6.9 | 7.3 | – | – | – |
| Scissors (↓) | 0.1 | 0.15 | 0.25 | 0.35 | 0.45 | 0.55 | 0.7 | – | – |
| Redir (↓) | 2.8 | 3.6 | 4.5 | 5.4 | 6.2 | 7 | 9 | – | – |
| Pinky off (↓) | 1.8 | 2.7 | 3.5 | 4.3 | 5.2 | 5.9 | 6.8 | – | – |

Hand balance: even ≤ 52–48, leans ≤ 55–45, heavy beyond. Doc stats came from Genkey (SFB/SFS/alt/roll/redir), Keysolve (scissors), a200 (in:out, hand use), MonkeyRacer corpus.
- **Space thumb** (16.4): ~55% of trigrams contain space; most analyzers report *without* space; including space with the "wrong" thumb turns rolls into redirects/alternates. → D5.

### 2.2 cyanophage playground — engine facts (from `keyboard_svg.js`, repo `cyanophage/cyanophage.github.io@main`)
- Fingers numbered 1–10 (5/6 = thumbs, treated as innermost finger of their hand). Geometry: fixed 3×12 + thumb row; ergo = flat grid (no column stagger); ISO/ANSI stagger = literal 0.5w/0.75w/1.25w x-offsets; distance = Euclidean / pitch, cumulative from the finger's last key *within a word*, reset to home per word.
- Per-key effort grid (rows top/home/bottom, cols 0–11): `5 3 2 1 2 7 | 7 2 1 2 3 5`, `5 1 0 0 0 5 | 5 0 0 0 1 5`, `7 3 2 2 1 8 | 8 1 2 2 3 7`; thumbs cost 0. "Effort" = 577·Σ(freq·effort)/keystrokes. "Total Word Effort"/"Hard Words" use a separate 1332-entry `bigram_effort.json` (base cost per key + same-hand interaction penalties; e.g. inward home roll 0.2, SFB 6.67, 2U SFB 7.67), skipgrams weighted 0.2, dictionary words only.
- SFB excludes same-key repeats; SFS = exactly one intervening key, unweighted; LSB = fixed column pairs (3↔5, 6↔8; "ring LSB" 2↔5, 6↔9), no row condition; Scissors = |Δcol|=1 ∧ |Δrow|≥2 ∧ different fingers same hand; "Rowskips", "Pinky/Ring scissors" variants. Bigram % divide by **keystrokes incl. one space per word**; trigram % divide by trigram count. Corpus = bag of words (no cross-word n-grams; `words-portuguese.json` has accents folded away).
- Trigram rules: same hand & strictly monotone finger order → roll in/out (3-key); same hand, direction change, f1≠f3 → redirect (weak unless index involved); L R L → alt (alt sfs if f1=f3 & different keys); mixed 2+1 with monotone pair → "bigram roll in/out"; else other.
- Magic fork rewrites n-grams before analysis (`xx→x§`, `letter+replacement→letter+¤`); combos expand to simultaneous keys.
- Known defects (reproduced only behind `bugCompat`, see §11): ISO/ANSI import guard, `.replace` vs `.replaceAll` folding, repeat list missing `jj qq vv ww yy`, single-digit effort cells.

### 2.3 Keysolve — `SFB LSB HSB FSB / SFS LSS HSS FSS / ALT ROL ONE RED`, Mirror, Board (ortho/row stagger). Model for the compact summary strip.

### 2.4 Romak / Magic Romak / author's ZMK keymap (repos `rafaelromao/romak`, `rafaelromao/keyboards`; local clone at `/Users/rromao/projects/keyboards`)
- Boards: 36-position matrix (thumbs `L2 L1 L0 | R0 R1 R2`), logical **24 keys `1333+2`** using thumbs `L1 L0 R0 R1`; also 34-key `3x5+2` Romak 34. Columnar stagger.
- Alpha layers: **ALPHA1** (base) → **ALPHA2** via `&sl` on the right inner thumb `R0` (`msl_sym_a2`: tap = `&sl ALPHA2`; tap while shift live = `&sl SFT_A2`; hold = SYM; when another mod is held = GUI — a hold-tap wrapped in mod-morph/layer-morph chains). `&sl` config: `release-after-ms 1000`, `quick-release`. **CCEDIL** (Ç-extension) armed by the `ç` macro (`&ac_cced` + `&sl CCEDIL`), gives `ã õ ão ões`, other vowels transparent, its `L1` thumb re-arms ALPHA2. **ALTREP2** armed by every accent macro and by `qu` (remaps only the repeat thumb). **SEN_CASE** armed by the space adaptive key after `. ? !`. Shifted twins: `SFT_A2`, `CASE_A2`, `CASE_A1` (caps word), `CPLK_A1` (caps line), `CASE_CCEDIL`. 31 layers incl. `_CP` duplicates and an all-`&trans` `ALT_OS` used only as a layer-morph discriminator.
- Accents = **one physical key** each (macro: dead key + letter to the host US-Intl layout, then `&sl ALTREP2`); `ç` OS-dependent via layer-morph; `qu`, `ão` (`&ac_atil &kp O`), `ões` (`&ac_otil &kp E &kp S`) are macros whose bodies call other macros.
- Adaptive keys (`urob/zmk-adaptive-key`, `max-prior-idle-ms 2000`, `strict-modifiers`): magic `h`→`v` after vowel keycodes (incl. `LS()`/`RS()` variants); reversed magic; alt-repeat (`a→h`, `y→d`, `h→ões`, `v/x/j→&sl ALPHA2`, `LS(I)→'`, after accents `a/e/o→x`, `i→e`, `u→ê`, default `&key_repeat`); `a2_alt_repeat` chains to `alternate_repeat_key`.
- Combos: 172, `timeout-ms 30`, **layer-scoped**; base-layer letter combos `ns=q mg=k st=w cp=v lo=x ra=z h,=j ae=y` documented as optional / command-oriented.
- Sticky shift `&sk LSHFT` (`release-after-ms 1500`, `quick-release`) on `R1`; double tap → caps word (auto-layer `CASE_A1`); repeat thumb while shift live → caps line.
- Prior evaluation used Keysolve (EN only, Romak 34), cyanophage permalink `playground.html?layout=qbmgkxlou/\dnstwzraei-yfcpvjh,.;'^&mode=ergo&lan=english&thumb=r`, KLA Next with 1 MB ChatGPT work corpora; normalization: accents removed, `! ?` fill, space opposite vowels, no digits/symbols.

### 2.5 ZMK semantics the simulator must honor (zmk.dev + source)
- Layers numbered by definition order; layer 0 always active; **resolution walks from the highest active layer downward; `&trans` passes the event down, `&none` swallows it**. Layer state is snapshotted per key position at press time. Max 32 layers.
- `&mo N` active while held. `&lt N K`: hold→`&mo N`, tap→`&kp K`. `&to N`: activate N, deactivate all others except base. `&tog N`: flip (or `toggle-mode on/off`), **locking** (only `&to`/`&tog` can deactivate a locked layer). `&sl N` = sticky key wrapping `&mo`, `release-after-ms 1000`, **`quick-release` → layer released on the next key *press*** (that key still resolves on the sticky layer); no `ignore-modifiers` → a modifier press consumes it (why sticky layer + sticky shift don't compose). Conditional layers: `then-layer` iff all `if-layers` active; **forced**; evaluate to a fixed point after every state change.
- Combos: processed before the keymap; candidates filtered against **the single highest active layer**; `timeout-ms` default 50; `slow-release`; `layers` list.
- Hold-tap flavors and timing knobs (`quick-tap-ms`, `require-prior-idle-ms`, `hold-trigger-key-positions`, `retro-tap`) are **not needed for the decision in an intent-based simulator**; recorded as parameters for a future timing model.
- `&sk`: one-shot modifier released after next key *release* (or *press* with `quick-release`), `ignore-modifiers` default true (sticky mods combine).
- Mod-morph: second binding when any listed mod is held; `keep-mods`; nest for AND. Tap-dance: by tap count. Macros: `macro_tap/press/release`, `macro_pause_for_release`, parameterized, **can change layers mid-sequence**; `&key_repeat` re-sends the last keycode; caps word: shift alphas until a key outside `continue-list`; `urob/zmk-auto-layer`: layer stays until a key outside `continue-list`.
- Keycodes = HID usage + implicit mod bits (`LS(A)`); implicit mods drop when another key is pressed ("Ab" rule). Host locale maps usages → characters; accents on US-Intl/ABNT2 are **dead key + letter**; `ç` is a real key on ABNT2. No native unicode (`urob/zmk-unicode` = one press → N hidden host events).

---

## 3. Domain model

| Term | Definition |
|---|---|
| **Geometry** | Physical keys: `id`, center `x,y` (U, per-hand origin, post-rotation), `w,h`, `rotation` (render only), `hand`, default `finger`, `row` (0 top, 1 home, 2 bottom, 3 thumb), `col` (canonical 0 outer-pinky … 5 inner), flags `home`, `thumb`, `inner`. Presets §6.1. |
| **Finger** | `LP LR LM LI LT RT RI RM RR RP`. Per-key assignment editable (standard / angle mod / custom). |
| **Keymap** | Ordered **layers**; each maps key id → **binding**; plus **combos**, **conditional layers**, named **behaviors**, per-layer optional `shiftedTwin`. Layer 0 = base. |
| **Binding** | `kp`, `trans`, `none`, `mo`, `lt`, `sl`, `tog`, `to`, `sk`, `caps_word`, `auto_layer`, `key_repeat`, `mod_morph`, `layer_morph`, `tap_dance`, `macro`, `adaptive`, `hold_tap`, `dead_key`, `unicode` (shapes in §9). |
| **Symbol** | Text unit produced: one grapheme (`a`, `ç`, `'`) or a string (`qu`, `ão`). Case is a separate attribute. |
| **Producer** | A concrete way to obtain a symbol: `direct(layer,key)`, `combo`, `adaptive(branch)`, `repeat`, `macro`, `deadkey sequence`. Carries applicability conditions (required layer, `afterAny` last-keycode set, required modifiers/case). |
| **Typing path** | User-ordered, per-symbol list of producers (D3) + per-layer **activators** (how a non-active layer is reached *from* a given layer) + `repeatPolicy` for doubled letters. |
| **Corpus** | Language-tagged text → normalized **symbol stream** + word list; precomputed n-gram tables for the fast path. |
| **Key event** | `{pos \| chordId, finger(s), hand, layerUsed, kind: tap\|holdPress\|holdRelease\|chord, producerKind, symbol?, flags: wastedOneShot, underHold[], wordIndex}`. Output of the simulator. |
| **Keystroke** | A key event that counts in denominators (definition table §7.1). |
| **Physical tables** | Counts over positions: unigram, bigram, trigram, skip-1..3, runs (by hand/finger/layer), per-word traces. Two universes (with/without space). |
| **Rule** | Parameterized function `(tables, geometry, fingers, globals) → {value, band, items[], perKey[], perFinger[]}`; `enabled`, `weight`, `bands`, `family`. |
| **Rule set** | Ordered rules + global parameters (§7.1) + score formula. JSON, versioned, shareable. |
| **Report** | Result of `(layout, geometry, corpus, ruleSet, options)`. |

---

## 4. Product surface (UI/UX)

### 4.1 Views
1. **Analyze** (home). Keyboard canvas (SVG) with **layer tabs**, heat-map mode (usage, SFB contribution, distance, effort, layer taps), hand-split badges. **Summary strip** (Keysolve-style: SFB · SFS · LSB · FSB/HSB · Alt · Roll · One · Redir · Pinky-off · Hand use, Doc band colors). **Metric panels** (collapsible cards, sortable top-N lists; hover/click an n-gram → keys highlight and the typing path is drawn as arrows). **"How is this typed?"** box: type a word → step list `[a] [² thumb] [ç] [ã (Ç-ext)] [o]` with layer/finger per step. **Coverage bar** (unproducible symbols, producers disabled by case mode). Toggles: universe (space on/off), case (fold/model), corpus, rule set. Every report header states universe, case mode, normalization, corpus.
2. **Edit**. Drag/drop symbols between positions *and across layer tabs*; binding editor (kind + params); tables for combos (keys, binding, layers, role typing/command, timeout) and adaptive keys (default + triggers, strict-modifiers); geometry picker (presets, per-column y offsets, thumb positions, key count); finger brush; **Typing paths panel**: symbols with ≥2 producers, alternatives as chips (drag to reorder, toggle, `when` condition shown for context producers), activators per layer per source layer, repeat policy. Live re-analysis (§5.6 relabel or worker re-simulation with progress).
3. **Compare** (2-way in v1). Same corpus/rules; delta bars, band labels, per-metric winner; synchronized hover; shareable URL.
4. **Rules**. Rule list by family (toggle, weight, params, bands); presets (`Layouts Doc`, `cyanophage-like`, `Keysolve-like`, `Romak author`); **Composer** (§7.3) + JSON tab; import/export; reset to preset.
5. **Corpus**. Language/corpus picker, EN↔PT-BR mix slider, paste/upload (worker → IndexedDB), corpus facts (letter/bigram/trigram/word frequencies), normalization options, coverage check against the current layout.
6. **Library**. Bundled layouts (Qwerty, Dvorak, Colemak, Colemak-DH, Graphite, Gallium, Canary, Sturdy, APTv3, Hands Down Neu/Promethium, Nerps, Semimak, Recurva, Engram, BEAKL, Romak 34, Romak 24, Magic Romak…), user layouts (local), share links, JSON import/export, text import.

### 4.2 Visual design
- Dark theme default + light theme; system preference honored.
- Keyboard SVG: rounded keys, tap legend centered, hold legend bottom, layer-activator badge, thumb clusters rotated per geometry, split gap; heat colors from a perceptually uniform, color-blind-safe sequential ramp; SFB/scissor/path overlays as arcs between keys.
- Typography: one UI sans + a monospace for symbols/legends; tabular figures in tables.
- Responsive: ≥1280px three columns (canvas | panels | sidebar); 768–1279 two columns; <768 single column with a **sticky mini keyboard + summary strip**, panels as an accordion; canvas scales via `viewBox`; lists virtualized. Touch: tap-to-select then tap-to-drop as drag fallback.
- Accessibility: keyboard navigation for editors, ARIA labels on keys, contrast ≥ 4.5:1, reduced-motion respected.
- Empty/error states: invalid layout (missing/duplicate letters for the corpus alphabet), unproducible symbols, corpus too small, worker busy.

### 4.3 URL, persistence & GitHub storage
- **URL** carries: layout id (library or saved) or an inline compressed layout, geometry preset id, corpus id(s) + mix, rule set id (+ compressed diff), universe/case toggles, typing-path selections, view. The router keeps it in sync; parameters at their default are omitted, and keys are written in a fixed order, so the same analysis always produces the same link. Inline layouts are `deflate`-compressed and base64url-encoded — byte-compatible with the Elixir implementation, so links are interchangeable between the two.
- **Browser storage** (always on): documents live in **IndexedDB** — object stores `layouts`, `rulesets`, `corpora`, each document keyed by its slug id, plus a per-collection index and a SHA-1 content hash used as the version. This is the only storage the app needs; it is written first on every save, so nothing is lost to a network problem.
- **Repository storage** (optional, per browser): the user points the app at **a repository they own** — `owner/name`, branch and directory — and supplies a **fine-grained personal access token** scoped to that repository with read and write on contents. Files: `layouts/<id>.json`, `rulesets/<id>.json`, `corpora/<id>.json`, `index.json` per collection — the same JSON schema as the Elixir implementation, so a data repository can be shared between them. Reads go through the Contents API with ETag revalidation and an in-memory cache; **Save** = `PUT /repos/{repo}/contents/{path}` with the current blob `sha` (optimistic concurrency; a lost race surfaces as a conflict → reload and ask). Commit messages record the action and the document name.
- **Token handling**: the token is kept in `localStorage` under `layoutmaster:github-token`, in that browser only. It is never written into a link, an export, a commit, or an error message, and is sent to `api.github.com` and nowhere else. **Forget token** clears it. Because there is no server, no token is ever app-owned.
- **Storage adapter**: a `StorageAdapter` interface with `IndexedDbAdapter` (local), `GitHubAdapter` (remote) and `CompositeStorage` (local first, then remote; reads prefer the local copy, `pushAll` uploads everything saved so far).
- **Preferences** — theme, collapsed panels, edit-panel state, repository configuration — are kept in `localStorage` separately from documents. Custom corpora pasted or uploaded through the UI are processed in the worker and cached by content hash; the user may save them like any other document.

---

## 5. Typing simulator (core differentiator)

### 5.1 Machine state
`layerMask` (bit 0 always set), `layerLocks`, `oneShotLayers` (stack of `{layer, quickRelease}`), `heldLayers` (from `mo`/`lt` holds), `heldMods`, `stickyMods` (`{mod, quickRelease}`), `capsWord/autoLayer` (`{layer|mods, continueList}`), `lastKeycode` (keycode incl. implicit mod bits) and `lastSymbol`, `pendingDeadKey` (host composition), `layerAtPress[pos]`, `wordIndex`.
`lastKeycode`/`lastSymbol` are updated **only by keycode-emitting behaviors** (`kp`, `key_repeat`, adaptive branches that emit, macro bodies, `unicode`); layer/mod/one-shot/caps behaviors leave them unchanged. For a macro, `lastKeycode` = the last keycode emitted by its body, ignoring trailing non-keycode steps (`mc_qu` ends with `&sl ALTREP2` → `lastKeycode = U`); dead-key macros expose the **final letter keycode**, not the composed grapheme. Machine state **persists across word boundaries** regardless of the `crossWord` n-gram mode (§7.1).

### 5.2 Event pipeline (per physical action)
1. **Combo check**: chord of positions → candidate combos filtered by `highestActiveLayer ∈ combo.layers`; chord emits its binding and is recorded as one `chord` event (members kept for per-key heat).
2. **Layer walk**: from highest active layer down to base; `trans` passes, `none` swallows; snapshot `layerAtPress[pos]`.
3. **Behavior execution** (§5.3) → emits symbols and/or mutates state. Recursion for nested behaviors (mod-morph → hold-tap → adaptive → macro) with max depth 8.
4. **Post-step**: **one-shot consumption** — an armed one-shot layer is consumed by the first physical *press* after arming, whatever it resolves to (`kp`, `trans`, `none`, macro, modifier), once per press (a macro consumes it once, not per emitted keycode); consumption happens *after* the layer walk so that press still resolves on the sticky layer. A one-shot consumed by a key that resolves to `none`/base-`trans`, or by a modifier press, marks the event `wastedOneShot`. Sticky mods consumed per their `quickRelease`. Drop implicit mods ("Ab" rule). Run **conditional-layer fixed point**; enforce **locking**; update `lastKeycode`/`lastSymbol` per §5.1.
5. **Host layer**: keycode + effective mods → symbol via host locale (`us`, `us-intl`, `abnt2`) with dead-key composition. Bindings authored as `symbol` (`hostLocale: symbols`) bypass this.

### 5.3 Behavior semantics (intent-based)
| Behavior | Simulation |
|---|---|
| `kp` | Emit symbol (or keycode → host). |
| `mo L` / `lt` hold | `holdPress` event at hold start (a keystroke of that finger when `holdKeystrokeCounts`), `L` active until `holdRelease` after the last key that needed it; keys typed meanwhile flagged `underHold[L]`. Releases never enter n-gram tables. |
| `lt` tap / `hold_tap` tap | Resolved by intent: tap if the tap symbol is wanted, hold if the layer/mod is needed. |
| `sl L` | Tap event; `L` active for exactly the next press (quick-release); if that press is a modifier key or `sk`, the one-shot is consumed without producing — faithful; the planner never chooses that order (§5.4.4). |
| `tog L` / `to L` | Tap event; locking / exclusive semantics. |
| `sk mod` | Tap event; mod applies to the next key (release, or press with `quickRelease`); combines with other sticky mods (`ignoreModifiers`). |
| `caps_word` / `auto_layer` | Tap event; stays until a key outside `continueList`. |
| `key_repeat` | Tap event; emits `lastSymbol` (re-sends `lastKeycode`). |
| `adaptive` | First trigger whose `afterAny` contains `lastKeycode` wins (with `strictModifiers`: exact mod match; else mods ⊇ trigger mods); else `default`. In `hostLocale: symbols` mode triggers match `lastSymbol` and `strictModifiers` is ignored. `default`/`binding` may reference another adaptive (chain, max depth 4, same `lastKeycode`). `deadKeys` honored. Timing treated as satisfied. |
| `mod_morph` / `layer_morph` / `tap_dance` | Deterministic selection from held+sticky mods, active layers, or requested tap count (tap-dance = N tap events). |
| `macro` | One physical tap event; `steps` executed in order through the same state machine (layer changes, `sl` arming, nested macros); symbols concatenated. |
| `dead_key` (host) | Tap event; sets `pendingDeadKey`; next letter composes (or both emitted). |
| `unicode` | Tap event; emits symbol; hidden host events exposed to an optional cost rule. |
| Combos | Chord event: N simultaneous presses, one table entry (§7.1 `chordTransitionRule`); `role: typing|command` decides whether it is offered as a producer (D3). |

### 5.4 Resolver (text → key events)
1. **Producer index** `enumerateProducers(layout, caseMode)`: every producer for every symbol (direct keys per layer, `role: typing` combos, adaptive branches with their `afterAny` sets, repeat, macros with their strings, dead-key sequences). In fold mode, producers requiring an explicit modifier (e.g. `'` only after `LS(I)`) are excluded and listed in Coverage. Symbols with ≥2 producers populate the Typing paths panel (D3); default order = fewest physical presses → already-active layer → non-combo → lower rule penalty.
2. **Greedy tokenization**: left-to-right **longest match** over the (folded or cased) symbol stream among symbols with an enabled producer (`qu`, `ão`, `ões`), never crossing a word/punctuation boundary; equal length → typing-path order, then default order; **no backtracking** (a match is committed even if the remainder gets costlier). Per-macro opt-out.
3. **Activation planning**: if the chosen producer needs layer `L` not active, insert the **activator declared for `L` from the current layer** (`activators[L]` entries with `from`); if a one-shot layer is already armed (CCEDIL after `ç`, SEN_CASE after `. `), producers on it are preferred automatically. If no activator path exists, the producer is unavailable (Coverage).
4. **Case (D4)**: fold mode ignores case. Model mode resolves an uppercase symbol via (a) a producer on the layer's declared `shiftedTwin`, else (b) sticky/held shift **emitted before** the layer activator + lowercase producer (the order "activator then modifier" is rejected because the modifier press would consume the one-shot), honoring caps word/sentence case state.
5. **Space**: always a real press on `keys.space`; excluded from the default universe view.
6. **Unproducible symbols**: dropped from the key stream and treated as a **hard n-gram boundary** (like a word boundary) in both `crossWord` modes; excluded from all denominators; counted in `coverage.unproducible`.
7. **Determinism & explainability**: each word yields a trace (used by "How is this typed?", Hard words, same-hand strings).

### 5.5 Fast path
Skip simulation and use corpus n-gram tables directly (relabeled symbol→position through the layer-0 map) only when **all** hold: every corpus symbol has exactly one producer and it is a layer-0 direct key; no adaptive/repeat/macro/combo/dead-key producers enabled; `caseMode = fold`; no shifted twin in use; the corpus tables were built with the same `crossWord` mode; precomputed skip tables cover the rule set's max skip; no enabled rule references `keyKind`, `layer`, `underHold`, `producerKind` or run/word sources beyond what the tables provide. Otherwise simulate the raw sample (1–5 MB) in a worker.

### 5.6 Output, caching, relabeling
Key event stream → **physical tables** (both universes) + runs + word traces, cached by `structureHash`. `structureHash` covers everything except the `symbol` field of *relabel-eligible* `kp` bindings: layer ids/order, binding kinds and params, activators, typing paths, combos, adaptive behaviors, macro bodies, `hostLocale`, geometry key set, finger map, `caseMode`, `crossWord`, corpus id. A symbol is **relabel-eligible** only if it appears in no adaptive trigger set, no macro body, no combo binding and no dead-key sequence. Swapping two eligible symbols between positions applies a position permutation to the cached tables (instant editing); any other edit re-simulates.

---

## 6. Geometry & fingering

### 6.1 Units, rows, columns, presets
- 1U = 19.05 mm; default key `w = h = 1`. Rows: 0 top, 1 home, 2 bottom, **3 thumb**. Thumb keys have `isHome = false` and are excluded from row-based predicates unless a rule sets `includeThumbs: true`. Canonical `col`: 0 outer-pinky, 1 pinky, 2 ring, 3 middle, 4 index, 5 inner (`1333+2` has no col 0 or 5). Coordinates are absolute post-rotation centers per hand (`rotation` is render-only); **distance is defined only within a hand** (cross-hand pairs → `null`, skipped by distance rules).

| Preset | Keys | Defaults |
|---|---|---|
| `3x5+2` (default) | 34 | column y-offsets (U, + = lower): pinky +0.25, ring 0, middle −0.25, index 0, inner n/a; thumbs at y = +1.25, x = index column −0.5 / +0.5 |
| `3x5+3` | 36 | as above, third thumb at +1.5U outward |
| `3x6+3` | 42 | adds inner column (col 5) at offset +0.25 |
| `1333+2` | 24 | pinky = home-row key only (col 1), cols 2–4 × 3 rows, thumbs `L1 L0 R0 R1` |
| `ansi`, `iso` | 60% rows 0–2 + space | row stagger: top +0.25U, bottom +0.5U; ISO extra key left of Z; fingering `standard` or `angle-mod` (Doc ch. 2). Angle mod **refingers only**; text import offers "un-angle-mod" (letter shift) as an explicit transform. |
| custom | any | JSON + visual offsets editor; ZMK physical-layout import (`&key_physical_attrs w h x y rot rx ry`, centi-units) = v1.x |

Text import (3 rows × 10 + optional thumb token; 30/33/34/35-char cyanophage/cmini/Keysolve conventions incl. `^`) maps onto the chosen preset by column; for `1333+2` a mapping dialog assigns dropped letters to alpha 2.

### 6.2 Fingering
Default finger per column; thumbs per side; angle-mod tables; user brush. Alt-fingering per bigram = v2.

### 6.3 Distance
`distance(a,b)` on key centers in U within a hand; models `euclid` (default), `squared` (Genkey/Oxeylyzer), `manhattan`. Finger travel from the finger's previous key (Doc 4.6); `resetToHomeAtWordStart` option (cyanophage-like, default off); optional per-finger multipliers. LSB thresholds are **absolute `xDistance` in U** (2.0 adjacent, 3.5 semi-adjacent) computed from real coordinates, so row stagger and angle mod are handled by geometry alone.

---

## 7. Metrics, rules, presets

### 7.1 Global rule-set parameters
`universe: no-space|with-space` (D5); `crossWord: reset|bridge` (default `reset`: a word boundary breaks n-gram accumulation, like Genkey/Keysolve/cyanophage; `bridge` counts inter-word transitions per Doc 4.6; affects tables only, never machine state); `repeatsCountAsSFB: false`; `skipWeights: [0.5, 0.25, 0.125]`; `distanceModel`; `normalization: percentOfNgrams|percentOfKeystrokes`; `chordTransitionRule: max|centroid` (a chord is one table entry: `centroid` = synthetic position at the member centroid; `max` = worst-case member finger/hand for pairwise predicates); `holdKeystrokeCounts: true`; `includeThumbsInRows: false`; `bugCompat: false`.

**Keystroke definition** (denominator unit):

| Counted as 1 keystroke | Never counted |
|---|---|
| `kp` tap, layer tap (`sl`, `tog`, `to`, `lt`-tap), sticky-mod tap, `key_repeat`, adaptive tap, macro (1 per physical press), chord (1), `holdPress` (if `holdKeystrokeCounts`), space (only in `with-space`) | keycodes emitted inside a macro, `holdRelease`, host dead-key composition steps, unproducible symbols |

**Denominators** for a stream of K keystrokes over W words: `reset` mode — bigrams K−W, skip-s grams K−W·(s+1) (clamped ≥0 per word), trigrams K−2W; `bridge` mode — K−1, K−s−1, K−2. `percentOfKeystrokes` divides by K (the `cyanophage-like` preset adds W in the `no-space` universe to mirror its one-space-per-word count).

### 7.2 Default rule catalog (all editable/removable)
**Bigram**: SFB % (+ per finger, 1U vs 2U split, distance-weighted), Repeats (same key), LSB % (absolute 2U / 3.5U thresholds), FSB %, HSB % (finger-height preference table; adjacent ×1, non-adjacent ×0.5; `keysolveMode` counts all ring–middle jumps), Center-column usage, Thumb bigrams (thumb→same-hand key, thumb double tap), Layer-tap SFB (two consecutive taps on the same thumb).
**Skipgram**: SFS % (skip 1..3 weighted), SFS distance, LSS, FSS, HSS, Alt-SFS (cyanophage).
**Trigram**: Alternation, Roll in, Roll out, In:out ratio, 3roll/Onehand (in/out), Redirect, Weak redirect, Other, `bigram roll in/out` (cyanophage compat).
**Runs/words**: Same-hand run histogram, Same-hand strings (top list), Hard words (per-word effort ranked per character, ≥4 letters), Word effort distribution.
**Usage/balance**: Finger usage %, Hand balance (with/without space), Row usage, Column usage, Pinky-off %, Home-row %, Finger distance / finger speed, Layer distribution (keystrokes per layer).
**Effort**: Per-key effort grid (default: cyanophage grid extended with thumbs = 1, inner column = 5), Total effort.
**Layer (new)**: Layer taps per 100 symbols, one-shot activations per word, Wasted one-shots, Macro usage, Adaptive hit rate (trigger branch vs default/fallback producer), Combo usage, Extra keystrokes per symbol (keystrokes / symbols − 1).

Every rule outputs: value, band, top offenders (n-grams with %, distance), per-key heat contribution, per-finger split.

### 7.3 Rule composer (D7) — JSON shape
```json
{ "id": "fsb", "label": "Full scissor bigrams", "family": "bigram", "enabled": true,
  "source": "ngram", "ngram": { "n": 2, "skip": 0 },
  "params": { "fingerHeightPreference": { "LI": "lower", "LM": "highest", "LR": "belowMiddle", "LP": "aboveIndex" } },
  "where": { "all": [ {"sameHand": true}, {"sameFinger": false},
                      {"rowDelta": {"abs": 2}}, {"fingerHeightPreference": "violated"} ] },
  "weight": { "adjacentFingers": 1.0, "nonAdjacentFingers": 0.5 },
  "aggregate": "percentOfNgrams",
  "bands": { "direction": "lowerIsBetter", "bounds": [0.1,0.15,0.25,0.35,0.45,0.55,0.7] },
  "score": { "weight": 0 } }
```
- `source`: `ngram` (`n` ∈ {1,2,3}; `skip` = number **or array** — an array sums matches weighted by `$global.skipWeights`), `run` (`{by: hand|finger|layer}` → `histogram(runLength)`), `word` (per-word traces → `perWord`, `topWords`, `weightedSum(table)`; also carries per-key effort grids).
- `where`: `all` / `any` / `none` combinators; set predicates accept `{"in": [...]}`; every pairwise predicate accepts `at: [i, j]` (0-based n-gram indices) to restrict to a sub-pair (needed for cyanophage's `bigram roll in/out` and adjacent-pair scissors inside trigrams).
- Predicates: `hand`, `sameHand`, `finger`, `sameFinger`, `sameKey`, `fingerPair`, `adjacentFingers`, `includesFinger`, `row`, `rowDelta`, `colDelta`, `xDistance`, `yDistance`, `distance`, `direction` (inward/outward), `monotone` (same direction across the n-gram), `changesDirection`, `handPattern` (`LRL`, `LLR`…), `isThumb`, `isHome`, `isInner`, `keyKind` (`alpha|layerTap|shift|space|repeat|magic|combo|hold`), `layer`, `underHold`, `wordBoundary`, `fingerHeightPreference` (table param), `producerKind` (`direct|combo|adaptive|repeat|macro|deadkey`), `adaptiveBranch` (`trigger|default`), `oneShotWasted`, `activatorFor(layer)`.
- Aggregations: `count`, `percentOfNgrams`, `percentOfKeystrokes`, `per100(symbols|keystrokes|words)`, `sumDistance`, `perFinger`, `perHand`, `perKey`, `perLayer`, `perSymbol`, `ratio(ruleA, ruleB)`, `ratioOf(where, where)`, `histogram(runLength)`, `perWord`, `topWords`, `weightedSum(table)`.
- `$global.<name>` may appear in any numeric position and resolves against §7.1. Composer UI builds this JSON; JSON tab for power users; JSON-Schema validated.

### 7.4 Presets
`Layouts Doc` (§2.1 definitions and bands, no score); `cyanophage-like` (column-pair LSB, adjacency scissors, `percentOfKeystrokes` incl. one space per word, `crossWord: reset`, repeats excluded, effort grid, `bugCompat` optional); `Keysolve-like` (ring–middle scissors, ortho/stagger, bigram normalization); `Romak author` (Doc rules + layer family weighted, PT-BR+EN mix). Composite score (D6): `Σ w_i · normalize_i(value)` with normalization by bands or user min/max; disabled unless the preset enables it.

---

## 8. Corpus pipeline (D8)

- **Shipped**: `en-general` (Leipzig eng news/web sample or equivalent CC-BY), `en-quotes` (MonkeyRacer-style, license permitting), `en-work` (romak `corpus_en.txt`), `pt-br-general` (Leipzig por-br sample, accents intact), `pt-br-work` (romak `corpus_pt.txt`), `mix` (EN↔PT-BR slider). Provenance + license per corpus in `packages/corpora/manifest.json`; vendored parity snapshots of the cyanophage/Keysolve word lists live there too (§11).
- **Build** (`packages/corpora`): normalize (NFC; folded and cased copies; `’→'`; whitespace collapse; sentence boundaries kept; digits and non-alpha symbols stripped except `, . ' ; / -` and language letters) → `unigram/bigram/trigram/skip1-3.json` (built in both `crossWord` modes), `words.json`, `sample.txt` (1–5 MB, sentence-aligned). Budget ≤ 3 MB gzipped per corpus. A 20 kB **fixture corpus** (EN+PT-BR) is checked into `packages/core` for tests.
- **Custom**: paste/upload → same pipeline in a Web Worker → IndexedDB; minimum 1 kB; language tag for coverage checks.
- **Coverage report**: unproducible symbols and case-mode-excluded producers.

---

## 9. Native layout format (D1) — `layoutmaster/layout@1`

```json
{ "format": "layoutmaster/layout@1", "name": "Magic Romak", "author": "Rafael Romão",
  "languages": ["pt-BR", "en"], "hostLocale": "symbols",
  "geometry": { "preset": "1333+2" },
  "keys": { "space": "L0", "shift": { "key": "R1", "kind": "sk" } },
  "behaviorDefaults": { "sl": { "quickRelease": true, "ignoreModifiers": false, "releaseAfterMs": 1000 },
                        "sk": { "quickRelease": true, "ignoreModifiers": true, "releaseAfterMs": 1500 } },
  "layers": [
    { "id": "alpha1", "name": "Alpha 1", "shiftedTwin": "case_a1", "bindings": {
        "LTR": {"kind":"kp","symbol":"b"},
        "RBI": {"kind":"hold_tap","tap":{"kind":"adaptive","ref":"magic"},"hold":{"kind":"mod","mod":"LGUI"}},
        "L1":  {"kind":"hold_tap","tap":{"kind":"adaptive","ref":"altRepeat"},"hold":{"kind":"mo","layer":"nav"}},
        "L0":  {"kind":"hold_tap","tap":{"kind":"adaptive","ref":"sentenceSpace"},"hold":{"kind":"mo","layer":"num"}},
        "R0":  {"kind":"mod_morph","mods":["LSHIFT","RSHIFT"],"keepMods":[],
                "default":{"kind":"hold_tap","tap":{"kind":"sl","layer":"alpha2"},"hold":{"kind":"mo","layer":"sym"}},
                "morphed":{"kind":"sl","layer":"sft_a2"}},
        "R1":  {"kind":"sk","mod":"LSHIFT"} } },
    { "id": "alpha2", "name": "Alpha 2", "shiftedTwin": "sft_a2", "bindings": {
        "LTM": {"kind":"macro","steps":[{"kind":"kp","symbol":"q"},{"kind":"kp","symbol":"u"},{"kind":"sl","layer":"altrep2"}]},
        "LBM": {"kind":"macro","steps":[{"kind":"kp","symbol":"ç"},{"kind":"sl","layer":"ccedil"}]},
        "RHR": {"kind":"macro","symbols":"á","then":[{"kind":"sl","layer":"altrep2"}]},
        "*":   {"kind":"trans"} } },
    { "id": "ccedil", "name": "Ç extension", "bindings": {
        "RHR": {"kind":"kp","symbol":"ã"}, "RBR": {"kind":"kp","symbol":"õ"},
        "LHI": {"kind":"macro","steps":[{"kind":"macro","ref":"atil"},{"kind":"kp","symbol":"o"}]},
        "L1":  {"kind":"sl","layer":"alpha2"}, "*": {"kind":"trans"} } },
    { "id": "sft_a2", "name": "Shifted Alpha 2", "bindings": { "RHR": {"kind":"kp","symbol":"Á"}, "*": {"kind":"trans"} } } ],
  "behaviors": {
    "magic": {"kind":"adaptive","strictModifiers":true,"default":{"kind":"kp","symbol":"h"},
              "triggers":[{"afterAny":["a","e","i","o","u"],"binding":{"kind":"kp","symbol":"v"}}]},
    "altRepeat": {"kind":"adaptive","default":{"kind":"key_repeat"},
              "triggers":[{"afterAny":["a"],"binding":{"kind":"kp","symbol":"h"}},
                          {"afterAny":["y"],"binding":{"kind":"kp","symbol":"d"}},
                          {"afterAny":["v","x","j"],"binding":{"kind":"sl","layer":"alpha2"}}]},
    "a2AltRepeat": {"kind":"adaptive","default":{"kind":"adaptive","ref":"altRepeat"},
              "triggers":[{"afterAny":["a","e","o"],"binding":{"kind":"kp","symbol":"x"}},{"afterAny":["u"],"binding":{"kind":"macro","ref":"ecir"}}]},
    "sentenceSpace": {"kind":"adaptive","default":{"kind":"kp","symbol":" "},
              "triggers":[{"afterAny":[".","?","!"],"binding":{"kind":"macro","steps":[{"kind":"kp","symbol":" "},{"kind":"sl","layer":"sen_case"}]}}]},
    "capsWord": {"kind":"auto_layer","layer":"case_a1","continueList":["alpha","_","Backspace"]} },
  "combos": [ {"id":"ns","keys":["LHR","LHM"],"binding":{"kind":"kp","symbol":"q"},"layers":["alpha1"],"role":"command","timeoutMs":30,"slowRelease":false} ],
  "conditionalLayers": [],
  "typingPaths": {
    "q": [ {"producer":"direct:alpha2/LTR","enabled":true}, {"producer":"combo:ns","enabled":false} ],
    "h": [ {"producer":"adaptive:magic#default","enabled":true}, {"producer":"adaptive:reversedMagic#trigger","when":{"afterAny":["a","e","i","o","u"]},"enabled":true} ],
    "ã": [ {"producer":"direct:ccedil/RHR","enabled":true}, {"producer":"direct:alpha2/RHR","enabled":true} ] },
  "repeatPolicy": { "doubledLetters": "repeatKey|tapTwice", "default": "repeatKey" },
  "activators": { "alpha2": [ {"from":"alpha1","via":"key:alpha1/R0"}, {"from":"ccedil","via":"key:ccedil/L1"} ],
                  "sft_a2": [ {"from":"alpha1","via":"key:alpha1/R0","requires":{"mods":["LSHIFT"]}} ] } }
```
- Binding shapes: `kp{symbol|keycode}`, `trans`, `none`, `mo{layer}`, `lt{layer,tap}`, `sl{layer,quickRelease?,ignoreModifiers?,releaseAfterMs?}`, `tog{layer,mode}`, `to{layer}`, `sk{mod,quickRelease?,ignoreModifiers?}`, `caps_word{continueList,mods}`, `auto_layer{layer,continueList}`, `key_repeat`, `mod_morph{mods,default,morphed,keepMods}`, `layer_morph{layers,active,inactive}`, `tap_dance{bindings[]}`, `macro{steps[] | symbols+then[], ref?}` (steps execute in order; nested macros allowed; `symbols` is sugar for an all-`kp` body), `adaptive{default,triggers[{afterAny,binding}],strictModifiers,deadKeys,ref?}`, `hold_tap{tap,hold,flavor?,tappingTermMs?}` (timing fields recorded, unused in v1), `dead_key{diacritic}`, `unicode{symbol,shiftedSymbol?}`, `mod{mod}`.
- `bindings["*"]` = default for unlisted keys. `hostLocale: symbols` → bindings carry output symbols; `us|us-intl|abnt2` → keycode-based bindings with dead-key composition and `afterAny` matched on keycodes incl. mods.
- `typingPaths[symbol][]` entries: `producer` id (`direct:<layer>/<key>`, `combo:<id>`, `adaptive:<ref>#trigger|default`, `repeat`, `macro:<layer>/<key>`), optional `when.afterAny`, `enabled`. `activators[layer][]`: `{from: <layerId>|"*", via: "key:<layer>/<key>", requires?}`. `repeatPolicy` handles doubled letters separately from symbols.
- JSON Schema (draft 2020-12) ships in `packages/core/schema/`. Text import/export per §6.1; keymap-drawer YAML import (v1.x): `layers` (`t/h/s`), `combos` (`p`, `k`, `layers`), `cols_thumbs_notation` → geometry.

---

## 10. Architecture (D10, TypeScript static SPA)

```
layoutmaster/                       pnpm workspace, no server
  packages/core/src/                engine — pure TypeScript, no DOM, runs in a worker and in Node
    geometry/    presets.ts, distance.ts, types.ts (fingering, columns, distance models)
    layout/      schema.ts (zod validation), compile.ts, text.ts (import/export), json.ts (canonical form), ops.ts, labels.ts
    host/        locale.ts (us, us-intl, abnt2 tables; dead-key composition)
    sim/         machine.ts (state machine §5.1–5.3), producers.ts, resolver.ts (§5.4)
    tables/      tables.ts (logical keys, n-gram accumulators, travel)
    rules/       engine.ts, predicates.ts (compiled closures), catalog.ts (built-ins as data), presets.ts, bands.ts, effort.ts, serialize.ts
    corpus/      normalize.ts, corpus.ts, node-loader.ts
    analysis/    analyze.ts (orchestration), hash.ts (structure hash), relabel.ts, cache.ts (LRU)
    storage/     ids.ts (slugs, document paths, index entries), the StorageAdapter interface
    layouts/     bundled layouts (classic, Romak family)
    golden/      parity suite against reports dumped from the Elixir implementation
  packages/corpora/src/build.ts     builds the shipped corpus tables from raw text
  apps/web/src/
    engine/      analysis.worker.ts, protocol.ts (postMessage RPC), worker-client.ts, direct-client.ts (tests),
                 report-dto.ts, corpus-loader.ts, heat.ts, use-analysis.ts
    views/       AnalyzeView, EditView (+ edit/reducer, panels), CompareView, RulesView (+ rules/composer),
                 CorpusView, LibraryView
    components/  Keyboard (SVG + drag), LayerTabs, Metrics, Shell
    url/         params.ts (codec, defaults omitted), inline.ts (deflate + base64url)
    storage/     indexeddb.ts, github.ts, composite.ts, StorageSettings.tsx, use-storage.tsx
    state/       session.ts, theme.ts, toasts.ts
```
- **Engine API**: `analyze(layout, corpus, ruleSet, opts): Report`; `simulate(compiled, stream, opts): Simulation`; `enumerateProducers(compiled, caseMode)`; `explain(compiled, text, opts)`; `relabel(tables, mapping)`; `structureHash(layout, opts)`. The UI never calls these directly: it talks to an `AnalysisClient` — `WorkerClient` in the app, `DirectClient` in tests — over a `postMessage` protocol, so a long analysis never blocks rendering and can be superseded by a newer request. Results are cached in an LRU keyed by `structureHash` × corpus × options.
- **Performance** (measured on the reference machine): 300 k-symbol sample **576 ms**; full corpus (~1 M symbols) **1.36 s**; rules over tables well under 200 ms; an eligible swap re-scores existing tables via `relabel` in **12 ms** instead of re-simulating. Budgets from the Elixir revision (3 s / 10 s / 200 ms) are met with room to spare, so no native escape hatch is needed.
- **Parity**: `packages/core/golden/` holds 38 reports dumped from the Elixir implementation (`golden_dump.exs`) plus the layouts and inline URLs they came from; the suite asserts every metric to 1e-6. Three deliberate differences are recorded in `golden/DEVIATIONS.md` — one of them a defect in the reference (LSB/LSS always zero because a nested `$global.` reference never resolves).
- **Quality gates**: vitest for every behavior, rule and trace, plus React Testing Library per view; `biome check` (format + lint), `tsc --noEmit` in strict mode, and the full test suite in CI. Deployment is `vite build` to static files published to GitHub Pages, with `index.html` copied to `404.html` so deep links resolve.

---

## 11. Validation & acceptance

1. **Parity** (against vendored snapshots of each tool's word list, licenses in the manifest): `cyanophage-like` preset with `bugCompat: true` reproduces playground SFB, LSB, scissors, finger usage and trigram categories for Qwerty/Colemak-DH/Graphite within ±0.05 pp; with `bugCompat: false` only sign and ranking of deltas are asserted. `Keysolve-like` preset matches SFB/LSB/HSB/FSB/SFS/ALT/ROL/ONE/RED within ±0.1 pp.
2. **Simulator scenarios** (unit tests): `sl` consumed by exactly one press; `sl` + modifier press consumes without output (flag `wastedOneShot`); `to` vs `tog` locking; conditional-layer fixed point; combo filtered by highest active layer; macro arming a one-shot layer and nested macros; adaptive trigger precedence, `strictModifiers`, chaining; `lastKeycode` unchanged by layer taps; greedy `qu`/`ão` with boundary rule; caps word ends on non-continue key; hold press/release around held sequences; unproducible symbol as hard boundary.
3. **Romak acceptance traces** (each pins its typing-path selection and expected press count): `ação` with `ão` macro enabled → `a · ² · ç · ão` (4 presses); with the macro disabled → `a · ² · ç · ã · o` (5 presses); `açúcar` needs a second `²`; `chave` via magic/reversed-magic per selected paths; `ll` via repeat when `repeatPolicy = repeatKey`; in shift-model mode a sentence start after `. ` adds no shift press.
4. **UI**: responsive screenshots at 375/768/1280/1920; drag/drop across layers; path picker state round-trips through the URL; compare deltas correct; custom corpus round-trip.

---

## 12. Milestones

Delivered on `ts-implementation`, each milestone gated on the parity suite staying green.

| M | Scope | Exit criteria (met) |
|---|---|---|
| M0 | pnpm workspace, TypeScript strict, Biome, vitest, Vite; CI (check/typecheck/test/build); golden dump from the Elixir app | tooling green, 38 reference reports checked in |
| M1 | Engine: geometry + presets, layout schema/compile, host locales, **simulator**, tables, text import/export, bundled layouts, rules engine + catalog + presets + bands, analysis + relabel + cache | §11.2 scenarios and §11.3 traces green; all 38 golden reports match to 1e-6 |
| M2 | Corpora: build pipeline, shipped corpora, mix, custom upload path | corpus tables byte-identical to the Elixir build; Node loader and bench on real corpora |
| M3 | App shell: routing with byte-compatible URLs, theme, navigation, worker client, Analyze view | Magic Romak analyzable end-to-end; a link round-trips through both implementations |
| M4 | Library, Compare (2-way) and Corpus views | saved layouts listed and loaded, deltas shown, corpora browsable and buildable |
| M5 | Edit view: drag/drop across layers, binding editor, combos/adaptive tables, geometry picker, typing-path panel | eligible swaps re-scored by relabel (12 ms), not re-simulated |
| M6 | Rules view + composer: enable, re-parameterize, compose, save a set | rules expressible per §7.3; sets round-trip through storage and the URL |
| M7 | Storage (IndexedDB + optional user repository), a11y and responsive pass, docs, static deploy | save/load round-trip locally and to a repository; §10 budgets met; docs published |
| v1.x | keymap-drawer YAML import, ZMK physical-layout import | |
| v2 | ZMK `.keymap` importer (cpp + tree-sitter devicetree), timing model, numbers/symbols layers, JS rule plugins, optimizer, alt-fingering | |

---

## 13. Risks & mitigations
- **Path explosion** in the resolver: bounded by user-selected paths (D3), no-backtracking tokenization, producer index cached per `structureHash`.
- **Comparability confusion**: every report labels universe/case/normalization/corpus; presets replicate other analyzers' normalization exactly; `bugCompat` isolated.
- **Corpus licensing**: manifest with provenance; CC-BY/public-domain sources; user corpora stay local.
- **PT-BR fidelity**: accents are distinct symbols end-to-end; coverage report flags folded/unproducible characters; host-locale tables validated against `zmk-locales keys_pt_abnt2.h`.
- **Performance on mobile**: fast path + cached tables + worker; reduced sample size with notice.

## 14. Sources
Layouts Doc 3rd ed. (§2.1 link); cyanophage.github.io + repo `cyanophage/cyanophage.github.io`; grassfedreeve.github.io/keysolve-web; klanext.keyboard-design.com; rafaelromao.github.io/romak, rafaelromao.github.io/keyboards, repos `rafaelromao/romak`, `rafaelromao/keyboards` (local: `/Users/rromao/projects/keyboards/src/features/{adaptive,accents,combos,sentence,smart}.dtsi`, `src/definitions/config.dtsi`); zmk.dev/docs (keymaps, behaviors, combos, conditional layers, macros, hold-tap, sticky key/layer, physical layouts) and `zmkfirmware/zmk` source (`keymap.c`, `combo.c`); `urob/zmk-adaptive-key`, `urob/zmk-auto-layer`, `urob/zmk-unicode`, `joelspadin/zmk-locales`, `caksoylar/keymap-drawer` KEYMAP_SPEC.
