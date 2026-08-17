export type JwtClaims = Record<string, unknown>;

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: JwtClaims;
  signature: string;
  rawToken: string;
}

export function stripJwtBearer(
  token: string | null | undefined,
): string {
  return (token ?? '').replace(/^Bearer\s+/i, '').trim();
}

export function jwtFromAuthorization(
  header: string | null | undefined,
): string {
  return stripJwtBearer(header);
}

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64').toString('utf8');
}

export function decodeJwt(token: string): DecodedJwt {
  const cleaned = stripJwtBearer(token);
  const parts = cleaned.split('.');

  if (parts.length < 2) {
    throw new Error('Invalid JWT: expected at least header and payload');
  }

  const [headerPart, payloadPart, signaturePart = ''] = parts;

  let header: Record<string, unknown>;
  let payload: JwtClaims;

  try {
    header = JSON.parse(base64UrlDecode(headerPart)) as Record<string, unknown>;
    payload = JSON.parse(base64UrlDecode(payloadPart)) as JwtClaims;
  } catch {
    throw new Error('Invalid JWT: unable to decode header or payload');
  }

  return {
    header,
    payload,
    signature: signaturePart,
    rawToken: cleaned,
  };
}

export function claimAsString(payload: JwtClaims, key: string): string | null {
  const value = payload[key];
  if (value === undefined || value === null) {
    return null;
  }
  return String(value);
}

export function claimAsNumber(payload: JwtClaims, key: string): number | null {
  const value = payload[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}
