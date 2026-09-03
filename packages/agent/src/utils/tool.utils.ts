import path from "path";

/**
 * The project root — the workspace directory the agent operates in.
 * On startup, this defaults to the current working directory.
 */
export const projectRoot = process.env.WORKSPACE_DIR ?? process.cwd();

export { path };
