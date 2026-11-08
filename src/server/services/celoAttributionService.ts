import {
  toDataSuffix,
  fromDataSuffix,
  withAttribution,
  verifyTx,
  ERC_8021_MARKER
} from '@celo/attribution-tags';
import { encodeFunctionData, decodeAbiParameters, isAddress, getAddress, type Hex } from 'viem';
import { z } from 'zod';
import {
  OFFICIAL_CELO_ATTRIBUTION_TAG,
  REQUIRED_CELO_CHAIN_ID,
  OFFICIAL_AGENT_WALLET_ADDRESS,
  ERC8021_SCHEMA_0_ID,
  ERC8021_MARKER_HEX,
  EXPECTED_ATTRIBUTION_SUFFIX_HEX,
  ERC8004_IDENTITY_REGISTRY_CELO_MAINNET,
  ERC8004_REPUTATION_REGISTRY_CELO_MAINNET,
  validateAttributionTag,
  getConfiguredAttributionTag
} from '../config/attribution.js';

export {
  OFFICIAL_CELO_ATTRIBUTION_TAG,
  REQUIRED_CELO_CHAIN_ID,
  OFFICIAL_AGENT_WALLET_ADDRESS,
  ERC8021_SCHEMA_0_ID,
  ERC8021_MARKER_HEX,
  ERC_8021_MARKER,
  EXPECTED_ATTRIBUTION_SUFFIX_HEX,
  ERC8004_IDENTITY_REGISTRY_CELO_MAINNET,
  ERC8004_REPUTATION_REGISTRY_CELO_MAINNET,
  validateAttributionTag,
  getConfiguredAttributionTag
};

export const ERC8004_IDENTITY_REGISTRY_ABI = [
  {
    inputs: [{ internalType: 'string', name: 'agentURI', type: 'string' }],
    name: 'register',
    outputs: [{ internalType: 'uint256', name: 'agentId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'uint256', name: 'agentId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'agentId', type: 'uint256' },
      { indexed: false, internalType: 'string', name: 'agentURI', type: 'string' },
      { indexed: true, internalType: 'address', name: 'owner', type: 'address' }
    ],
    name: 'Registered',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'from', type: 'address' },
      { indexed: true, internalType: 'address', name: 'to', type: 'address' },
      { indexed: true, internalType: 'uint256', name: 'tokenId', type: 'uint256' }
    ],
    name: 'Transfer',
    type: 'event'
  }
] as const;

export const ERC8004_REGISTER_FUNCTION_SELECTOR = '0xf2c298be' as const;
export const ERC8004_REGISTERED_EVENT_TOPIC =
  '0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a' as const;
export const ERC721_TRANSFER_EVENT_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as const;

export type OperationCategory =
  | 'CATEGORY_A_OUTGOING_TX'
  | 'CATEGORY_B_READ_ONLY_RPC'
  | 'CATEGORY_C_HTTP_PAYMENT'
  | 'CATEGORY_D_INTERNAL'
  | 'CATEGORY_UNKNOWN';

export type ClassificationDecision =
  | 'REQUIRES_ATTRIBUTION'
  | 'MUST_REMAIN_UNTAGGED'
  | 'REJECT_UNKNOWN';

export interface RequestClassification {
  operation: string;
  category: OperationCategory;
  shouldAddAttribution: boolean;
  decision: ClassificationDecision;
  description: string;
}

/**
 * Authoritative operation classifier separating state-mutating EVM transactions
 * from read-only RPC calls, HTTP payment requests, and internal operations.
 *
 * Security Invariants (DEF-50, DEF-58):
 * - Explicit allowlists for each category; never uses broad prefix wildcards (e.g. eth_*).
 * - Outgoing state-mutating EVM transactions have shouldAddAttribution: true and decision: REQUIRES_ATTRIBUTION.
 * - Read-only RPC, HTTP payment, and internal operations have shouldAddAttribution: false and decision: MUST_REMAIN_UNTAGGED.
 * - Unrecognized operations are classified as CATEGORY_UNKNOWN with decision: REJECT_UNKNOWN under fail-closed security policy.
 */
