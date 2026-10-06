# LayoutMaster — v1 Specification
Keyboard layout analyzer with faithful ZMK layer semantics (multi-alpha-layer aware)

> The implementation is the TypeScript static SPA (D10, §10). Sections 2–9 and 11 describe behavior and are stack-neutral.

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
| D8 | Corpora: per language a **general** corpus (Leipzig/MonkeyRacer-style) **+ a conversational corpus** generated from OpenSubtitles word frequencies, EN+PT-BR **mix slider**, custom paste/upload. |
| D9 | Geometry default **3x5+2 (34 keys)**; presets `3x5+3`, `3x6+3`, the Hummingbird family `23332+2` (Hummingbird, Rommana), `23332+1`, `13332+2`, `13332+1` (ʻākohekohe, Visorbearer), `13331+2` (Smallcat), `1333+2`, `1222+2`, ANSI, ISO (+ angle mod), custom editor. |
| D10 | Stack (revised 2026-09-07; sign-in added 2026-10-05): **TypeScript, static single-page app, plus one small sign-in function** — pnpm workspace with the engine in `packages/core` (pure TypeScript, runs in a worker and in Node), corpus build in `packages/corpora`, UI in `apps/web` (React + TanStack Router + Tailwind/daisyUI). The engine runs in a **Web Worker**; analyses never block the interface. **Storage = the browser (IndexedDB) plus, optionally, the user's GitHub account** — their fork of layoutmaster, or secret gists — reached by **signing in with GitHub** (a GitHub App) — see §4.3/§10. Deployed as static files behind a CDN (Cloudflare Pages); the only server code is the sign-in exchange, a Pages Function that holds the app's client secret and keeps no documents. Any static host serves the app; without the function it saves in the browser only. |
| D11 | v1 UI: **five views** (Analyze, where a layout is also edited; Compare [2-way]; Rules; Corpus; Library), plus the Guide that documents them. |
| D12 | **English UI only**, no i18n layer. |

