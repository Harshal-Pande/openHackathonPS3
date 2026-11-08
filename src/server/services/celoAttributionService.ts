import {
  toDataSuffix,
  fromDataSuffix,
  withAttribution,
  verifyTx,
  ERC_8021_MARKER
} from '@celo/attribution-tags';
import { encodeFunctionData, isAddress, type Hex } from 'viem';
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
    stateMutability: 'external',
    type: 'function'
  }
] as const;

export type OperationCategory =
  | 'CATEGORY_A_OUTGOING_TX'
  | 'CATEGORY_B_READ_ONLY_RPC'
  | 'CATEGORY_C_HTTP_PAYMENT'
  | 'CATEGORY_D_INTERNAL'
  | 'CATEGORY_UNKNOWN';

export interface RequestClassification {
  operation: string;
  category: OperationCategory;
  shouldAddAttribution: boolean;
  description: string;
}

/**
 * Authoritative operation classifier separating state-mutating EVM transactions
 * from read-only RPC calls, HTTP payment requests, and internal operations.
 *
 * Security Invariants (DEF-50):
 * - Explicit allowlists for each category; never uses broad prefix wildcards (e.g. eth_*).
 * - Outgoing state-mutating EVM transactions have shouldAddAttribution: true.
 * - Read-only RPC, HTTP payment, and internal operations have shouldAddAttribution: false.
 * - Unrecognized operations are classified as CATEGORY_UNKNOWN with no assumption of safety.
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
      description: 'Internal backend/frontend operation (SQLite persistence, report formatting, exports); untagged.'
    };
  }

  // Unknown operations fail closed to CATEGORY_UNKNOWN with no assumption of safety
  return {
    operation: op,
    category: 'CATEGORY_UNKNOWN',
    shouldAddAttribution: false,
    description: `Unknown operation '${op}'; not recognized in allowlists, no safety assumption.`
  };
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

export interface Erc8004AgentMetadata {
  type: string;
  name: string;
  description: string;
  image?: string;
  network: string;
  chainId: number;
  agentWallet: `0x${string}`;
  attributionTag: string;
  services: Array<{
    name: string;
    endpoint: string;
    version: string;
  }>;
  supportedTrust: string[];
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
   */
  public appendAttribution(calldata?: string): `0x${string}` {
    let base: `0x${string}`;

    if (calldata === undefined) {
      base = '0x';
    } else if (typeof calldata !== 'string') {
      throw new AttributionError('Calldata must be a string or undefined.', 'INVALID_CALLDATA');
    } else {
      const trimmed = calldata.trim();
      if (trimmed === '' || trimmed === '0x') {
        base = '0x';
      } else {
        if (!trimmed.startsWith('0x')) {
          throw new AttributionError("Calldata must start with '0x' prefix.", 'INVALID_CALLDATA');
        }
        if (trimmed.length % 2 !== 0) {
          throw new AttributionError(
            `Calldata '${trimmed}' has odd hexadecimal length (${trimmed.length - 2} nibbles).`,
            'INVALID_CALLDATA'
          );
        }
        if (!/^0x[0-9a-fA-F]+$/.test(trimmed)) {
          throw new AttributionError('Calldata contains non-hexadecimal characters.', 'INVALID_CALLDATA');
        }
        base = trimmed as `0x${string}`;
      }
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
      attributionTag: this.officialTag,
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

    const cleanBaseUrl = params.baseUrl.replace(/\/+$/, '');

    return {
      type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
      name: 'RevertLens',
      description: 'Evidence-backed forensic investigation of failed Celo transactions, including execution traces, revert reasons, causal propagation analysis and evidence-led reports.',
      image: `${cleanBaseUrl}/assets/revertlens-banner.png`,
      network: 'Celo Mainnet',
      chainId: REQUIRED_CELO_CHAIN_ID,
      agentWallet: params.agentWallet,
      attributionTag: this.officialTag,
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
}
