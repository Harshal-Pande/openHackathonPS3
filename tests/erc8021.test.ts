import { describe, it, expect, vi } from 'vitest';
import {
  CeloAttributionService,
  OFFICIAL_CELO_ATTRIBUTION_TAG,
  REQUIRED_CELO_CHAIN_ID,
  OFFICIAL_AGENT_WALLET_ADDRESS,
  EXPECTED_ATTRIBUTION_SUFFIX_HEX,
  ERC8021_SCHEMA_0_ID,
  ERC8021_MARKER_HEX,
  validateAttributionTag,
  getConfiguredAttributionTag,
  classifyOperation,
  AttributionError,
  ERC8004_IDENTITY_REGISTRY_ABI
} from '../src/server/services/celoAttributionService.js';
import {
  toDataSuffix,
  fromDataSuffix,
  toRoleDataSuffix,
  ERC_8021_MARKER,
  codeFromRepo,
  codeFromHostname
} from '@celo/attribution-tags';
import { encodeFunctionData, decodeFunctionData, parseAbi, concat, createWalletClient, custom, type Hex } from 'viem';
import { celo } from 'viem/chains';
import { loadConfig, validatePublicBaseUrl } from '../src/server/config.js';
import { validateAgentWalletAddress } from '../src/server/config/attribution.js';
import { buildApp } from '../src/server/app.js';
import { ChainstackProvider } from '../src/server/providers/chainstack.js';

