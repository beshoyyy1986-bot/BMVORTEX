// Vercel serverless entry. The bundle is produced by the api-server build
// (esbuild, self-contained), so this file has no workspace imports of its own.
// An Express app is already a (req, res) handler, which is what Vercel wants.
export { default } from "../artifacts/api-server/dist/app.mjs";
