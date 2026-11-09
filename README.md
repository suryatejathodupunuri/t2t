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
- Switch among named table pairs
- Change table text size from 10 to 20 pixels
- Drag the center divider to resize the source and target views
- Select text in a cell and assign an error category
- Clear the saved browser session from the top navigation

## Supported JSON shapes

- An array of objects (one table)
- An array of arrays (one table, generated column names)
- `{ "rows": [...] }` or `{ "data": [...] }`
- `{ "tables": [{ "name": "...", "rows": [...] }] }`
- An object whose values are named row arrays

Annotations, imported tables, table size, and split position are autosaved to `localStorage` in the same browser. **Save all** downloads a JSON file containing each span, category, table, row, column, and character offsets.
