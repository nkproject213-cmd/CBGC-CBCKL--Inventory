# Excel partial updates by management number

Baseline before this change: 9b091c5157a347966f66ff8b7fefb1d400294608.

The current organization's management_no is the exact lookup key (surrounding whitespace is trimmed). Existing records accept only management number plus the columns to change. Empty cells, whitespace-only values, absent columns, omitted items and the other organization are preserved. A zero is a real supplied number. Blank cells do not erase existing values; clear values through the normal item editor.

A new management number alone is sufficient to create a record. Missing or blank item_name and item_type are stored as empty strings on creation. Blank or omitted cells preserve their stored values on updates. Purchase prices accept numeric amounts, decimal amounts, properly comma-grouped amounts and text such as "-" or "미상". Both 0 and "0" record zero won. Blank prices remain unspecified on creation and preserve the current price on update. Duplicate numbers inside one workbook are rejected for all those rows before writes. Other invalid rows are reported and skipped, while valid rows are applied. Existing IDs, public IDs, creation time, photo URLs not supplied by the sheet, and QR layout settings are not changed. A real change updates updated_at; an identical re-upload does not.

Dates, useful life, quantities and photo references also accept text such as “-”, “미상” and “확인 중”. Numeric zero remains a supplied value. On import, a literal replaces the previous date, count or URL and is preserved on export. Entering a valid typed value replaces the literal. An empty or missing cell preserves both. Date calculations use a valid date and whole-year useful life. Only valid HTTP(S) photo references can identify an image.

The file can retain the existing template headers or contain only management number and selected fields. The template guide and UI describe this behavior. The result reports created, updated, unchanged, skipped blank rows, and failed rows (first 30 error details). Limits: XLSX <= 4 MiB and 5,000 data rows.

Implementation: pre-parse/validate all rows, split new/existing keys within the selected org, apply batches of 50. Parameterized SQL uses a fixed field allowlist. The typed columns and their paired text columns are updated together, and fields omitted from a row preserve their current database values. Conflicting concurrent inserts retry as partial updates without replacing public IDs.

Run npm run test:excel-import (also required by build). Tests use isolated in-memory fixtures, plus a real ExcelJS XLSX write/read roundtrip. No production item is created, changed or deleted by these tests.