describe('MOD-04: ERC-8021 Attribution Engine & Celo SDK Integration', () => {
  const service = new CeloAttributionService();
  const validAgentWallet = OFFICIAL_AGENT_WALLET_ADDRESS;

  // =========================================================================
  // 1. Tag Validation Tests (PART 7.2)
  // =========================================================================
  describe('1. Tag Validation & Configuration Constraints', () => {
    it('accepts the exact official assigned hackathon tag', () => {
      const result = validateAttributionTag(OFFICIAL_CELO_ATTRIBUTION_TAG);
      expect(result.valid).toBe(true);
      expect(service.getConfiguredAttributionTag()).toBe('celo_235f6ef56f5b');
      expect(getConfiguredAttributionTag()).toBe('celo_235f6ef56f5b');
    });

    it('rejects empty or whitespace-only tags', () => {
      expect(validateAttributionTag('').valid).toBe(false);
      expect(validateAttributionTag('   ').valid).toBe(false);
      expect(() => new CeloAttributionService('')).toThrow(AttributionError);
    });

    it('rejects tags with uppercase characters', () => {
      const upper = 'CELO_235F6EF56F5B';
      const result = validateAttributionTag(upper);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('must match');
      expect(() => new CeloAttributionService(upper)).toThrow(AttributionError);
    });

    it('rejects tags containing spaces', () => {
      expect(validateAttributionTag('celo 235f6ef56f5b').valid).toBe(false);
      expect(validateAttributionTag('celo_tag ').valid).toBe(false);
    });

    it('rejects tags containing commas or invalid punctuation', () => {
      expect(validateAttributionTag('celo,tag').valid).toBe(false);
      expect(validateAttributionTag('celo-tag').valid).toBe(false);
      expect(validateAttributionTag('celo.tag').valid).toBe(false);
      expect(validateAttributionTag('celo@tag').valid).toBe(false);
    });

    it('rejects tags exceeding 32 characters in length', () => {
      const longTag = 'celo_' + 'a'.repeat(30); // 35 chars
      const result = validateAttributionTag(longTag);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('exceeds maximum 32 bytes');
    });

    it('rejects unexpected non-ASCII or Unicode characters', () => {
      expect(validateAttributionTag('celo_🎉').valid).toBe(false);
      expect(validateAttributionTag('celo_é').valid).toBe(false);
    });

    it('forbids substituting an unauthorized tag during service initialization', () => {
      expect(() => new CeloAttributionService('celo_unauthorized123')).toThrowError(
        /does not match official hackathon tag/
      );
    });

    it('enforces exact tag match in production configuration loading', () => {
      expect(() =>
        loadConfig({
          NODE_ENV: 'production',
          SESSION_SECRET: 'a'.repeat(64),
          OPERATOR_PASSWORD_HASH: 'scrypt$16384$8$1$c2FsdHNhbHQxMjM0NTY3OA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
          RATE_LIMIT_INVESTIGATIONS_MAX: '50',
          RATE_LIMIT_INVESTIGATIONS_WINDOW_MS: '60000',
          DATABASE_PATH: './test.sqlite',
          CORS_ORIGIN: 'https://example.com',
          CHAINSTACK_CELO_HTTP_URL: 'https://rpc.example.com',
          CELO_ATTRIBUTION_TAG: 'celo_wrong_tag_123'
        })
      ).toThrowError(/CELO_ATTRIBUTION_TAG must match the official hackathon tag/);
    });

    it('documents the discrepancy between repo-derived code and portal-assigned tag', () => {
      // The official SDK computes a tag from repo slug via SHA-256
      const derivedCode = codeFromRepo('Harshal-Pande/openHackathonPS3');
      expect(derivedCode).toBe('celo_655a3d2b2db2');

      // The hackathon organizers assigned 'celo_235f6ef56f5b' at registration time
      // The assigned tag MUST remain authoritative per PART 4.3 instructions
      expect(OFFICIAL_CELO_ATTRIBUTION_TAG).toBe('celo_235f6ef56f5b');
      expect(derivedCode).not.toBe(OFFICIAL_CELO_ATTRIBUTION_TAG);
    });
  });

  // =========================================================================
  // 2. Encoding & Wire Format Tests (PART 7.3)
  // =========================================================================
  describe('2. Encoding & Wire Format Determinism', () => {
    it('generates the exact byte-for-byte expected ERC-8021 hex suffix', () => {
      const generatedSuffix = service.createAttributionSuffix();
      expect(generatedSuffix).toBe(EXPECTED_ATTRIBUTION_SUFFIX_HEX);
      expect(service.getDataSuffix()).toBe(EXPECTED_ATTRIBUTION_SUFFIX_HEX);

      // Verify exact expected vector
      // 0x63656c6f5f323335663665663536663562 (17 bytes: ASCII 'celo_235f6ef56f5b')
      // 11 (1 byte: length 17 in hex)
      // 00 (1 byte: schemaId 0)
      // 80218021802180218021802180218021 (16 bytes: ERC-8021 marker)
      expect(EXPECTED_ATTRIBUTION_SUFFIX_HEX).toBe(
        '0x63656c6f5f323335663665663536663562110080218021802180218021802180218021'
      );
    });

    it('verifies exact wire format component lengths and marker bytes', () => {
      const hex = EXPECTED_ATTRIBUTION_SUFFIX_HEX.slice(2);
      expect(hex.length).toBe(70); // 35 bytes = 70 hex characters

      const asciiHex = hex.slice(0, 34); // 17 bytes
      const lengthHex = hex.slice(34, 36); // 1 byte
      const schemaHex = hex.slice(36, 38); // 1 byte
      const markerHex = hex.slice(38, 70); // 16 bytes

      expect(Buffer.from(asciiHex, 'hex').toString('ascii')).toBe('celo_235f6ef56f5b');
      expect(parseInt(lengthHex, 16)).toBe(17);
      expect(parseInt(schemaHex, 16)).toBe(ERC8021_SCHEMA_0_ID);
      expect('0x' + markerHex).toBe(ERC_8021_MARKER);
    });

    it('decodes the generated assigned-tag suffix via fromDataSuffix', () => {
      const decoded = service.decodeAttributionData(EXPECTED_ATTRIBUTION_SUFFIX_HEX);
      expect(decoded).not.toBeNull();
      expect(decoded?.schemaId).toBe(0);
      expect(decoded?.codes).toEqual(['celo_235f6ef56f5b']);
    });

    it('identifies expected tag presence accurately via hasExpectedAttribution', () => {
      const check = service.hasExpectedAttribution(EXPECTED_ATTRIBUTION_SUFFIX_HEX);
      expect(check.status).toBe('TAGGED_CORRECTLY');
      expect(check.hasExpectedTag).toBe(true);
      expect(check.codes).toContain('celo_235f6ef56f5b');
      expect(check.schemaId).toBe(0);
    });

    it('distinguishes wrong attribution when calldata contains other valid tags', () => {
      const otherSuffix = toDataSuffix('celo_otherapp123');
      const check = service.hasExpectedAttribution(otherSuffix);
      expect(check.status).toBe('WRONG_ATTRIBUTION');
      expect(check.hasExpectedTag).toBe(false);
      expect(check.codes).toEqual(['celo_otherapp123']);
      expect(check.reason).toContain('missing expected official tag');
    });

    it('distinguishes absence of attribution from malformed suffixes', () => {
      // Clean calldata without suffix
      const noAttr = service.hasExpectedAttribution('0x12345678');
      expect(noAttr.status).toBe('NO_ATTRIBUTION');
      expect(noAttr.hasExpectedTag).toBe(false);

      // Calldata ending with marker but having corrupted schema or length
      const malformed = ('0x12345678' + 'ff' + 'ff' + ERC_8021_MARKER.slice(2)) as `0x${string}`;
      const malformedCheck = service.hasExpectedAttribution(malformed);
      expect(malformedCheck.status).toBe('MALFORMED_SUFFIX');
      expect(malformedCheck.hasExpectedTag).toBe(false);
      expect(malformedCheck.reason).toContain('terminates with ERC-8021 marker but contains malformed');
    });

    it('produces repeatable, deterministic output across repeated invocations', () => {
      const first = service.createAttributionSuffix();
      for (let i = 0; i < 50; i++) {
        expect(service.createAttributionSuffix()).toBe(first);
      }
    });
  });

  // =========================================================================
  // 3. Calldata Preservation & Idempotency Tests (PART 7.4)
  // =========================================================================
  describe('3. Calldata Preservation & Idempotency', () => {
    it('tags empty or missing calldata safely with bare suffix', () => {
      const fromEmpty = service.appendAttribution('');
      const fromUndefined = service.appendAttribution(undefined);
      const fromHexZero = service.appendAttribution('0x');

      expect(fromEmpty).toBe(EXPECTED_ATTRIBUTION_SUFFIX_HEX);
      expect(fromUndefined).toBe(EXPECTED_ATTRIBUTION_SUFFIX_HEX);
      expect(fromHexZero).toBe(EXPECTED_ATTRIBUTION_SUFFIX_HEX);
    });

    it('strictly preserves original contract calldata as exact byte prefix', () => {
      const abi = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);
      const originalCalldata = encodeFunctionData({
        abi,
        functionName: 'transfer',
        args: ['0x1234567890123456789012345678901234567890', 1000000000000000000n]
      });

      const tagged = service.appendAttribution(originalCalldata);

      // Verify original calldata is byte-for-byte intact as prefix
      expect(tagged.startsWith(originalCalldata)).toBe(true);

      // Verify suffix is appended after original calldata
      const expectedSuffixNoPrefix = EXPECTED_ATTRIBUTION_SUFFIX_HEX.slice(2);
      expect(tagged.endsWith(expectedSuffixNoPrefix)).toBe(true);

      // Total length = original length + suffix length
      expect(tagged.length).toBe(originalCalldata.length + expectedSuffixNoPrefix.length);

      // Decodes cleanly
      const decoded = fromDataSuffix(tagged);
      expect(decoded?.codes).toEqual(['celo_235f6ef56f5b']);
    });

    it('handles short non-empty calldata safely', () => {
      const short = '0x12';
      const tagged = service.appendAttribution(short);
      expect(tagged.startsWith(short)).toBe(true);
      expect(service.hasExpectedAttribution(tagged).hasExpectedTag).toBe(true);
    });

    it('handles large contract bytecode/calldata within bounds safely', () => {
      const largeCalldata = '0x' + 'ab'.repeat(2048); // 2048 bytes
      const tagged = service.appendAttribution(largeCalldata);
      expect(tagged.startsWith(largeCalldata)).toBe(true);
      expect(service.hasExpectedAttribution(tagged).hasExpectedTag).toBe(true);
    });

    it('is strictly idempotent when calldata already has the exact official tag', () => {
      const original = '0xa9059cbb11223344';
      const firstPass = service.appendAttribution(original);
      const secondPass = service.appendAttribution(firstPass);
      const thirdPass = service.appendAttribution(secondPass);

      expect(secondPass).toBe(firstPass);
      expect(thirdPass).toBe(firstPass);
      expect(firstPass.length).toBe(original.length + EXPECTED_ATTRIBUTION_SUFFIX_HEX.length - 2);

      const decoded = fromDataSuffix(thirdPass);
      expect(decoded?.codes).toEqual(['celo_235f6ef56f5b']);
    });

    it('merges codes idempotently when calldata already contains a different Schema 0 tag', () => {
      const otherTag = 'celo_partnerapp';
      const otherSuffix = toDataSuffix(otherTag);
      const original = '0xa9059cbb11223344' + otherSuffix.slice(2);

      const merged = service.appendAttribution(original);

      // Decoded result contains BOTH the existing tag and our official tag
      const decoded = fromDataSuffix(merged);
      expect(decoded?.schemaId).toBe(0);
      expect(decoded?.codes).toContain(otherTag);
      expect(decoded?.codes).toContain('celo_235f6ef56f5b');
      expect(decoded?.codes.length).toBe(2);

      // Calling appendAttribution again does not add duplicate tags
      const doubleMerged = service.appendAttribution(merged);
      const doubleDecoded = fromDataSuffix(doubleMerged);
      expect(doubleDecoded?.codes.length).toBe(2);
    });

    it('refuses to silently omit official tag when input has Schema 2 role-based attribution without tag (DEF-54)', () => {
      const s2Suffix = toRoleDataSuffix({ app: 'test_app', wallet: 'test_wallet' });
      const original = '0xa9059cbb11223344' + s2Suffix.slice(2);

      expect(() => service.appendAttribution(original)).toThrowError(
        /Cannot merge Schema 0 hackathon tag/
      );
    });

    it('preserves Schema 2 role-based attribution if it already contains the official hackathon tag', () => {
      const s2Suffix = toRoleDataSuffix({ app: 'celo_235f6ef56f5b', wallet: 'test_wallet' });
      const original = ('0xa9059cbb11223344' + s2Suffix.slice(2)) as `0x${string}`;

      const tagged = service.appendAttribution(original);
      expect(tagged).toBe(original);
      const decoded = fromDataSuffix(tagged);
      expect(decoded?.schemaId).toBe(2);
      expect(decoded?.codes).toContain('celo_235f6ef56f5b');
    });
  });

  // =========================================================================
  // 4. Transaction Field & Caller Immutability Tests (PART 7.5)
  // =========================================================================
  describe('4. Transaction Field Preservation & Caller Immutability', () => {
    it('does not mutate caller transaction object and preserves all fields', () => {
      const originalTx = {
        to: '0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0' as `0x${string}`,
        from: validAgentWallet,
        value: 1250000000000000000n,
        data: '0xa9059cbb11223344' as `0x${string}`,
        chainId: 42220,
        gasLimit: 500000n
      };

      // Deep copy to check immutability
      const snapshot = JSON.stringify(originalTx, (_, v) => (typeof v === 'bigint' ? v.toString() : v));

      const prepared = service.prepareTaggedTransaction(originalTx);

      // Verify caller object was NOT mutated
      const afterSnapshot = JSON.stringify(originalTx, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
      expect(afterSnapshot).toBe(snapshot);

      // Verify returned fields are preserved
      expect(prepared.to).toBe(originalTx.to);
      expect(prepared.from).toBe(originalTx.from);
      expect(prepared.value).toBe(originalTx.value);
      expect(prepared.chainId).toBe(REQUIRED_CELO_CHAIN_ID);
      expect(prepared.gasLimit).toBe(originalTx.gasLimit);
      expect(prepared.attributionTag).toBe('celo_235f6ef56f5b');
      expect(prepared.data.startsWith(originalTx.data)).toBe(true);
      expect(prepared.verifiedCodes).toContain('celo_235f6ef56f5b');
    });

    it('rejects transactions targeting non-Celo-Mainnet chains', () => {
      expect(() =>
        service.prepareTaggedTransaction({
          to: '0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0',
          chainId: 1 // Ethereum Mainnet
        })
      ).toThrowError(/strictly requires Celo Mainnet \(42220\)/);

      expect(() =>
        service.prepareTaggedTransaction({
          to: '0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0',
          chainId: 44787 // Alfajores Testnet
        })
      ).toThrowError(/strictly requires Celo Mainnet \(42220\)/);
    });

    it('rejects transactions with invalid or malformed recipient address', () => {
      expect(() =>
        service.prepareTaggedTransaction({
          // @ts-expect-error testing invalid address
          to: '0xinvalid',
          chainId: 42220
        })
      ).toThrowError(/Invalid or missing destination address/);
    });

    it('rejects transactions with invalid sender address if provided', () => {
      expect(() =>
        service.prepareTaggedTransaction({
          to: '0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0',
          // @ts-expect-error testing invalid sender address
          from: '0xbad_sender',
          chainId: 42220
        })
      ).toThrowError(/Invalid sender address/);
    });
  });

  // =========================================================================
  // 5. viem Wallet Client Extension Tests (PART 7.6)
  // =========================================================================
  describe('5. viem Wallet Client Extension Compatibility', () => {
    it('applies attribution to sendTransaction and writeContract via withAttribution', async () => {
      let capturedRequest: any = null;

      // Mock transport capturing requests without sending real transactions or needing private keys
      const mockTransport = custom({
        async request({ method, params }: any) {
          if (method === 'eth_chainId') {
            return '0xa4ec'; // 42220
          }
          if (method === 'eth_estimateGas') {
            return '0x5208'; // 21000
          }
          if (method === 'eth_gasPrice') {
            return '0x3b9aca00'; // 1 gwei
          }
          if (method === 'eth_sendTransaction') {
            capturedRequest = params[0];
            return '0x1111111111111111111111111111111111111111111111111111111111111111';
          }
          return null;
        }
      });

      const client = createWalletClient({
        chain: celo,
        transport: mockTransport,
        account: validAgentWallet
      }).extend(service.getWalletClientExtension());

      // 1. Plain native token transfer with no data
      await client.sendTransaction({
        to: '0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0',
        value: 1000000000000000000n
      });

      expect(capturedRequest).not.toBeNull();
      expect(capturedRequest.data).toBe(EXPECTED_ATTRIBUTION_SUFFIX_HEX);
      expect(service.hasExpectedAttribution(capturedRequest.data).hasExpectedTag).toBe(true);

      // 2. Contract call with existing calldata
      const originalData = '0xa9059cbb000000000000000000000000d0bebd199e4a115c4ddd04351e57913b2fe9b6a0';
      await client.sendTransaction({
        to: '0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0',
        data: originalData
      });

      expect(capturedRequest.data.startsWith(originalData)).toBe(true);
      expect(capturedRequest.data.endsWith(EXPECTED_ATTRIBUTION_SUFFIX_HEX.slice(2))).toBe(true);
      expect(service.hasExpectedAttribution(capturedRequest.data).hasExpectedTag).toBe(true);
    });
  });

  // =========================================================================
  // 6. Request Classification Tests (PART 7.7)
  // =========================================================================
  describe('6. Request Classification & Operation Isolation Matrix', () => {
    const classificationMatrix = [
      { operation: 'sendTransaction', expectedCategory: 'CATEGORY_A_OUTGOING_TX', shouldTag: true },
      { operation: 'writeContract', expectedCategory: 'CATEGORY_A_OUTGOING_TX', shouldTag: true },
      { operation: 'prepareTaggedTransaction', expectedCategory: 'CATEGORY_A_OUTGOING_TX', shouldTag: true },
      { operation: 'native_transfer', expectedCategory: 'CATEGORY_A_OUTGOING_TX', shouldTag: true },
      { operation: 'erc20_transfer', expectedCategory: 'CATEGORY_A_OUTGOING_TX', shouldTag: true },
      { operation: 'eth_call', expectedCategory: 'CATEGORY_B_READ_ONLY_RPC', shouldTag: false },
      { operation: 'eth_getTransactionReceipt', expectedCategory: 'CATEGORY_B_READ_ONLY_RPC', shouldTag: false },
      { operation: 'eth_getTransactionByHash', expectedCategory: 'CATEGORY_B_READ_ONLY_RPC', shouldTag: false },
      { operation: 'eth_getBlockByNumber', expectedCategory: 'CATEGORY_B_READ_ONLY_RPC', shouldTag: false },
      { operation: 'eth_getBlockByHash', expectedCategory: 'CATEGORY_B_READ_ONLY_RPC', shouldTag: false },
      { operation: 'debug_traceTransaction', expectedCategory: 'CATEGORY_B_READ_ONLY_RPC', shouldTag: false },
      { operation: 'eth_chainId', expectedCategory: 'CATEGORY_B_READ_ONLY_RPC', shouldTag: false },
      { operation: 'eth_blockNumber', expectedCategory: 'CATEGORY_B_READ_ONLY_RPC', shouldTag: false },
      { operation: 'eth_getBalance', expectedCategory: 'CATEGORY_B_READ_ONLY_RPC', shouldTag: false },
      { operation: 'eth_getCode', expectedCategory: 'CATEGORY_B_READ_ONLY_RPC', shouldTag: false },
      { operation: 'ChainstackProvider', expectedCategory: 'CATEGORY_B_READ_ONLY_RPC', shouldTag: false },
      { operation: 'buy_cli', expectedCategory: 'CATEGORY_C_HTTP_PAYMENT', shouldTag: false },
      { operation: 'x402_payment', expectedCategory: 'CATEGORY_C_HTTP_PAYMENT', shouldTag: false },
      { operation: 'cencori_chat_completions', expectedCategory: 'CATEGORY_C_HTTP_PAYMENT', shouldTag: false },
      { operation: 'cencori_quote', expectedCategory: 'CATEGORY_C_HTTP_PAYMENT', shouldTag: false },
      { operation: 'cencori_execute', expectedCategory: 'CATEGORY_C_HTTP_PAYMENT', shouldTag: false },
      { operation: 'sqlite_write', expectedCategory: 'CATEGORY_D_INTERNAL', shouldTag: false },
      { operation: 'report_export', expectedCategory: 'CATEGORY_D_INTERNAL', shouldTag: false },
      { operation: 'internal_api', expectedCategory: 'CATEGORY_D_INTERNAL', shouldTag: false }
    ];

    for (const testCase of classificationMatrix) {
      it(`correctly classifies "${testCase.operation}" -> ${testCase.expectedCategory} (Tag: ${testCase.shouldTag})`, () => {
        const classified = classifyOperation(testCase.operation);
        expect(classified.category).toBe(testCase.expectedCategory);
        expect(classified.shouldAddAttribution).toBe(testCase.shouldTag);
      });
    }
  });

  // =========================================================================
  // 7. Read-Only RPC Invariant & Protection Tests (PART 6.7)
  // =========================================================================
  describe('7. Read-Only RPC Strict Exclusion Invariant', () => {
    it('throws ILLEGAL_READ_ONLY_TAGGING if ERC-8021 marker is injected into read-only RPC methods', () => {
      const taintedPayload = '0x12345678' + ERC_8021_MARKER;

      expect(() => CeloAttributionService.assertReadOnlyRpcUntagged('eth_call', taintedPayload)).toThrowError(
        /Attempted to inject attribution data suffix into read-only RPC method 'eth_call'/
      );

      expect(() => CeloAttributionService.assertReadOnlyRpcUntagged('debug_traceTransaction', taintedPayload)).toThrowError(
        /Attempted to inject attribution data suffix into read-only RPC method 'debug_traceTransaction'/
      );

      expect(() => CeloAttributionService.assertReadOnlyRpcUntagged('eth_getTransactionReceipt', taintedPayload)).toThrowError(
        /Attempted to inject attribution data suffix into read-only RPC method 'eth_getTransactionReceipt'/
      );

      expect(() => CeloAttributionService.assertReadOnlyRpcUntagged('eth_getTransactionByHash', taintedPayload)).toThrowError(
        /Attempted to inject attribution data suffix into read-only RPC method 'eth_getTransactionByHash'/
      );

      expect(() => CeloAttributionService.assertReadOnlyRpcUntagged('eth_chainId', taintedPayload)).toThrowError(
        /Attempted to inject attribution data suffix into read-only RPC method 'eth_chainId'/
      );
    });

    it('passes standard untainted payloads to read-only RPC methods without throwing', () => {
      expect(() => CeloAttributionService.assertReadOnlyRpcUntagged('eth_call', '0x12345678')).not.toThrow();
      expect(() => CeloAttributionService.assertReadOnlyRpcUntagged('eth_getTransactionReceipt', '0xabcdef')).not.toThrow();
      expect(() => CeloAttributionService.assertReadOnlyRpcUntagged('debug_traceTransaction', '0x000000')).not.toThrow();
    });
  });

  // =========================================================================
  // 8. On-Chain Attribution Verification Tests (PART 7.8)
  // =========================================================================
  describe('8. On-Chain Attribution Verification API (Read-Only)', () => {
    it('verifies on-chain transaction returning VERIFIED when tagged with official tag', async () => {
      const mockClient = {
        getTransaction: vi.fn().mockResolvedValue({
          input: ('0xa9059cbb11223344' + EXPECTED_ATTRIBUTION_SUFFIX_HEX.slice(2)) as `0x${string}`
        })
      };

      const result = await service.verifyOnChainAttribution('0x1234' as `0x${string}`, mockClient);
      expect(result.verified).toBe(true);
      expect(result.status).toBe('VERIFIED');
      expect(result.codes).toContain('celo_235f6ef56f5b');
    });

    it('returns WRONG_TAG when on-chain transaction has attribution but for a different app', async () => {
      const otherSuffix = toDataSuffix('celo_otherpartner');
      const mockClient = {
        getTransaction: vi.fn().mockResolvedValue({
          input: ('0xa9059cbb11223344' + otherSuffix.slice(2)) as `0x${string}`
        })
      };

      const result = await service.verifyOnChainAttribution('0x1234' as `0x${string}`, mockClient);
      expect(result.verified).toBe(false);
      expect(result.status).toBe('WRONG_TAG');
      expect(result.codes).toEqual(['celo_otherpartner']);
      expect(result.reason).toContain('missing expected official tag');
    });

    it('returns NOT_TAGGED when on-chain transaction has no attribution suffix', async () => {
      const mockClient = {
        getTransaction: vi.fn().mockResolvedValue({
          input: '0xa9059cbb11223344'
        })
      };

      const result = await service.verifyOnChainAttribution('0x1234' as `0x${string}`, mockClient);
      expect(result.verified).toBe(false);
      expect(result.status).toBe('NOT_TAGGED');
      expect(result.codes).toEqual([]);
    });

    it('handles RPC errors gracefully with RPC_ERROR status', async () => {
      const mockClient = {
        getTransaction: vi.fn().mockRejectedValue(new Error('Connection timeout to Celo RPC'))
      };

      const result = await service.verifyOnChainAttribution('0x1234' as `0x${string}`, mockClient);
      expect(result.verified).toBe(false);
      expect(result.status).toBe('RPC_ERROR');
      expect(result.reason).toContain('Connection timeout to Celo RPC');
    });
  });

  // =========================================================================
  // 9. ERC-8004 Identity Registration Payload Generation
  // =========================================================================
  describe('9. ERC-8004 Identity Registration Transaction Builder', () => {
    it('builds a valid, decodable ERC-8004 registration transaction payload', () => {
      const regTx = service.buildErc8004RegistrationTransaction({
        agentURI: 'https://revertlens.onrender.com/api/agent/metadata',
        from: validAgentWallet
      });

      expect(regTx.to.toLowerCase()).toBe('0x8004A169FB4a3325136EB29fA0ceB6D2e539a432'.toLowerCase());
      expect(regTx.chainId).toBe(42220);
      expect(regTx.value).toBe(0n);
      expect(regTx.attributionTag).toBe('celo_235f6ef56f5b');
      expect(regTx.data.startsWith('0xf2c298be')).toBe(true); // register(string) selector

      const decoded = fromDataSuffix(regTx.data);
      expect(decoded?.codes).toContain('celo_235f6ef56f5b');
    });

    it('generates standard ERC-8004 agent registration metadata payload', () => {
      const metadata = service.generateErc8004Metadata({
        agentWallet: validAgentWallet,
        baseUrl: 'https://revertlens.onrender.com'
      });

      expect(metadata.name).toBe('RevertLens');
      expect(metadata.chainId).toBe(42220);
      expect(metadata.network).toBe('Celo Mainnet');
      expect(metadata.agentWallet).toBe(validAgentWallet);
      expect(metadata.attributionTag).toBe('celo_235f6ef56f5b');
      expect(metadata.services.length).toBe(3);
      expect(metadata.supportedTrust).toContain('erc8004-identity-v1');
    });
  });

  // =========================================================================
  // 10. Security & Non-Negotiable Invariants (PART 7.9)
  // =========================================================================
  describe('10. Security Invariants & Zero-Spend Boundary', () => {
    it('does not expose private keys, seed phrases, or raw signing credentials', () => {
      const config = loadConfig({ NODE_ENV: 'test' });
      expect((config as any).PRIVATE_KEY).toBeUndefined();
      expect((config as any).MNEMONIC).toBeUndefined();
      expect((config as any).WALLET_KEY).toBeUndefined();
    });

    it('maintains the official agent wallet address across the application', () => {
      const config = loadConfig({ NODE_ENV: 'test' });
      expect(config.AGENT_WALLET_ADDRESS).toBe(OFFICIAL_AGENT_WALLET_ADDRESS);
      expect(config.AGENT_WALLET_ADDRESS).toBe('0x3e1bef07824cd0E076F4907641F0A0EF27898e52');
    });
  });

  // =========================================================================
  // 11. DEF-49: Registration URI Substitution Prevention & Base URL Security
  // =========================================================================
  describe('11. DEF-49: Registration URI Hardening & Base URL Validation', () => {
    const testConfig = loadConfig({
      NODE_ENV: 'test',
      PUBLIC_BASE_URL: 'http://localhost:3000'
    });
    const testApp = buildApp(testConfig);

    it('returns canonical metadata URI and ignores attacker-provided query parameters', async () => {
      const response = await testApp.inject({
        method: 'GET',
        url: '/api/agent/erc8004-registration-tx?agentURI=https://attacker.example/metadata'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // The returned agentURI must strictly be the canonical URL, NOT the attacker URL
      expect(body.data.agentURI).toBe('http://localhost:3000/api/agent/metadata');
      expect(body.data.agentURI).not.toContain('attacker.example');

      // Calldata verification: decode register(string) argument to ensure attacker URL is not encoded
      const calldata = body.data.taggedTransaction.data;
      // Strip ERC-8021 suffix (35 bytes = 70 hex chars) before ABI decoding register(string)
      const baseCalldata = calldata.slice(0, calldata.length - 70);
      const decoded = decodeFunctionData({
        abi: ERC8004_IDENTITY_REGISTRY_ABI,
        data: baseCalldata as `0x${string}`
      });
      expect(decoded.args[0]).toBe('http://localhost:3000/api/agent/metadata');
      expect(decoded.args[0]).not.toContain('attacker.example');
    });

    it('verifies that metadata endpoint and registration URI are in exact agreement', async () => {
      const regResponse = await testApp.inject({
        method: 'GET',
        url: '/api/agent/erc8004-registration-tx'
      });
      const metaResponse = await testApp.inject({
        method: 'GET',
        url: '/api/agent/metadata'
      });

      const regBody = JSON.parse(regResponse.body);
      const metaBody = JSON.parse(metaResponse.body);

      expect(regBody.data.agentURI).toBe('http://localhost:3000/api/agent/metadata');
      const metaEndpointService = metaBody.data.services.find(
        (s: { name: string }) => s.name === 'RevertLens Agent Metadata'
      );
      expect(metaEndpointService).toBeDefined();
      expect(metaEndpointService.endpoint).toBe(regBody.data.agentURI);
    });

    it('validates public base URL in production: requires HTTPS', () => {
      const result = validatePublicBaseUrl('http://revertlens.example.com', true);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('must use https: protocol');
    });

    it('validates public base URL in production: rejects embedded credentials', () => {
      const result = validatePublicBaseUrl('https://admin:secret@revertlens.example.com', true);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('must not contain embedded username or password');
    });

    it('validates public base URL in production: rejects localhost and loopback', () => {
      expect(validatePublicBaseUrl('https://localhost:3000', true).valid).toBe(false);
      expect(validatePublicBaseUrl('https://127.0.0.1:3000', true).valid).toBe(false);
      expect(validatePublicBaseUrl('https://[::1]:3000', true).valid).toBe(false);
    });

    it('validates public base URL in production: rejects private network IP addresses', () => {
      expect(validatePublicBaseUrl('https://10.0.0.1/api', true).valid).toBe(false);
      expect(validatePublicBaseUrl('https://192.168.1.100', true).valid).toBe(false);
      expect(validatePublicBaseUrl('https://172.16.0.5', true).valid).toBe(false);
      expect(validatePublicBaseUrl('https://169.254.169.254', true).valid).toBe(false);
    });

    it('validates public base URL: allows localhost in development and test environments', () => {
      expect(validatePublicBaseUrl('http://localhost:3000', false).valid).toBe(true);
      expect(validatePublicBaseUrl('http://127.0.0.1:3000', false).valid).toBe(true);
    });

    it('normalizes trailing slashes safely without creating double slashes', () => {
      const result = validatePublicBaseUrl('https://revertlens.example.com///', true);
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('https://revertlens.example.com');
    });
  });

  // =========================================================================
  // 12. DEF-50: Explicit RPC Method Classification Matrix
  // =========================================================================
  describe('12. DEF-50: Explicit RPC Method Classification & Isolation', () => {
    it('classifies state-mutating EVM transaction methods as CATEGORY_A_OUTGOING_TX', () => {
      const stateChangingMethods = [
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

      for (const method of stateChangingMethods) {
        const result = classifyOperation(method);
        expect(result.category).toBe('CATEGORY_A_OUTGOING_TX');
        expect(result.shouldAddAttribution).toBe(true);
      }
    });

    it('classifies read-only RPC query methods as CATEGORY_B_READ_ONLY_RPC', () => {
      const readOnlyMethods = [
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

      for (const method of readOnlyMethods) {
        const result = classifyOperation(method);
        expect(result.category).toBe('CATEGORY_B_READ_ONLY_RPC');
        expect(result.shouldAddAttribution).toBe(false);
      }
    });

    it('does NOT use broad eth_* or debug_* prefix rules to misclassify state-changing calls', () => {
      // Prior bug misclassified eth_sendTransaction as read-only because of startsWith('eth_')
      expect(classifyOperation('eth_sendTransaction').category).toBe('CATEGORY_A_OUTGOING_TX');
      expect(classifyOperation('eth_sendRawTransaction').category).toBe('CATEGORY_A_OUTGOING_TX');
      expect(classifyOperation('eth_sendTransaction').shouldAddAttribution).toBe(true);
      expect(classifyOperation('eth_sendRawTransaction').shouldAddAttribution).toBe(true);
    });

    it('classifies HTTP 402 / Buy payment lifecycle operations as CATEGORY_C_HTTP_PAYMENT', () => {
      const buyOps = [
        'buy_cli',
        'buy_whoami',
        'x402_payment',
        'cencori_chat_completions',
        'cencori_quote',
        'cencori_execute',
        'http_402_challenge'
      ];

      for (const op of buyOps) {
        const result = classifyOperation(op);
        expect(result.category).toBe('CATEGORY_C_HTTP_PAYMENT');
        expect(result.shouldAddAttribution).toBe(false);
      }
    });

    it('classifies unknown operations as CATEGORY_UNKNOWN with no assumption of safety', () => {
      const unknownOps = ['eth_customExtensionMethod', 'unknown_rpc_query', 'arbitrary_operation'];
      for (const op of unknownOps) {
        const result = classifyOperation(op);
        expect(result.category).toBe('CATEGORY_UNKNOWN');
        expect(result.shouldAddAttribution).toBe(false);
        expect(result.description).toContain('Unknown operation');
      }
    });
  });

  // =========================================================================
  // 13. DEF-51 & DEF-54: Calldata Validation Fail-Closed & Attribution Merge Safety
  // =========================================================================
  describe('13. DEF-51 & DEF-54: Calldata Validation & Attribution Merge Integrity', () => {
    it('accepts undefined calldata and safely produces bare suffix', () => {
      const tagged = service.appendAttribution(undefined);
      expect(tagged).toBe(EXPECTED_ATTRIBUTION_SUFFIX_HEX);
    });

    it('accepts empty string and 0x and produces bare suffix', () => {
      expect(service.appendAttribution('')).toBe(EXPECTED_ATTRIBUTION_SUFFIX_HEX);
      expect(service.appendAttribution('0x')).toBe(EXPECTED_ATTRIBUTION_SUFFIX_HEX);
    });

    it('preserves valid calldata prefix byte-for-byte', () => {
      const calldata = '0x12345678';
      const tagged = service.appendAttribution(calldata);
      expect(tagged.startsWith(calldata)).toBe(true);
      expect(tagged.endsWith(EXPECTED_ATTRIBUTION_SUFFIX_HEX.slice(2))).toBe(true);
    });

    it('rejects calldata missing the 0x prefix (DEF-51 fail closed)', () => {
      expect(() => service.appendAttribution('12345678')).toThrow(AttributionError);
      expect(() => service.appendAttribution('12345678')).toThrowError(/must start with '0x' prefix/);
    });

    it('rejects odd-length hexadecimal calldata (DEF-51 fail closed)', () => {
      expect(() => service.appendAttribution('0x123')).toThrow(AttributionError);
      expect(() => service.appendAttribution('0x123')).toThrowError(/odd hexadecimal length/);
    });

    it('rejects non-hexadecimal characters in calldata (DEF-51 fail closed)', () => {
      expect(() => service.appendAttribution('0x1234zz')).toThrow(AttributionError);
      expect(() => service.appendAttribution('0x1234zz')).toThrowError(/non-hexadecimal characters/);
    });

    it('handles mixed-case hexadecimal calldata correctly', () => {
      const mixed = '0xAbCdEf01';
      const tagged = service.appendAttribution(mixed);
      expect(tagged.toLowerCase().startsWith('0xabcdef01')).toBe(true);
    });

    it('handles large calldata payloads safely without corruption', () => {
      const largePayload = ('0x' + 'aa'.repeat(5000)) as `0x${string}`;
      const tagged = service.appendAttribution(largePayload);
      expect(tagged.startsWith(largePayload)).toBe(true);
      expect(service.hasExpectedAttribution(tagged).hasExpectedTag).toBe(true);
    });

    it('rejects calldata ending with ERC-8021 marker but having malformed suffix (MALFORMED_SUFFIX)', () => {
      // 16-byte marker attached to invalid/corrupted length and schema bytes
      const corrupted = ('0x12345678' + '9999' + ERC_8021_MARKER.slice(2)) as `0x${string}`;
      expect(() => service.appendAttribution(corrupted)).toThrow(AttributionError);
      expect(() => service.appendAttribution(corrupted)).toThrowError(/malformed ERC-8021 attribution suffix/);
    });

    it('merges multiple Schema 0 attribution tags without duplicating official tag', () => {
      const otherTag = 'celo_otherapp123';
      const firstTagged = service.appendAttribution('0x11223344');
      const decodedFirst = fromDataSuffix(firstTagged);
      expect(decodedFirst?.codes).toEqual(['celo_235f6ef56f5b']);

      // Double-append on already-tagged calldata is idempotent
      const secondTagged = service.appendAttribution(firstTagged);
      expect(secondTagged).toBe(firstTagged);
    });

    it('refuses to merge Schema 0 hackathon tag into Schema 2 role-based attribution without tag (DEF-54)', () => {
      const s2Suffix = toRoleDataSuffix({ app: 'partner_app', wallet: 'partner_wallet' });
      const original = '0x12345678' + s2Suffix.slice(2);

      expect(() => service.appendAttribution(original)).toThrow(AttributionError);
      expect(() => service.appendAttribution(original)).toThrowError(
        /Cannot merge Schema 0 hackathon tag 'celo_235f6ef56f5b' into existing Schema 2 role-based attribution/
      );
    });
  });

  // =========================================================================
  // 14. DEF-52: Structured Read-Only RPC Parameter Guard & Provider Boundary
  // =========================================================================
  describe('14. DEF-52: Structured Read-Only RPC Guard & Boundary Enforcement', () => {
    it('detects attribution marker in direct string payload', () => {
      const tainted = '0x1234' + ERC_8021_MARKER;
      expect(() => CeloAttributionService.assertReadOnlyRpcUntagged('eth_call', tainted)).toThrowError(
        /Attempted to inject attribution data suffix into read-only RPC method/
      );
    });

    it('detects attribution marker in nested array parameter', () => {
      const nestedArray = ['0x123456', ['0xabcdef', '0x9999' + ERC_8021_MARKER]];
      expect(() => CeloAttributionService.assertReadOnlyRpcUntagged('eth_call', nestedArray)).toThrowError(
        /Attempted to inject attribution data suffix into read-only RPC method/
      );
    });

    it('detects attribution marker in nested object parameter', () => {
      const nestedObject = {
        to: '0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0',
        data: '0x12345678' + ERC_8021_MARKER
      };
      expect(() => CeloAttributionService.assertReadOnlyRpcUntagged('eth_call', nestedObject)).toThrowError(
        /Attempted to inject attribution data suffix into read-only RPC method/
      );
    });

    it('detects mixed-case attribution marker case-insensitively', () => {
      const mixedCaseMarker = ERC_8021_MARKER.slice(2).toUpperCase();
      const payload = { call: { data: '0x1234' + mixedCaseMarker } };
      expect(() => CeloAttributionService.assertReadOnlyRpcUntagged('debug_traceTransaction', payload)).toThrowError(
        /Attempted to inject attribution data suffix into read-only RPC method/
      );
    });

    it('fails closed on circular reference objects in read-only RPC payloads', () => {
      const circular: any = { method: 'test' };
      circular.self = circular;
      expect(() => CeloAttributionService.assertReadOnlyRpcUntagged('eth_call', circular)).toThrowError(
        /Circular reference detected/
      );
    });

    it('fails closed on excessively deep payload traversal', () => {
      let deep: any = { val: 'safe' };
      for (let i = 0; i < 15; i++) {
        deep = { child: deep };
      }
      expect(() => CeloAttributionService.assertReadOnlyRpcUntagged('eth_call', deep)).toThrowError(
        /exceeded maximum traversal depth/
      );
    });

    it('does not mutate the investigated payload object', () => {
      const original = { to: '0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0', data: '0x12345678' };
      const originalCopy = JSON.stringify(original);
      CeloAttributionService.assertReadOnlyRpcUntagged('eth_call', original);
      expect(JSON.stringify(original)).toBe(originalCopy);
    });

    it('enforces read-only RPC isolation at ChainstackProvider.callRpc gateway boundary', async () => {
      const provider = new ChainstackProvider({ rpcUrl: 'https://rpc.example.com' });
      const taintedParams = [{ data: '0x1234' + ERC_8021_MARKER }];

      await expect(
        provider.callRpc('eth_call', taintedParams)
      ).rejects.toThrowError(/Attempted to inject attribution data suffix into read-only RPC method/);
    });
  });

  // =========================================================================
  // 15. DEF-53: Official Agent Wallet Invariant & Production Validation
  // =========================================================================
  describe('15. DEF-53: Official Agent Wallet Address Inviolability', () => {
    it('accepts exact official checksummed agent wallet address', () => {
      const result = validateAgentWalletAddress(OFFICIAL_AGENT_WALLET_ADDRESS, true);
      expect(result.valid).toBe(true);
      expect(result.checksummed).toBe(OFFICIAL_AGENT_WALLET_ADDRESS);
    });

    it('accepts lowercase representation of official address and normalizes to checksum', () => {
      const lower = OFFICIAL_AGENT_WALLET_ADDRESS.toLowerCase();
      const result = validateAgentWalletAddress(lower, true);
      expect(result.valid).toBe(true);
      expect(result.checksummed).toBe(OFFICIAL_AGENT_WALLET_ADDRESS);
    });

    it('rejects different valid EVM addresses in production', () => {
      const differentAddress = '0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0';
      const result = validateAgentWalletAddress(differentAddress, true);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('must match official hackathon wallet');
    });

    it('rejects malformed or non-EVM addresses in all environments', () => {
      expect(validateAgentWalletAddress('not-an-address', false).valid).toBe(false);
      expect(validateAgentWalletAddress('0x123', false).valid).toBe(false);
      expect(validateAgentWalletAddress('', false).valid).toBe(false);
    });

    it('enforces official wallet address invariant during production configuration load', () => {
      expect(() =>
        loadConfig({
          NODE_ENV: 'production',
          SESSION_SECRET: 'a'.repeat(64),
          OPERATOR_PASSWORD_HASH:
            'scrypt$v=1$N=16384$r=8$p=1$MTIzNDU2Nzg5MDEyMzQ1Ng==$lz+/lmHQGUWcL7lg4806U5pUvi6ksAUVulQc8tB+0Mw=',
          RATE_LIMIT_INVESTIGATIONS_MAX: '50',
          RATE_LIMIT_INVESTIGATIONS_WINDOW_MS: '60000',
          DATABASE_PATH: './test.sqlite',
          CORS_ORIGIN: 'https://example.com',
          PUBLIC_BASE_URL: 'https://revertlens.example.com',
          AGENT_WALLET_ADDRESS: '0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0' // Different address
        })
      ).toThrowError(/AGENT_WALLET_ADDRESS is invalid: Agent wallet address in production must match official hackathon wallet/);
    });
  });
});
