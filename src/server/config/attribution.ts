import { toDataSuffix, fromDataSuffix, ERC_8021_MARKER } from '@celo/attribution-tags';

/**
 * Official Hackathon Attribution Configuration
 * 
 * Central authoritative configuration for Celo ERC-8021 attribution tagging.
 * Hackathon: Agents on Open Rails Hackathon 2026 (Track PS3: Build with Buy)
 */

export const OFFICIAL_CELO_ATTRIBUTION_TAG = 'celo_235f6ef56f5b' as const;
export const REQUIRED_CELO_CHAIN_ID = 42220 as const;
export const OFFICIAL_AGENT_WALLET_ADDRESS = '0x3e1bef07824cd0E076F4907641F0A0EF27898e52' as const;

export const ERC8021_SCHEMA_0_ID = 0 as const;
export const ERC8021_MARKER_HEX = ERC_8021_MARKER as '0x80218021802180218021802180218021';

export const ERC8004_IDENTITY_REGISTRY_CELO_MAINNET = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;
export const ERC8004_REPUTATION_REGISTRY_CELO_MAINNET = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63' as const;

/**
 * Exact pre-computed wire format for 'celo_235f6ef56f5b' (Schema 0):
 * - ASCII 'celo_235f6ef56f5b' (17 bytes / 0x11): 63656c6f5f323335663665663536663562
 * - Length byte: 11
 * - Schema ID byte: 00
 * - ERC marker (16 bytes): 80218021802180218021802180218021
 * Total bytes: 35 bytes (70 hex characters + '0x' prefix)
 */
export const EXPECTED_ATTRIBUTION_SUFFIX_HEX =
  '0x63656c6f5f323335663665663536663562110080218021802180218021802180218021' as const;

/**
 * Validates attribution code format per official @celo/attribution-tags specification:
 * Must match /^[a-z0-9_]{1,32}$/ (no spaces, no commas, no uppercase characters, 1-32 chars).
 */
export const ATTRIBUTION_CODE_REGEX = /^[a-z0-9_]{1,32}$/;

export function validateAttributionTag(tag: unknown): { valid: boolean; reason?: string } {
  if (typeof tag !== 'string' || tag.trim().length === 0) {
    return { valid: false, reason: 'Attribution tag must be a non-empty string.' };
  }
  if (tag.length > 32) {
    return { valid: false, reason: `Attribution tag length (${tag.length}) exceeds maximum 32 bytes allowed by ERC-8021.` };
  }
  if (!ATTRIBUTION_CODE_REGEX.test(tag)) {
    return {
      valid: false,
      reason: `Attribution tag "${tag}" is invalid: must match /^[a-z0-9_]{1,32}$/ (lowercase alphanumeric and underscore only, no spaces or uppercase).`
    };
  }
  return { valid: true };
}

/**
 * Returns the immutable configured attribution tag.
 */
export function getConfiguredAttributionTag(): string {
  return OFFICIAL_CELO_ATTRIBUTION_TAG;
}
