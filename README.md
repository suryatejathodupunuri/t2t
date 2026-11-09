# TableLens

A local-first, single-page table annotation tool.

## Run

From `/scratch/suryateja.t`, run:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/t2t/`.

The page can also be opened directly as `index.html`; the sample button has an embedded fallback for browsers that block local JSON fetches.

## Supported JSON shapes

- An array of objects (one table)
- An array of arrays (one table, generated column names)
- `{ "rows": [...] }` or `{ "data": [...] }`
- `{ "tables": [{ "name": "...", "rows": [...] }] }`
- An object whose values are named row arrays

Annotations and imported tables are autosaved to `localStorage` in the same browser. **Save all** downloads a JSON file containing each span, category, table, row, column, and character offsets.
