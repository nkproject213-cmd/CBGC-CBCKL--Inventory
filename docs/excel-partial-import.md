# Excel partial updates by management number

Baseline before this change: 9b091c5157a347966f66ff8b7fefb1d400294608.

The current organization's management_no is the exact lookup key (surrounding whitespace is trimmed). Existing records accept only management number plus the columns to change. Empty cells, whitespace-only values, absent columns, omitted items and the other organization are preserved. A zero is a real supplied number. Blank cells do not erase existing values; clear values through the normal item editor.

Unrecognized new management numbers require item_name and item_type and are inserted. Duplicate numbers inside one workbook are rejected for all those rows before writes. Other invalid rows are reported and skipped, while valid rows are applied. Existing IDs, public IDs, creation time, photo URLs not supplied by the sheet, and QR layout settings are not changed. A real change updates updated_at; an identical re-upload does not.

The file can retain the existing template headers or contain only management number and selected fields. The template guide and UI describe this behavior. The result reports created, updated, unchanged, skipped blank rows, and failed rows (first 30 error details). Limits: XLSX <= 4 MiB and 5,000 data rows.

Implementation: pre-parse/validate all rows, split new/existing keys within the selected org, apply batches of 50. Parameterized SQL uses a fixed field allowlist and current-value COALESCE to preserve concurrent edits to absent fields. Conflicting concurrent inserts retry as partial updates without replacing public IDs. No DELETE/TRUNCATE and no schema migration were introduced. The old QR encoding fix and layout renderer are unchanged.

Run npm run test:excel-import (also required by build). Tests use isolated in-memory fixtures, plus a real ExcelJS XLSX write/read roundtrip. No production item is created, changed or deleted by these tests.
