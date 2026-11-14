import { createClient, chains, createAccount } from 'genlayer-js';
import { parseEther, formatEther, type Address } from 'viem';

export const STUDIONET_CHAIN_ID = 61999;
export const STUDIONET_CHAIN_ID_HEX = '0xf22f';
export const STUDIONET_RPC_URL =
  process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || 'https://studio.genlayer.com/api';
export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  '0xbB14bFF145C3422f05a51ccD515dbeF770435815') as Address;
export const DEPLOYMENT_TX_HASH =
  process.env.NEXT_PUBLIC_DEPLOYMENT_TX_HASH ||
  '0x759af5933f3f6c93971490f790be8f5e4d25d88b48f758a07902fdd307432526';

export interface Market {
  id: number;
  creator: string;
  question: string;
  resolution_source_url: string;
  resolution_rules: string;
  deadline_iso: string;
  yes_pool: string;
  no_pool: string;
  status: 'OPEN' | 'RESOLVED';
  outcome: 'PENDING' | 'YES' | 'NO';
  resolution_rationale: string;
  total_positions: number;
  yes_probability: number;
  no_probability: number;
}

export interface ProtocolStats {
  total_markets: number;
  open_markets: number;
  resolved_markets: number;
  total_volume_locked: string;
}

export interface UserPosition {
  market_id: number;
  user_address: string;
  yes_stake: string;
  no_stake: string;
  claimed: boolean;
  claimable_payout: string;
}

// Read-only client singleton connected to Studionet
export function getReadOnlyClient() {
  return createClient({
    chain: chains.studionet,
    endpoint: STUDIONET_RPC_URL,
  });
}

// Fetch all live markets directly from contract state
export async function fetchAllMarkets(): Promise<Market[]> {
  const client = getReadOnlyClient();
  const rawMarkets = (await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: 'get_all_markets',
    args: [],
  })) as any[];

  return rawMarkets.map((m) => ({
    id: Number(m.id),
    creator: String(m.creator),
    question: String(m.question),
    resolution_source_url: String(m.resolution_source_url),
    resolution_rules: String(m.resolution_rules),
    deadline_iso: String(m.deadline_iso),
    yes_pool: String(m.yes_pool),
    no_pool: String(m.no_pool),
    status: m.status as 'OPEN' | 'RESOLVED',
    outcome: m.outcome as 'PENDING' | 'YES' | 'NO',
    resolution_rationale: String(m.resolution_rationale || ''),
    total_positions: Number(m.total_positions),
    yes_probability: Number(m.yes_probability),
    no_probability: Number(m.no_probability),
  }));
}

// Fetch a single market by ID
export async function fetchMarket(id: number): Promise<Market> {
  const client = getReadOnlyClient();
  const m = (await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: 'get_market',
    args: [BigInt(id)],
  })) as any;

  return {
    id: Number(m.id),
    creator: String(m.creator),
    question: String(m.question),
    resolution_source_url: String(m.resolution_source_url),
    resolution_rules: String(m.resolution_rules),
    deadline_iso: String(m.deadline_iso),
    yes_pool: String(m.yes_pool),
    no_pool: String(m.no_pool),
    status: m.status as 'OPEN' | 'RESOLVED',
    outcome: m.outcome as 'PENDING' | 'YES' | 'NO',
    resolution_rationale: String(m.resolution_rationale || ''),
    total_positions: Number(m.total_positions),
    yes_probability: Number(m.yes_probability),
    no_probability: Number(m.no_probability),
  };
}

// Fetch protocol telemetry statistics
export async function fetchStats(): Promise<ProtocolStats> {
  const client = getReadOnlyClient();
  const raw = (await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: 'get_stats',
    args: [],
  })) as any;

  return {
    total_markets: Number(raw.total_markets),
    open_markets: Number(raw.open_markets),
    resolved_markets: Number(raw.resolved_markets),
    total_volume_locked: String(raw.total_volume_locked),
  };
}

// Fetch user position for a specific market
export async function fetchUserPosition(
  marketId: number,
  userAddress: string
): Promise<UserPosition> {
  if (!userAddress) {
    return {
      market_id: marketId,
      user_address: '',
      yes_stake: '0',
      no_stake: '0',
      claimed: false,
      claimable_payout: '0',
    };
  }

  const client = getReadOnlyClient();
  const raw = (await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: 'get_user_position',
    args: [BigInt(marketId), userAddress],
  })) as any;

  return {
    market_id: Number(raw.market_id),
    user_address: String(raw.user_address),
    yes_stake: String(raw.yes_stake),
    no_stake: String(raw.no_stake),
    claimed: Boolean(raw.claimed),
    claimable_payout: String(raw.claimable_payout),
  };
}