### Non-goals (v1)
Optimizer/generator; numbers/symbols/nav layers; real timing model; home-row-mod timing analysis; a backend or accounts of our own (signing in with GitHub is optional, and GitHub holds the documents); ZMK `.keymap` parsing; JS rule plugins; alt-fingering overrides; UI translation.

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
| **Keymap** | Ordered **layers**; each maps key id → **binding**; plus **combos**, **conditional layers**, named **behaviors**, and declarative **features** (sentence case, caps word) the compiler wraps their keys with. Magic keys and alt repeats are `adaptive` bindings on their keys. Layer 0 = base. |
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
1. **Analyze** (`/analyze`). Keyboard canvas (SVG) with **layer tabs**, heat-map mode (usage, SFB contribution, distance, effort, layer taps; each layer counts only the presses made on it, on the key that typed them), hand-split badges. **Summary strip**, led by the two headline numbers every view shows and sorts by, Effort and SFB, then (Keysolve-style: SFB · SFS · LSB · FSB/HSB · Alt · Roll · One · Redir · Pinky-off · Hand use, Doc band colors). **Metric panels** (collapsible cards, sortable top-N lists; a click on a card away from its controls opens it enlarged; hover/click an n-gram → keys highlight, the typing path is drawn as arrows and the board turns to the layer the n-gram is pressed on, the upper one when it crosses layers; a pair ending on a layer key also opens what that key was pressed for: the keys pressed next, on the board of the layer it reaches and as a list, each with its part of the pair). **"How is this typed?"** box: type a word → the board plays it press by press, switching to the layer each press lands on, a combo's keys pressed together and a held thumb marked while held, with no arrows; the step list `[a] [² thumb] [ç] [ã (Ç-ext)] [o]` marks the press shown, steps to any one, and pauses or plays (it does not start on its own when the system asks for reduced motion). Combos with the typing role are drawn as pills between their keys on the layers they fire on, and a pill lights up while its combo is played; a toggle hides them. **Coverage**: every character of the text the layout cannot type, each with its count and share, most frequent first, and the punctuation skipped. **A key's numbers**: the selected key, on the layer shown, gives its share of the presses and of layer taps, its part of every number that is a sum over keys (`key_scale`, §7.2) with that number and the share it makes, each number's n-grams through the key from the worker (opened per number, clicking one outlines it), and for a layer key what it was pressed for, also on the board of the layer it reaches. The shared settings bar (below), plus the sample size and a second corpus to mix in. Every report header states universe, case mode, normalization, corpus.
2. **Editing, in Analyze**. The board and one **key inspector**, the same on a phone and at a desk, beside every number of the analysis, which follows each edit. Selecting a key (tap, click or `Space`) opens it: a preview of the cap, what the key does in words, and a row of **kind tiles** — Symbol, Layer, Modifier, Tap-hold, Repeat, Magic, Macro, Transparent, Nothing, and under More: alt repeat, tap dance, morph, caps word, Unicode, dead key, behaviour. Each kind shows its own controls, and every part of a bigger key (a tap-hold's tap and hold, a magic key's default and branches, a tap dance's taps) carries its own compact kind choice, recursively, so every binding the model has — adaptive keys and alt repeats with their triggers and tags included — is built and edited with controls rather than refused. A magic key or an alt repeat is the same kind of key wherever it came from: a binding on its key, its branches tried from the top and reordered with arrows, a tagged branch above a plain one making a second stage; a tap-hold's tap can be one. Every change commits at once and is undoable. The bindings the layout already uses, its magic keys and alt repeats first, and imported keys are offered as chips to reuse; a chip puts a copy on the key. The binding can also be typed in ZMK's own syntax (`&kp ç`, `&lt num a`, `&mo sym`, `&macro ão then alpha2`), with completion and a legend preview, and typing a character on a focused key starts it there; a binding the syntax cannot write whole is not offered as text, so the field starts empty and replaces it only when committed. A key that sentence case or caps word wraps is edited as that feature (punctuation, continue list) and can be taken off one key without touching the others. Drag to swap, `Alt` to copy, drop on a layer tab to send, each also a button (swap with…, copy to…, send to layer…). **Layers**: rename (field, or the tab by double-click, `F2` or long-press), reorder (arrows or drag; the base stays first and a later layer wins), colour (Automatic by place, or one of the palette's seven, each with a light and a dark shade; the copy a duplicate makes starts on Automatic), duplicate, and remove — refused while any key, combo or behaviour still reaches the layer, naming each. Panels: Layers; Features; Geometry (presets, space and shift keys); Combos (keys picked on the board, output in the same syntax, layers, role typing/command); Behaviors; **Typing paths** (symbols with ≥2 producers, alternatives as chips — drag to reorder, toggle, `when` condition shown for context producers — and repeat policy; the keys that reach each layer are drawn on the board as reach keys); JSON (LayoutMaster JSON, or keymap-drawer YAML to copy or download). A bar above the board holds the name, author and description, an **unsaved** badge with **Save** beside it (a layout's id follows its name: one from storage keeps its id while that still matches its name, and once renamed is saved under a free id from the new name, its old copy removed and the link moved with it, so a link made before the rename no longer opens it; a first save takes a free id from its name; the message names the layout; saving keeps the editor and its history, and undoing past a save is unsaved again), the **Layout** picker (the bundled layouts and the saved ones; with unsaved edits it asks first), the shared settings bar, the sample and a second corpus, and **Compare**, which takes the layout as edited. The link follows the edits: 400 ms after the last one it holds the layout as an inline snapshot, written in place, and the tab remembers, across a reload, which stored layout the snapshot is a draft of (or that it is a draft of one never stored), so the link opened again in that tab is still unsaved and saving it saves that layout rather than a copy; once nothing is unsaved the link names the stored or opened layout again. The same link opened anywhere else is a new layout. A feature switched off changes the numbers only, and the keys are edited as written. Undo/redo buttons and `Ctrl`/`Cmd`+`Z`; arrow-key movement between keys and a single tab stop on the board; `Delete` makes a key do nothing (`none`, not the layer's default). Live re-analysis on the chosen sample: a swap shows a relabel estimate at once (§5.6), marked as one, when the last report landed is of the layout swapped; any other edit re-simulates, an analysis nobody waits for any more stopping at its next pause (§10). Selection is a ring outside the cap; an outlined n-gram is green, as its arrows are.
3. **Compare** (2-way in v1). Same corpus/rules; delta bars, band labels, per-metric winner; synchronized hover; shareable URL. **Compare with** is the Library's feature switches, applied to both layouts: each is analyzed and drawn typed without the features left out, carried as `off=` like the Library's, and a status line says so.
4. **Rules**. Rule list by family (toggle, weight, params, bands); presets (`Layouts Doc`, `cyanophage-like`, `Keysolve-like`, `Romak author`); **Composer** (§7.3) + JSON tab; import/export; reset to preset.
5. **Corpus**. Language/corpus picker, EN↔PT-BR mix slider, paste/upload (worker → IndexedDB), corpus facts (letter/bigram/trigram/word frequencies), normalization options, coverage check against the current layout.
6. **Library** (home: `/` and the title open it). Bundled layouts (Magic Romak, Qwerty, Dvorak, Colemak, Colemak-DH, Graphite, Gallium, Canary, Sturdy, APTv3, Hands Down Neu… and small-board layouts with thumb letters, chords, magic and repeat keys: Hands Down Gold/Promethium/Vibranium, RSTHD, T-34, Magic Sturdy, Uno, Enthium, Nordrassil, Finch, Cem Aksoylar's Colemak-DH, Ben Vallack's Piano — each copied from its author's firmware or page and citing it) and user layouts (local, marked *saved*) in one list, sorted by **Effort**, **SFB** or name (both numbers shown on every card, scored on the same sample; the chosen order applies from the first score, each layout taking its place as it is scored; each card says what share of the text the layout skips, and layouts missing letters the corpus's language requires rank after those that have them), **Rank with** (magic keys, repeat key, typing combos, multi-letter macros — each can be switched off: the layout is ranked as typed without it, a magic key typing its default, and carried as `off=` to Analyze, which analyzes the same way and says so; a macro typing one letter, such as an accent, is how the layout reaches it and always stays), create from scratch or from an existing layout, share links, JSON import/export, text import, and **keymap-drawer import**: the YAML `keymap parse` writes, read without a dependency. The board comes from `cols_thumbs_notation` or `ortho_layout`, laid out exactly as keymap-drawer lays them out, and becomes a preset when its columns match one; a keyboard given only by name is matched to a preset the reader confirms, or read from a QMK `info.json` they upload — nothing is fetched. Layers are chosen, renamed and reordered before import. Legends are read into bindings (symbols, layer keys by name, one-shots, toggles, tap-holds, modifiers, repeat, caps word, transparent); keys the simulator does not model become `raw` imported keys that keep their legend, and a hold over such a tap is kept. Combos come by position or trigger keys. A report per layer says what could not be read.
7. **Guide**. The user guide, `docs/guide/*.md` and the metric glossary `docs/METRICS.md`, read at build time and drawn in the app at `/guide` by a small Markdown reader that produces React elements and never HTML. Each page opens short — its opening is always shown — and folds the rest: every `##` section and `###` subsection opens on request, and a link into one opens it and the section around it. A "?" beside views and panels opens the section about them in a new tab, so unsaved work in Analyze stays where it is; rule sources that cite the glossary open it there too. Tests hold every link between pages and every "?" to a heading that exists.
8. **About** (`/about/`, linked from the header). The landing page: what the simulator models, why the numbers can be trusted (each claim named with the test or file behind it), and a dated, sourced comparison with other analyzers. Static HTML and CSS in `docs/site`, with no script and a policy that loads nothing from elsewhere; the build copies it into the output and the dev server serves it from the folder. Its screenshots come from the running app (`pnpm --filter @layoutmaster/web shots`), and a test holds every link and image to the app.

Analyze's groups (board, word trace, summary, legend, editor, numbers) and Compare's (layouts, metric comparison) each fold away under a heading; which are folded is a preference kept in `localStorage`.

Library, Analyze and Compare share one **settings bar**, drawn the same in each (in the Library it sits in the **Rank and filter** dialog, with the sort and a **board filter** whose choice, like the sort, this browser remembers; layouts on hidden boards are neither listed nor scored): corpus, rule set, counts (letters only, with numbers, with symbols), the feature switches (**Rank with**, **Compare with**, **Analyze with**), include space and model shift. Analyze and Compare add the sample, Analyze a second corpus to mix in. The header's links to those three views carry the choices in force, and so do Rules' and Corpus' links into Analyze; the choices are kept for the tab, not stored, and a link always opens what it names.

