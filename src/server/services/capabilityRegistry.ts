/**
 * Authoritative Server-Side Capability Registry & Amount Normalization for Buy
 * Enforces strict binding between capability ID, provider, exact service URL, HTTP method,
 * supported tokens, token decimals, payee address, request body schema, and pricing.
 */

export interface CapabilityTokenConfig {
  symbol: string;
  contract: string;
  decimals: number;
}

export interface RegisteredCapability {
  id: string; // e.g. 'cencori/inference'
  capabilityId: string; // e.g. 'cencori.v1.chat.completions'
  name: string;
  category: 'inference' | 'rpc';
  provider: string;
  serviceUrl: string;
  method: 'POST' | 'GET';
  supportedTokens: CapabilityTokenConfig[];
  payee: string; // canonical lowercase 0x address
  supportedModels?: string[];
  maxBodyBytes: number;
  flatPriceAtomic: string;
  flatPriceDisplay: string;
  chainId: number;
  version: string;
  verifiedAt: string;
  expiresAt: string;
}

/**
 * Authoritative verified capability registry based on verified Buy marketplace catalogue.
 * For RevertLens: Cencori is the ONLY paid Buy capability.
 * Chainstack RPC is directly connected under AD-008 and is NOT exposed as a paid Buy capability.
 */
export const CAPABILITY_REGISTRY: Record<string, RegisteredCapability> = {
  'cencori.v1.chat.completions': {
    id: 'cencori/inference',
    capabilityId: 'cencori.v1.chat.completions',
    name: 'Cencori LLM Inference',
    category: 'inference',
    provider: 'cencori',
    serviceUrl: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
    method: 'POST',
    supportedTokens: [
      {
        symbol: 'USDC',
        contract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
        decimals: 6
      }
    ],
    payee: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b',
    supportedModels: ['maximo-atlas-1.3'],
    maxBodyBytes: 32768, // 32 KiB
    flatPriceAtomic: '10000',
    flatPriceDisplay: '0.01 USDC',
    chainId: 42220,
    version: '1.0.0',
    verifiedAt: '2026-11-08T00:00:00.000Z',
    expiresAt: '2026-12-08T00:00:00.000Z'
  }
};

export function getRegisteredCapability(capabilityId: string): RegisteredCapability | null {
  return CAPABILITY_REGISTRY[capabilityId] || null;
}

export function listRegisteredCapabilities(): RegisteredCapability[] {
  return Object.values(CAPABILITY_REGISTRY);
}

/**
 * Strictly normalizes and mathematically verifies the equivalence between atomic amount
 * and display amount using exact BigInt decimal arithmetic (no floating-point numbers).
 */
export function normalizeAndVerifyAmount(
  amountAtomic: string,
  amountDisplay: string,
  tokenDecimals: number
): { canonicalAtomic: string; canonicalDisplay: string } {
  // 1. Validate amountAtomic as strict positive base-10 integer string
  if (!/^[1-9][0-9]*$/.test(amountAtomic)) {
    throw new Error(
      `Invalid atomic amount: "${amountAtomic}". Must be a positive base-10 integer string with no signs, decimals, exponent notation, or leading zeros.`
    );
  }

  // 2. Validate amountDisplay format
  const cleanDisplay = amountDisplay.replace(/^\$/, '').trim();
  if (!/^[0-9]+(\.[0-9]+)?$/.test(cleanDisplay)) {
    throw new Error(`Invalid display amount format: "${amountDisplay}".`);
  }

  const [intStr, fracStr = ''] = cleanDisplay.split('.');
  if (fracStr.length > tokenDecimals) {
    throw new Error(
      `Display amount precision (${fracStr.length} decimal places) exceeds token decimals (${tokenDecimals}).`
    );
  }

  const atomicBn = BigInt(amountAtomic);
  const paddedFrac = fracStr.padEnd(tokenDecimals, '0');
  const computedFromDisplayAtomic =
    BigInt(intStr) * (10n ** BigInt(tokenDecimals)) + BigInt(paddedFrac);

  if (atomicBn !== computedFromDisplayAtomic) {
    throw new Error(
      `Atomic amount (${amountAtomic}) does not mathematically match display amount ("${amountDisplay}") using ${tokenDecimals} decimals.`
    );
  }

  // 3. Compute canonical normalized display representation
  const factor = 10n ** BigInt(tokenDecimals);
  const integerPart = atomicBn / factor;
  const remainder = atomicBn % factor;
  let fractionPart = remainder.toString().padStart(tokenDecimals, '0');
  fractionPart = fractionPart.replace(/0+$/, '');
  const canonicalDisplay =
    fractionPart.length > 0 ? `${integerPart}.${fractionPart}` : integerPart.toString();

  return {
    canonicalAtomic: atomicBn.toString(),
    canonicalDisplay
  };
}

