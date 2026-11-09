# Table2Table Translation

A buildless, browser-based tool for comparing source and target tables and annotating errors in target-table text.

## Features

- Upload source and target JSON files or use the included samples
- Review any table in any order with **Previous** and **Next**
- Mark each table as **SAVED** or **UNSAVED**
- Save a reviewed table even when it contains no errors
- Resume work from the same browser using `localStorage`
- Download one JSON file after every table has been saved

## Requirements

- Git
- Python 3, or any other local static-file server
- A modern web browser

There are no packages or dependencies to install.

## Clone and run

```bash
git clone https://github.com/suryatejathodupunuri/t2t.git
cd t2t
python3 -m http.server 8000
```

Open `http://localhost:8000` in your browser.

Use a local server instead of opening `index.html` directly because the app loads its categories and samples from JSON files.

## Configuration

Edit `error-categories.json` to change the dropdown values:

```json
{
  "categories": [
    "Incorrect value",
    "Missing content",
    "Other"
  ]
}
```

Source-table selection is disabled by default. To enable annotations on both source and target tables, change this setting near the top of `app.js`:

```js
const APP_CONFIG = {
  enableSourceEditing: true
};
```

## Supported table JSON

The source and target uploads support:

- An array of objects
- An array of arrays
- `{ "rows": [...] }` or `{ "data": [...] }`
- `{ "tables": [{ "name": "...", "rows": [...] }] }`
- An object whose values are named row arrays

## Saving and export

Browser autosave stores imported tables, annotations, review states, text size, and split position in `localStorage` on the same browser.

Users can move between tables freely. Adding, removing, or clearing an annotation changes that table to **UNSAVED**. Saving a table with no annotations confirms that it was reviewed and has no errors.

**Download all** becomes available only after every table is saved. The exported JSON contains annotation spans, selected text, categories, table numbers, rows, columns, and character offsets.