export function classifyOperation(operation: string): RequestClassification {
  const op = operation.trim();

  // Category A: Actual outgoing state-mutating EVM transactions
  const categoryAOps = [
    'sendTransaction',
    'writeContract',
    'eth_sendTransaction',
    'eth_sendRawTransaction',
    'wallet_sendCalls',
    'eth_signTransaction',
    'personal_sendTransaction',
    'prepareTaggedTransaction',
    'buildErc8004RegistrationTransaction',
    'native_transfer',
    'erc20_transfer'
  ];
  if (categoryAOps.includes(op)) {
    return {
      operation: op,
      category: 'CATEGORY_A_OUTGOING_TX',
      shouldAddAttribution: true,
      decision: 'REQUIRES_ATTRIBUTION',
      description: 'Outgoing state-mutating EVM transaction; must include ERC-8021 attribution suffix.'
    };
  }

  // Category B: Read-only RPC requests (explicit allowlist; never use prefix checks)
  const categoryBOps = [
    'eth_call',
    'eth_getTransactionReceipt',
    'eth_getTransactionByHash',
    'eth_getBlockByNumber',
    'eth_getBlockByHash',
    'eth_blockNumber',
    'eth_chainId',
    'eth_getBalance',
    'eth_getCode',
    'eth_getStorageAt',
    'eth_getLogs',
    'eth_estimateGas',
    'eth_gasPrice',
    'eth_maxPriorityFeePerGas',
    'eth_feeHistory',
    'eth_getTransactionCount',
    'debug_traceTransaction',
    'debug_traceBlockByNumber',
    'debug_traceBlockByHash',
    'debug_traceCall',
    'ChainstackProvider'
  ];
  if (categoryBOps.includes(op)) {
    return {
      operation: op,
      category: 'CATEGORY_B_READ_ONLY_RPC',
      shouldAddAttribution: false,
      decision: 'MUST_REMAIN_UNTAGGED',
      description: 'Read-only JSON-RPC query inspecting mined blocks/receipts; must NEVER be tagged.'
    };
  }

  // Category C: x402 / Buy HTTP payment requests
  const categoryCOps = [
    'buy_cli',
    'buy_whoami',
    'x402_payment',
    'cencori_chat_completions',
    'cencori_quote',
    'cencori_execute',
    'http_402_challenge'
  ];
  if (categoryCOps.includes(op)) {
    return {
      operation: op,
      category: 'CATEGORY_C_HTTP_PAYMENT',
      shouldAddAttribution: false,
      decision: 'MUST_REMAIN_UNTAGGED',
      description: 'HTTP x402 / Buy payment lifecycle request; separate protocol from EVM transaction calldata.'
    };
  }

  // Category D: Internal application operations
  const categoryDOps = [
    'sqlite_persist',
    'sqlite_write',
    'password_scrypt',
    'session_hmac',
    'report_generate',
    'report_export',
    'export_csv',
    'auth_rate_limit',
    'operator_login',
    'investigation_cache',
    'internal_api'
  ];
  if (categoryDOps.includes(op)) {
    return {
      operation: op,
      category: 'CATEGORY_D_INTERNAL',
      shouldAddAttribution: false,
      decision: 'MUST_REMAIN_UNTAGGED',
      description: 'Internal backend/frontend operation (SQLite persistence, report formatting, exports); untagged.'
    };
  }

  // Unknown operations fail closed to CATEGORY_UNKNOWN with explicit REJECT_UNKNOWN decision (DEF-58)
  return {
    operation: op,
    category: 'CATEGORY_UNKNOWN',
    shouldAddAttribution: false,
    decision: 'REJECT_UNKNOWN',
    description: `Unknown operation '${op}'; prohibited from execution or dispatch under fail-closed security policy.`
  };
}

/**
 * Asserts that an operation is recognized and dispatchable under policy rules.
 * Throws AttributionError with UNRECOGNIZED_OPERATION_REJECTED for any unknown operation (DEF-58).
 */
export function assertOperationDispatchable(operation: string): RequestClassification {
  const classification = classifyOperation(operation);
  if (classification.decision === 'REJECT_UNKNOWN') {
    throw new AttributionError(
      `Operation '${operation}' is unrecognized and rejected under fail-closed attribution policy.`,
      'UNRECOGNIZED_OPERATION_REJECTED'
    );
  }
  return classification;
}

export interface OutgoingTransactionRequest {
  to: `0x${string}`;
  value?: bigint | string;
  data?: `0x${string}`;
  chainId: number;
  from?: `0x${string}`;
  gasLimit?: bigint | string;
}

export interface TaggedTransactionPayload {
  to: `0x${string}`;
  from?: `0x${string}`;
  value: bigint;
  data: `0x${string}`;
  chainId: 42220;
  gasLimit?: bigint;
  attributionTag: string;
  dataSuffix: `0x${string}`;
  verifiedCodes: string[];
}

export interface AttributionCheckResult {
  status: 'TAGGED_CORRECTLY' | 'NO_ATTRIBUTION' | 'WRONG_ATTRIBUTION' | 'MALFORMED_SUFFIX';
  hasExpectedTag: boolean;
  codes: string[];
  schemaId?: number;
  reason?: string;
}

export interface OnChainVerificationResult {
  verified: boolean;
  status: 'VERIFIED' | 'NOT_TAGGED' | 'WRONG_TAG' | 'RPC_ERROR' | 'UNSUPPORTED';
  codes: string[];
  schemaId?: number;
  reason?: string;
}

export const erc8004AgentMetadataSchema = z
  .object({
    type: z.literal('https://eips.ethereum.org/EIPS/eip-8004#registration-v1'),
    name: z.literal('RevertLens'),
    description: z.string().min(10),
    image: z.string().url().optional(),
    network: z.literal('Celo Mainnet'),
    chainId: z.literal(REQUIRED_CELO_CHAIN_ID),
    agentWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    attributionTag: z.literal(OFFICIAL_CELO_ATTRIBUTION_TAG),
    services: z
      .array(
        z.object({
          name: z.string().min(1),
          endpoint: z.string().url(),
          version: z.string().min(1)
        })
      )
      .min(1),
    supportedTrust: z.array(z.string()).min(1)
  })
  .strict();

export type Erc8004AgentMetadata = z.infer<typeof erc8004AgentMetadataSchema>;

export function validateErc8004Metadata(data: unknown): {
  valid: boolean;
  data?: Erc8004AgentMetadata;
  reason?: string;
} {
  const result = erc8004AgentMetadataSchema.safeParse(data);
  if (!result.success) {
    const errorDetails = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    return { valid: false, reason: `Invalid ERC-8004 metadata: ${errorDetails}` };
  }
  return { valid: true, data: result.data };
}

export interface RegistrationReceiptVerificationParams {
  receipt: {
    transactionHash: string;
    blockNumber?: number | string | bigint | null;
    status: number | string | 'SUCCESS' | 'REVERTED' | 'UNKNOWN';
    logs?: Array<{
      address: string;
      topics: string[];
      data: string;
    }>;
  };
  transaction?: {
    hash?: string;
    from?: string;
    to?: string | null;
    input?: string;
  };
  expectedWallet?: string;
  expectedRegistry?: string;
  expectedAttributionTag?: string;
  expectedCanonicalUri?: string;
}

