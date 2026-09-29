export type PackageMode = "editable" | "readonly";

export interface PackageFile {
  path: string;
  size: number;
  content: Blob;
  textContent?: string;
}

export interface PackageMetadata {
  name: string;
  version?: string;
  format?: string;
  instructionPath?: string;
}

export interface PackageView {
  mode: PackageMode;
  metadata: PackageMetadata;
  files: PackageFile[];
}
