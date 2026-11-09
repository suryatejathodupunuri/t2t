(() => {
  "use strict";

  const STORAGE_KEY = "table2table.workspace.v1";
  const LEGACY_STORAGE_KEY = "tablelens.workspace.v1";
  const STORAGE_VERSION = 1;
  const APP_CONFIG = {
    enableSourceEditing: false
  };

  const SAMPLE_SOURCE = {
    tables: [
      {
        name: "Quarterly Sales",
        rows: [
          { Region: "North", Product: "Desk Lamp", Quarter: "Q1", Revenue: "$12,400" },
          { Region: "South", Product: "Floor Lamp", Quarter: "Q1", Revenue: "$9,850" },
          { Region: "West", Product: "Reading Light", Quarter: "Q1", Revenue: "$15,200" }
        ]
      },
      {
        name: "Team Directory",
        rows: [
          { Name: "Amina Patel", Role: "Research Lead", Location: "London" },
          { Name: "Jon Bell", Role: "Product Designer", Location: "New York" },
          { Name: "Mei Tan", Role: "Data Analyst", Location: "Singapore" }
        ]
      }
    ]
  };

  const SAMPLE_TARGET = {
    tables: [
      {
        name: "Quarterly Sales",
        rows: [
          { Region: "North", Product: "Desk lamp", Quarter: "Q1", Revenue: "$12,400" },
          { Region: "South", Product: "Floor Lamp", Quarter: "Q2", Revenue: "$9,850" },
          { Region: "West", Product: "Reading Light", Quarter: "Q1", Revenue: "$15,2000" }
        ]
      },
      {
        name: "Team Directory",
        rows: [
          { Name: "Amina Patel", Role: "Researcher Lead", Location: "London" },
          { Name: "Jon Bell", Role: "Product Designer", Location: "New York City" },
          { Name: "Mei Tan", Role: "Data Analyst", Location: "Singapore" }
        ]
      }
    ]
  };

  const state = {
    source: null,
    target: null,
    annotations: [],
    savedTables: {},
    activeTableIndex: 0,
    pendingSelection: null,
    categoriesReady: false,
    tableFontSize: 12,
    splitPercent: 50
  };

  const pendingFiles = { source: null, target: null };
  let saveTimer = null;
  let toastTimer = null;

  const dom = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    [
      "clearSessionButton", "saveTableButton", "downloadAllButton", "emptyState", "loadSampleButton",
      "workspace", "annotationCount", "annotationTableLabel", "tableTabs", "previousTableButton",
      "currentTableLabel", "nextTableButton", "reviewProgressLabel",
      "sourcePanelLabel", "sourceTableTitle",
      "targetTableTitle", "sourceRowCount", "targetRowCount", "sourceTableContainer",
      "targetTableContainer", "selectionText", "selectionLocation", "categorySelect",
      "addAnnotationButton", "clearAnnotationsButton", "annotationList", "uploadForm",
      "sourceFileInput", "targetFileInput", "sourceDropzone", "targetDropzone",
      "sourceDropTitle", "targetDropTitle", "sourceDropMeta", "targetDropMeta", "dialogError",
      "loadFilesButton", "fontSizeOptions", "comparisonGrid", "tableSplitter", "toast"
    ].forEach((id) => { dom[id] = document.getElementById(id); });

    bindEvents();
    if (!restoreWorkspace()) renderEmptyState();
    loadErrorCategories();
  }

  function bindEvents() {
    dom.clearSessionButton.addEventListener("click", clearSession);
    dom.saveTableButton.addEventListener("click", saveCurrentTable);
    dom.downloadAllButton.addEventListener("click", downloadAnnotations);
    dom.previousTableButton.addEventListener("click", () => goToTable(state.activeTableIndex - 1));
    dom.nextTableButton.addEventListener("click", () => goToTable(state.activeTableIndex + 1));
    dom.loadSampleButton.addEventListener("click", loadSampleWorkspace);
    dom.addAnnotationButton.addEventListener("click", addAnnotation);
    dom.categorySelect.addEventListener("change", updateAddButton);
    dom.clearAnnotationsButton.addEventListener("click", clearAnnotations);
    dom.uploadForm.addEventListener("submit", handleUploadSubmit);
    dom.sourceFileInput.addEventListener("change", (event) => setPendingFile("source", event.target.files[0]));
    dom.targetFileInput.addEventListener("change", (event) => setPendingFile("target", event.target.files[0]));
    dom.fontSizeOptions.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-size]");
      if (button) setTableFontSize(Number(button.dataset.size));
    });

    setupDropzone(dom.sourceDropzone, "source");
    setupDropzone(dom.targetDropzone, "target");
    setupSplitter();

    const selectionContainers = [dom.targetTableContainer];
    if (APP_CONFIG.enableSourceEditing) selectionContainers.push(dom.sourceTableContainer);
    selectionContainers.forEach((container) => {
      container.addEventListener("mouseup", () => window.setTimeout(captureSelection, 0));
      container.addEventListener("keyup", () => window.setTimeout(captureSelection, 0));
    });

    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (state.source && state.target) saveCurrentTable();
      }
      if (event.key === "Escape" && state.pendingSelection) resetPendingSelection();
    });
  }

  async function loadErrorCategories() {
    try {
      const response = await fetch("error-categories.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const values = Array.isArray(payload) ? payload : payload?.categories;
      const categories = [...new Set(
        (Array.isArray(values) ? values : [])
          .filter((value) => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean)
      )];
      if (!categories.length) throw new Error("No categories found");

      dom.categorySelect.replaceChildren();
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Choose a category…";
      dom.categorySelect.append(placeholder);
      categories.forEach((category) => {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        dom.categorySelect.append(option);
      });
      state.categoriesReady = true;
      dom.categorySelect.disabled = !state.pendingSelection;
      updateAddButton();
    } catch (_error) {
      state.categoriesReady = false;
      dom.categorySelect.replaceChildren();
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Categories unavailable";
      dom.categorySelect.append(option);
      dom.categorySelect.disabled = true;
      showToast("Could not load error-categories.json.");
    }
  }

  function setupDropzone(dropzone, side) {
    ["dragenter", "dragover"].forEach((type) => {
      dropzone.addEventListener(type, (event) => {
        event.preventDefault();
        dropzone.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach((type) => {
      dropzone.addEventListener(type, (event) => {
        event.preventDefault();
        dropzone.classList.remove("dragover");
      });
    });
    dropzone.addEventListener("drop", (event) => {
      const file = event.dataTransfer.files[0];
      if (file) setPendingFile(side, file);
    });
  }

  function showUploadScreen() {
    resetUploadForm();
    dom.emptyState.hidden = false;
    dom.workspace.hidden = true;
    dom.saveTableButton.textContent = "Save table";
    dom.saveTableButton.disabled = true;
    dom.downloadAllButton.disabled = true;
  }

  function resetUploadForm() {
    pendingFiles.source = null;
    pendingFiles.target = null;
    dom.sourceFileInput.value = "";
    dom.targetFileInput.value = "";
    dom.sourceDropTitle.textContent = "Choose source JSON";
    dom.targetDropTitle.textContent = "Choose target JSON";
    dom.sourceDropMeta.textContent = "Click to browse or drop a file";
    dom.targetDropMeta.textContent = "Click to browse or drop a file";
    dom.dialogError.textContent = "";
    dom.loadFilesButton.disabled = true;
  }

  function setPendingFile(side, file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json") && file.type !== "application/json") {
      dom.dialogError.textContent = `${file.name} is not a JSON file.`;
      return;
    }
    pendingFiles[side] = file;
    dom[`${side}DropTitle`].textContent = file.name;
    dom[`${side}DropMeta`].textContent = formatBytes(file.size);
    dom.dialogError.textContent = "";
    dom.loadFilesButton.disabled = !(pendingFiles.source && pendingFiles.target);
  }

  async function handleUploadSubmit(event) {
    event.preventDefault();
    if (!pendingFiles.source || !pendingFiles.target) return;

    dom.loadFilesButton.disabled = true;
    dom.loadFilesButton.textContent = "Reading files…";
    dom.dialogError.textContent = "";
    try {
      const [sourceText, targetText] = await Promise.all([
        pendingFiles.source.text(),
        pendingFiles.target.text()
      ]);
      const sourceRaw = JSON.parse(sourceText);
      const targetRaw = JSON.parse(targetText);
      const source = normalizeDocument(sourceRaw, pendingFiles.source.name);
      const target = normalizeDocument(targetRaw, pendingFiles.target.name);
      startWorkspace(source, target, true);
      showToast("Files loaded. Your work will autosave in this browser.");
    } catch (error) {
      dom.dialogError.textContent = error instanceof SyntaxError
        ? "One of the files contains invalid JSON. Please check it and try again."
        : error.message;
    } finally {
      dom.loadFilesButton.textContent = "Open uploaded tables";
      dom.loadFilesButton.disabled = !(pendingFiles.source && pendingFiles.target);
    }
  }

  async function loadSampleWorkspace() {
    try {
      const [sourceResponse, targetResponse] = await Promise.all([
        fetch("samples/source.json"),
        fetch("samples/target.json")
      ]);
      if (!sourceResponse.ok || !targetResponse.ok) throw new Error("Sample fetch failed");
      const [sourceRaw, targetRaw] = await Promise.all([sourceResponse.json(), targetResponse.json()]);
      startWorkspace(
        normalizeDocument(sourceRaw, "source.json"),
        normalizeDocument(targetRaw, "target.json"),
        true
      );
    } catch (_error) {
      // Browsers block fetch() for file:// pages, so keep an identical embedded fallback.
      startWorkspace(
        normalizeDocument(SAMPLE_SOURCE, "source.json"),
        normalizeDocument(SAMPLE_TARGET, "target.json"),
        true
      );
    }
    showToast("Sample tables loaded.");
  }

  function startWorkspace(source, target, clearExistingAnnotations) {
    state.source = source;
    state.target = target;
    state.activeTableIndex = 0;
    state.pendingSelection = null;
    state.savedTables = {};
    if (clearExistingAnnotations) state.annotations = [];
    renderWorkspace();
    persistWorkspace(true);
  }

  function normalizeDocument(raw, fileName) {
    let candidates = [];

    if (raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray(raw.tables)) {
      candidates = raw.tables.map((table, index) => ({
        name: table?.name || table?.title || `Table ${index + 1}`,
        value: table
      }));
    } else if (Array.isArray(raw)) {
      const looksLikeTableCollection = raw.length > 0 && raw.every((entry) =>
        entry && typeof entry === "object" && !Array.isArray(entry) &&
        (Array.isArray(entry.rows) || Array.isArray(entry.data))
      );
      candidates = looksLikeTableCollection
        ? raw.map((table, index) => ({ name: table.name || table.title || `Table ${index + 1}`, value: table }))
        : [{ name: "Table 1", value: raw }];
    } else if (raw && typeof raw === "object") {
      if (Array.isArray(raw.rows) || Array.isArray(raw.data)) {
        candidates = [{ name: raw.name || raw.title || "Table 1", value: raw }];
      } else {
        const arrayEntries = Object.entries(raw).filter(([, value]) => Array.isArray(value));
        candidates = arrayEntries.length
          ? arrayEntries.map(([name, value]) => ({ name, value }))
          : [{ name: raw.name || raw.title || "Table 1", value: [raw] }];
      }
    } else {
      throw new Error(`${fileName} does not contain a table-like JSON value.`);
    }

    const tables = candidates.map((candidate, index) => normalizeTable(candidate.value, candidate.name, index));
    if (!tables.length) tables.push(normalizeTable([], "Table 1", 0));
    return { fileName, tables };
  }

  function normalizeTable(input, name, index) {
    const descriptor = input && !Array.isArray(input) && typeof input === "object" ? input : null;
    const rawRows = Array.isArray(input)
      ? input
      : Array.isArray(descriptor?.rows)
        ? descriptor.rows
        : Array.isArray(descriptor?.data)
          ? descriptor.data
          : [];
    const suppliedColumns = descriptor?.columns || descriptor?.headers;
    let keys = [];
    let labels = [];

    if (Array.isArray(suppliedColumns)) {
      keys = suppliedColumns.map((column, columnIndex) =>
        typeof column === "object" && column !== null
          ? String(column.key ?? column.id ?? column.name ?? columnIndex)
          : String(column)
      );
      labels = suppliedColumns.map((column, columnIndex) =>
        typeof column === "object" && column !== null
          ? String(column.label ?? column.name ?? column.key ?? `Column ${columnIndex + 1}`)
          : String(column)
      );
    } else if (rawRows.some((row) => row && typeof row === "object" && !Array.isArray(row))) {
      const keySet = new Set();
      rawRows.forEach((row) => {
        if (row && typeof row === "object" && !Array.isArray(row)) {
          Object.keys(row).forEach((key) => keySet.add(key));
        }
      });
      keys = [...keySet];
      labels = [...keys];
    } else {
      const width = rawRows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 1), 0);
      keys = Array.from({ length: width }, (_, columnIndex) => String(columnIndex));
      labels = keys.map((_, columnIndex) => `Column ${columnIndex + 1}`);
    }

    const rows = rawRows.map((row) => keys.map((key, columnIndex) => {
      const value = Array.isArray(row)
        ? row[columnIndex]
        : row && typeof row === "object"
          ? row[key]
          : columnIndex === 0 ? row : "";
      return stringifyCell(value);
    }));

    return {
      id: `table-${index}`,
      name: String(descriptor?.name || descriptor?.title || name || `Table ${index + 1}`),
      columns: keys.map((key, columnIndex) => ({ key, label: labels[columnIndex] || key })),
      rows
    };
  }

  function stringifyCell(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") {
      try { return JSON.stringify(value); } catch (_error) { return String(value); }
    }
    return String(value);
  }

  function renderEmptyState() {
    showUploadScreen();
  }

  function renderWorkspace() {
    if (!state.source || !state.target) {
      renderEmptyState();
      return;
    }
    dom.emptyState.hidden = true;
    dom.workspace.hidden = false;
    applyWorkspacePreferences();

    const pairCount = getTableCount();
    if (state.activeTableIndex >= pairCount) state.activeTableIndex = 0;
    renderTabs(pairCount);
    renderActiveTables();
    renderAnnotationList();
    updateAnnotationCount();
    resetPendingSelection(false);
  }

  function renderTabs(pairCount) {
    const tableNumber = state.activeTableIndex + 1;
    const isSaved = Boolean(state.savedTables[state.activeTableIndex]);
    dom.currentTableLabel.textContent = `Table ${tableNumber} of ${pairCount}`;
    dom.currentTableLabel.classList.toggle("saved", isSaved);
    dom.previousTableButton.disabled = state.activeTableIndex === 0;
    dom.nextTableButton.disabled = state.activeTableIndex >= pairCount - 1;
    updateSaveControls();
  }

  function goToTable(index) {
    const pairCount = getTableCount();
    if (index < 0 || index >= pairCount || index === state.activeTableIndex) return;
    state.activeTableIndex = index;
    resetPendingSelection();
    renderTabs(pairCount);
    renderActiveTables();
    renderAnnotationList();
    updateAnnotationCount();
    persistWorkspace();
  }

  function renderActiveTables() {
    const index = state.activeTableIndex;
    const sourceTable = state.source.tables[index];
    const targetTable = state.target.tables[index];
    const tableLabel = `Table ${index + 1}`;
    dom.sourcePanelLabel.textContent = APP_CONFIG.enableSourceEditing ? "SOURCE" : "SOURCE · READ ONLY";
    dom.sourceTableTitle.textContent = tableLabel;
    dom.targetTableTitle.textContent = tableLabel;
    dom.sourceRowCount.textContent = pluralize(sourceTable?.rows.length || 0, "row");
    dom.targetRowCount.textContent = pluralize(targetTable?.rows.length || 0, "row");
    renderTable(dom.sourceTableContainer, sourceTable, "source", index);
    renderTable(dom.targetTableContainer, targetTable, "target", index);
  }

  function renderTable(container, table, side, tableIndex) {
    container.replaceChildren();
    if (!table) {
      const empty = document.createElement("div");
      empty.className = "empty-table";
      empty.textContent = `No ${side} table at this position.`;
      container.append(empty);
      return;
    }

    const element = document.createElement("table");
    element.className = "data-table";
    const head = document.createElement("thead");
    const headingRow = document.createElement("tr");
    const numberHeading = document.createElement("th");
    numberHeading.className = "row-number";
    numberHeading.textContent = "#";
    headingRow.append(numberHeading);
    table.columns.forEach((column) => {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = column.label;
      headingRow.append(th);
    });
    head.append(headingRow);
    element.append(head);

    const body = document.createElement("tbody");
    table.rows.forEach((row, rowIndex) => {
      const tr = document.createElement("tr");
      const numberCell = document.createElement("td");
      numberCell.className = "row-number";
      numberCell.textContent = rowIndex + 1;
      tr.append(numberCell);

      row.forEach((value, columnIndex) => {
        const column = table.columns[columnIndex];
        const td = document.createElement("td");
        const isEditable = side === "target" || APP_CONFIG.enableSourceEditing;
        td.className = isEditable ? "selectable-cell" : "read-only-cell";
        td.dataset.side = side;
        td.dataset.tableIndex = tableIndex;
        td.dataset.rowIndex = rowIndex;
        td.dataset.columnIndex = columnIndex;
        td.dataset.columnKey = column.key;
        td.dataset.columnLabel = column.label;
        renderCellContent(td, value, side, tableIndex, rowIndex, columnIndex);
        tr.append(td);
      });
      body.append(tr);
    });
    element.append(body);
    container.append(element);
  }

  function renderCellContent(cell, value, side, tableIndex, rowIndex, columnIndex) {
    const matching = state.annotations
      .filter((annotation) => annotation.side === side && annotation.tableIndex === tableIndex &&
        annotation.rowIndex === rowIndex && annotation.columnIndex === columnIndex)
      .sort((a, b) => a.startOffset - b.startOffset);
    if (!matching.length) {
      cell.textContent = value;
      return;
    }

    let cursor = 0;
    matching.forEach((annotation) => {
      if (annotation.startOffset > cursor) cell.append(document.createTextNode(value.slice(cursor, annotation.startOffset)));
      const mark = document.createElement("mark");
      mark.className = "annotation-mark";
      mark.title = annotation.errorCategory;
      mark.textContent = value.slice(annotation.startOffset, annotation.endOffset);
      cell.append(mark);
      cursor = annotation.endOffset;
    });
    if (cursor < value.length) cell.append(document.createTextNode(value.slice(cursor)));
  }

  function captureSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const startCell = getCellFromNode(range.startContainer);
    const endCell = getCellFromNode(range.endContainer);
    if (!startCell || startCell !== endCell) {
      showToast("Please select text within a single table cell.");
      return;
    }

    const startOffset = textOffsetWithin(startCell, range.startContainer, range.startOffset);
    const endOffset = textOffsetWithin(startCell, range.endContainer, range.endOffset);
    const low = Math.min(startOffset, endOffset);
    const high = Math.max(startOffset, endOffset);
    const selectedText = startCell.textContent.slice(low, high);
    if (!selectedText.trim()) return;

    document.querySelectorAll(".active-cell").forEach((cell) => cell.classList.remove("active-cell"));
    startCell.classList.add("active-cell");
    state.pendingSelection = {
      side: startCell.dataset.side,
      tableIndex: Number(startCell.dataset.tableIndex),
      rowIndex: Number(startCell.dataset.rowIndex),
      columnIndex: Number(startCell.dataset.columnIndex),
      columnKey: startCell.dataset.columnKey,
      columnLabel: startCell.dataset.columnLabel,
      startOffset: low,
      endOffset: high,
      selectedText
    };
    dom.selectionText.textContent = `“${selectedText}”`;
    dom.selectionLocation.textContent = formatSelectionLocation(state.pendingSelection);
    dom.categorySelect.disabled = !state.categoriesReady;
    if (state.categoriesReady) dom.categorySelect.focus({ preventScroll: true });
    else showToast("Error categories are still loading.");
    updateAddButton();
  }

  function getCellFromNode(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return element?.closest("td.selectable-cell") || null;
  }

  function textOffsetWithin(root, node, offset) {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.setEnd(node, offset);
    return range.toString().length;
  }

  function updateAddButton() {
    dom.addAnnotationButton.disabled = !(state.pendingSelection && dom.categorySelect.value);
  }

  function addAnnotation() {
    if (!state.pendingSelection || !dom.categorySelect.value) return;
    const pending = state.pendingSelection;
    const overlap = state.annotations.some((annotation) =>
      annotation.side === pending.side && annotation.tableIndex === pending.tableIndex &&
      annotation.rowIndex === pending.rowIndex && annotation.columnIndex === pending.columnIndex &&
      pending.startOffset < annotation.endOffset && pending.endOffset > annotation.startOffset
    );
    if (overlap) {
      showToast("That span overlaps an existing annotation. Choose a different span.");
      return;
    }

    const table = state[pending.side].tables[pending.tableIndex];
    state.annotations.push({
      id: createId(),
      ...pending,
      tableName: table?.name || `Table ${pending.tableIndex + 1}`,
      errorCategory: dom.categorySelect.value,
      createdAt: new Date().toISOString()
    });
    markTableUnsaved(pending.tableIndex);
    window.getSelection()?.removeAllRanges();
    resetPendingSelection(false);
    renderTabs(getTableCount());
    renderActiveTables();
    renderAnnotationList();
    updateAnnotationCount();
    persistWorkspace();
    showToast("Annotation added.");
  }

  function resetPendingSelection(clearBrowserSelection = true) {
    state.pendingSelection = null;
    document.querySelectorAll(".active-cell").forEach((cell) => cell.classList.remove("active-cell"));
    if (clearBrowserSelection) window.getSelection()?.removeAllRanges();
    if (!dom.selectionText) return;
    dom.selectionText.textContent = "Select text inside a table cell to begin.";
    dom.selectionLocation.textContent = "";
    dom.categorySelect.value = "";
    dom.categorySelect.disabled = true;
    dom.addAnnotationButton.disabled = true;
  }

  function renderAnnotationList() {
    dom.annotationList.replaceChildren();
    const currentAnnotations = state.annotations.filter(
      (annotation) => annotation.tableIndex === state.activeTableIndex
    );
    dom.clearAnnotationsButton.hidden = currentAnnotations.length === 0;
    if (!currentAnnotations.length) {
      const empty = document.createElement("div");
      empty.className = "annotation-empty";
      empty.textContent = `No errors marked for Table ${state.activeTableIndex + 1}.`;
      dom.annotationList.append(empty);
      return;
    }

    [...currentAnnotations].reverse().forEach((annotation) => {
      const item = document.createElement("article");
      item.className = "annotation-item";

      const side = document.createElement("span");
      side.className = `side-pill ${annotation.side}`;
      side.textContent = annotation.side.toUpperCase();

      const location = document.createElement("span");
      location.className = "annotation-location";
      location.textContent = `Table ${annotation.tableIndex + 1} · Row ${annotation.rowIndex + 1} · ${annotation.columnLabel}`;

      const quote = document.createElement("span");
      quote.className = "annotation-quote";
      quote.textContent = `“${annotation.selectedText}”`;
      quote.title = annotation.selectedText;

      const category = document.createElement("span");
      category.className = "category-pill";
      category.textContent = annotation.errorCategory;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-button";
      remove.setAttribute("aria-label", `Delete annotation for ${annotation.selectedText}`);
      remove.title = "Delete annotation";
      remove.textContent = "×";
      remove.addEventListener("click", () => deleteAnnotation(annotation.id));

      item.append(side, location, quote, category, remove);
      dom.annotationList.append(item);
    });
  }

  function deleteAnnotation(id) {
    const removed = state.annotations.find((annotation) => annotation.id === id);
    state.annotations = state.annotations.filter((annotation) => annotation.id !== id);
    if (removed) markTableUnsaved(removed.tableIndex);
    renderTabs(getTableCount());
    renderActiveTables();
    renderAnnotationList();
    updateAnnotationCount();
    persistWorkspace();
    showToast("Annotation removed.");
  }

  function clearAnnotations() {
    const tableIndex = state.activeTableIndex;
    if (!window.confirm(`Remove all annotations from Table ${tableIndex + 1}?`)) return;
    state.annotations = state.annotations.filter((annotation) => annotation.tableIndex !== tableIndex);
    markTableUnsaved(tableIndex);
    renderTabs(getTableCount());
    renderActiveTables();
    renderAnnotationList();
    updateAnnotationCount();
    persistWorkspace();
    showToast(`Annotations cleared from Table ${tableIndex + 1}.`);
  }

  function updateAnnotationCount() {
    const count = state.annotations.filter(
      (annotation) => annotation.tableIndex === state.activeTableIndex
    ).length;
    dom.annotationCount.textContent = count;
    dom.annotationTableLabel.textContent = `Table ${state.activeTableIndex + 1}`;
  }

  function buildExport() {
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      sourceFile: state.source.fileName,
      targetFile: state.target.fileName,
      annotationCount: state.annotations.length,
      tableReviewStatus: Array.from({ length: getTableCount() }, (_, index) => ({
        tableNumber: index + 1,
        savedAt: state.savedTables[index] || null
      })),
      annotations: state.annotations.map((annotation) => ({
        id: annotation.id,
        side: annotation.side,
        tableIndex: annotation.tableIndex,
        tableNumber: annotation.tableIndex + 1,
        tableName: annotation.tableName,
        rowIndex: annotation.rowIndex,
        rowNumber: annotation.rowIndex + 1,
        columnIndex: annotation.columnIndex,
        columnNumber: annotation.columnIndex + 1,
        columnKey: annotation.columnKey,
        columnName: annotation.columnLabel,
        startOffset: annotation.startOffset,
        endOffset: annotation.endOffset,
        selectedText: annotation.selectedText,
        errorCategory: annotation.errorCategory,
        createdAt: annotation.createdAt
      }))
    };
  }

  function downloadAnnotations() {
    if (!state.source || !state.target || !allTablesSaved()) {
      showToast("Save every table before downloading the final JSON.");
      return;
    }
    const payload = JSON.stringify(buildExport(), null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `table-annotations-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    persistWorkspace(true);
    showToast(`Downloaded ${pluralize(state.annotations.length, "annotation")}.`);
  }

  function persistWorkspace(immediate = false) {
    if (!state.source || !state.target) return;
    window.clearTimeout(saveTimer);

    const save = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          version: STORAGE_VERSION,
          savedAt: new Date().toISOString(),
          source: state.source,
          target: state.target,
          annotations: state.annotations,
          savedTables: state.savedTables,
          activeTableIndex: state.activeTableIndex,
          tableFontSize: state.tableFontSize,
          splitPercent: state.splitPercent
        }));
      } catch (_error) {
        showToast("Could not autosave: browser storage is full.");
      }
    };

    if (immediate) save();
    else saveTimer = window.setTimeout(save, 250);
  }

  function restoreWorkspace() {
    try {
      const currentCache = localStorage.getItem(STORAGE_KEY);
      const cached = JSON.parse(currentCache || localStorage.getItem(LEGACY_STORAGE_KEY));
      if (!cached || cached.version !== STORAGE_VERSION || !cached.source || !cached.target) return false;
      state.source = cached.source;
      state.target = cached.target;
      state.annotations = Array.isArray(cached.annotations) ? cached.annotations : [];
      state.savedTables = cached.savedTables && typeof cached.savedTables === "object"
        ? cached.savedTables
        : {};
      state.activeTableIndex = Number.isInteger(cached.activeTableIndex) ? cached.activeTableIndex : 0;
      state.tableFontSize = [10, 12, 14, 16, 20].includes(cached.tableFontSize) ? cached.tableFontSize : 12;
      state.splitPercent = Number.isFinite(cached.splitPercent) ? cached.splitPercent : 50;
      renderWorkspace();
      if (!currentCache) {
        persistWorkspace(true);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
      showToast("Previous workspace restored.");
      return true;
    } catch (_error) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return false;
    }
  }

  function getTableCount() {
    if (!state.source || !state.target) return 0;
    return Math.max(state.source.tables.length, state.target.tables.length);
  }

  function saveCurrentTable() {
    if (!state.source || !state.target) return;
    const tableIndex = state.activeTableIndex;
    const annotationCount = state.annotations.filter(
      (annotation) => annotation.tableIndex === tableIndex
    ).length;
    state.savedTables[tableIndex] = new Date().toISOString();
    persistWorkspace(true);
    renderTabs(getTableCount());
    showToast(annotationCount
      ? `Table ${tableIndex + 1} saved with ${pluralize(annotationCount, "annotation")}.`
      : `Table ${tableIndex + 1} saved — no errors marked.`);
  }

  function markTableUnsaved(tableIndex) {
    if (state.savedTables[tableIndex]) delete state.savedTables[tableIndex];
  }

  function allTablesSaved() {
    const tableCount = getTableCount();
    return tableCount > 0 && Array.from(
      { length: tableCount },
      (_, index) => Boolean(state.savedTables[index])
    ).every(Boolean);
  }

  function updateSaveControls() {
    const hasWorkspace = Boolean(state.source && state.target);
    const isCurrentSaved = hasWorkspace && Boolean(state.savedTables[state.activeTableIndex]);
    const tableCount = hasWorkspace ? getTableCount() : 0;
    const savedCount = Array.from(
      { length: tableCount },
      (_, index) => Boolean(state.savedTables[index])
    ).filter(Boolean).length;
    dom.saveTableButton.disabled = !hasWorkspace || isCurrentSaved;
    dom.saveTableButton.textContent = isCurrentSaved
      ? `Table ${state.activeTableIndex + 1} saved`
      : `Save table ${state.activeTableIndex + 1}`;
    dom.downloadAllButton.disabled = !hasWorkspace || !allTablesSaved();
    dom.downloadAllButton.title = allTablesSaved()
      ? "Download all annotations"
      : "Save every table to enable the final download";
    dom.reviewProgressLabel.textContent = `Saved ${savedCount} / ${tableCount}`;
  }

  function applyWorkspacePreferences() {
    setTableFontSize(state.tableFontSize, false);
    setSplitPercent(state.splitPercent, false);
  }

  function setTableFontSize(value, shouldPersist = true) {
    const allowedSizes = [10, 12, 14, 16, 20];
    const size = allowedSizes.includes(value) ? value : 12;
    state.tableFontSize = size;
    dom.workspace.style.setProperty("--table-font-size", `${size}px`);
    dom.fontSizeOptions.querySelectorAll("button[data-size]").forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.size) === size);
    });
    if (shouldPersist) persistWorkspace();
  }

  function setupSplitter() {
    let dragging = false;

    dom.tableSplitter.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      dragging = true;
      document.body.classList.add("is-resizing");
      dom.tableSplitter.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    dom.tableSplitter.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const bounds = dom.comparisonGrid.getBoundingClientRect();
      const percent = ((event.clientX - bounds.left) / bounds.width) * 100;
      setSplitPercent(percent, false);
    });

    const stopDragging = (event) => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove("is-resizing");
      if (dom.tableSplitter.hasPointerCapture(event.pointerId)) {
        dom.tableSplitter.releasePointerCapture(event.pointerId);
      }
      persistWorkspace();
    };

    dom.tableSplitter.addEventListener("pointerup", stopDragging);
    dom.tableSplitter.addEventListener("pointercancel", stopDragging);
    dom.tableSplitter.addEventListener("dblclick", () => setSplitPercent(50));
    dom.tableSplitter.addEventListener("keydown", (event) => {
      let next = state.splitPercent;
      if (event.key === "ArrowLeft") next -= 2;
      else if (event.key === "ArrowRight") next += 2;
      else if (event.key === "Home") next = 20;
      else if (event.key === "End") next = 80;
      else if (event.key === "0") next = 50;
      else return;
      event.preventDefault();
      setSplitPercent(next);
    });
  }

  function setSplitPercent(value, shouldPersist = true) {
    const percent = Math.round(Math.min(80, Math.max(20, Number(value) || 50)));
    state.splitPercent = percent;
    dom.comparisonGrid.style.gridTemplateColumns = `${percent}fr 9px ${100 - percent}fr`;
    dom.tableSplitter.setAttribute("aria-valuenow", percent);
    if (shouldPersist) persistWorkspace();
  }

  function clearSession() {
    if (
      state.source &&
      !window.confirm("Do you really want to clear this session? All your annotations will be lost.")
    ) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    state.source = null;
    state.target = null;
    state.annotations = [];
    state.savedTables = {};
    state.activeTableIndex = 0;
    state.pendingSelection = null;
    state.tableFontSize = 12;
    state.splitPercent = 50;
    resetPendingSelection();
    renderEmptyState();
    showToast("Browser session cleared.");
  }

  function formatSelectionLocation(selection) {
    return `${selection.side.toUpperCase()} · Table ${selection.tableIndex + 1} · Row ${selection.rowIndex + 1} · ${selection.columnLabel} · chars ${selection.startOffset}–${selection.endOffset}`;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function pluralize(count, singular) {
    return `${count} ${singular}${count === 1 ? "" : "s"}`;
  }

  function createId() {
    return globalThis.crypto?.randomUUID?.() || `annotation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.classList.add("visible");
    toastTimer = window.setTimeout(() => dom.toast.classList.remove("visible"), 2600);
  }
})();
