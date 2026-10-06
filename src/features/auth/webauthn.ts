/**
 * The browser half of a passkey ceremony (D-029). The server gets the
 * options from Supabase and checks the answer; this only turns the JSON
 * options into what navigator.credentials needs and the credential back into
 * JSON. Uses the browser's own JSON helpers where they exist (Chrome 129+,
 * Safari 18+, Firefox 119+), with a small fallback. No Zod (client file).
 */

type Json = Record<string, unknown>;

interface PublicKeyCredentialStatics {
  parseCreationOptionsFromJSON?: (options: Json) => PublicKeyCredentialCreationOptions;
  parseRequestOptionsFromJSON?: (options: Json) => PublicKeyCredentialRequestOptions;
}

export function passkeysSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential === "function" &&
    typeof navigator.credentials?.get === "function"
  );
}

export function toBytes(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function toBase64url(buffer: ArrayBuffer | ArrayBufferView): string {
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function withIds<T extends { id: unknown }>(list: unknown): T[] | undefined {
  if (!Array.isArray(list)) return undefined;
  return list.map((c: Json) => ({ ...c, id: toBytes(String(c.id)) }) as unknown as T);
}

/** Options from the server (WebAuthn JSON) → what navigator.credentials.get() takes. */
export function requestOptionsFromJSON(options: Json): PublicKeyCredentialRequestOptions {
  const statics = PublicKeyCredential as unknown as PublicKeyCredentialStatics;
  if (typeof statics.parseRequestOptionsFromJSON === "function") return statics.parseRequestOptionsFromJSON(options);
  return {
    ...(options as unknown as PublicKeyCredentialRequestOptions),
    challenge: toBytes(String(options.challenge)),
    allowCredentials: withIds<PublicKeyCredentialDescriptor>(options.allowCredentials),
  };
}

/** Options from the server (WebAuthn JSON) → what navigator.credentials.create() takes. */
export function creationOptionsFromJSON(options: Json): PublicKeyCredentialCreationOptions {
  const statics = PublicKeyCredential as unknown as PublicKeyCredentialStatics;
  if (typeof statics.parseCreationOptionsFromJSON === "function") return statics.parseCreationOptionsFromJSON(options);
  const user = options.user as Json;
  return {
    ...(options as unknown as PublicKeyCredentialCreationOptions),
    challenge: toBytes(String(options.challenge)),
    user: { ...(user as unknown as PublicKeyCredentialUserEntity), id: toBytes(String(user.id)) },
    excludeCredentials: withIds<PublicKeyCredentialDescriptor>(options.excludeCredentials),
  };
}

/** A credential → the JSON the server expects (the same shape as credential.toJSON()). */
export function credentialToJSON(credential: PublicKeyCredential): Json {
  const native = (credential as PublicKeyCredential & { toJSON?: () => Json }).toJSON;
  if (typeof native === "function") return native.call(credential);

  const response = credential.response;
  const json: Json = { clientDataJSON: toBase64url(response.clientDataJSON) };
  if ("attestationObject" in response) {
    const attestation = response as AuthenticatorAttestationResponse;
    json.attestationObject = toBase64url(attestation.attestationObject);
    json.transports = typeof attestation.getTransports === "function" ? attestation.getTransports() : [];
  } else {
    const assertion = response as AuthenticatorAssertionResponse;
    json.authenticatorData = toBase64url(assertion.authenticatorData);
    json.signature = toBase64url(assertion.signature);
    json.userHandle = assertion.userHandle ? toBase64url(assertion.userHandle) : null;
  }
  return {
    id: credential.id,
    rawId: toBase64url(credential.rawId),
    type: credential.type,
    response: json,
    authenticatorAttachment: credential.authenticatorAttachment ?? null,
    clientExtensionResults: credential.getClientExtensionResults(),
  };
}

/** "cancelled" when the person dismissed the prompt or it timed out; otherwise "failed". */
export function ceremonyError(error: unknown): "passkeyCancelled" | "passkeyFailed" {
  const name = error instanceof DOMException ? error.name : "";
  return name === "NotAllowedError" || name === "AbortError" ? "passkeyCancelled" : "passkeyFailed";
}