export interface RegistrationReceiptVerificationResult {
  verified: boolean;
  agentId: string | null;
  agentIdBigInt: bigint | null;
  owner: string | null;
  agentURI: string | null;
  registryAddress: string;
  transactionHash: string;
  blockNumber: number;
  attributionTag: string;
  hasExpectedAttribution: boolean;
  status:
    | 'VERIFIED'
    | 'REVERTED'
    | 'INVALID_TARGET'
    | 'INVALID_SENDER'
    | 'MISSING_ATTRIBUTION'
    | 'INVALID_CALLDATA'
    | 'NO_REGISTRATION_EVENT'
    | 'AMBIGUOUS_EVENTS'
    | 'INVALID_RECEIPT';
  reason?: string;
}

export class AttributionError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'AttributionError';
  }
}

/**
 * CeloAttributionService
 *
 * Enforces official ERC-8021 attribution tagging for all outgoing Celo Mainnet transactions
 * using the official @celo/attribution-tags SDK.
 *
 * Strict Invariants:
 * 1. Only allows Celo Mainnet (chain ID 42220).
 * 2. Injects the immutable official hackathon tag ('celo_235f6ef56f5b').
 * 3. Never modifies read-only RPC calls (eth_call, eth_getTransactionReceipt, etc.).
 * 4. Preserves base contract calldata byte-for-byte as prefix.
 * 5. Handles existing attribution suffixes idempotently without duplication.
 * 6. Verifies the appended data suffix via fromDataSuffix() before returning payload.
 */
export class CeloAttributionService {
  private readonly officialTag: string;

  constructor(customTag?: string) {
    this.officialTag = customTag !== undefined ? customTag : OFFICIAL_CELO_ATTRIBUTION_TAG;
    const validation = validateAttributionTag(this.officialTag);
    if (!validation.valid) {
      throw new AttributionError(
        `Attribution tag '${this.officialTag}' is invalid: ${validation.reason}`,
        'INVALID_ATTRIBUTION_TAG'
      );
    }
    if (this.officialTag !== OFFICIAL_CELO_ATTRIBUTION_TAG) {
      throw new AttributionError(
        `Attribution tag '${this.officialTag}' does not match official hackathon tag '${OFFICIAL_CELO_ATTRIBUTION_TAG}'.`,
        'INVALID_ATTRIBUTION_TAG'
      );
    }
  }

  /**
   * Returns the configured attribution tag for the service.
   */
  public getConfiguredAttributionTag(): string {
    return this.officialTag;
  }

  /**
   * Alias for getConfiguredAttributionTag for backward compatibility.
   */
  public getOfficialTag(): string {
    return this.officialTag;
  }

  /**
   * Generates the raw ERC-8021 hex suffix for the configured tag via @celo/attribution-tags.
   */
  public createAttributionSuffix(): `0x${string}` {
    return toDataSuffix(this.officialTag) as `0x${string}`;
  }

  /**
   * Alias for createAttributionSuffix for backward compatibility.
   */
  public getDataSuffix(): `0x${string}` {
    return this.createAttributionSuffix();
  }

  /**
   * Decodes attribution data from full calldata or standalone suffix via official SDK fromDataSuffix().
   */
  public decodeAttributionData(data: `0x${string}` | string): {
    codes: string[];
    schemaId: number;
    app?: string;
    wallet?: string;
    service?: string[];
  } | null {
    if (typeof data !== 'string' || data.length < 2) {
      return null;
    }
    const hex = (data.startsWith('0x') ? data : `0x${data}`) as `0x${string}`;
    try {
      return fromDataSuffix(hex);
    } catch {
      return null;
    }
  }

  /**
   * Cryptographically verifies whether calldata contains the expected official attribution tag.
   * Distinguishes TAGGED_CORRECTLY, NO_ATTRIBUTION, WRONG_ATTRIBUTION, and MALFORMED_SUFFIX.
   */
  public hasExpectedAttribution(data: `0x${string}` | string): AttributionCheckResult {
    if (typeof data !== 'string' || data.length < 2) {
      return {
        status: 'NO_ATTRIBUTION',
        hasExpectedTag: false,
        codes: [],
        reason: 'Empty or non-string calldata.'
      };
    }

    const hex = (data.startsWith('0x') ? data : `0x${data}`) as `0x${string}`;
    const decoded = this.decodeAttributionData(hex);

    if (!decoded) {
      // Check if data ends with the 16-byte ERC-8021 marker to detect malformed suffixes
      const markerHex = ERC_8021_MARKER.slice(2).toLowerCase();
      if (hex.toLowerCase().endsWith(markerHex)) {
        return {
          status: 'MALFORMED_SUFFIX',
          hasExpectedTag: false,
          codes: [],
          reason: 'Calldata terminates with ERC-8021 marker but contains malformed length, schema, or code payload.'
        };
      }
      return {
        status: 'NO_ATTRIBUTION',
        hasExpectedTag: false,
        codes: [],
        reason: 'No ERC-8021 attribution suffix found in calldata.'
      };
    }

    const hasTag = decoded.codes.includes(this.officialTag);
    if (hasTag) {
      return {
        status: 'TAGGED_CORRECTLY',
        hasExpectedTag: true,
        codes: decoded.codes,
        schemaId: decoded.schemaId
      };
    }

    return {
      status: 'WRONG_ATTRIBUTION',
      hasExpectedTag: false,
      codes: decoded.codes,
      schemaId: decoded.schemaId,
      reason: `Calldata contains attribution codes [${decoded.codes.join(', ')}] but missing expected official tag "${this.officialTag}".`
    };
  }