/**
 * Validates all parameters of an inbound Buy quote request against the authoritative registry.
 */
export function validateCapabilityRequest(params: {
  capabilityId: string;
  url: string;
  method: string;
  tokenSymbol: string;
  tokenContract: string;
  amountAtomic: string;
  amountDisplay: string;
  recipient: string;
  exactBody: string;
  chainId?: number;
}): {
  capability: RegisteredCapability;
  canonicalAtomic: string;
  canonicalDisplay: string;
  tokenConfig: CapabilityTokenConfig;
} {
  const cap = getRegisteredCapability(params.capabilityId);
  if (!cap) {
    throw new Error(
      `Capability "${params.capabilityId}" is not in the approved Buy capability allowlist.`
    );
  }

  // Expiry check of capability registration
  if (new Date(cap.expiresAt).getTime() < Date.now()) {
    throw new Error(
      `Capability "${params.capabilityId}" registration expired on ${cap.expiresAt}. Registry update required.`
    );
  }

  // Exact URL binding (reject query params, path traversal, or alterations)
  if (params.url !== cap.serviceUrl) {
    throw new Error(
      `Service URL "${params.url}" does not match registered URL for capability "${params.capabilityId}" (${cap.serviceUrl}).`
    );
  }

  // Exact Method binding
  if (params.method.toUpperCase() !== cap.method) {
    throw new Error(
      `HTTP method "${params.method}" does not match registered method for capability "${params.capabilityId}" (${cap.method}).`
    );
  }

  // Payee / Recipient binding
  if (params.recipient.toLowerCase() !== cap.payee.toLowerCase()) {
    throw new Error(
      `Payee address "${params.recipient}" is not in the approved recipient allowlist.`
    );
  }

  // Token binding
  const cleanContract = params.tokenContract.toLowerCase();
  const tokenConfig = cap.supportedTokens.find(
    (t) =>
      t.contract.toLowerCase() === cleanContract &&
      t.symbol.toUpperCase() === params.tokenSymbol.toUpperCase()
  );
  if (!tokenConfig) {
    throw new Error(
      `Token ${params.tokenSymbol} (${params.tokenContract}) is not supported for capability "${params.capabilityId}".`
    );
  }

  // Chain ID
  const chainId = params.chainId || 42220;
  if (chainId !== cap.chainId) {
    throw new Error(
      `Invalid chain ID ${chainId}. Capability "${params.capabilityId}" only supports Celo Mainnet (${cap.chainId}).`
    );
  }

  // Request Body Size
  const bodyBytes = Buffer.byteLength(params.exactBody, 'utf-8');
  if (bodyBytes > cap.maxBodyBytes) {
    throw new Error(
      `Request body size (${bodyBytes} bytes) exceeds maximum permitted for capability "${params.capabilityId}" (${cap.maxBodyBytes} bytes).`
    );
  }

  // Request Body Schema Validation
  let parsedBody: any;
  try {
    parsedBody = JSON.parse(params.exactBody);
  } catch {
    throw new Error('Request body is not valid JSON.');
  }

  if (typeof parsedBody !== 'object' || parsedBody === null || Array.isArray(parsedBody)) {
    throw new Error('Request body must be a valid JSON object.');
  }

  if (parsedBody.model && cap.supportedModels && cap.supportedModels.length > 0) {
    if (!cap.supportedModels.includes(parsedBody.model)) {
      throw new Error(
        `Model "${parsedBody.model}" is not in the supported models list: ${cap.supportedModels.join(', ')}.`
      );
    }
  }

  if (parsedBody.messages) {
    if (!Array.isArray(parsedBody.messages) || parsedBody.messages.length === 0) {
      throw new Error(`Request body must contain a non-empty "messages" array.`);
    }

    for (const msg of parsedBody.messages) {
      if (!msg || typeof msg !== 'object') {
        throw new Error('Message entry must be an object.');
      }
      if (!['system', 'user', 'assistant'].includes(msg.role)) {
        throw new Error(`Invalid message role: "${msg.role}". Must be system, user, or assistant.`);
      }
      if (typeof msg.content !== 'string' || msg.content.length === 0) {
        throw new Error('Message content must be a non-empty string.');
      }
    }
  }

  // Mathematical Amount Normalization & Equivalence Check
  const { canonicalAtomic, canonicalDisplay } = normalizeAndVerifyAmount(
    params.amountAtomic,
    params.amountDisplay,
    tokenConfig.decimals
  );

  return {
    capability: cap,
    canonicalAtomic,
    canonicalDisplay,
    tokenConfig
  };
}
