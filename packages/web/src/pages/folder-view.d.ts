/**
 * Folder View — shows projects and subfolders
 *
 * Receives the already-resolved folderId from DynamicContent.
 * null = root level.
 */
import React from 'react';
interface FolderViewProps {
  folderId: string | null;
  folderName: string;
  /** The resolved base path for this folder (e.g. "/folder-a/folder-b") */
  basePath?: string;
}
export declare const FolderView: React.FC<FolderViewProps>;
export {};
//# sourceMappingURL=folder-view.d.ts.map
