# QR label change: backup and restore

Backup taken before the ten-field QR label change.

- Repository: nkproject213-cmd/CBGC-CBCKL--Inventory
- Previous production commit: 5b9af7621870a6ba19b24adb836b38e74f914765
- Git backup branch: backup/before-qr-details-5b9af762
- Previous production deployment: dpl_9YDvEYknBgYt597WvunBXt78Ts2x
- Neon project: purple-resonance-18404063
- Production DB branch: br-fancy-paper-azjyyi14
- DB backup branch: br-royal-shape-azqpajv5 (backup-before-qr-details-5b9af762)
- Backup parent LSN: 0/211F5F8
- Backup branch created at: 2026-10-23T02:33:22Z

The DB backup preserves the database at that point. Blob image files are not copied by a Neon branch; this change does not delete or alter existing item photos or saved label-image blobs. Old label-image URL/scale records and the settings API remain for rollback, but the new UI and printing no longer use them. Secrets are not stored here.

The only schema changes are additive nullable fields: unit TEXT, quantity INTEGER (non-negative), item_status TEXT. No item data is backfilled or deleted. Location uses the existing storage_location field.

To restore the old application, deploy the backup commit or the previous production deployment. Extra nullable DB columns are backward compatible, so a normal code rollback does not require restoring the database. Do not reset production data to the backup without explicit authorization: later edits would be lost.

Print layout remains Formtec 3104, 3 columns x 9 rows, 62.7 x 30.1 mm, left 8 mm, top 11 mm. Use A4 / 100% / no margins / headers and footers off. Single-item and all-item print use the same renderer. Standalone QR PNG/ZIP and public URLs are retained.
