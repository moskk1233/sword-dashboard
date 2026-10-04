/* eslint-disable max-classes-per-file */
import { createSign } from 'crypto';
import { httpsPost, postJson } from './http';
import { ServiceAccount } from './settings_store';

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';

const b64url = (input: string | Buffer) => Buffer.from(input).toString('base64url');

export class FcmTokenInvalidError extends Error {}

/**
 * Firebase Cloud Messaging HTTP v1 sender. Authenticates with a service account using the OAuth 2.0
 * JWT bearer flow, so no firebase-admin dependency is needed on the dashboards server.
 */
export class FcmClient {
  private cache?: { key: string; token: string; expiresAt: number };

  private async accessToken(sa: ServiceAccount): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const key = `${sa.client_email}|${sa.project_id}`;
    if (this.cache && this.cache.key === key && this.cache.expiresAt > now + 60) {
      return this.cache.token;
    }
    const tokenUri = sa.token_uri || DEFAULT_TOKEN_URI;
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(
      JSON.stringify({
        iss: sa.client_email,
        scope: SCOPE,
        aud: tokenUri,
        iat: now,
        exp: now + 3600,
      })
    );
    const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(sa.private_key);
    const assertion = `${header}.${claims}.${b64url(signature)}`;

    const { status, body } = await httpsPost(
      tokenUri,
      new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
      { 'Content-Type': 'application/x-www-form-urlencoded' }
    );
    if (status !== 200 || !body?.access_token) {
      throw new Error(
        `Google OAuth ${status}: ${body?.error_description ?? body?.error ?? 'failed'}`
      );
    }
    this.cache = { key, token: body.access_token, expiresAt: now + (body.expires_in ?? 3600) };
    return body.access_token;
  }

  async send(
    sa: ServiceAccount,
    deviceToken: string,
    notification: { title: string; body: string },
    data: Record<string, string>
  ) {
    const accessToken = await this.accessToken(sa);
    const { status, body } = await postJson(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`,
      {
        message: {
          token: deviceToken,
          notification,
          data,
          webpush: { headers: { Urgency: 'high' } },
          android: { priority: 'high' },
        },
      },
      { Authorization: `Bearer ${accessToken}` }
    );
    if (status === 200) return;
    const errorCode: string | undefined = body?.error?.details?.find((d: any) => d.errorCode)
      ?.errorCode;
    const message = `FCM ${status}: ${errorCode ?? body?.error?.message ?? 'send failed'}`;
    if (status === 404 || errorCode === 'UNREGISTERED' || errorCode === 'INVALID_ARGUMENT') {
      throw new FcmTokenInvalidError(message);
    }
    throw new Error(message);
  }
}
