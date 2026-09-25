# TN Grama Bank — Security Operations Dashboard

A branch-security operations console for a 680-branch, 38-district bank network:
panel arm state, intrusion and tamper conditions, 8-zone panel detail, power
health, a live event feed, event history, a geographic view, a manager
directory, ten exportable reports, and system configuration.

Rebuilt from a mind-map-driven prototype into plain, runnable source. No build
step, no dependencies, no server required.

## Running it

Open `index.html` in any modern browser. That is the whole procedure — the
scripts are classic `<script>` tags in dependency order, so the page works from
the file system without a module server.

If you prefer a server (Python is the only thing needed):

```
python -m http.server 8000
```

then visit <http://localhost:8000/>.

Each view has its own URL fragment, so `index.html#reports` opens straight into
Reports and the address bar tracks navigation.

## Tests

`tests/selftest.html` loads the real dashboard, clicks through every view, every
drill-down, every view-mode switch, every search box and the CSV export, then
prints a pass/fail report. Open it in a browser, or run it headless:

```
chrome --headless=new --virtual-time-budget=20000 --dump-dom tests/selftest.html
```

The last line of the report reads `RESULT: ALL PASS` when everything is green.
It also checks that all text on every view is Arial Regular (no bold or italic).

## Sending it to someone

```
python build/bundle.py
```

writes `dist/tngb-dashboard-standalone.html`, a single 160 KB file with the
stylesheet and all eighteen scripts inlined. The recipient double-clicks it and
the whole dashboard runs. Send that when you just need someone to see the thing
working.

Send the zipped source tree when they need to edit it. Note that Gmail, Outlook
and most corporate filters reject `.js` attachments even inside a `.zip`, so a
plain archive of this folder will bounce. Share it through a Drive or OneDrive
link, or put it on a Git host, rather than as a raw attachment.

## Layout

```
index.html              script order and the mount point
assets/styles.css       design tokens, layout, components
src/core/utils.js       colours, seeded RNG, formatting
src/core/icons.js       inline SVG icon set
src/core/dom.js         the `h` element builder
src/core/widgets.js     KPI tiles, tables, drill-down panels, chips
src/data/master.js      districts, branch roster, status mix
src/data/derived.js     zones, power health, event stream, report definitions
src/views/*.js          one module per sidebar entry
src/app.js              state, navigation, render loop
tests/selftest.html     browser-driven regression suite
build/bundle.py         single-file build for emailing
dist/                   build output
```

## How it is put together

**State is one plain object** in `src/app.js`. `setState` merges a patch and
repaints the content region; nothing outside a view's own `render` touches the
DOM. Views are pure functions of `(state)` returning a DOM node, registered as
`App.views.<key>`.

**Adding a view** means dropping a module in `src/views/` that registers itself
on `App.views`, adding its key to `NAV_ORDER` in `src/app.js`, and adding its
`<script>` tag to `index.html`.

**Every number is drillable.** No counter on any page is a hard-coded figure —
each one is computed from the branch roster and opens the list it came from.
"Alarm Restored: 39" opens 39 real branch-and-time records.

**One rule per fact.** District status comes from `App.data.districtStatus`, so
the region list, the district table and the map can never disagree. Panel and
connectivity colours live in `src/core/utils.js` alone.

## The data layer

Sample data, generated from fixed seeds, so the dashboard is identical on every
load and screenshots, exports and drill-downs all reconcile.

The status mix is exact, not probabilistic:

| Panel state  | Branches | Connectivity |
| ------------ | -------- | ------------ |
| Armed        | 350      | Online       |
| Disarmed     | 150      | Online       |
| Alarm Active | 50       | Offline      |
| Fault        | 20       | Offline      |
| Offline      | 110      | Offline      |

That totals 680 branches, 500 online and 180 offline. Melur Branch is a
hand-entered reference record pinned to Armed / Online; the category its slot
drew is handed to another Armed / Online branch, so the totals above hold
exactly.

Zones, power health and events are derived per branch from a seed keyed on the
branch id, so a branch reporting Alarm Active always has a zone that explains
it, and a branch that is offline is overwhelmingly likely to be offline because
its mains failed.

## Connecting real data

Replace `src/data/master.js` with your own feed. Everything downstream depends
only on the shape it exports:

```js
{ id, name, branchIdCode, district, panelStatus, connectivity, status,
  manager: { name, id, contact, email },
  events: [{ type, time, zone }] }
```

`panelStatus` is one of `Armed`, `Disarmed`, `Alarm Active`, `Fault`, `Offline`;
`connectivity` is `Online` or `Offline`; `time` is `YYYY-MM-DD HH:MM`, which
sorts lexicographically and is what the range filters in Reports rely on.

Keep the exported helpers (`allBranches`, `branchById`, `branchesIn`,
`districtStats`, `districtStatus`, `networkStats`) and no view needs to change.

## Notes

Two behaviours differ deliberately from the prototype this was rebuilt from.
District status is now derived from the branch numbers rather than a fixed list,
because the old fixed list labelled districts "Normal" while their own row
reported an open fault. Tamper counts are derived from actual zone state instead
of a single hard-coded branch. Both changes make the drill-downs reconcile with
the cards above them.

Reports preview the first 400 rows for responsiveness; the CSV export always
contains the full result set.