  /**
   * Appends the official attribution suffix to calldata safely and idempotently.
   *
   * Security Invariants:
   * - DEF-51: Fails closed on malformed calldata (odd length, non-hex, missing 0x prefix).
   *   Accepts undefined only where no calldata is intended (normalized to '0x').
   *   Never silently truncates or normalizes away invalid calldata.
   * - DEF-54: Hard failure on any merge error; never silently omits the official tag.
   *   If existing calldata contains Schema 2 role-based attribution without the official tag,
   *   refuses with typed AttributionError (SCHEMA_2_MERGE_PROHIBITED) to prevent silent omission.
   *   Verifies the final calldata via hasExpectedAttribution() before returning.
   * - DEF-59: Rejects leading, trailing, or embedded whitespace strictly with typed
   *   AttributionError without silently trimming.
   */
  public appendAttribution(calldata?: string): `0x${string}` {
    let base: `0x${string}`;

    if (calldata === undefined) {
      base = '0x';
    } else if (typeof calldata !== 'string') {
      throw new AttributionError('Calldata must be a string or undefined.', 'INVALID_CALLDATA');
    } else if (/\s/.test(calldata)) {
      throw new AttributionError('Calldata must not contain whitespace.', 'INVALID_CALLDATA');
    } else if (calldata === '' || calldata === '0x') {
      base = '0x';
    } else {
      if (!calldata.startsWith('0x')) {
        throw new AttributionError("Calldata must start with '0x' prefix.", 'INVALID_CALLDATA');
      }
      if (calldata.length % 2 !== 0) {
        throw new AttributionError(
          `Calldata '${calldata}' has odd hexadecimal length (${calldata.length - 2} nibbles).`,
          'INVALID_CALLDATA'
        );
      }
      if (!/^0x[0-9a-fA-F]+$/.test(calldata)) {
        throw new AttributionError('Calldata contains non-hexadecimal characters.', 'INVALID_CALLDATA');
      }
      base = calldata as `0x${string}`;
    }

    const existing = this.decodeAttributionData(base);
    let result: `0x${string}`;

    if (!existing) {
      // Check if data ends with the 16-byte ERC-8021 marker to detect malformed existing suffixes
      const markerHex = ERC_8021_MARKER.slice(2).toLowerCase();
      if (base.length >= 34 && base.toLowerCase().endsWith(markerHex)) {
        throw new AttributionError(
          'Calldata contains a malformed ERC-8021 attribution suffix.',
          'MALFORMED_SUFFIX'
        );
      }
      const suffix = this.createAttributionSuffix();
      result = (base + suffix.slice(2)) as `0x${string}`;
    } else if (existing.schemaId !== 0) {
      // Non-Schema-0 (e.g. Schema 2 role-based attribution):
      // If it already includes the official hackathon tag, it is already valid and compliant.
      if (existing.codes.includes(this.officialTag)) {
        result = base;
      } else {
        // In accordance with DEF-54 and official ERC-8021 specification:
        // Schema 2 immutability prevents silent omission or corruption of hackathon tag.
        throw new AttributionError(
          `Cannot merge Schema 0 hackathon tag '${this.officialTag}' into existing Schema ${existing.schemaId} role-based attribution; Schema ${existing.schemaId} immutability prevents silent omission or corruption.`,
          'SCHEMA_2_MERGE_PROHIBITED'
        );
      }
    } else {
      // Schema 0: idempotent code merge
      if (existing.codes.length === 1 && existing.codes[0] === this.officialTag) {
        result = base;
      } else if (existing.codes.includes(this.officialTag)) {
        result = base;
      } else {
        const merged = [...existing.codes, this.officialTag];
        const markerBytes = 16;
        const existingBytes = existing.codes.join(',').length + 1 + 1 + markerBytes;
        if (base.length < 2 + existingBytes * 2) {
          throw new AttributionError(
            'Calldata length is shorter than decoded existing attribution suffix.',
            'INVALID_CALLDATA'
          );
        }
        const stripped = base.slice(0, base.length - existingBytes * 2);
        let newSuffix: string;
        try {
          newSuffix = toDataSuffix(merged);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new AttributionError(`Failed to generate merged attribution suffix: ${msg}`, 'MERGE_FAILED');
        }
        result = (stripped + newSuffix.slice(2)) as `0x${string}`;
      }
    }

    // Verify tag presence in final calldata before returning (DEF-54)
    const check = this.hasExpectedAttribution(result);
    if (!check.hasExpectedTag) {
      throw new AttributionError(
        `Attribution verification failed on result calldata: ${check.reason || 'official tag missing'}`,
        'TAG_VERIFICATION_FAILED'
      );
    }

    return result;
  }