// Switch or add Studionet chain to browser wallet
export async function switchNetworkToStudionet(ethereum: any) {
  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: STUDIONET_CHAIN_ID_HEX }],
    });
  } catch (switchError: any) {
    // 4902 means the chain has not been added yet
    if (switchError.code === 4902) {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: STUDIONET_CHAIN_ID_HEX,
            chainName: 'GenLayer Studionet',
            nativeCurrency: {
              name: 'GEN',
              symbol: 'GEN',
              decimals: 18,
            },
            rpcUrls: [STUDIONET_RPC_URL],
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}

// Track 4-stage consensus lifecycle: SUBMITTING -> PROPOSING -> COMMITTING -> FINALIZED
export async function waitForConsensusFinality(
  txHash: string,
  onStageChange?: (stage: string, rawStatusName?: string, tx?: any) => void
): Promise<any> {
  const client = getReadOnlyClient();
  const startTime = Date.now();
  const timeoutMs = 180000; // 3 minute safety timeout

  onStageChange?.('SUBMITTING', 'PENDING');

  while (Date.now() - startTime < timeoutMs) {
    try {
      const tx = await client.getTransaction({ hash: txHash as any });
      if (tx) {
        const rawStatus = (tx.statusName || String(tx.status || '')).toUpperCase();
        
        let mappedStage = 'SUBMITTING';
        if (rawStatus === 'PROPOSING' || rawStatus.includes('PROPOS')) {
          mappedStage = 'PROPOSING';
        } else if (rawStatus === 'COMMITTING' || rawStatus === 'REVEALING' || rawStatus.includes('COMMIT')) {
          mappedStage = 'COMMITTING';
        } else if (
          rawStatus === 'FINALIZED' ||
          rawStatus === 'ACCEPTED' ||
          rawStatus === 'DECIDED' ||
          tx.status === 7
        ) {
          mappedStage = 'FINALIZED';
          onStageChange?.(mappedStage, rawStatus, tx);
          return tx;
        }

        onStageChange?.(mappedStage, rawStatus, tx);
      }
    } catch {
      // Transaction might still be propagating in RPC mempool
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error(`Consensus timeout after 180s for tx ${txHash}`);
}

// Client creator for execution (supports both browser window.ethereum and custom private key)
export function getExecutionClient(options: {
  provider?: any;
  userAddress?: string;
  privateKey?: `0x${string}`;
}) {
  if (options.privateKey) {
    const account = createAccount(options.privateKey);
    return createClient({
      chain: chains.studionet,
      endpoint: STUDIONET_RPC_URL,
      account,
    });
  }

  if (options.provider && options.userAddress) {
    return createClient({
      chain: chains.studionet,
      endpoint: STUDIONET_RPC_URL,
      provider: options.provider,
      account: options.userAddress as Address,
    });
  }

  throw new Error('No valid wallet or private key supplied for write execution');
}

// Write Methods
export async function executePlaceBet(params: {
  marketId: number;
  side: 'YES' | 'NO';
  amountGen: string;
  wallet: { provider?: any; userAddress?: string; privateKey?: `0x${string}` };
  onStageChange?: (stage: string, rawStatus?: string, tx?: any) => void;
}): Promise<{ txHash: string; txReceipt: any }> {
  const client = getExecutionClient(params.wallet);
  const valueWei = parseEther(params.amountGen);

  const txHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: 'place_bet',
    args: [BigInt(params.marketId), params.side],
    value: valueWei,
  });

  const txReceipt = await waitForConsensusFinality(txHash, params.onStageChange);
  return { txHash, txReceipt };
}

export async function executeResolveMarket(params: {
  marketId: number;
  wallet: { provider?: any; userAddress?: string; privateKey?: `0x${string}` };
  onStageChange?: (stage: string, rawStatus?: string, tx?: any) => void;
}): Promise<{ txHash: string; txReceipt: any }> {
  const client = getExecutionClient(params.wallet);

  const txHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: 'resolve_market',
    args: [BigInt(params.marketId)],
    value: 0n,
  });

  const txReceipt = await waitForConsensusFinality(txHash, params.onStageChange);
  return { txHash, txReceipt };
}

export async function executeClaimWinnings(params: {
  marketId: number;
  wallet: { provider?: any; userAddress?: string; privateKey?: `0x${string}` };
  onStageChange?: (stage: string, rawStatus?: string, tx?: any) => void;
}): Promise<{ txHash: string; txReceipt: any }> {
  const client = getExecutionClient(params.wallet);

  const txHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: 'claim_winnings',
    args: [BigInt(params.marketId)],
    value: 0n,
  });

  const txReceipt = await waitForConsensusFinality(txHash, params.onStageChange);
  return { txHash, txReceipt };
}

export async function executeCreateMarket(params: {
  question: string;
  sourceUrl: string;
  rules: string;
  deadlineIso: string;
  seedAmountGen?: string;
  wallet: { provider?: any; userAddress?: string; privateKey?: `0x${string}` };
  onStageChange?: (stage: string, rawStatus?: string, tx?: any) => void;
}): Promise<{ txHash: string; txReceipt: any }> {
  const client = getExecutionClient(params.wallet);
  const valueWei = params.seedAmountGen && Number(params.seedAmountGen) > 0
    ? parseEther(params.seedAmountGen)
    : 0n;

  const txHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: 'create_market',
    args: [
      params.question,
      params.sourceUrl,
      params.rules,
      params.deadlineIso,
    ],
    value: valueWei,
  });

  const txReceipt = await waitForConsensusFinality(txHash, params.onStageChange);
  return { txHash, txReceipt };
}

// Utility: format wei to GEN with specified decimals
export function formatGen(wei: string | bigint, decimals: number = 4): string {
  try {
    const formatted = formatEther(BigInt(wei));
    const num = parseFloat(formatted);
    if (isNaN(num)) return '0.00';
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: decimals,
    });
  } catch {
    return '0.00';
  }
}