### 4.2 Visual design
- Dark theme default + light theme; system preference honored.
- Keyboard SVG: rounded keys, tap legend centered, hold legend bottom, reach keys (on any layer above the base, a ring inside each key held or tapped to bring it on, in the layer's colour, with `held` or `tapped` in its band when the key has no hold of its own there, from the simulator's own activators (a declared one only while its key still brings the layer on) plus macros, magic-key branches, auto layers and later tap-dance taps that arm the layer; a conditional layer is reached through its `if` layers), thumb clusters rotated per geometry, split gap; a transparent key drawn `▽` and spoken *transparent*, whether listed or its layer's default; heat colors from a perceptually uniform, color-blind-safe sequential ramp; SFB/scissor/path overlays as green arcs between keys, apart from the heat under them.
- Typography: one UI sans + a monospace for symbols/legends; tabular figures in tables.
- Responsive: ≥1280px three columns (canvas | panels | sidebar); 768–1279 two columns; <768 single column with a **sticky mini keyboard + summary strip**, panels as an accordion; canvas scales via `viewBox`; lists virtualized. In Analyze, from 1024px the inspector and panels dock beside the board, which has the typed word, the summary and the legend under it, and every metric card runs under both; below, one column in the order board, inspector, typed word, summary, legend, panels, cards. While a key is edited the board stays pinned under the header, with the inspector beneath it on a phone. Touch: a tap selects; kind tiles are 44px tall and the inspector's other controls at least 36px; the on-screen keyboard stays down until a text field is tapped; a drag starts only once a finger has rested on a key, so a swipe still scrolls, and every drag has a button that does the same. Every board draws a split layout's halves a third of a key apart, whatever room its preset keeps for columns it lacks, with a hair of margin across; only the drawing moves, since every distance the analysis measures is within one hand. On a phone the editing board runs edge to edge and fits the width as long as its keys stay at least 28px wide, about what the phone's own keyboard gives a key on a 320px screen: a 24-key split board fits any phone, a 34-key one fits from about 330px, and a wider board keeps that key size and pans sideways.
- Legends fit their key: the tap legend shrinks or takes two lines before it is cut, holds and layer modes (`hold`, `1×` one-shot, `toggle`, `switch`, `auto`) sit in a band along the bottom, corner marks say magic `✦`, macro `⋯`, tap dance `TD`, Unicode `U+`. A key whose legend still cannot say everything is numbered, and a legend list beside the board says it in words. Legends stay readable at any heat: the colours that say what kind of key it is, or which layer it reaches, are set per theme to keep 3:1 against a key below half heat, and a key at half heat or more, or being pressed, draws every legend in its text colour at full strength; a reach key's ring follows the same rule. The legend list says each way into the layer in words, and the inspector says it for a selected key.
- Accessibility: keyboard navigation for editors, ARIA labels on keys, contrast ≥ 4.5:1, reduced-motion respected.
- Empty/error states: invalid layout (missing/duplicate letters for the corpus alphabet), unproducible symbols, corpus too small, worker busy.

### 4.3 URL, persistence & GitHub storage
- **URL** carries: layout id (library or saved) or an inline compressed layout, geometry preset id, corpus id(s) + mix, rule set id (+ compressed diff), universe/case toggles, typing-path selections, view. The router keeps it in sync; parameters at their default are omitted, and keys are written in a fixed order, so the same analysis always produces the same link. Inline layouts are `deflate`-compressed and base64url-encoded.
- **Browser storage** (always on): documents live in **IndexedDB** — object stores `layouts`, `rulesets`, `corpora`, each document keyed by its slug id, plus a per-collection index and a SHA-1 content hash used as the version. This is the only storage the app needs; it is written first on every save, so nothing is lost to a network problem.
- **GitHub storage** (optional): **Sign in with GitHub**, in the Storage dialog, keeps documents in the user's GitHub account as well, so they follow them between browsers. Where they go is found, not configured:
  - **Their copy of layoutmaster**, when the app may write to it: the upstream repository itself for its owner, otherwise a fork the user owns (renamed or not; recognised by its `source`). The app is a **GitHub App**, so it reaches only repositories it is installed on: candidates come from `GET /user/installations` and their repositories, and the dialog links to the app's installation page when the user has a fork the app was not given. Documents are committed to a **`layoutmaster-data` branch**, created once from the default branch (so what is in `data/` there comes along) — the main branch gets no save commits, so CI does not run per save and syncing a fork with the upstream cannot conflict on an index. Files: `data/layouts/<id>.json`, `data/rulesets/<id>.json`, `data/corpora/<id>.json`, `index.json` per collection. Reads go through the Contents API with ETag revalidation and an in-memory cache; **Save** = `PUT /repos/{repo}/contents/{path}` with the current blob `sha` (optimistic concurrency; a lost race surfaces as a conflict → reload and ask). Commit messages record the action and the document name.
  - **Secret gists** otherwise, **one per collection** ("LayoutMaster: saved layouts", "… rule sets", "… corpora"), each holding `<collection>.<id>.json` per document and `<collection>.index.json`, which is also how the gist is recognised among the user's others. A save writes the document and the index in **one** edit. Gists take no conditional writes, so a save re-reads the gist (a 304 when nothing changed) and refuses with a conflict if the document's content hash is not the expected one. Secret gists are unlisted, not private, and the dialog says so.
  - Where documents go is looked up after signing in, again on **Check again**, and when the window regains focus with the dialog open, as it does after the installation page; it is remembered per account, and a lookup that fails keeps the last answer rather than splitting documents between two places.