  /**
   * Prepares and cryptographically verifies an outgoing Celo transaction with the official ERC-8021 data suffix.
   * Invariants:
   * - Caller transaction object is never mutated.
   * - Original calldata is preserved byte-for-byte as prefix.
   * - Destination and value fields are preserved exactly.
   * - Validates target chain ID is strictly Celo Mainnet (42220).
   */
  public prepareTaggedTransaction(tx: OutgoingTransactionRequest): TaggedTransactionPayload {
    // 1. Validate Chain ID
    if (tx.chainId !== REQUIRED_CELO_CHAIN_ID) {
      throw new AttributionError(
        `Invalid chain ID ${tx.chainId}. Attribution service strictly requires Celo Mainnet (${REQUIRED_CELO_CHAIN_ID}).`,
        'INVALID_CHAIN_ID'
      );
    }

    // 2. Validate 'to' address
    if (!tx.to || !isAddress(tx.to)) {
      throw new AttributionError(`Invalid or missing destination address: '${tx.to}'.`, 'INVALID_RECIPIENT');
    }

    // 3. Validate 'from' address if provided
    if (tx.from && !isAddress(tx.from)) {
      throw new AttributionError(`Invalid sender address: '${tx.from}'.`, 'INVALID_SENDER');
    }

    // 4. Construct Calldata with ERC-8021 suffix idempotently
    const taggedData = this.appendAttribution(tx.data);

    // 5. Verify Tag is present and decodable in the output calldata
    const check = this.hasExpectedAttribution(taggedData);
    if (!check.hasExpectedTag) {
      throw new AttributionError(
        `Failed to verify attribution tag in tagged calldata: ${check.reason}`,
        'TAG_VERIFICATION_FAILED'
      );
    }

    const valueBigInt = typeof tx.value === 'bigint' ? tx.value : BigInt(tx.value || '0');
    const gasLimitBigInt = tx.gasLimit ? (typeof tx.gasLimit === 'bigint' ? tx.gasLimit : BigInt(tx.gasLimit)) : undefined;

    return {
      to: tx.to,
      from: tx.from,
      value: valueBigInt,
      data: taggedData,
      chainId: REQUIRED_CELO_CHAIN_ID,
      gasLimit: gasLimitBigInt,
      attributionTag: this.officialTag as typeof OFFICIAL_CELO_ATTRIBUTION_TAG,
      dataSuffix: this.createAttributionSuffix(),
      verifiedCodes: check.codes
    };
  }

  /**
   * Builds an ERC-8004 Identity Registration transaction tagged with the official attribution code.
   */
  public buildErc8004RegistrationTransaction(params: {
    agentURI: string;
    from?: `0x${string}`;
    registryAddress?: `0x${string}`;
  }): TaggedTransactionPayload {
    if (!params.agentURI || typeof params.agentURI !== 'string' || params.agentURI.trim().length === 0) {
      throw new AttributionError('agentURI must be a non-empty URI string.', 'INVALID_AGENT_URI');
    }

    const registry = params.registryAddress || (ERC8004_IDENTITY_REGISTRY_CELO_MAINNET as `0x${string}`);
    if (!isAddress(registry)) {
      throw new AttributionError(`Invalid registry address: '${registry}'.`, 'INVALID_REGISTRY_ADDRESS');
    }

    // Encode register(string agentURI)
    const calldata = encodeFunctionData({
      abi: ERC8004_IDENTITY_REGISTRY_ABI,
      functionName: 'register',
      args: [params.agentURI.trim()]
    });

    return this.prepareTaggedTransaction({
      to: registry,
      from: params.from,
      value: 0n,
      data: calldata,
      chainId: REQUIRED_CELO_CHAIN_ID,
      gasLimit: 350000n // Conservative estimated limit for ERC-721 mint on Celo
    });
  }

  /**
   * Generates standard ERC-8004 agent registration metadata.
   */
  public generateErc8004Metadata(params: {
    agentWallet: `0x${string}`;
    baseUrl: string;
  }): Erc8004AgentMetadata {
    if (!params.agentWallet || !isAddress(params.agentWallet)) {
      throw new AttributionError(`Invalid agent wallet address: '${params.agentWallet}'.`, 'INVALID_AGENT_WALLET');
    }

    if (!params.baseUrl || typeof params.baseUrl !== 'string') {
      throw new AttributionError(`Base URL is required for ERC-8004 metadata.`, 'INVALID_BASE_URL');
    }

    let cleanBaseUrl: string;
    try {
      const parsedUrl = new URL(params.baseUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Protocol must be http or https');
      }
      cleanBaseUrl = params.baseUrl.replace(/\/+$/, '');
    } catch {
      throw new AttributionError(
        `Invalid baseUrl '${params.baseUrl}': must be a valid HTTP/HTTPS URL.`,
        'INVALID_BASE_URL'
      );
    }

    const metadata: Erc8004AgentMetadata = {
      type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
      name: 'RevertLens',
      description:
        'Evidence-backed forensic investigation of failed Celo transactions, including execution traces, revert reasons, causal propagation analysis and evidence-led reports.',
      image: `${cleanBaseUrl}/assets/revertlens-banner.png`,
      network: 'Celo Mainnet',
      chainId: REQUIRED_CELO_CHAIN_ID,
      agentWallet: getAddress(params.agentWallet) as `0x${string}`,
      attributionTag: this.officialTag as typeof OFFICIAL_CELO_ATTRIBUTION_TAG,
      services: [
        {
          name: 'RevertLens Investigation API',
          endpoint: `${cleanBaseUrl}/api/investigations`,
          version: '1.0.0'
        },
        {
          name: 'RevertLens Public Health Check',
          endpoint: `${cleanBaseUrl}/api/health`,
          version: '1.0.0'
        },
        {
          name: 'RevertLens Agent Metadata',
          endpoint: `${cleanBaseUrl}/api/agent/metadata`,
          version: '1.0.0'
        }
      ],
      supportedTrust: ['erc8004-identity-v1']
    };

    const validation = validateErc8004Metadata(metadata);
    if (!validation.valid) {
      throw new AttributionError(
        `Generated ERC-8004 metadata failed schema validation: ${validation.reason}`,
        'INVALID_METADATA'
      );
    }

    return metadata;
  }

