# Mobbin review: stack's components against the references

Judged at stack `97af0933` and hub `b2857c7`, 1920x1080 dark, beside the Mobbin references and the voice's anchor, Linear. Native is judged from source and marked "not rendered". Plan items are in [fix-plan.md](../fix-plan.md). Every proposed fix is free of app props and words, and obeys `structure.md` rules 5, 6, 7, 11 and 12.

Links open `mobbin.com/screens/<id>`.

## Selection bar

### What the references do

| Pattern | References |
|---|---|
| Floating pill at the foot, few acts plus a menu | [Linear](https://mobbin.com/screens/3f36e39e-2b9e-4145-bee2-f43a3cf21f7b), Attio [1](https://mobbin.com/screens/5bb2a956-b937-497e-bd31-afc2616bb111) [2](https://mobbin.com/screens/f6aa5c36-a41b-432f-a620-5248fb8bc7b0), [ClickUp](https://mobbin.com/screens/e9639493-e0a6-46c9-93d1-d3189cbdc3c7) |
| Header strip, overflow behind "..." | Notion [1](https://mobbin.com/screens/f49ef73e-f5ea-4da3-b785-f9c768aaca1b) [2](https://mobbin.com/screens/f63163ee-9eaa-4c17-9095-9e00d896a659), GitHub [1](https://mobbin.com/screens/bc4e4d5c-3faf-4c4f-ad44-1ad4e36cb48f) [2](https://mobbin.com/screens/8f64e43f-4c33-49a6-ac39-6edda5187427), Shopify [1](https://mobbin.com/screens/306b7c73-6f54-4991-872e-ee8b899889a1) [2](https://mobbin.com/screens/c95d8697-fd41-49bc-bd67-878a0774e31e) [3](https://mobbin.com/screens/c3204dae-cbeb-4df4-b01a-ee12e995dcad), Google Drive [1](https://mobbin.com/screens/cbbac53c-ef71-470b-88e5-0593538813c0) [2](https://mobbin.com/screens/f20af80a-306c-498e-af04-6c73c1acd19e), [Stripe](https://mobbin.com/screens/d412df8a-c1d6-4d9c-af5d-04fd317f627f) |
| One menu button | [Airtable](https://mobbin.com/screens/23393ca2-c8f1-4d00-9467-b320b8ab749a) |
| Docked foot | [Meetup](https://mobbin.com/screens/6c4c07bd-3086-4562-81e0-d03089799079), [Dribbble](https://mobbin.com/screens/efd20c79-3f51-43f5-8ea7-18b91cc859a8), [Midday](https://mobbin.com/screens/975c0ea4-58a5-442e-bea9-cd42f360fd5d), [Wrangle](https://mobbin.com/screens/b9d8a719-226b-4c7c-9268-45b0f1fa875e) |
| No bar, keys only | Superhuman [1](https://mobbin.com/screens/0e821e22-026a-4641-a91b-ac63b0c9e4bc) [2](https://mobbin.com/screens/3ae6bf95-6bbd-4232-b045-3160b748393c) |

Every reference says "N selected". None has a "select all N" prompt. Gmail, Figma and Asana selection are not on Mobbin.

### The prototypes

All three stand only when something is ticked, format the count, show "Select all" while the ticked are fewer than the total, and fold the acts so the filled primary stands and the rest are in the more menu. Form c draws all nine where the Pane's container is `page-wide` or wider, which departs from the fold rule.

| Measured | a, docked foot | b, floating pill | c, header swap |
|---|---|---|---|
| Count width, 2 ticked | 139 px | 139 px | 139 px |
| Count width, all | 170 px | 170 px | 170 px |
| Bar height | 45 | 46 | 68, covering the Toolbar |
| Overlap beside a record, list 520 | no | no | no |
| Last row reachable | yes | yes | yes |
| Toast above the bar | yes | yes | never meets it |
| List and record, record open at 1920 | 1180, 520 | 1180, 520 | 1180, 520 |
| Rows shift when the bar arrives | 0 | 0 | 0 |
| Covers | nothing | rows under the pill | search and filters while ticked |

No effect or `ResizeObserver` serves the bar. The Table no longer has one either. Ticking still moves rows by 2 px per tick from K1.10's cause.

## List width

The list keeps its grid beside a record: the Table's form follows the density (K1.2), a `wide` Pane takes the spare room, and the record holds the list width (K1.3). With a record open the list is 1180 at 1920, 700 at 1440, and 520 down to the `region-min` floor of 340.

| Behaviour beside a record | References |
|---|---|
| Keep the columns and clip | [Attio](https://mobbin.com/screens/875fe7d7-a2e0-4521-bfc8-78a654b163d9), [Twenty](https://mobbin.com/screens/86a114d8-1a8e-4795-a639-c8dda8ee916a), [Jira](https://mobbin.com/screens/e70551a7-8c9a-4371-8686-629b5b0f13f8), [Superhuman](https://mobbin.com/screens/dea1a047-1c66-4679-957b-e0720ce38a85) |
| Drop columns or go compact | [Asana](https://mobbin.com/screens/95d319c8-e44a-48e0-bb32-83937d98ba96), [Linear Inbox](https://mobbin.com/screens/10d46768-7ef5-4140-9f5f-22a97a207759), [Front](https://mobbin.com/screens/d2c36bc8-4873-4542-8099-ce62ebaff44f), [Cloaked](https://mobbin.com/screens/a06abecd-2f6b-4ba6-b02e-4ad59dafec5a) |
| Record over the list | [Airtable](https://mobbin.com/screens/0a357715-a165-4684-b958-866607664786), [GitHub](https://mobbin.com/screens/4cf76327-af7d-4781-ae36-f571cdb2ed27), [Notion](https://mobbin.com/screens/8a6a33e6-ab41-4afb-9e51-dc4f108e39ee), [Origin](https://mobbin.com/screens/0909eeef-35b5-4496-91df-036c44a26d59), [Square](https://mobbin.com/screens/af6a9d55-8c5c-41b5-b742-edea7495065c), [Squarespace](https://mobbin.com/screens/116c1238-3c3c-45e4-9034-20528b320a86) |
| Record replaces the list | [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338), [Jira](https://mobbin.com/screens/29bf85fe-11dd-41af-adbb-c3744c0c72ac), [Attio](https://mobbin.com/screens/e56d6f53-7818-44f3-a6d6-8bb6e677aab5) |

## Table

| Component | Mobbin references | Gaps | Proposed fix | Plan item |
|---|---|---|---|---|
| Grid or list | [Notion](https://mobbin.com/screens/2f7bbc1f-a8a0-4fd4-ba5f-aa6c5ef86ceb), [Notion](https://mobbin.com/screens/8859ba39-fc79-499d-a756-0085c2bf502f) | `useWide` alone decides, by own width; list rows at 520 | The density decides | K1.2, changed |
| Frozen title | [Airtable](https://mobbin.com/screens/871d9238-a54f-4d8c-a9c1-a9cb7e5aca25), [Attio](https://mobbin.com/screens/3c2d207c-037e-495b-b6c8-50fe3045ed0c) | No edge when scrolled; title 140 px clips at 1100; tick column 28 and title offset 32 leak scrolled text through 4 px | `left-target`; hairline edge by CSS on the last frozen cell; floor at `measure-short` | K1.4, changed; K1.12, new |
| Frozen acts | [GitHub](https://mobbin.com/screens/fbf0fa53-e61e-4130-9bda-c5405dc91304), [Attio](https://mobbin.com/screens/f87ae525-00b1-405b-b82c-a38a96811837) | Quiet in meta ink, the old outline is gone; no rise on hover or focus | Body ink on row hover and focus-within, optional | K1.4, changed |
| Columns menu | [Braintrust](https://mobbin.com/screens/76c74e01-c89f-4748-b892-eb65e437ac4d), [Hex](https://mobbin.com/screens/c19382a2-22c3-430e-b5f4-141f79f95891), [Vanta](https://mobbin.com/screens/7f317ce6-2e6e-4fb2-929d-c8de5b2c2f75) | Ten checks, no Reset | One Reset row, `words.reset`, enabled when the choice differs | K1.16, new |
| Figure widths | [Linear](https://mobbin.com/screens/9fe6cfba-e54d-4cf0-9857-b3c1fe815238), [Airtable](https://mobbin.com/screens/8b3756c6-5b8f-48d8-9471-4d70bedb7d29) | Age 98 px clips "1 second a…"; Title, Artist, Key and Genre are all 304 at 1920 | Age floor from the longest word; text columns share by content class | K1.5, changed |
| Cursor | [Airtable](https://mobbin.com/screens/edaf92ed-905c-49c7-87de-a8a9d1f4d2b5), [GitHub](https://mobbin.com/screens/fbf0fa53-e61e-4130-9bda-c5405dc91304) | None, the ring is inset | None | None |
| Range ticks | [Notion](https://mobbin.com/screens/f49ef73e-f5ea-4da3-b785-f9c768aaca1b), [GitHub](https://mobbin.com/screens/fbf0fa53-e61e-4130-9bda-c5405dc91304), [Linear](https://mobbin.com/screens/3f36e39e-2b9e-4145-bee2-f43a3cf21f7b) | Rows 37 against 32, ticked 35; no wash at rest | Drop the tick cell's `py-gap`; `wash-selected` at rest, neutral | K1.10, K1.11, new |
| Choose | [ClickUp](https://mobbin.com/screens/e9639493-e0a6-46c9-93d1-d3189cbdc3c7), [Midday](https://mobbin.com/screens/975c0ea4-58a5-442e-bea9-cd42f360fd5d), [Wrangle](https://mobbin.com/screens/b9d8a719-226b-4c7c-9268-45b0f1fa875e), [Notion](https://mobbin.com/screens/f49ef73e-f5ea-4da3-b785-f9c768aaca1b) | Today's bar overlaps at 520: "Select all" 348-410 over "Keep it anyway" 367-482; "0 of 0" and disabled acts over an empty table; count unformatted | The picked prototype | K1.6, changed |
| Picked | None found | None | None | None |
| Windowed reads | [Unify](https://mobbin.com/screens/be3c7516-09ef-469f-a861-f08395a61f38), [Airtable](https://mobbin.com/screens/871d9238-a54f-4d8c-a9c1-a9cb7e5aca25), [Attio](https://mobbin.com/screens/626e45fb-f3cf-4b83-933d-31e0f92f0de6) | Total only in the bar. Painted rows while scrolling not observed | Formatted total in the columns bar | K1.15, new |
| Sort | [Linear](https://mobbin.com/screens/36065aa3-7929-4c53-a61d-7538096b3bba), [Attio](https://mobbin.com/screens/626e45fb-f3cf-4b83-933d-31e0f92f0de6) | No slot reserved, the glyph can wrap a 140 px label; first press on text sorts descending. Second and third press not observed | `invisible` hint; ascending first for text | K1.14, new |
| Edit | None | The hub does not use it | None | None |

## Sidebar and drag

| Component | Mobbin references | Gaps | Proposed fix | Plan item |
|---|---|---|---|---|
| Nested places | [Linear](https://mobbin.com/screens/02e40d29-f036-4543-9ae4-eb93f297b588), [Notion](https://mobbin.com/screens/8eb72dab-402b-4e35-9965-c6e0e1a12628), [hilos](https://mobbin.com/screens/181a16e8-6e89-4d41-b904-c472f69a643e), [TIDAL](https://mobbin.com/screens/63b29cb9-4145-4cb1-9822-4e5f0a61fbc3) | None | None | None |
| Folding | Same | Boxed 32 px chevron, minor | None | None |
| Tree keyboard | None | Space acts as Enter; 22 flat places are 22 tab stops, the tree is one | Space does nothing; every run through `PlaceTree` | K3.4; K3.6, new |
| Drop targets | [hilos](https://mobbin.com/screens/181a16e8-6e89-4d41-b904-c472f69a643e), [Featurebase](https://mobbin.com/screens/19c5dddb-0f80-4955-8ad0-a3acee80a2c5), [Dropbox Dash](https://mobbin.com/screens/ef7ae5b0-b15f-4080-955d-f45f979c3ad8) | A folded branch stays closed under a 2 s hold; its drops are unregistered | A short hold opens it; the tree owns the fold, `lib/drag` exposes the hold | K3.7, new |
| Counts | [Skiff](https://mobbin.com/screens/6b1d4162-c493-46b1-9a69-407db25d41c1), [Plain](https://mobbin.com/screens/1764602c-b875-482f-a13f-059bf78c15b7), [Pipedrive](https://mobbin.com/screens/ca19eb32-25da-438b-8817-d284e92bc1b8), [Notion Mail](https://mobbin.com/screens/8aec2e56-7abe-4a9f-8117-b4e5392db612) | Not rendered, no fixture; source fine | The app gives them | T1.7 |
| Pinned end | [Browserbase](https://mobbin.com/screens/47c2c738-eafa-44d4-8f0b-dcdcab087b40), [Linear](https://mobbin.com/screens/5f8b47b2-cf1a-431b-aa95-dfce8c7f5810), [Plane](https://mobbin.com/screens/4f8af89a-da3b-4f1d-b169-8a7c4b1ba1a9) | With a folder open the nav is 1138 tall in 1080, Settings is 58 px off screen, nothing scrolls | `SHELL_PLACES` scrolls; switcher and end group stay fixed | K3.1, changed |
| Drag label | [Dropbox Dash](https://mobbin.com/screens/ef7ae5b0-b15f-4080-955d-f45f979c3ad8), [Zendesk](https://mobbin.com/screens/b283f8ce-10b6-44bb-909c-49f6ac8aea71), [hilos](https://mobbin.com/screens/181a16e8-6e89-4d41-b904-c472f69a643e) | Fine; covers the next row's name, minor | None | None |
| Accent line | [Todoist](https://mobbin.com/screens/5d69e138-224c-4105-83e6-a50e42338655) | None | None | None |
| Reorder | [Maze](https://mobbin.com/screens/08860af6-164c-4122-84dc-a99e7c120345), [Fresha](https://mobbin.com/screens/c303fa1c-01df-4330-b5bd-f6db02b9371b) | Source row holds its press wash; voice asks no more | None | None |
| Edge scroll | None | A drag-only list has none; only the source's scroller moves | Carry the scroller under the pointer, from the existing hit test | K3.9, new |
| Press model | None | None | None | None |
| Menu floor | [Sana](https://mobbin.com/screens/5b096267-f5d4-44d8-819f-2b066d34f815), [Dropbox Paper](https://mobbin.com/screens/eb62382e-d12c-4a43-bdc3-d7cf46d3138c), [Drive](https://mobbin.com/screens/cba53d40-5c32-4667-b0a0-d4ec46390860), [ClickUp](https://mobbin.com/screens/c6892d98-c93c-468d-a244-e9cf7fec2ced) | Folded drops missing; same-label drops merged (source only) | From the place specs; each named by path | K3.2, K3.5 |

## Player and forms

| Component | Mobbin references | Gaps | Proposed fix | Plan item |
|---|---|---|---|---|
| Web dock | Spotify [1](https://mobbin.com/screens/546316d5-f68c-4bb6-bcda-b578d70ff27c) [2](https://mobbin.com/screens/635efc90-cb3f-4390-b6e3-8abc00d84128), [SoundCloud](https://mobbin.com/screens/c76fc42b-8fdd-4827-9462-e5d0de263eb6) | Name column `w-popover`, transport at 490-586 against a centre of 1070; Play looks like Skip; time touches the thumb | Zones share by flex; a glyph act takes `primary`; `gap-gap` on the progress row | K4.8, new |
| Native dock, not rendered | [Apple Music](https://mobbin.com/screens/c5710dec-38e5-42eb-aeaa-125ae7ae0251), [Suno](https://mobbin.com/screens/d490fe9a-8971-4bc1-859c-9bf15927ad07), [Spotify Kids](https://mobbin.com/screens/ad346ad5-2832-4482-bfd5-f2ad7dde93c7) | Two bars, about 121 px, no full player | One bar with hairline progress; press opens a Sheet | K4.9, new |
| Artwork | The dock's references | Name moves 30 px without a cover; a broken address shows a broken image | Thumbnail tile states from `image/base.tsx` | K4.10, new |
| Web waveform, source only | SoundCloud [1](https://mobbin.com/screens/a0d729d1-5b4c-4d58-9191-b2906aca4901) [2](https://mobbin.com/screens/ed654af2-e00e-4abe-9b23-6f56f5056a17) | Seeks on each pointer move | Commit on release through `useHeldDraft` | K4.11, new |
| Native waveform, not rendered | SoundCloud iOS [1](https://mobbin.com/screens/2f6ac051-b175-4ae9-bfb9-60bab59af954) [2](https://mobbin.com/screens/130fa915-e37c-4db8-9560-1fffeb082fb1) | Absent, by decision | SVG columns, commit on release | K4.12, new |
| Field-commit form | Linear [1](https://mobbin.com/screens/f3134ca3-b7e5-47ab-a283-92ce2db403db) [2](https://mobbin.com/screens/60dd3590-48ba-4a6b-933a-7f8ef3ab8b6d) [3](https://mobbin.com/screens/34f99905-3147-4e31-9d52-c091158c4ba3) | Rows 80 against 56; "256" in a 462 px box; "Optional" 50 times | Description under the label, control at its own measure | K2.1; K2.14, new |
| Sheet `after` | [Vercel](https://mobbin.com/screens/56371ade-be8a-45d7-89a2-b1a3a7ca7db0), [Workable](https://mobbin.com/screens/a0b8a010-71fe-411d-8b2f-335b33306587), [Railway](https://mobbin.com/screens/131e5390-18b7-4eb6-9715-bb5d9497c7fb) | Apply lands mid-body at y=727 with the preview under it | The form's bar stands after `after`, pinned in the sheet's foot | K2.15, new |
| Secret | Stripe [1](https://mobbin.com/screens/065bf8c6-7bb0-4ddf-ab61-af29f505d0a3) [2](https://mobbin.com/screens/e8ddbdc5-bc89-454f-9ebb-846905b83df4), [Vercel](https://mobbin.com/screens/5bd3c92b-c89f-4445-8541-b29b3b578074) | Mask reads as a value; red trash at rest; one press removes; no Replace | "Saved, ends in …" in meta ink, Replace, quiet Remove with confirm | K2.16, new; T6.5 |

## Frames and blocks

| Component | Mobbin references | Gaps | Proposed fix | Plan item |
|---|---|---|---|---|
| Banner | [incident.io](https://mobbin.com/screens/3d5a05c9-fc6e-40a6-b965-a7af5ffac560), [Sprig](https://mobbin.com/screens/83f67504-08a2-499e-823d-03a52c3f28a3), [Mixpanel](https://mobbin.com/screens/4fd29bdb-4496-4252-82b2-ea3400ef18fc), [Gumloop](https://mobbin.com/screens/60ec82f0-afbf-4a61-b57a-0c56f540f9b6) | Act in the tone's ink; glyph 6 px above centre beside an act. The 56 px move on arrival is what `rules.md` asks | Outlined act; the line keeps the act's height | K2.3, changed |
| Section frames and error | [Remote](https://mobbin.com/screens/33a0fa06-a623-4e22-b705-4175ce2216a9), [PayPal](https://mobbin.com/screens/71044211-2f4a-4b72-a66f-867a5ea94b35), [Dropbox Dash](https://mobbin.com/screens/f10e8de9-fc45-47d7-8ada-238f1ea8d062), [SuperHi](https://mobbin.com/screens/e5acbbff-4729-4ac2-bd57-33c70c503537) | One failed form per Section: 8 on stats, 8 on settings, which `rules.md` accepts | Open: see K2.6 | K2.6, changed |
| Section reorder | [Linear](https://mobbin.com/screens/e494c7a9-8c56-4840-bca4-a0324b332710), [Coda](https://mobbin.com/screens/e794d9e9-f4cf-47cb-9f8c-9aecd4a95fac) | They use a grip; voice says never by a handle | None | None |
| MoreRow | [Webflow](https://mobbin.com/screens/a9765eff-fb9b-4873-8c24-0e2f8e66779d), [Elicit](https://mobbin.com/screens/a93ed186-ad32-4d8b-9cec-acd2ddcc78ef), [Airtasker](https://mobbin.com/screens/d87ab472-5dc0-4d5d-9878-bd792cbac646), [Hashnode](https://mobbin.com/screens/cf237bd2-a14d-4e02-a42e-44e58d64a1d8) | Not rendered, no fixture; source fine | None | None |
| Row pick | Linear [1](https://mobbin.com/screens/5f8b47b2-cf1a-431b-aa95-dfce8c7f5810) [2](https://mobbin.com/screens/50e9bde5-16a9-4d43-9266-450278791eab), [Notion](https://mobbin.com/screens/bb37c98b-4f9a-4fef-967c-40225bc2e9b6) | Trigger shows the instruction, "Map Hous to a close ge…" | The value, or a generic word from `words`; label as accessible name | K2.17, new |
| Gate | [Laravel Cloud](https://mobbin.com/screens/080902ea-69ea-45d6-a840-f3a6a3fdbf03), [Etsy](https://mobbin.com/screens/441605d5-c082-482d-a75d-b6814c91eb5f), [Dropbox Dash](https://mobbin.com/screens/bd09a0df-85ba-47e8-89cb-657f6df17ed2) | Quiet Decline; consent sentence in meta ink. Stack offers both fixes | Decline `secondary`, the sentence in a body `Text` | T5.8, new |
| Empty | [Laravel](https://mobbin.com/screens/5a0b71b3-f06f-4b14-af43-b862c1550a8f), [Basedash](https://mobbin.com/screens/e8be089a-4841-4693-852b-427c96690749), [Amplitude](https://mobbin.com/screens/76cb02f8-006d-4d4f-8af7-97f43abe32d7), [Whop](https://mobbin.com/screens/6de0f2b2-772e-4d3f-8354-3b24feb3f690) | None | None | None |
| Loading | [GoFundMe](https://mobbin.com/screens/f764e9fc-e5cf-4e0f-89ea-bd778d2fa88a), [Fabric](https://mobbin.com/screens/46846b8b-226e-4952-a05a-97f5b7bb11a1), [Chronicle](https://mobbin.com/screens/fbeab89c-f418-442b-9fa2-ba67efa47c56), [Babbel](https://mobbin.com/screens/eb4a4034-4605-4b51-b624-da8989c143b8) | Later headings move 100 px on genres; the unify preview's heading stands over nothing | Paint the last count; the preview paints while it waits | K2.7; T2.9, new |
| Not-found | [Coinbase](https://mobbin.com/screens/7484e648-c0ba-4ffa-888c-30c36d53ab32), [Height](https://mobbin.com/screens/bd98fbd3-903c-4b52-9a17-fd3ce92fc0ad), [Sketch](https://mobbin.com/screens/a99a2151-9161-4ded-b152-3e641beba398), [Instagram](https://mobbin.com/screens/5294ba10-11ee-43dd-892c-840e0fbfdab6) | `back={false}` still draws Back; a Section's missing form draws Back, 8 on stats | Fix `useBackAct`; a Section's missing form is the sentence alone | K2.6, changed |
| Stats | [Xero](https://mobbin.com/screens/7e99b13f-3003-4846-98b4-0e9f939f4969), [Cloudflare](https://mobbin.com/screens/5cfd2aab-b900-484e-bca8-7bec7cbdcc27), [Whop](https://mobbin.com/screens/0098ad70-886b-41c4-894f-107124665d8a) | "%" stands 178 px from "64" | The unit follows the figure, spare room after the pair | K2.5 |
| BarChart | [Gumloop](https://mobbin.com/screens/60ec82f0-afbf-4a61-b57a-0c56f540f9b6), [Xero](https://mobbin.com/screens/7e99b13f-3003-4846-98b4-0e9f939f4969), Vercel [1](https://mobbin.com/screens/684fc9a5-8990-4f93-8fc3-28e1e0750078) [2](https://mobbin.com/screens/0e990655-cf9f-4231-a936-8358046daa48) | Plot now 685 of 720. No card, and `blocks.md` and `frames.md` disagree. Keys names only the A keys, 12 of 24 | BarChart draws its card as Stats does; Keys as 12 stacked buckets | K2.20, new; T6.6 |

## Fixes ranked

1. K1.6, the selection bar: it overlaps wherever a record is open, on the library's main task.
2. K1.10 and K1.11, one row height and a neutral wash at rest: every grid row, and ticking moves the list.
3. K3.1, the sidebar scrolls: Settings is unreachable with a folder open.
4. K4.11, the waveform commits on release: a drag is a seek per pointer move.
5. K2.15, Apply after the preview: the preview is what a bulk edit turns on.
6. K1.4 and K1.12, the frozen group: text leaks through 4 px and has no edge.
7. K2.1, no "Optional" in a field-commit form: 50 words on settings.
8. K2.3, the outlined Banner act and its glyph.
9. K2.16, secret: one press discards a key that cannot be read back.
10. K3.2 and K3.5, every drop reachable without a pointer.
11. K2.20 and K2.5, the BarChart's card and the Stats unit.
12. K2.17, the row pick's trigger.
13. K1.5, column shares.
14. K3.7 and K3.9, hold to open and edge scroll under the pointer.
15. K4.8 and K4.10, dock zones and the cover tile.
16. K1.16, K1.14 and K1.15, Reset, the sort glyph and the total.
17. K3.6 and K3.4, the sidebar's keyboard.
18. K2.14, the field row, which needs the owner's word on voice 3.
19. K4.9, the native dock.
20. K4.12, the native waveform.