- **Sign-in and tokens**: the code-for-token exchange needs the app's client secret, which a page cannot keep, so it runs in a **Pages Function** (`functions/api/auth/[[path]].ts`, whose logic is `apps/web/src/server/github-auth.ts`, also mounted by the dev server): `GET /api/auth/login` (state and PKCE, kept in an encrypted SameSite=Lax cookie for the round trip), `GET /api/auth/callback`, `POST /api/auth/session`, `POST /api/auth/logout` (revokes the token). Both tokens live in an **AES-GCM-encrypted, HttpOnly, SameSite=Strict cookie**; the page receives only the **access token**, which it keeps **in memory**, from `session`, renewed there when it has less than five minutes left. GitHub App tokens last 8 hours and refresh tokens work **once**, so tabs ask one at a time (Web Locks). The access token is never written into storage, a link, an export, a commit or an error message, and is sent to `api.github.com` and nowhere else. Before leaving for GitHub the page puts its own address in session storage and returns to it afterwards, so an unsaved inline layout survives signing in. The function stores nothing; where it is absent, `session` is not JSON and the app says sign-in is not set up.
- **Storage adapter**: a `StorageAdapter` interface with `IndexedDbAdapter` (local), `GitHubAdapter` (a repository), `GistAdapter` (gists) and `CompositeStorage` (local first, then remote; reads prefer the remote copy and fall back to the local one, `pushAll` uploads everything saved in this browser).
- **Library scores** are kept in `localStorage` by request hash (the newest 400), so the Library opens ranked; every one is computed again in the background and replaced only when its numbers changed, so an engine or rule change corrects them on the next visit.
- **Preferences** — theme, the metric sections shown, the Library's sort, edit-panel state — are kept in `localStorage` separately from documents. Custom corpora pasted or uploaded through the UI are processed in the worker and cached by content hash; the user may save them like any other document.

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
| `adaptive` | Triggers are tried in order; the first whose `afterAny` contains `lastKeycode`, and whose `afterTags`, when given, include the tag of the previous press, wins (tags alone: any symbol from a tagged press; empty lists count as absent) (with `strictModifiers`: exact mod match; else mods ⊇ trigger mods); else `default`. In `hostLocale: symbols` mode triggers match `lastSymbol` and `strictModifiers` is ignored. `default`/`binding` may reference another adaptive (chain, max depth 4, same `lastKeycode`). `deadKeys` honored. Timing treated as satisfied. |
| `mod_morph` / `layer_morph` / `tap_dance` | Deterministic selection from held+sticky mods, active layers, or requested tap count (tap-dance = N tap events). |
| `macro` | One physical tap event; `steps` executed in order through the same state machine (layer changes, `sl` arming, nested macros); symbols concatenated. |
| `dead_key` (host) | Tap event; sets `pendingDeadKey`; next letter composes (or both emitted). |
| `unicode` | Tap event; emits symbol; hidden host events exposed to an optional cost rule. |
| Combos | Chord event: N simultaneous presses, one table entry (§7.1 `chordTransitionRule`); `role: typing|command` decides whether it is offered as a producer (D3). |

