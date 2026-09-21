// Vercel serverless entry. The API itself lives in server/src (see app.ts); this file
// only hands it to the Vercel runtime, so there is one implementation, not two.
import { createApp } from "../server/src/app";

export default createApp();
