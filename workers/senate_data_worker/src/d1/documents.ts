/** Re-export for existing call sites; implementation lives in `storage/documents`. */
export {
  deleteDocument,
  readDocumentJson,
  writeDocumentJson,
  type DocumentWriteOptions,
} from "../storage/documents";
