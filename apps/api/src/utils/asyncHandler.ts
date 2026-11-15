import type { NextFunction, Request, RequestHandler, Response } from "express";

export function asyncHandler<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  P = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ResBody = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ReqBody = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ReqQuery = any,
>(
  fn: (
    req: Request<P, ResBody, ReqBody, ReqQuery>,
    res: Response<ResBody>,
    next: NextFunction,
  ) => Promise<unknown>,
): RequestHandler {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (req: any, res: any, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
