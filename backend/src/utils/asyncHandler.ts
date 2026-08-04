/**
 * Express 4 async hataları otomatik yakalamaz; promise rejection'ları
 * `next`'e iletir. Tüm async route handler'lar bu sarmalayıcıyla kullanılır.
 *
 * `P` generic'i Express 5 tip paketindeki route param tiplerini (string,
 * string[]) korur — generic'siz `Request` params'ı `string | string[]`
 * yapar; `Request<{ id: string }>` ile daraltılır.
 */

import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express';

type ParamsDictionary = { [key: string]: string | string[] };

export function asyncHandler<P extends ParamsDictionary = ParamsDictionary>(
  fn: (req: Request<P>, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler<P> {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