### 5.4 Resolver (text → key events)
1. **Producer index** `enumerateProducers(layout, caseMode)`: every producer for every symbol (direct keys per layer, `role: typing` combos, adaptive branches with their `afterAny` sets, repeat, macros with their strings, dead-key sequences). In fold mode, producers requiring an explicit modifier (e.g. `'` only after `LS(I)`) are excluded and listed in Coverage. Symbols with ≥2 producers populate the Typing paths panel (D3). A symbol with no order set by hand is typed the **cheapest** way from the machine's current state: every producer is tried from the same state, and the fewest presses win, then the way that leaves fewer layer keys held, then the way that makes the word typed so far the fewest same-finger bigrams, then the fewest same-finger skipgrams (two presses in a row, or with one between, sharing a finger on different keys, not both chords — as `sfbWhere()` counts them), then the lower Effort over the presses (the default cyanophage grid, a chord's keys summed), then the index's order (static cost, non-dynamic, non-combo, id). None of these measures is the rule set's, so typing never depends on the rules it is scored by. There is no lookahead: the presses still to come in the word are not weighed. A symbol with an order set by hand takes the first producer that works in that order.
2. **Greedy tokenization**: left-to-right **longest match** over the (folded or cased) symbol stream among symbols with an enabled producer (`qu`, `ão`, `ões`), never crossing a word/punctuation boundary; equal length → typing-path order, then the cheapest; **no backtracking** (a match is committed even if the remainder gets costlier). Per-macro opt-out.
3. **Activation planning**: if the chosen producer needs layer `L` not active, insert the **activator declared for `L` from the current layer** (`activators[L]` entries with `from`), else the first key found on the layout that brings `L` on; if a one-shot layer is already armed (CCEDIL after `ç`, SEN_CASE after `. `), producers on it are preferred automatically. If no activator path exists, the producer is unavailable (Coverage). Other keys that bring `L` on from the same layer by the same kind of tap (one-shot, toggle or switch, through any hold-tap, layer-tap or morph), needing no modifier, and leave the machine exactly as the planner's tap does **stand in** for it, a declared one included: a word's presses are held until it ends, and each such tap is then made on the key that gives the word the fewest same-finger bigrams, then skipgrams, then the lower Effort (a tie keeps the planner's key, so a declared key wins ties); every combination up to 1024, one greedy pass beyond. Pairs with the space or with other words are not weighed, so the choice is the same in both `crossWord` modes and in "How is this typed?". Held keys and keys needing a modifier are pressed as found.
4. **Case (D4)**: fold mode ignores case. Model mode resolves an uppercase symbol via a producer that already emits it, else sticky/held shift **emitted before** the layer activator plus the lowercase producer — that order matters, because a layer press does not consume a one-shot modifier but a modifier press would. Caps-word and sentence-case state feed the same check. A one-shot shift cannot be cancelled, so a lowercase symbol while one is armed is unproducible, as on hardware.
5. **Space**: always a real press on `keys.space`; excluded from the default universe view.
6. **Unproducible symbols**: dropped from the key stream and treated as a **hard n-gram boundary** (like a word boundary) in both `crossWord` modes; excluded from all denominators; counted in `coverage.unproducible`.
7. **Determinism & explainability**: each word yields a trace (used by "How is this typed?", Hard words, same-hand strings). A word's presses enter the tables when it ends, in the order they were made; a run of more than 128 presses with no space enters in pieces.

### 5.5 Fast path
Skip simulation and use corpus n-gram tables directly (relabeled symbol→position through the layer-0 map) only when **all** hold: every corpus symbol has exactly one producer and it is a layer-0 direct key; no adaptive/repeat/macro/combo/dead-key producers enabled; `caseMode = fold`; no shifted twin in use; the corpus tables were built with the same `crossWord` mode; precomputed skip tables cover the rule set's max skip; no enabled rule references `keyKind`, `layer`, `underHold`, `producerKind` or run/word sources beyond what the tables provide. Otherwise simulate the raw sample (1–5 MB) in a worker.

### 5.6 Output, caching, relabeling
Key event stream → **physical tables** (both universes) + runs + word traces, cached by `structureHash`. `structureHash` covers everything except the `symbol` field of *relabel-eligible* `kp` bindings: layer ids/order, binding kinds and params, activators, typing paths, combos, adaptive behaviors, macro bodies, `hostLocale`, geometry key set, finger map, `caseMode`, `crossWord`, corpus id. A symbol is **relabel-eligible** only if it appears in no adaptive trigger set, no macro body, no combo binding and no dead-key sequence. Swapping two eligible symbols between positions applies a position permutation to the cached tables (instant editing); any other edit re-simulates. The permutation is exact only if the simulator would type the swapped layout the same way, and its choices by same-finger pairs and Effort (§5.4) can move with the keys, so the result is an estimate, marked provisional until the re-simulation lands.

---

## 6. Geometry & fingering

### 6.1 Units, rows, columns, presets
- 1U = 19.05 mm; default key `w = h = 1`. Rows: 0 top, 1 home, 2 bottom, **3 thumb**. Thumb keys have `isHome = false` and are excluded from row-based predicates unless a rule sets `includeThumbs: true`. Canonical `col`: 0 outer-pinky, 1 pinky, 2 ring, 3 middle, 4 index, 5 inner (`1333+2` has no col 0 or 5). Coordinates are absolute post-rotation centers per hand (`rotation` is render-only); **distance is defined only within a hand** (cross-hand pairs → `null`, skipped by distance rules).

| Preset | Keys | Defaults |
|---|---|---|
| `3x5+2` (default) | 34 | column y-offsets (U, + = lower): pinky +0.25, ring 0, middle −0.25, index 0, inner n/a; thumbs at y = +1.25, x = index column −0.5 / +0.5 |
| `3x5+3` | 36 | as above, third thumb at +1.5U outward |
| `3x6+3` | 42 | adds inner column (col 5) at offset +0.25 |
| `23332+2` | 30 | Hummingbird, Rommana: pinky top and home, ring/middle/index × 3, inner index home and bottom (it sits half a row low), 2 thumbs |
| `23332+1`, `13332+2`, `13332+1` | 28, 28, 26 | the Hummingbird block with one thumb, without the pinky's top key, or both (Grumpy; Zilpzalp; ʻākohekohe, Pueo, Visorbearer) |
| `13331+2` | 26 | Smallcat: pinky and inner index home only, ring/middle/index × 3, 2 thumbs |
| `1333+2` | 24 | pinky = home-row key only (col 1), cols 2–4 × 3 rows, thumbs `L1 L0 R0 R1` |
| `1222+2` | 18 | pinky home only, ring/middle/index top and home (Ben Vallack's Piano) |
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

**Denominators** for a stream of K keystrokes over W words: `reset` mode — bigrams K−W, skip-s grams K−W·(s+1) (clamped ≥0 per word), trigrams K−2W; `bridge` mode — K−1, K−s−1, K−2. `percentOfKeystrokes` divides by K (the `cyanophage-like` preset adds W in the `no-space` universe to mirror its one-space-per-word count). For **pairs** (bigrams, skipgrams), `percentOfKeystrokes` and **Effort**, K is the text's character count, not the layout's presses (`SimulationTables.text` counts the n-grams the text would have with one press per character): extra presses — layer taps, holds, one-shots, shift — add pairs no letter rule matches and cost nothing in Effort, so counting them would rank a layout that needs them above one that does not. Single-key and trigram rules stay shares of what was pressed. For a layout typing one press per character the two counts are equal.

### 7.2 Default rule catalog (all editable/removable)
**Bigram**: SFB % (+ per finger, 1U vs 2U split, distance-weighted), Repeats (same key), LSB % (absolute 2U / 3.5U thresholds), FSB %, HSB % (finger-height preference table; adjacent ×1, non-adjacent ×0.5; `keysolveMode` counts all ring–middle jumps), Center-column usage, Thumb bigrams (thumb→same-hand key, thumb double tap), Layer-tap SFB (two consecutive taps on the same thumb).
**Skipgram**: SFS % (skip 1..3 weighted), SFS distance, LSS, FSS, HSS, Alt-SFS (cyanophage).
**Trigram**: Alternation, Roll in, Roll out, In:out ratio, 3roll/Onehand (in/out), Redirect, Weak redirect, Other, `bigram roll in/out` (cyanophage compat).
**Runs/words**: Same-hand run histogram, Same-hand strings (top list), Hard words (per-word effort ranked per character, ≥4 letters), Word effort distribution.
**Usage/balance**: Finger usage %, Hand balance (with/without space), Row usage, Column usage, Pinky-off %, Home-row %, Finger distance / finger speed, Layer distribution (keystrokes per layer).
**Effort**: cyanophage's Effort exactly (§2.2: its grid by position, thumbs 0, 577·Σ effort ÷ keystrokes), editable per key. Total Word Effort is not provided: it needs cyanophage's `bigram_effort.json`, which ships without a license.
**Layer (new)**: Layer taps per 100 symbols, one-shot activations per word, Wasted one-shots, Macro usage, Adaptive hit rate (trigger branch vs default/fallback producer), Combo usage, Extra keystrokes per symbol (keystrokes / symbols − 1).

Every rule outputs: value, band, top offenders (n-grams with %, distance and the layer each key was pressed on; a pair ending on a layer key lists the keys pressed next, each with its part of the pair), per-key heat contribution, overall and per layer pressed, per-finger split, and `key_scale`: a key's part of the value is its per-key number times it, and the parts of every key add up to the value. To make them add up, an n-gram's count is split evenly between its keys and a chord's share between the keys pressed together; a distance aggregate credits distance × count, an effort sum each key's own cost × count, Finger travel the travel to the key (kept per logical key by the simulator), layer taps the key tapped. Spreads (per finger, hand, row, column, layer), ratios, runs, words and other counters have no per-key part (`key_scale: null`). The n-grams of a rule through one key on one layer come from a follow-up worker request over the cached tables (`keyStats`), in the card's order.

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
- Predicates: `hand`, `sameHand`, `finger`, `sameFinger`, `sameKey`, `fingerPair`, `adjacentFingers`, `includesFinger`, `row`, `rowDelta`, `colDelta`, `xDistance`, `yDistance`, `distance`, `direction` (inward/outward), `monotone` (same direction across the n-gram), `changesDirection`, `handPattern` (`LRL`, `LLR`…), `isThumb`, `isHome`, `isInner`, `keyKind` (`alpha|layerTap|shift|space|repeat|magic|combo|hold`, of the binding a tap reaches past tap-holds, a tapped layer-tap, morphs and tap dances, as the legend has it; an alt repeat is `magic`), `layer`, `underHold`, `wordBoundary`, `fingerHeightPreference` (table param), `producerKind` (`direct|combo|adaptive|repeat|macro|deadkey`), `adaptiveBranch` (`trigger|default`), `oneShotWasted`, `activatorFor(layer)`.
- Aggregations: `count`, `percentOfNgrams`, `percentOfKeystrokes`, `per100(symbols|keystrokes|words)`, `sumDistance`, `perFinger`, `perHand`, `perKey`, `perLayer`, `perSymbol`, `ratio(ruleA, ruleB)`, `ratioOf(where, where)`, `histogram(runLength)`, `perWord`, `topWords`, `weightedSum(table)`.
- `$global.<name>` may appear in any numeric position and resolves against §7.1. Composer UI builds this JSON; JSON tab for power users; JSON-Schema validated.

### 7.4 Presets
`Layouts Doc` (§2.1 definitions and bands, no score); `cyanophage-like` (column-pair LSB, adjacency scissors, `percentOfKeystrokes` incl. one space per word, `crossWord: reset`, repeats excluded, effort grid, `bugCompat` optional); `Keysolve-like` (ring–middle scissors, ortho/stagger, bigram normalization); `Romak author` (Doc rules + layer family weighted, PT-BR+EN mix). Composite score (D6): `Σ w_i · normalize_i(value)` with normalization by bands or user min/max; disabled unless the preset enables it.

---

## 8. Corpus pipeline (D8)

- **Shipped**: `en-general` (Leipzig eng news/web sample or equivalent CC-BY), `en-quotes` (MonkeyRacer-style, license permitting), `en-conv`, `pt-br-conv`, `es-conv`, `fr-conv` (sentences generated from hermitdave/FrequencyWords' OpenSubtitles counts, MIT, split words rejoined), `pt-br-general` (Leipzig por-br sample, accents intact), `es-general`, `fr-general` (Leipzig news, once downloaded), `mix` (EN↔PT-BR slider). Provenance + license per corpus in `packages/corpora/manifest.json`; vendored parity snapshots of the cyanophage/Keysolve word lists live there too (§11).
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
    { "id": "alpha1", "name": "Alpha 1", "bindings": {
        "LTR": {"kind":"kp","symbol":"b"},
        "RBI": {"kind":"hold_tap","tap":{"kind":"adaptive","ref":"magic"},"hold":{"kind":"mod","mod":"LGUI"}},
        "L1":  {"kind":"hold_tap","tap":{"kind":"adaptive","ref":"altRepeat"},"hold":{"kind":"mo","layer":"nav"}},
        "L0":  {"kind":"hold_tap","tap":{"kind":"adaptive","ref":"sentenceSpace"},"hold":{"kind":"mo","layer":"num"}},
        "R0":  {"kind":"mod_morph","mods":["LSHIFT","RSHIFT"],"keepMods":[],
                "default":{"kind":"hold_tap","tap":{"kind":"sl","layer":"alpha2"},"hold":{"kind":"mo","layer":"sym"}},
                "morphed":{"kind":"sl","layer":"sft_a2"}},
        "R1":  {"kind":"sk","mod":"LSHIFT"} } },
    { "id": "alpha2", "name": "Alpha 2", "bindings": {
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
    "h": [ {"producer":"adaptive:alpha1/RBI#default","enabled":true}, {"producer":"adaptive:alpha2/LBI#t0","when":{"afterAny":["a","e","i","o","u"]},"enabled":true} ],
    "ã": [ {"producer":"direct:ccedil/RHR","enabled":true}, {"producer":"direct:alpha2/RHR","enabled":true} ] },
  "repeatPolicy": { "doubledLetters": "repeatKey|tapTwice", "default": "repeatKey" },
  "activators": { "alpha2": [ {"from":"alpha1","via":"key:alpha1/R0"}, {"from":"ccedil","via":"key:ccedil/L1"} ],
                  "sft_a2": [ {"from":"alpha1","via":"key:alpha1/R0","requires":{"mods":["LSHIFT"]}} ] } }
```
- Binding shapes: `kp{symbol|keycode}`, `trans`, `none`, `mo{layer}`, `lt{layer,tap}`, `sl{layer,quickRelease?,ignoreModifiers?,releaseAfterMs?}`, `tog{layer,mode}`, `to{layer}`, `sk{mod,quickRelease?,ignoreModifiers?}`, `caps_word{continueList,mods}`, `auto_layer{layer,continueList}`, `key_repeat`, `mod_morph{mods,default,morphed,keepMods}`, `layer_morph{layers,active,inactive}`, `tap_dance{bindings[]}`, `macro{steps[] | symbols+then[], ref?}` (steps execute in order; nested macros allowed; `symbols` is sugar for an all-`kp` body), `adaptive{default,triggers[{afterAny?,afterTags?,binding}],strictModifiers,deadKeys,ref?}` (triggers tried in order), `hold_tap{tap,hold,flavor?,tappingTermMs?}` (timing fields recorded, unused in v1), `dead_key{diacritic}`, `unicode{symbol,shiftedSymbol?}`, `mod{mod}`.
- `layers[].color`: `blue|green|amber|red|violet|teal|lime`, the colour the layer's tab and the keys reaching it are drawn in; absent = by the layer's place in the list. Not part of the analysis identity.
- `bindings["*"]` = default for unlisted keys. `hostLocale: symbols` → bindings carry output symbols; `us|us-intl|abnt2` → keycode-based bindings with dead-key composition and `afterAny` matched on keycodes incl. mods.
- `typingPaths[symbol][]` entries: `producer` id, by position (`direct:<layer>/<key>`, `combo:<id>`, `adaptive:<layer>/<key>#t<i>|#default`, `repeat:<layer>/<key>`, `macro:<layer>/<key>`, `direct:<layer>/<key>#td<n>` for a tap dance's n-th tap, `…#hold` for what a tap-hold's hold types, pressed held and let go), optional `when.afterAny`, `enabled`. `activators[layer][]`: `{from: <layerId>|"*", via: "key:<layer>/<key>", requires?}`. `repeatPolicy` handles doubled letters separately from symbols.
- JSON Schema (draft 2020-12) ships in `packages/core/schema/`. Text import/export per §6.1; keymap-drawer YAML import (v1.x): `layers` (`t/h/s`), `combos` (`p`, `k`, `layers`), `cols_thumbs_notation` → geometry.

---

## 10. Architecture (D10, TypeScript static SPA)

```
layoutmaster/                       pnpm workspace
  functions/api/auth/[[path]].ts    the Cloudflare Pages Function for sign-in; its logic is apps/web/src/server
  packages/core/src/                engine — pure TypeScript, no DOM, runs in a worker and in Node
    geometry/    presets.ts, distance.ts, types.ts (fingering, columns, distance models)
    layout/      schema.ts (zod validation), compile.ts, text.ts (import/export), json.ts (canonical form), ops.ts, labels.ts
    host/        locale.ts (us, us-intl, abnt2 tables; dead-key composition)
    sim/         machine.ts (state machine §5.1–5.3), producers.ts, resolver.ts (§5.4)
    tables/      tables.ts (logical keys, n-gram accumulators, travel)
    rules/       engine.ts, predicates.ts (compiled closures), catalog.ts (built-ins as data), presets.ts, bands.ts, effort.ts, serialize.ts
    corpus/      normalize.ts, corpus.ts, node-loader.ts
    analysis/    analyze.ts (orchestration), hash.ts (structure hash), relabel.ts, cache.ts (LRU)
    import/      yaml.ts (YAML 1.2 reader, no dependency), keymap-drawer.ts (read, place, import, export)
    storage/     ids.ts (slugs, document paths, index entries), the StorageAdapter interface
    layouts/     bundled layouts (classic, Romak family)
    golden/      regression suite: reports pinned from this engine
  packages/corpora/src/build.ts     builds the shipped corpus tables from raw text
  apps/web/src/
    engine/      analysis.worker.ts, protocol.ts (postMessage RPC), worker-client.ts, direct-client.ts (tests),
                 report-dto.ts, corpus-loader.ts, heat.ts, use-analysis.ts
    views/       AnalyzeView, EditView (+ edit/reducer, panels, inspector/), CompareView, RulesView
                 (+ rules/composer), CorpusView, LibraryView (+ library/KeymapDrawerImport), GuideView
    guide/       markdown.tsx (reader and renderer), pages.ts (docs/ read at build time), help.ts ("?" targets)
    components/  Keyboard (SVG + drag), LayerTabs, Metrics, HelpLink, RuleSources, Shell
    url/         params.ts (codec, defaults omitted), inline.ts (deflate + base64url)
    storage/     indexeddb.ts, github.ts, gist.ts, target.ts (fork or gists), composite.ts, StorageSettings.tsx, use-storage.tsx
    auth/        github-session.ts (signed-in state, the access token in memory, where documents go)
    server/      github-auth.ts (sign-in: login, callback, session, logout; Web APIs only)
    state/       session.ts, theme.ts, toasts.ts
```
- **Engine API**: `analyze(layout, corpus, ruleSet, opts): Report`; `simulate(compiled, stream, opts): Simulation`; `enumerateProducers(compiled, caseMode)`; `explain(compiled, text, opts)`; `relabel(tables, mapping)`; `structureHash(layout, opts)`. The UI never calls these directly: it talks to an `AnalysisClient` — `WorkerClient` in the app, `DirectClient` in tests — over a `postMessage` protocol, so a long analysis never blocks rendering and can be superseded by a newer request. In the worker an analysis types in chunks (`analyzeSteps`, a pause about every 20 000 symbols), so other requests — a swap's estimate, a word to explain, a key's n-grams — are answered between chunks, and real progress is reported; analyses run one at a time in the order asked, and a `cancel` for one still in hand (sent when its caller gives up on it) drops it at its next pause, unanswered and uncached. Results are cached in an LRU keyed by `structureHash` × corpus × options; `keyStats(reportKey, key, layer)` reads a kept report's tables through an index of n-grams by logical key, built once per table.
- **Performance** (measured on the reference machine): 300 k-symbol sample **576 ms**; full corpus (~1 M symbols) **1.36 s**; rules over tables well under 200 ms; an eligible swap re-scores existing tables via `relabel` in **12 ms** instead of re-simulating. Budgets (3 s / 10 s / 200 ms) are met with room to spare, so no native escape hatch is needed.
- **Regression**: `packages/core/golden/` holds 38 reports covering the layout × corpus × preset × case-mode × universe matrix, plus the layout documents and inline URL they came from; the suite asserts every metric to 1e-6 and every item list exactly. `pnpm goldens` regenerates them from this engine and must be a no-op on a clean tree. `golden/GOLDENS.md` records each deliberate change to them.
- **Quality gates**: vitest for every behavior, rule and trace, plus React Testing Library per view; `biome check` (format + lint), `tsc --noEmit` in strict mode, and the full test suite in CI. Deployment is `vite build` to static files behind a CDN, plus the sign-in Pages Function. The build emits what a static host needs to serve a client-routed app: `_redirects` (`/* /index.html 200`, so a deep link resolves with a 200 rather than a 404 body), `_headers`, and a `404.html` copy for hosts that use that instead. The same build also writes a content security policy into the page and into `_headers` from one definition — `connect-src 'self' https://api.github.com` is what confines the access token to GitHub — and the build fails if a chunk gains `eval`/`new Function` or the page gains an inline script, since `script-src 'self'` would block them in production only.

---

## 11. Validation & acceptance

1. **Parity** (against vendored snapshots of each tool's word list, licenses in the manifest): `cyanophage-like` preset with `bugCompat: true` reproduces playground SFB, LSB, scissors, finger usage and trigram categories for Qwerty/Colemak-DH/Graphite within ±0.05 pp; with `bugCompat: false` only sign and ranking of deltas are asserted. `Keysolve-like` preset matches SFB/LSB/HSB/FSB/SFS/ALT/ROL/ONE/RED within ±0.1 pp.
2. **Simulator scenarios** (unit tests): `sl` consumed by exactly one press; `sl` + modifier press consumes without output (flag `wastedOneShot`); `to` vs `tog` locking; conditional-layer fixed point; combo filtered by highest active layer; macro arming a one-shot layer and nested macros; adaptive trigger precedence, `strictModifiers`, chaining; `lastKeycode` unchanged by layer taps; greedy `qu`/`ão` with boundary rule; caps word ends on non-continue key; hold press/release around held sequences; unproducible symbol as hard boundary; several keys tapping the same layer chosen per word by same-finger pairs then Effort, a tie keeping the first, a held key or one leaving another state never standing in; a character's producer chosen by the same-finger pairs it makes with the keys before it.
3. **Romak acceptance traces** (each pins its typing-path selection and expected press count): `ação` with `ão` macro enabled → `a · ² · ç · ão` (4 presses); with the macro disabled → `a · ² · ç · ã · o` (5 presses); `açúcar` needs a second `²`; `chave` via magic/reversed-magic per selected paths; `ll` via repeat when `repeatPolicy = repeatKey`; in shift-model mode a sentence start after `. ` adds no shift press.
4. **UI**: responsive screenshots at 375/768/1280/1920; drag/drop across layers; path picker state round-trips through the URL; compare deltas correct; custom corpus round-trip.

---

## 12. Milestones

Each milestone was gated on the parity suite staying green; the eight commits are in the history behind `7e0fca7`.

| M | Scope | Exit criteria (met) |
|---|---|---|
| M0 | pnpm workspace, TypeScript strict, Biome, vitest, Vite; CI (check/typecheck/test/build); first golden dump | tooling green, 38 reference reports checked in |
| M1 | Engine: geometry + presets, layout schema/compile, host locales, **simulator**, tables, text import/export, bundled layouts, rules engine + catalog + presets + bands, analysis + relabel + cache | §11.2 scenarios and §11.3 traces green; all 38 golden reports match to 1e-6 |
| M2 | Corpora: build pipeline, shipped corpora, mix, custom upload path | corpus tables reproduced byte for byte; Node loader and bench on real corpora |
| M3 | App shell: routing with byte-compatible URLs, theme, navigation, worker client, Analyze view | Magic Romak analyzable end-to-end; a link round-trips through both implementations |
| M4 | Library, Compare (2-way) and Corpus views | saved layouts listed and loaded, deltas shown, corpora browsable and buildable |
| M5 | Edit view: drag/drop across layers, binding editor, combos/adaptive tables, geometry picker, typing-path panel | eligible swaps re-scored by relabel (12 ms), not re-simulated |
| M6 | Rules view + composer: enable, re-parameterize, compose, save a set | rules expressible per §7.3; sets round-trip through storage and the URL |
| M7 | Storage (IndexedDB + optional user repository), a11y and responsive pass, docs, static deploy | save/load round-trip locally and to a repository; §10 budgets met; docs published |
| v1.x | keymap-drawer YAML import, ZMK physical-layout import | |
| v2 | ZMK `.keymap` importer (cpp + tree-sitter devicetree), timing model, numbers/symbols layers, JS rule plugins, optimizer, alt-fingering | |

---

## 13. Risks & mitigations
- **Path explosion** in the resolver: bounded by user-selected paths (D3), no-backtracking tokenization, producer index cached per `structureHash`; the choice among stand-in layer keys is per word, exhaustive up to 1024 combinations and one greedy pass beyond, over runs of at most 128 presses.
- **Comparability confusion**: every report labels universe/case/normalization/corpus; presets replicate other analyzers' normalization exactly; `bugCompat` isolated.
- **Corpus licensing**: manifest with provenance; CC-BY/public-domain sources; user corpora stay local.
- **Special features**: sentence case and caps word are declared in a `features` block, and the compiler wraps the space and shift keys with `adaptive`, `caps_word`, `sk` and `macro`. Firmware needs pre-shifted twin layers for these; the simulator does not, so the layer list stays the set of layers a typist reaches. Magic keys and alt repeats are `adaptive` bindings on their keys, made and edited like any key; `tag` on a binding plus `afterTags` on a trigger, listed first, replace the one-shot layer that firmware uses to remember how the previous symbol was produced. Documents that declared them as `features.adaptiveKeys` / `features.altRepeat` are converted to bindings when read, typing exactly as before.
- **PT-BR fidelity**: accents are distinct symbols end-to-end; coverage report flags folded/unproducible characters; host-locale tables validated against `zmk-locales keys_pt_abnt2.h`.
- **Performance on mobile**: fast path + cached tables + worker; reduced sample size with notice.

## 14. Sources
Layouts Doc 3rd ed. (§2.1 link); cyanophage.github.io + repo `cyanophage/cyanophage.github.io`; grassfedreeve.github.io/keysolve-web; klanext.keyboard-design.com; rafaelromao.github.io/romak, rafaelromao.github.io/keyboards, repos `rafaelromao/romak`, `rafaelromao/keyboards` (local: `/Users/rromao/projects/keyboards/src/features/{adaptive,accents,combos,sentence,smart}.dtsi`, `src/definitions/config.dtsi`); zmk.dev/docs (keymaps, behaviors, combos, conditional layers, macros, hold-tap, sticky key/layer, physical layouts) and `zmkfirmware/zmk` source (`keymap.c`, `combo.c`); `urob/zmk-adaptive-key`, `urob/zmk-auto-layer`, `urob/zmk-unicode`, `joelspadin/zmk-locales`, `caksoylar/keymap-drawer` KEYMAP_SPEC and `physical_layout.py` (MIT), whose cols+thumbs and ortho generators the importer reproduces; the YAML 1.2.2 specification (core schema) for the reader, and PyYAML's YAML 1.1 resolver, which keymap-drawer loads files with, for what the exporter quotes.
