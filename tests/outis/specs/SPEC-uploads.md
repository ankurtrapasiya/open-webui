# Spec: uploads

Fork commit: e08edc8f8 (CSV read locally whatever the extraction engine).

## Behaviour

- A `.csv` upload is read by Open WebUI's own `CSVLoaderWithSummary`, before any content
  extraction engine is consulted. Browsers often label `.csv` as `application/vnd.ms-excel`,
  which skipped the text check and sent the file to Docling, which refuses CSV (found live
  2026-10-04: upload failed with 502 "docling status skipped ... File format not allowed").

## Acceptance criteria

- **UP-1** With the engine set to Docling at an address nothing listens on, uploading a CSV
  labelled `application/vnd.ms-excel` completes (`data.status === 'completed'`) and its content
  holds the rows (`ticker: UPAAA`). The original engine settings are restored afterwards.
  (Fails on images before e08edc8f8 with status `failed`.)
