# Table2Table Translation

A local-first, single-page source-to-target table annotation tool.

## Run

From `/scratch/suryateja.t`, run:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/t2t/`.

The page can also be opened directly as `index.html`; the sample button has an embedded fallback for browsers that block local JSON fetches.

## Workspace controls

- Upload source and target JSON directly, or proceed with the included samples
- Move through numbered tables with **Previous** and **Next**
- Save the current table before navigating away; the app prompts you if it is still unsaved
- See **SAVED** or **UNSAVED**, track `Saved X / N`, and use **Find unsaved** to locate unfinished tables
- Change table text size from 10 to 20 pixels
- Drag the center divider to resize the source and target views
- Select target-table text and assign an error category
- View annotation logs for the current table only
- Save each table individually as a completed review checkpoint
- Save a table with zero annotations to confirm that it was reviewed and contains no errors
- Download the final JSON only after every table has been saved
- Clear the browser session from the top navigation

Browser autosave remains active in the background. If an annotation is added, removed, or cleared after a table is saved, that table immediately becomes **UNSAVED** and must be saved again before you can leave it.

## Source editing configuration

Source-table span selection is disabled by default. To allow annotations on both sides, edit the configuration near the top of `app.js`:

```js
const APP_CONFIG = {
  enableSourceEditing: true
};
```

Use `false` for target-only annotation or `true` to enable source annotation.

## Supported JSON shapes

- An array of objects (one table)
- An array of arrays (one table, generated column names)
- `{ "rows": [...] }` or `{ "data": [...] }`
- `{ "tables": [{ "name": "...", "rows": [...] }] }`
- An object whose values are named row arrays

Annotations, imported tables, table review checkpoints, text size, and split position are autosaved to `localStorage` in the same browser. **Download all** exports every annotation with its span, category, table, row, column, and character offsets.