  /**
   * Verifies on-chain transaction attribution using official SDK verifyTx().
   * Read-only inspection; does not sign, mutate, or broadcast any transaction.
   */
  public async verifyOnChainAttribution(
    hash: `0x${string}`,
    client: { getTransaction: (args: { hash: `0x${string}` }) => Promise<{ input?: `0x${string}` | string } | null> }
  ): Promise<OnChainVerificationResult> {
    try {
      // Direct call to surface network/RPC errors explicitly rather than letting verifyTx silently swallow
      const tx = await client.getTransaction({ hash });
      if (!tx || !tx.input) {
        return {
          verified: false,
          status: 'NOT_TAGGED',
          codes: [],
          reason: 'Transaction not found or has no input data.'
        };
      }

      const result = await verifyTx({ hash, client: client as any });
      if (!result || !result.codes || result.codes.length === 0) {
        return {
          verified: false,
          status: 'NOT_TAGGED',
          codes: [],
          reason: 'No ERC-8021 attribution found on-chain for transaction.'
        };
      }
      const hasTag = result.codes.includes(this.officialTag);
      if (hasTag) {
        return {
          verified: true,
          status: 'VERIFIED',
          codes: result.codes,
          schemaId: result.schemaId
        };
      }
      return {
        verified: false,
        status: 'WRONG_TAG',
        codes: result.codes,
        schemaId: result.schemaId,
        reason: `On-chain transaction contains attribution tags [${result.codes.join(', ')}] but missing expected official tag "${this.officialTag}".`
      };
    } catch (err) {
      return {
        verified: false,
        status: 'RPC_ERROR',
        codes: [],
        reason: err instanceof Error ? err.message : String(err)
      };
    }
  }

  /**
   * Returns official viem wallet client extension configured with the official attribution tag.
   */
  public getWalletClientExtension() {
    return withAttribution(this.officialTag);
  }

  /**
   * Asserts that read-only RPC requests are strictly protected from attribution suffix injection.
   *
   * Security Hardening (DEF-52):
   * - Performs recursive, bounded inspection of JSON-RPC parameters (objects, arrays, strings).
   * - Detects the ERC-8021 marker case-insensitively anywhere in nested structures.
   * - Detects and fails closed on circular references and excessive traversal depth.
   * - Never mutates the examined payload.
   */
  public static assertReadOnlyRpcUntagged(method: string, payload: unknown): void {
    const classification = classifyOperation(method);
    if (classification.category !== 'CATEGORY_B_READ_ONLY_RPC') {
      return;
    }

    const markerHex = ERC_8021_MARKER.slice(2).toLowerCase();
    const MAX_DEPTH = 10;
    const MAX_NODES = 500;
    let nodeCount = 0;
    const visited = new Set<object>();

    function inspect(value: unknown, depth: number): void {
      if (depth > MAX_DEPTH) {
        throw new AttributionError(
          `Payload inspection exceeded maximum traversal depth (${MAX_DEPTH}) for read-only RPC method '${method}'.`,
          'PAYLOAD_INSPECTION_LIMIT_EXCEEDED'
        );
      }
      nodeCount++;
      if (nodeCount > MAX_NODES) {
        throw new AttributionError(
          `Payload inspection exceeded maximum node count (${MAX_NODES}) for read-only RPC method '${method}'.`,
          'PAYLOAD_INSPECTION_LIMIT_EXCEEDED'
        );
      }

      if (typeof value === 'string') {
        if (value.toLowerCase().includes(markerHex)) {
          throw new AttributionError(
            `Violation: Attempted to inject attribution data suffix into read-only RPC method '${method}'.`,
            'ILLEGAL_READ_ONLY_TAGGING'
          );
        }
        return;
      }

      if (value === null || typeof value !== 'object') {
        return;
      }

      if (visited.has(value)) {
        throw new AttributionError(
          `Circular reference detected in payload for read-only RPC method '${method}'.`,
          'CIRCULAR_REFERENCE_DETECTED'
        );
      }
      visited.add(value);

      if (Array.isArray(value)) {
        for (const item of value) {
          inspect(item, depth + 1);
        }
      } else {
        for (const key of Object.keys(value)) {
          inspect((value as Record<string, unknown>)[key], depth + 1);
        }
      }
    }

    inspect(payload, 0);
  }

  /**
   * Static helper delegating to request classifier.
   */
  public static classifyOperation(operation: string): RequestClassification {
    return classifyOperation(operation);
  }

  /**
   * Static helper asserting that an operation is recognized and dispatchable (DEF-58).
   */
  public static assertOperationDispatchable(operation: string): RequestClassification {
    return assertOperationDispatchable(operation);
  }

  /**
   * Validates ERC-8004 agent metadata against strict EIP-8004 schema.
   */
  public static validateErc8004Metadata(data: unknown) {
    return validateErc8004Metadata(data);
  }

  /**
   * Verifies ERC-8004 registration receipt against expected invariants.
   */
  public verifyErc8004RegistrationReceipt(
    params: RegistrationReceiptVerificationParams
  ): RegistrationReceiptVerificationResult {
    return verifyErc8004RegistrationReceipt({
      ...params,
      expectedAttributionTag: params.expectedAttributionTag || this.officialTag
    });
  }

  /**
   * Static helper verifying ERC-8004 registration receipt.
   */
  public static verifyErc8004RegistrationReceipt(
    params: RegistrationReceiptVerificationParams
  ): RegistrationReceiptVerificationResult {
    return verifyErc8004RegistrationReceipt(params);
  }
}

/**
 * Verifies an ERC-8004 agent registration transaction and receipt on Celo Mainnet.
 *
 * Strict Validations:
 * 1. Receipt must exist and indicate success (status 1). Fails with REVERTED if status 0.
 * 2. If transaction details provided:
 *    - Destination 'to' must match the official ERC-8004 Identity Registry (0x8004A169FB4a3325136EB29fA0ceB6D2e539a432).
 *    - Sender 'from' must match the official agent wallet (0x3e1bef07824cd0E076F4907641F0A0EF27898e52).
 *    - Input selector must match register(string) (0xf2c298be).
 *    - Input calldata must be cryptographically tagged with official attribution tag ('celo_235f6ef56f5b').
 * 3. Logs inspection:
 *    - Decodes Registered(uint256,string,address) and Transfer(0x0,owner,tokenId).
 *    - Rejects receipts containing zero registration events (NO_REGISTRATION_EVENT).
 *    - Rejects receipts containing ambiguous/multiple conflicting agent IDs (AMBIGUOUS_EVENTS).
 *    - Verifies that minted token owner strictly equals expected agent wallet.
 *    - Extracts agentId, owner, and agentURI safely.
 */
