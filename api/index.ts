import type { IncomingMessage, ServerResponse } from "node:http";
import app from "../artifacts/api-server/src/app.ts";

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  app(req as any, res as any);
}

export const config = {
  runtime: "nodejs20.x",
};
