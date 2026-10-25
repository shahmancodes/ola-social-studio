import path from "node:path";

/** One resolver for the database and artifact store; normal Ola keeps its original default. */
export const ROOT_DIR = path.resolve(process.env.OLA_ROOT_DIR || process.cwd());
export const DATA_DIR = path.resolve(process.env.OLA_DATA_DIR || path.join(ROOT_DIR, ".data"));