export function verifyErc8004RegistrationReceipt(
  params: RegistrationReceiptVerificationParams
): RegistrationReceiptVerificationResult {
  const targetRegistry = getAddress(params.expectedRegistry || ERC8004_IDENTITY_REGISTRY_CELO_MAINNET);
  const expectedWallet = getAddress(params.expectedWallet || OFFICIAL_AGENT_WALLET_ADDRESS);
  const expectedTag = params.expectedAttributionTag || OFFICIAL_CELO_ATTRIBUTION_TAG;

  if (!params || !params.receipt) {
    return {
      verified: false,
      agentId: null,
      agentIdBigInt: null,
      owner: null,
      agentURI: null,
      registryAddress: targetRegistry,
      transactionHash: '',
      blockNumber: 0,
      attributionTag: expectedTag,
      hasExpectedAttribution: false,
      status: 'INVALID_RECEIPT',
      reason: 'Missing receipt parameter.'
    };
  }

  const { receipt, transaction } = params;
  const txHash = typeof receipt.transactionHash === 'string' ? receipt.transactionHash.trim() : '';

  if (!/^0[xX][0-9a-fA-F]{64}$/.test(txHash)) {
    return {
      verified: false,
      agentId: null,
      agentIdBigInt: null,
      owner: null,
      agentURI: null,
      registryAddress: targetRegistry,
      transactionHash: txHash,
      blockNumber: 0,
      attributionTag: expectedTag,
      hasExpectedAttribution: false,
      status: 'INVALID_RECEIPT',
      reason: `Invalid transactionHash in receipt: '${txHash}'. Must be 32-byte hex hash.`
    };
  }

  // Parse block number safely
  let blockNumber = 0;
  if (receipt.blockNumber !== null && receipt.blockNumber !== undefined) {
    try {
      blockNumber = Number(BigInt(receipt.blockNumber));
    } catch {
      blockNumber = 0;
    }
  }

  // Check receipt status
  const statusRaw = receipt.status;
  if (
    statusRaw === 0 ||
    statusRaw === '0' ||
    statusRaw === '0x0' ||
    statusRaw === 'REVERTED'
  ) {
    return {
      verified: false,
      agentId: null,
      agentIdBigInt: null,
      owner: null,
      agentURI: null,
      registryAddress: targetRegistry,
      transactionHash: txHash,
      blockNumber,
      attributionTag: expectedTag,
      hasExpectedAttribution: false,
      status: 'REVERTED',
      reason: 'Transaction reverted on-chain (status 0).'
    };
  }

  if (
    statusRaw !== 1 &&
    statusRaw !== '1' &&
    statusRaw !== '0x1' &&
    statusRaw !== 'SUCCESS'
  ) {
    return {
      verified: false,
      agentId: null,
      agentIdBigInt: null,
      owner: null,
      agentURI: null,
      registryAddress: targetRegistry,
      transactionHash: txHash,
      blockNumber,
      attributionTag: expectedTag,
      hasExpectedAttribution: false,
      status: 'INVALID_RECEIPT',
      reason: `Transaction receipt status is ambiguous or unsuccessful: '${String(statusRaw)}'.`
    };
  }

  let hasExpectedAttribution = false;

  // Transaction checks if provided
  if (transaction) {
    if (transaction.to) {
      if (!isAddress(transaction.to) || getAddress(transaction.to) !== targetRegistry) {
        return {
          verified: false,
          agentId: null,
          agentIdBigInt: null,
          owner: null,
          agentURI: null,
          registryAddress: targetRegistry,
          transactionHash: txHash,
          blockNumber,
          attributionTag: expectedTag,
          hasExpectedAttribution: false,
          status: 'INVALID_TARGET',
          reason: `Transaction recipient ('${transaction.to}') does not match expected ERC-8004 Identity Registry ('${targetRegistry}').`
        };
      }
    }

    if (transaction.from) {
      if (!isAddress(transaction.from) || getAddress(transaction.from) !== expectedWallet) {
        return {
          verified: false,
          agentId: null,
          agentIdBigInt: null,
          owner: null,
          agentURI: null,
          registryAddress: targetRegistry,
          transactionHash: txHash,
          blockNumber,
          attributionTag: expectedTag,
          hasExpectedAttribution: false,
          status: 'INVALID_SENDER',
          reason: `Transaction sender ('${transaction.from}') does not match expected official agent wallet ('${expectedWallet}').`
        };
      }
    }

    if (transaction.input) {
      const input = transaction.input.trim();
      if (!input.startsWith('0x') || input.length < 10) {
        return {
          verified: false,
          agentId: null,
          agentIdBigInt: null,
          owner: null,
          agentURI: null,
          registryAddress: targetRegistry,
          transactionHash: txHash,
          blockNumber,
          attributionTag: expectedTag,
          hasExpectedAttribution: false,
          status: 'INVALID_CALLDATA',
          reason: `Transaction input calldata is too short or malformed.`
        };
      }

      const selector = input.slice(0, 10).toLowerCase();
      if (selector !== ERC8004_REGISTER_FUNCTION_SELECTOR.toLowerCase()) {
        return {
          verified: false,
          agentId: null,
          agentIdBigInt: null,
          owner: null,
          agentURI: null,
          registryAddress: targetRegistry,
          transactionHash: txHash,
          blockNumber,
          attributionTag: expectedTag,
          hasExpectedAttribution: false,
          status: 'INVALID_CALLDATA',
          reason: `Transaction function selector '${selector}' does not match register(string) ('${ERC8004_REGISTER_FUNCTION_SELECTOR}').`
        };
      }

      const attrChecker = new CeloAttributionService(expectedTag);
      const attrCheck = attrChecker.hasExpectedAttribution(input as `0x${string}`);
      if (attrCheck.status !== 'TAGGED_CORRECTLY') {
        return {
          verified: false,
          agentId: null,
          agentIdBigInt: null,
          owner: null,
          agentURI: null,
          registryAddress: targetRegistry,
          transactionHash: txHash,
          blockNumber,
          attributionTag: expectedTag,
          hasExpectedAttribution: false,
          status: 'MISSING_ATTRIBUTION',
          reason: `Transaction input data does not contain expected attribution tag '${expectedTag}'. Status: ${attrCheck.status}`
        };
      }
      hasExpectedAttribution = true;
    }
  }

  // Logs analysis
  const logs = Array.isArray(receipt.logs) ? receipt.logs : [];
  const agentIds = new Set<string>();
  const agentOwners = new Set<string>();
  const agentUris = new Set<string>();

  for (const log of logs) {
    if (!log || !log.address || !isAddress(log.address)) {
      continue;
    }
    if (getAddress(log.address) !== targetRegistry) {
      continue;
    }
    if (!Array.isArray(log.topics) || log.topics.length === 0) {
      continue;
    }

    const topic0 = log.topics[0].toLowerCase();

    // Check Registered(uint256 indexed agentId, string agentURI, address indexed owner)
    if (topic0 === ERC8004_REGISTERED_EVENT_TOPIC.toLowerCase()) {
      if (log.topics.length >= 3) {
        try {
          const id = BigInt(log.topics[1]).toString();
          agentIds.add(id);

          const ownerRaw = log.topics[2];
          if (ownerRaw && ownerRaw.length >= 26) {
            const ownerAddr = getAddress('0x' + ownerRaw.slice(-40));
            agentOwners.add(ownerAddr);
          }

          if (log.data && log.data !== '0x') {
            const decoded = decodeAbiParameters([{ type: 'string' }], log.data as Hex);
            if (typeof decoded[0] === 'string') {
              agentUris.add(decoded[0]);
            }
          }
        } catch {
          // Log decode error
        }
      }
    }

    // Check Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
    if (topic0 === ERC721_TRANSFER_EVENT_TOPIC.toLowerCase()) {
      if (log.topics.length >= 4) {
        try {
          const fromRaw = log.topics[1];
          const toRaw = log.topics[2];
          const idRaw = log.topics[3];

          const fromAddr = fromRaw && fromRaw.length >= 26 ? getAddress('0x' + fromRaw.slice(-40)) : null;
          const toAddr = toRaw && toRaw.length >= 26 ? getAddress('0x' + toRaw.slice(-40)) : null;

          // For minting, fromAddr MUST be the zero address
          if (fromAddr === '0x0000000000000000000000000000000000000000') {
            const id = BigInt(idRaw).toString();
            agentIds.add(id);
            if (toAddr) {
              agentOwners.add(toAddr);
            }
          }
        } catch {
          // Log decode error
        }
      }
    }
  }

  if (agentIds.size === 0) {
    return {
      verified: false,
      agentId: null,
      agentIdBigInt: null,
      owner: null,
      agentURI: null,
      registryAddress: targetRegistry,
      transactionHash: txHash,
      blockNumber,
      attributionTag: expectedTag,
      hasExpectedAttribution,
      status: 'NO_REGISTRATION_EVENT',
      reason: 'No valid ERC-8004 Registered or ERC-721 mint event found in registry logs.'
    };
  }

  if (agentIds.size > 1) {
    return {
      verified: false,
      agentId: null,
      agentIdBigInt: null,
      owner: null,
      agentURI: null,
      registryAddress: targetRegistry,
      transactionHash: txHash,
      blockNumber,
      attributionTag: expectedTag,
      hasExpectedAttribution,
      status: 'AMBIGUOUS_EVENTS',
      reason: `Multiple distinct agent IDs found in registry logs: [${Array.from(agentIds).join(', ')}].`
    };
  }

  const resolvedAgentId = Array.from(agentIds)[0];
  const resolvedOwner = Array.from(agentOwners)[0] || null;
  const resolvedUri = Array.from(agentUris)[0] || null;

  if (resolvedOwner && resolvedOwner !== expectedWallet) {
    return {
      verified: false,
      agentId: resolvedAgentId,
      agentIdBigInt: BigInt(resolvedAgentId),
      owner: resolvedOwner,
      agentURI: resolvedUri,
      registryAddress: targetRegistry,
      transactionHash: txHash,
      blockNumber,
      attributionTag: expectedTag,
      hasExpectedAttribution,
      status: 'INVALID_SENDER',
      reason: `Minted token owner ('${resolvedOwner}') does not match expected agent wallet ('${expectedWallet}').`
    };
  }

  return {
    verified: true,
    agentId: resolvedAgentId,
    agentIdBigInt: BigInt(resolvedAgentId),
    owner: resolvedOwner || expectedWallet,
    agentURI: resolvedUri,
    registryAddress: targetRegistry,
    transactionHash: txHash,
    blockNumber,
    attributionTag: expectedTag,
    hasExpectedAttribution: transaction?.input ? hasExpectedAttribution : true,
    status: 'VERIFIED'
  };
}
