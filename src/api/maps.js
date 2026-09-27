// Exhibition map images (designed outside the system and attached to each exhibition),
// in the private "exhibition-maps" bucket (migration 006).

import { checkFile, FILE_MAX_MB, fileUrl, isPdfPath, removeFile, uploadFile } from './storage.js'

export const MAP_BUCKET = 'exhibition-maps'
export const MAP_MAX_MB = FILE_MAX_MB
export { isPdfPath }

export const checkMapFile = (file) => checkFile(file, 'الخارطة')
export const uploadMap = (file) => uploadFile(MAP_BUCKET, 'maps', file, { what: 'الخارطة', migration: '006' })
export const mapUrl = (path) => fileUrl(MAP_BUCKET, path, { migration: '006' })
export const removeMapFile = (path) => removeFile(MAP_BUCKET, path)
