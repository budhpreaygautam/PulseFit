import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

// Verifies the ID token ("credential") that Google Identity Services hands the browser.
// Everything we trust about a Google user (subject id, email) comes from a token whose
// signature, issuer, audience and expiry have been checked here, never from the request body.

export interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

export type GoogleVerifier = (credential: string, audience: string) => Promise<GoogleProfile>;

export class InvalidGoogleTokenError extends Error {}

const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

let remoteKeys: JWTVerifyGetKey | null = null;

/** Checks a credential against a given key set; exported so tests can use a local key pair. */
export async function verifyGoogleIdToken(
  credential: string,
  audience: string,
  keys: JWTVerifyGetKey
): Promise<GoogleProfile> {
  let payload;
  try {
    ({ payload } = await jwtVerify(credential, keys, {
      issuer: GOOGLE_ISSUERS,
      audience,
      algorithms: ['RS256']
    }));
  } catch {
    throw new InvalidGoogleTokenError('The Google sign-in token could not be verified.');
  }

  const { sub, email, email_verified, name, picture } = payload as Record<string, unknown>;
  if (typeof sub !== 'string' || !sub || typeof email !== 'string' || !email) {
    throw new InvalidGoogleTokenError('The Google sign-in token has no account details.');
  }
  // Google sends the boolean, but older tokens carried the string "true".
  if (email_verified !== true && email_verified !== 'true') {
    throw new InvalidGoogleTokenError('This Google account has not verified its email address.');
  }
  return {
    sub,
    email: email.trim().toLowerCase(),
    name: typeof name === 'string' ? name : undefined,
    picture: typeof picture === 'string' ? picture : undefined
  };
}

const defaultVerifier: GoogleVerifier = (credential, audience) => {
  remoteKeys ??= createRemoteJWKSet(new URL(GOOGLE_CERTS_URL));
  return verifyGoogleIdToken(credential, audience, remoteKeys);
};

let activeVerifier: GoogleVerifier = defaultVerifier;

export function verifyGoogleCredential(credential: string, audience: string): Promise<GoogleProfile> {
  return activeVerifier(credential, audience);
}

/** Replace the verifier so tests never call Google; pass null to restore the real one. */
export function setGoogleVerifierForTests(verifier: GoogleVerifier | null): void {
  activeVerifier = verifier ?? defaultVerifier;
}
