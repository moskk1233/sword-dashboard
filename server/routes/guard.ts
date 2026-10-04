import {
  OpenSearchDashboardsRequest,
  OpenSearchDashboardsResponseFactory,
  RequestHandler,
  RequestHandlerContext,
} from '../../../../src/core/server';
import { AccessInfo, PASSWORD_CHANGE_REQUIRED } from '../../common';
import { AccessService } from '../lib/access';
import { InvalidFilterError } from '../lib/queries';

type GuardedHandler<P, Q, B> = (
  context: RequestHandlerContext,
  request: OpenSearchDashboardsRequest<P, Q, B>,
  response: OpenSearchDashboardsResponseFactory,
  access: AccessInfo
) => ReturnType<RequestHandler<P, Q, B>>;

export interface GuardOptions {
  /** Minimum SWORD role. */
  level: 'soc' | 'admin';
  /** Allow the call while a forced password change is pending (only the change itself). */
  allowPendingPasswordChange?: boolean;
}

export function errorMessage(e: any): string {
  return e?.meta?.body?.error?.reason ?? e?.meta?.body?.message ?? e?.message ?? 'Unexpected error';
}

/**
 * Server-side authorization for every SWORD route. The UI hides what a user cannot use, but the
 * decision is always made here so it cannot be bypassed by calling the API directly.
 */
export function createGuard(access: AccessService) {
  return function guard<P, Q, B>(
    options: GuardOptions,
    handler: GuardedHandler<P, Q, B>
  ): RequestHandler<P, Q, B> {
    return async (context, request, response) => {
      const info = await access.resolve(context.core.opensearch.client.asCurrentUser);
      if (info.role === 'none') {
        return response.forbidden({ body: { message: 'You do not have a SWORD role' } });
      }
      if (options.level === 'admin' && info.role !== 'admin') {
        return response.forbidden({ body: { message: 'Master Administrator role required' } });
      }
      if (info.mustChangePassword && !options.allowPendingPasswordChange) {
        return response.forbidden({ body: { message: PASSWORD_CHANGE_REQUIRED } });
      }
      try {
        return await handler(context, request, response, info);
      } catch (e: any) {
        // Expired / missing credentials: core turns this into a 401 challenge.
        if (e?.statusCode === 401) throw e;
        if (e instanceof InvalidFilterError) {
          return response.badRequest({ body: { message: e.message } });
        }
        const status = e?.statusCode ?? e?.meta?.statusCode;
        if (status === 403) return response.forbidden({ body: { message: errorMessage(e) } });
        return response.customError({
          statusCode: status && status >= 400 && status < 600 ? status : 500,
          body: { message: errorMessage(e) },
        });
      }
    };
  };
}

export type Guard = ReturnType<typeof createGuard>;
