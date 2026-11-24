# Useful-life status, filter and photo backup

Baseline commit: 52a8d6adb86abc96ca2461f426395f5ae2ce41fa.
Code backup: backup/before-life-status-photos-52a8d6a.

## Useful-life rule
Acquisition DATE plus whole useful_life_years calendar years is compared with the current date in Asia/Seoul. The anniversary day is included. February 29 clamps to February 28 in non-leap years. Missing/invalid dates or missing/negative years do not expire. An explicitly supplied zero is a real zero-year period (not a blank). Dates outside years 0100-9999 are not auto-evaluated.

The actual item_status becomes 내용연수 경과. Two additive internal columns preserve previous manual status (status_before_life_expiry) and flag automated values (life_expiry_auto). Correcting date/life back to an unexpired value restores the previous manual status. Deliberately supplied new manual statuses are retained as the prior status, not lost. The status and updated_at are changed only when reconciliation changes state. Public fields remain unchanged; prices and internal status metadata are not exposed anonymously.

Reconciliation is request-triggered: authenticated list/detail/export/label reads, item writes, and the end of an Excel import. An open visible management page checks for a Korean date change once per minute and on focus. No cron job is claimed or configured; an entirely idle site reconciles on its next authenticated read. Original photos, IDs and public QR URLs remain unchanged.

The management list adds a status column and 내용연수 경과만 보기 checkbox. Search/type filters compose with it. Changing the expiry filter clears selection; select-all/delete operates on visible IDs. Excel export honors the expiry filter, but not display sort order.

## Photo archive
The authenticated photo-manifest endpoint returns registered item photo URLs only, for CBGC, CBCKL or both. It ignores the list's search/expiry filters. It excludes unreferenced Blob uploads, QR PNGs and the shared QR-label image, without deleting any of them. Each item gets its own numbered filename containing management number and item name, grouped by organization.

Images are fetched directly by the browser without cookies, then stored byte-for-byte in a UTF-8 ZIP with CRC32. There is no arbitrary URL fetch on the server (no SSRF proxy) and no long-lived Vercel ZIP request. File System Access-capable browsers stream to one ZIP; fallback browsers save sequential ~64 MiB ZIP parts with a user click for each part, keeping memory bounded. Per-image max is 20 MiB; a request times out after 30s. The ZIP writer supports up to ~3.75 GiB and 60,000 entries; this is not ZIP64.

Archive includes a CSV file index, failure CSV and completion notes. Missing photos are counted separately; deleted files, network/CORS errors and unsupported MIME types are reported, not silently treated as success. Cancel/disk failure aborts the current disk file; already saved fallback parts remain. Do not close the page while processing. No whole-production-photo download is performed by build tests.

Build runs existing QR, Excel, model suites and test:lifecycle-photos. Tests validate anniversary boundaries, Korean midnight, leap days, empty vs zero, filtered XLSX, manifest authentication/org isolation, real 1500-entry ZIP serialization and independent JSZip CRC/extraction. Physical browser save permissions and all live photo fetches require end-to-end browser verification separately.

## Apply one photo to selected items

In either CBGC or CBCKL 물품관리, select the management-number rows and choose 사진 일괄 적용. The dialog lists the selected items, shows how many existing photos will be replaced, and previews the chosen JPG, PNG, or WEBP. Confirm with the item-count apply button. Select-all applies only to the currently visible, filtered list; at most 2,000 items can be updated in one request.

The image is compressed to at most 250KB and uploaded once under `inventory/shared/`. All selected items reference that same file. Only `photo_url`, `photo_url_text`, and `updated_at` are changed. A single SQL statement locks and checks the whole organization-scoped selection before updating; a deleted or moved target rejects the entire batch. Replaying a successful request does not change timestamps again.

Replacing or deleting one item never removes a shared photo from Blob storage, so other items retain their pictures. Unreferenced shared files are retained rather than automatically deleted. The new `test:bulk-photo` build gate covers authentication, validation, target limits, UUID normalization, conflict responses, and shared-file preservation on individual edits and deletions.
