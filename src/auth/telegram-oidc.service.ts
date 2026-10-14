/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';

@Injectable()
export class TelegramOidcService {
  private jwks?: ReturnType<
    Awaited<typeof import('jose')>['createRemoteJWKSet']
  >;

  constructor(private readonly config: ConfigService) {}

  private async getJwks() {
    if (!this.jwks) {
      const { createRemoteJWKSet } = await import('jose');

      this.jwks = createRemoteJWKSet(
        new URL('https://oauth.telegram.org/.well-known/jwks.json'),
      );
    }

    return this.jwks;
  }

  private getSettings() {
    const clientId = this.config.get<string>('TELEGRAM_OIDC_CLIENT_ID');

    const clientSecret = this.config.get<string>('TELEGRAM_OIDC_CLIENT_SECRET');

    const redirectUri = this.config.get<string>('TELEGRAM_OIDC_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new ServiceUnavailableException('Telegram OIDC is not configured');
    }

    return {
      clientId,
      clientSecret,
      redirectUri,
    };
  }

  createAuthorizationRequest() {
    const { clientId, redirectUri } = this.getSettings();

    const state = randomBytes(32).toString('base64url');

    const codeVerifier = randomBytes(32).toString('base64url');

    const nonce = randomBytes(32).toString('base64url');

    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    const url = new URL('https://oauth.telegram.org/auth');

    url.searchParams.set('client_id', clientId);

    url.searchParams.set('redirect_uri', redirectUri);

    url.searchParams.set('response_type', 'code');

    url.searchParams.set('scope', 'openid profile');

    url.searchParams.set('state', state);

    url.searchParams.set('nonce', nonce);

    url.searchParams.set('code_challenge', codeChallenge);

    url.searchParams.set('code_challenge_method', 'S256');

    return {
      authorizationUrl: url.toString(),

      state,

      codeVerifier,

      nonce,
    };
  }

  async exchangeCode(code: string, codeVerifier: string) {
    const { clientId, clientSecret, redirectUri } = this.getSettings();

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
      'base64',
    );

    const response = await fetch('https://oauth.telegram.org/token', {
      method: 'POST',

      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',

        Authorization: `Basic ${credentials}`,
      },

      body: new URLSearchParams({
        grant_type: 'authorization_code',

        code,

        redirect_uri: redirectUri,

        code_verifier: codeVerifier,
      }),
    });

    if (!response.ok) {
      throw new UnauthorizedException(
        'Telegram authorization code exchange failed',
      );
    }

    const result: any = await response.json();

    if (!result || typeof result.id_token !== 'string') {
      throw new UnauthorizedException('Telegram ID token is missing');
    }

    return result.id_token;
  }

  async verifyIdToken(idToken: string, expectedNonce: string) {
    const { clientId } = this.getSettings();

    const { jwtVerify } = await import('jose');

    const jwks = await this.getJwks();

    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: 'https://oauth.telegram.org',

      audience: clientId,

      algorithms: ['RS256'],

      clockTolerance: 30,
    });

    if (
      payload.nonce !== expectedNonce ||
      typeof payload.sub !== 'string' ||
      !/^[1-9][0-9]*$/.test(payload.sub)
    ) {
      throw new UnauthorizedException('Invalid Telegram identity');
    }

    return {
      telegramUserId: payload.sub,

      firstName:
        typeof payload.given_name === 'string' ? payload.given_name : null,

      lastName:
        typeof payload.family_name === 'string' ? payload.family_name : null,

      username:
        typeof payload.preferred_username === 'string'
          ? payload.preferred_username
          : null,

      photoUrl: typeof payload.picture === 'string' ? payload.picture : null,
    };
  }
}
