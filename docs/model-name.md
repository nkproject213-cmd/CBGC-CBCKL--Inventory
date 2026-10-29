# Model name

Baseline: 7f312db562d719f00d74b8ada8c27b6f7445643a.
Code backup: backup/before-model-name-7f312db.

The label 품명 remains unchanged. A separate optional 모델명 (model_name TEXT, nullable) is added to item registration/details, validation, create/update/read, and the QR-linked public page immediately after 품명. Unset values render as -. Existing values are not inferred from 품명 or 규격.

Excel template, guide, examples, partial import and export include 모델명. Both generated workbooks place it immediately after 품명 and use text formatting. Existing templates without 모델명 continue to work. Matching remains exact management_no within the selected organization. Blank/absent model-name cells preserve the current stored model. A sheet with only 관리번호 and 모델명 updates only the model of existing items. New items still require 품명 and 물품유형; model name is optional. Old open detail tabs preserve the new field through the existing PATCH merge. Clearing in the detail editor is explicit and allowed.

The DB change is additive and idempotent: ADD COLUMN IF NOT EXISTS model_name TEXT. No item value is backfilled, deleted, or renamed. Existing IDs, QR URLs, saved label layouts, photos, and the seven-field printed label configuration are retained. Public access is expanded only for the requested model name, not other internal fields.

Build runs test:model-name alongside the existing QR and Excel suites. Model tests use isolated records/mocked auth/DB, actual template and export route XLSX serialization/parsing, and React server rendering. They do not mutate production items.
