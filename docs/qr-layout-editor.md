# QR layout editor

## Scope
The QR management route now uses QRManagement. Dashboard, item CRUD, photos, public pages and standalone PNG/ZIP QR downloads retain their existing behavior. The legacy AdminConsole QR markup and qr-print renderer are kept for rollback but no longer used by the QR route or label printing.

The editable label has three blocks: QR (square), image (common upload or each item's photo), information. All seven information fields always appear: item_name, management_no, specification, acquired_date, storage_location, manager_main, manager_sub. Users can reorder fields, adjust font size and key-column width, and toggle table borders. Unit, quantity, status are not printed; their stored item values are untouched.

Physical label dimensions stay at 62.7 x 30.1 mm, A4 3 x 9, left 8 mm, top 11 mm, horizontal gap 2.5 mm. Print at 100%, no margins, headers/footers off. Editor and print share markup, CSS, coordinates and text fitting. A QR keeps its quiet zone and aspect ratio. Overlaps prevent saving. Unresolved text overflow or broken images block the print button. Absent images are left blank. Test on plain paper and verify physical QR scanning before a large label run.

## Persistence and rollback
- Pre-change commit: 0b75de33572a6fd9cc457e3ffa6b3a2bcd137303
- Backup branch: backup/before-qr-layout-editor-0b75de3
- Pre-change production deployment: dpl_2WsTJhdDZJvAumECsFJ6K8qDCJSn
- Existing database and image backups remain unchanged.

A new additive table, inventory_qr_layouts, stores one JSON layout, revision and timestamp per organization. It does not alter inventory_items or inventory_settings. An old common image is reused as the initial image without changing the old record. Revision-based compare-and-set returns 409 rather than overwriting another browser tab. Authentication is required for settings and printing. Input is validated before HTML/CSS interpolation. Image uploads use the existing authenticated upload API and only accept JPG/PNG/WebP up to 4 MB.

Re-deploy the backup commit to restore the old UI. Do not reset item data. New layout settings can remain in the additive table during rollback.

## Checks
Run npm run test:qr-layout, npm run test:qr-print and npm run build. Additional local Chromium checks cover rendered print layout, overflow detection and A4 pagination; physical printer calibration is separate.
