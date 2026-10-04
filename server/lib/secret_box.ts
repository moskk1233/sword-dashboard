import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from '../../../../src/core/server';

const PREFIX = 'v1:';

/** AES-256-GCM encryption for secrets stored in the .kibana index. */
export class SecretBox {
  private constructor(private readonly key: Buffer) {}

  static async create(
    configuredKey: string | undefined,
    dataPath: string,
    logger: Logger
  ): Promise<SecretBox> {
    if (configuredKey) {
      return new SecretBox(createHash('sha256').update(configuredKey).digest());
    }
    const keyFile = path.join(dataPath, 'sword_secret.key');
    try {
      const existing = (await fs.readFile(keyFile, 'utf8')).trim();
      return new SecretBox(createHash('sha256').update(existing).digest());
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    const generated = randomBytes(32).toString('hex');
    await fs.writeFile(keyFile, generated, { mode: 0o600, flag: 'wx' });
    logger.info(`Generated secret encryption key at ${keyFile}`);
    return new SecretBox(createHash('sha256').update(generated).digest());
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
  }

  decrypt(sealed: string): string {
    if (!sealed.startsWith(PREFIX)) throw new Error('Unsupported secret format');
    const raw = Buffer.from(sealed.slice(PREFIX.length), 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  }
}
