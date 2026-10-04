import https from 'https';

export interface HttpResult {
  status: number;
  body: any;
}

/** Minimal HTTPS POST used for Google / FCM APIs (no extra dependencies). */
export function httpsPost(
  url: string,
  payload: string,
  headers: Record<string, string>,
  timeoutMs = 10000
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(payload).toString() },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let body: any = text;
          try {
            body = JSON.parse(text);
          } catch {
            // keep raw text
          }
          resolve({ status: res.statusCode ?? 0, body });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    req.end(payload);
  });
}

export const postJson = (url: string, data: unknown, headers: Record<string, string> = {}) =>
  httpsPost(url, JSON.stringify(data), { 'Content-Type': 'application/json', ...headers });
