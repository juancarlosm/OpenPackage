/**
 * Manifest reading for the wave resolver.
 * Re-exports from the shared resolution manifest reader.
 */

export {
  readManifestAtPath,
  readManifestFromSource,
  extractDependencies,
  getManifestPathAtContentRoot,
  getDeclaredInDir
} from '../resolution/manifest-reader.js';
