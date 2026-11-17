# Asset management cards

Baseline: e57367719faf0432179d07548edf97e86f12f05d.
Code backup: backup/before-asset-cards-e573677.

The inventory toolbar now includes 자산관리카드 생성 next to the existing photo archive button. PhotoArchiveButtonCore is the exact previous photo component, not a rewritten downloader. The dialog loads the current organization's items through the existing authenticated API and optionally limits them to useful-life-expired items. This export does not create, delete, or edit inventory data.

## Exact workbook template
The sanitized template is derived from the user-supplied 자산관리카드 양식.xlsx (SHA-256 beb0df155a544ba7aed7ca8b501728544c0a91567c2f7bd2b887e475c1b3f0a6). It retains the original styles, theme, headings (including 일렬번호 and 내용년수), column widths, upper-section row heights, merges, and photo frame. Sample values, example photos, personal file paths, external workbook references and calc chain are removed. Item data is escaped and inserted as text, not interpreted as formulas. The original PDF is the layout reference, not an extra generated template.

Each item produces one worksheet, sorted by management number. CBGC-001 maps to sheet/document number CB-1. Original management number remains in the card. The same rule applies within CBCKL. Invalid or duplicate sheet names are reported instead of silently renumbering. Serial number and repair history stay blank because no corresponding stored fields exist. Missing values and missing photos stay blank.

## Fixed depreciation region (user correction)
Do not add continuation pages. The original depreciation body occupies 189 points (9 rows x 21 pt); this TOTAL HEIGHT is fixed. A 5-year item gets 5 rows at 37.8 pt, a 9-year item gets 9 rows at 21 pt, and a 12-year item gets 12 rows at 15.75 pt. Other periods distribute 0.05-point increments without changing the total. Rows 1-31, the photo region, and the overall form height do not move. Cost-cell and balance-cell merges track the row count. One sheet is configured to print on one A4 portrait page. Font size is reduced only within the annual rows when required. Long periods become dense; periods above 100 years are rejected with a clear validation error rather than silently omitting years.

Depreciation follows the supplied template: purchase price / useful life, with full-precision formulas and cached results displayed to zero decimals. Cumulative depreciation is capped at cost and remaining value at zero. Calendar years start at acquisition year. Missing/zero useful life or missing cost does not divide by zero; uncomputable cells remain blank. This reproduces the supplied worksheet logic, not an independent accounting policy.

## Photos and large inventories
Photos are fetched by the browser without credentials (no server-side arbitrary URL proxy). JPEG/PNG up to 2 MiB are embedded directly; WebP and larger browser-decodable images are converted to JPEG for spreadsheet compatibility. Photos retain aspect ratio within the original frame. Missing photos leave a blank frame. Failed image fetches are counted, leave the corresponding frame blank, and are included in a downloadable result report. Original stored image files are untouched.

The writer streams OOXML parts through the existing StoredZip implementation. File System Access-capable browsers save one workbook. Other browsers save parts at 100 sheets or about 64 MiB, requiring a user click for each part. Cancel/disk errors abort the current disk file; previously saved parts remain. The import API, QR/public URLs, existing layout editor, and database schema are unchanged.

## Verification
Build runs test:asset-cards in addition to the existing suites. It checks template identity, exact upper layout and 9-year formatting, fixed-height schedules, one-page print metadata, formulas/caches, zero/missing values, XML escaping, image relationships, package CRC, and 1,500-sheet bounded-memory generation. Tests use synthetic data only. Local artifact-tool rendering checks the 12-year layout; it does not substitute for physical printer and Microsoft Excel rendering verification.
