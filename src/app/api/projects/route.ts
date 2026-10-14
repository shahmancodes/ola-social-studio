// Compatibility endpoint for clients that create projects through /api/projects.
// The content route owns the shared format and availability checks.
export { GET, POST } from "../content/route";
