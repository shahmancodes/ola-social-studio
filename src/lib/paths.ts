import path from "node:path";
import { companyForProject } from "./platform-db";

import { ROOT_DIR, DATA_DIR } from "./data-directory";
export { ROOT_DIR, DATA_DIR };
export const PROJECTS_DIR = path.join(DATA_DIR, "projects");
export const ASSETS_DIR = path.join(ROOT_DIR, "shared-assets");
export const BRAND_FONTS_DIR = path.join(ASSETS_DIR, "fonts");
export const ASSET_METADATA_FILE = path.join(ROOT_DIR, "shared-asset-metadata.json");

export function projectDir(id: string) {
  assertSafeId(id);
  const company = companyForProject(id);
  return company ? path.join(DATA_DIR, "companies", company.company_id, "projects", id) : path.join(PROJECTS_DIR, id);
}

export function assertSafeId(id: string) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("Invalid project id");
}
