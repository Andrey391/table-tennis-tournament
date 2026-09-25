import { Router as expressRouter, Request, Response, NextFunction } from "express";

// Express 4 does not look at the promise an async handler returns, so a handler
// that throws outside its own try/catch (a query parameter of an unexpected
// shape, a date Prisma rejects) becomes an unhandled rejection, and Node ends the
// process on one: a single anonymous GET could take the whole server down. Every
// router is built here instead of with express.Router(), and each handler it is
// given passes its rejection to next(), i.e. to the error handler in app.ts.
type Handler = (req: Request, res: Response, next: NextFunction) => unknown;

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

function guard(handler: unknown): unknown {
  // Error handlers (four arguments) and anything that is not a function pass through.
  if (typeof handler !== "function" || handler.length >= 4) return handler;
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = (handler as Handler)(req, res, next);
      if (result && typeof (result as Promise<unknown>).catch === "function") (result as Promise<unknown>).catch(next);
    } catch (err) {
      next(err);
    }
  };
}

export function Router() {
  const router = expressRouter();
  for (const method of METHODS) {
    const register = (router[method] as (...args: unknown[]) => unknown).bind(router);
    (router as unknown as Record<string, unknown>)[method] = (path: unknown, ...handlers: unknown[]) => register(path, ...handlers.map(guard));
  }
  return router;
}
