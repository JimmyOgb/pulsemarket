'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Coins,
  ExternalLink,
  Flame,
  Globe,
  Info,
  Layers,
  Lock,
  PlusCircle,
  RefreshCw,
  Scale,
  ShieldCheck,
  TrendingUp,
  Wallet,
  XCircle,
  AlertTriangle,
  Copy,
  Check,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  CONTRACT_ADDRESS,
  STUDIONET_CHAIN_ID,
  STUDIONET_RPC_URL,
  DEPLOYMENT_TX_HASH,
  type Market,
  type ProtocolStats,
  type UserPosition,
  fetchAllMarkets,
  fetchStats,
  fetchUserPosition,
  switchNetworkToStudionet,
  executePlaceBet,
  executeResolveMarket,
  executeClaimWinnings,
  executeClaimRefund,
  executeVoidExpiredMarket,
  executeCreateMarket,
  formatGen,
} from '@/lib/genlayer';

// Stage type for GenLayer 4-stage consensus tracker
type ConsensusStage = 'IDLE' | 'SUBMITTING' | 'PROPOSING' | 'COMMITTING' | 'FINALIZED' | 'ERROR';

export default function PulseMarketApp() {
  // Protocol State
  const [markets, setMarkets] = useState<Market[]>([]);
  const [stats, setStats] = useState<ProtocolStats>({
    total_markets: 0,
    open_markets: 0,
    resolved_markets: 0,
    voided_markets: 0,
    total_volume_locked: '0',
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED' | 'VOIDED'>('ALL');

  // Wallet State
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [isWalletConnecting, setIsWalletConnecting] = useState<boolean>(false);
  const [walletType, setWalletType] = useState<'WEB3' | 'PRIVATE_KEY' | null>(null);
  const [customPrivateKey, setCustomPrivateKey] = useState<string>('');
  const [showWalletModal, setShowWalletModal] = useState<boolean>(false);

  // Active Modals
  const [activeTradeMarket, setActiveTradeMarket] = useState<Market | null>(null);
  const [activeUserPos, setActiveUserPos] = useState<UserPosition | null>(null);
  const [tradeSide, setTradeSide] = useState<'YES' | 'NO'>('YES');
  const [stakeAmount, setStakeAmount] = useState<string>('0.5');

  // Consensus Tracker Modal State
  const [consensusModal, setConsensusModal] = useState<{
    isOpen: boolean;
    title: string;
    stage: ConsensusStage;
    txHash: string;
    details: string;
    rawStatus: string;
    error?: string;
    resultOutcome?: string;
    resultRationale?: string;
  }>({
    isOpen: false,
    title: '',
    stage: 'IDLE',
    txHash: '',
    details: '',
    rawStatus: '',
  });

  // Create Market Modal State
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newQuestion, setNewQuestion] = useState<string>('');
  const [newSourceUrl, setNewSourceUrl] = useState<string>('https://');
  const [newRules, setNewRules] = useState<string>('');
  const [newDeadline, setNewDeadline] = useState<string>('2026-12-31T23:59:59Z');
  const [newSeedGen, setNewSeedGen] = useState<string>('1.0');

  // Copied indicator
  const [hasCopiedAddress, setHasCopiedAddress] = useState<boolean>(false);

  // Load protocol data from Studionet
  const loadProtocolData = useCallback(async () => {
    try {
      const [fetchedMarkets, fetchedStats] = await Promise.all([
        fetchAllMarkets(),
        fetchStats(),
      ]);
      setMarkets(fetchedMarkets);
      setStats(fetchedStats);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to load protocol data from Studionet:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Poll protocol telemetry periodically
  useEffect(() => {
    loadProtocolData();
    const interval = setInterval(loadProtocolData, 12000);
    return () => clearInterval(interval);
  }, [loadProtocolData]);

  // Load user position when active market changes or wallet connects
  useEffect(() => {
    if (activeTradeMarket && walletAddress) {
      fetchUserPosition(activeTradeMarket.id, walletAddress)
        .then(setActiveUserPos)
        .catch(console.error);
    } else {
      setActiveUserPos(null);
    }
  }, [activeTradeMarket, walletAddress]);

  // Connect Web3 Wallet (MetaMask / Rabby / Browser EIP-1193)
  const connectWeb3Wallet = async () => {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      alert('No EIP-1193 Web3 wallet detected. You can also connect via Studionet Private Key!');
      return;
    }
    setIsWalletConnecting(true);
    try {
      const eth = (window as any).ethereum;
      await switchNetworkToStudionet(eth);
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts.length > 0) {
        setWalletAddress(accounts[0]);
        setWalletType('WEB3');
        setShowWalletModal(false);
      }
    } catch (err: any) {
      console.error('Failed to connect wallet:', err);
      alert(`Wallet connection failed: ${err.message || err}`);
    } finally {
      setIsWalletConnecting(false);
    }
  };

  // Connect via Custom Studionet Private Key
  const connectWithPrivateKey = () => {
    let cleanKey = customPrivateKey.trim();
    if (!cleanKey) return;
    if (!cleanKey.startsWith('0x')) cleanKey = '0x' + cleanKey;
    if (cleanKey.length !== 66) {
      alert('Invalid private key length. It must be a 32-byte hex string (66 characters with 0x).');
      return;
    }
    try {
      // Derive address preview
      const { createAccount } = require('genlayer-js');
      const acc = createAccount(cleanKey as `0x${string}`);
      setWalletAddress(acc.address);
      setWalletType('PRIVATE_KEY');
      setShowWalletModal(false);
    } catch (err: any) {
      alert(`Invalid key: ${err.message}`);
    }
  };

  // Disconnect wallet
  const disconnectWallet = () => {
    setWalletAddress('');
    setWalletType(null);
    setCustomPrivateKey('');
    setActiveUserPos(null);
  };

  // Copy helper
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setHasCopiedAddress(true);
    setTimeout(() => setHasCopiedAddress(false), 2000);
  };

  // Get active wallet credentials
  const getWalletParams = () => {
    if (walletType === 'PRIVATE_KEY' && customPrivateKey) {
      let key = customPrivateKey.trim();
      if (!key.startsWith('0x')) key = '0x' + key;
      return { privateKey: key as `0x${string}`, userAddress: walletAddress };
    }
    if (walletType === 'WEB3' && typeof window !== 'undefined') {
      return {
        provider: (window as any).ethereum,
        userAddress: walletAddress,
      };
    }
    return null;
  };

  // Execute Bet Handler
  const handlePlaceBet = async () => {
    const wallet = getWalletParams();
    if (!wallet || !activeTradeMarket) {
      setShowWalletModal(true);
      return;
    }
    if (!stakeAmount || parseFloat(stakeAmount) <= 0) {
      alert('Please enter a valid GEN stake amount.');
      return;
    }

    setConsensusModal({
      isOpen: true,
      title: `Placing ${stakeAmount} GEN on ${tradeSide}`,
      stage: 'SUBMITTING',
      txHash: '',
      details: 'Submitting transaction to GenLayer Studionet RPC...',
      rawStatus: 'SUBMITTING',
    });

    try {
      const { txHash, txReceipt } = await executePlaceBet({
        marketId: activeTradeMarket.id,
        side: tradeSide,
        amountGen: stakeAmount,
        wallet,
        onStageChange: (stage, rawStatus, tx) => {
          setConsensusModal((prev) => ({
            ...prev,
            stage: stage as ConsensusStage,
            rawStatus: rawStatus || prev.rawStatus,
            txHash: tx?.hash || prev.txHash,
            details:
              stage === 'PROPOSING'
                ? 'Lead validator executing non-deterministic state evaluation...'
                : stage === 'COMMITTING'
                ? 'Validators validating equivalence principle consensus...'
                : stage === 'FINALIZED'
                ? 'Consensus reached! Stake added to on-chain pool.'
                : prev.details,
          }));
        },
      });

      setConsensusModal((prev) => ({
        ...prev,
        stage: 'FINALIZED',
        txHash,
        details: 'Bet placed successfully on Studionet!',
      }));

      // Refresh data
      await loadProtocolData();
      if (walletAddress) {
        fetchUserPosition(activeTradeMarket.id, walletAddress).then(setActiveUserPos);
      }
    } catch (err: any) {
      console.error('Error placing bet:', err);
      setConsensusModal((prev) => ({
        ...prev,
        stage: 'ERROR',
        error: err.message || String(err),
        details: 'Failed to complete transaction on Studionet.',
      }));
    }
  };

  // Execute Resolution Handler
  const handleResolveMarket = async (market: Market) => {
    const wallet = getWalletParams();
    if (!wallet) {
      setShowWalletModal(true);
      return;
    }

    setConsensusModal({
      isOpen: true,
      title: `Resolving Market #${market.id} via AI Consensus`,
      stage: 'SUBMITTING',
      txHash: '',
      details: 'Calling resolve_market() on GenLayer Studionet...',
      rawStatus: 'SUBMITTING',
    });

    try {
      const { txHash, txReceipt } = await executeResolveMarket({
        marketId: market.id,
        wallet,
        onStageChange: (stage, rawStatus, tx) => {
          setConsensusModal((prev) => ({
            ...prev,
            stage: stage as ConsensusStage,
            rawStatus: rawStatus || prev.rawStatus,
            txHash: tx?.hash || prev.txHash,
            details:
              stage === 'PROPOSING'
                ? 'Lead validator scraping live resolution URL and querying GenVM LLM...'
                : stage === 'COMMITTING'
                ? 'Consensus validators verifying web output & voting on outcome...'
                : stage === 'FINALIZED'
                ? 'Equivalence principle consensus reached on-chain!'
                : prev.details,
          }));
        },
      });

      // Reload markets to get rationale and updated outcome
      await loadProtocolData();
      const updated = await fetchAllMarkets();
      const thisMarket = updated.find((m) => m.id === market.id);

      setConsensusModal((prev) => ({
        ...prev,
        stage: 'FINALIZED',
        txHash,
        details: 'Oracle-Free resolution completed!',
        resultOutcome: thisMarket?.outcome,
        resultRationale: thisMarket?.resolution_rationale,
      }));
    } catch (err: any) {
      console.error('Resolution failed:', err);
      setConsensusModal((prev) => ({
        ...prev,
        stage: 'ERROR',
        error: err.message || String(err),
        details: 'Failed to resolve market via GenLayer AI validators.',
      }));
    }
  };

  // Execute Claim Handler
  const handleClaimWinnings = async (marketId: number) => {
    const wallet = getWalletParams();
    if (!wallet) {
      setShowWalletModal(true);
      return;
    }

    setConsensusModal({
      isOpen: true,
      title: `Claiming Payout for Market #${marketId}`,
      stage: 'SUBMITTING',
      txHash: '',
      details: 'Submitting claim request to Studionet...',
      rawStatus: 'SUBMITTING',
    });

    try {
      const { txHash } = await executeClaimWinnings({
        marketId,
        wallet,
        onStageChange: (stage, rawStatus, tx) => {
          setConsensusModal((prev) => ({
            ...prev,
            stage: stage as ConsensusStage,
            rawStatus: rawStatus || prev.rawStatus,
            txHash: tx?.hash || prev.txHash,
            details:
              stage === 'FINALIZED'
                ? 'Native GEN payout sent to your wallet!'
                : `Stage: ${stage}`,
          }));
        },
      });

      await loadProtocolData();
      if (walletAddress) {
        fetchUserPosition(marketId, walletAddress).then(setActiveUserPos);
      }

      setConsensusModal((prev) => ({
        ...prev,
        stage: 'FINALIZED',
        txHash,
        details: 'Winnings claimed successfully!',
      }));
    } catch (err: any) {
      setConsensusModal((prev) => ({
        ...prev,
        stage: 'ERROR',
        error: err.message || String(err),
        details: 'Claim failed.',
      }));
    }
  };

  // Execute Claim Refund Handler
  const handleClaimRefund = async (marketId: number) => {
    const wallet = getWalletParams();
    if (!wallet) {
      setShowWalletModal(true);
      return;
    }

    setConsensusModal({
      isOpen: true,
      title: `Claiming 100% Principal Refund for Market #${marketId}`,
      stage: 'SUBMITTING',
      txHash: '',
      details: 'Submitting claim_refund() to Studionet...',
      rawStatus: 'SUBMITTING',
    });

    try {
      const { txHash } = await executeClaimRefund({
        marketId,
        wallet,
        onStageChange: (stage, rawStatus, tx) => {
          setConsensusModal((prev) => ({
            ...prev,
            stage: stage as ConsensusStage,
            rawStatus: rawStatus || prev.rawStatus,
            txHash: tx?.hash || prev.txHash,
            details:
              stage === 'FINALIZED'
                ? 'Full principal refund sent back to your wallet!'
                : `Stage: ${stage}`,
          }));
        },
      });

      await loadProtocolData();
      if (walletAddress) {
        fetchUserPosition(marketId, walletAddress).then(setActiveUserPos);
      }

      setConsensusModal((prev) => ({
        ...prev,
        stage: 'FINALIZED',
        txHash,
        details: '100% principal refund claimed successfully!',
      }));
    } catch (err: any) {
      setConsensusModal((prev) => ({
        ...prev,
        stage: 'ERROR',
        error: err.message || String(err),
        details: 'Refund claim failed.',
      }));
    }
  };

  // Execute Void Expired Market Handler
  const handleVoidExpiredMarket = async (marketId: number) => {
    const wallet = getWalletParams();
    if (!wallet) {
      setShowWalletModal(true);
      return;
    }

    setConsensusModal({
      isOpen: true,
      title: `Voiding Expired Market #${marketId}`,
      stage: 'SUBMITTING',
      txHash: '',
      details: 'Calling void_expired_market() on Studionet...',
      rawStatus: 'SUBMITTING',
    });

    try {
      const { txHash } = await executeVoidExpiredMarket({
        marketId,
        wallet,
        onStageChange: (stage, rawStatus, tx) => {
          setConsensusModal((prev) => ({
            ...prev,
            stage: stage as ConsensusStage,
            rawStatus: rawStatus || prev.rawStatus,
            txHash: tx?.hash || prev.txHash,
            details:
              stage === 'FINALIZED'
                ? 'Market successfully VOIDED. 100% principal refunds are now open!'
                : `Stage: ${stage}`,
          }));
        },
      });

      await loadProtocolData();
      if (walletAddress) {
        fetchUserPosition(marketId, walletAddress).then(setActiveUserPos);
      }

      setConsensusModal((prev) => ({
        ...prev,
        stage: 'FINALIZED',
        txHash,
        details: 'Market expired window elapsed — status transitioned to VOIDED!',
      }));
    } catch (err: any) {
      setConsensusModal((prev) => ({
        ...prev,
        stage: 'ERROR',
        error: err.message || String(err),
        details: 'Void request failed.',
      }));
    }
  };

  // Execute Create Market Handler
  const handleCreateMarket = async (e: React.FormEvent) => {
    e.preventDefault();
    const wallet = getWalletParams();
    if (!wallet) {
      setShowWalletModal(true);
      return;
    }

    if (!newQuestion.trim() || !newSourceUrl.trim() || !newRules.trim()) {
      alert('Please fill out all market fields.');
      return;
    }

    setShowCreateModal(false);
    setConsensusModal({
      isOpen: true,
      title: 'Deploying New Real-World Prediction Market',
      stage: 'SUBMITTING',
      txHash: '',
      details: 'Broadcasting create_market() to Studionet...',
      rawStatus: 'SUBMITTING',
    });

    try {
      const { txHash } = await executeCreateMarket({
        question: newQuestion.trim(),
        sourceUrl: newSourceUrl.trim(),
        rules: newRules.trim(),
        deadlineIso: newDeadline.trim(),
        seedAmountGen: newSeedGen,
        wallet,
        onStageChange: (stage, rawStatus, tx) => {
          setConsensusModal((prev) => ({
            ...prev,
            stage: stage as ConsensusStage,
            rawStatus: rawStatus || prev.rawStatus,
            txHash: tx?.hash || prev.txHash,
            details:
              stage === 'FINALIZED'
                ? 'Market live on Studionet with initial liquidity!'
                : `Consensus Stage: ${stage}`,
          }));
        },
      });

      // Clear form
      setNewQuestion('');
      setNewSourceUrl('https://');
      setNewRules('');
      await loadProtocolData();

      setConsensusModal((prev) => ({
        ...prev,
        stage: 'FINALIZED',
        txHash,
        details: 'New prediction market successfully created on-chain!',
      }));
    } catch (err: any) {
      setConsensusModal((prev) => ({
        ...prev,
        stage: 'ERROR',
        error: err.message || String(err),
        details: 'Failed to create market.',
      }));
    }
  };

  // Filtered markets
  const filteredMarkets = useMemo(() => {
    return markets.filter((m) => {
      if (filter === 'OPEN') return m.status === 'OPEN';
      if (filter === 'RESOLVED') return m.status === 'RESOLVED';
      if (filter === 'VOIDED') return m.status === 'VOIDED';
      return true;
    });
  }, [markets, filter]);

  // Pari-Mutuel dynamic estimator
  const returnEstimates = useMemo(() => {
    if (!activeTradeMarket || !stakeAmount || parseFloat(stakeAmount) <= 0) {
      return { newOdds: 50, estimatedPayout: '0.00', multiplier: '1.00x' };
    }
    try {
      const stakeWei = BigInt(Math.floor(parseFloat(stakeAmount) * 1e18));
      const yesPool = BigInt(activeTradeMarket.yes_pool);
      const noPool = BigInt(activeTradeMarket.no_pool);
      const totalPool = yesPool + noPool + stakeWei;

      let winningPool = tradeSide === 'YES' ? yesPool + stakeWei : noPool + stakeWei;
      if (winningPool === 0n) winningPool = 1n;

      const payoutWei = (stakeWei * totalPool) / winningPool;
      const formattedPayout = formatGen(payoutWei.toString(), 2);
      const multiplier = (Number(payoutWei) / Number(stakeWei)).toFixed(2) + 'x';
      const newOdds = Math.round((Number(winningPool) / Number(totalPool)) * 100);

      return {
        newOdds,
        estimatedPayout: formattedPayout,
        multiplier,
      };
    } catch {
      return { newOdds: 50, estimatedPayout: '0.00', multiplier: '1.00x' };
    }
  }, [activeTradeMarket, stakeAmount, tradeSide]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Banner: Network & Consensus Protocol Status */}
      <div className="bg-gradient-to-r from-cyan-950 via-slate-900 to-indigo-950 border-b border-cyan-800/30 text-xs text-slate-300 py-2 px-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-mono text-cyan-400 font-semibold uppercase tracking-wider">
            GenLayer Studionet Active
          </span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400 font-mono">Chain ID: {STUDIONET_CHAIN_ID}</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400">Oracle-Free Non-Deterministic Consensus</span>
        </div>

        <div className="flex items-center gap-3 font-mono">
          <div className="flex items-center gap-1.5 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700/60">
            <span className="text-slate-400">Contract:</span>
            <span className="text-cyan-300">
              {CONTRACT_ADDRESS.slice(0, 6)}...{CONTRACT_ADDRESS.slice(-4)}
            </span>
            <button
              onClick={() => copyToClipboard(CONTRACT_ADDRESS)}
              className="text-slate-400 hover:text-white transition ml-1"
              title="Copy Contract Address"
            >
              {hasCopiedAddress ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <a
            href={`${STUDIONET_RPC_URL}`}
            target="_blank"
            rel="noreferrer"
            className="text-slate-400 hover:text-cyan-400 transition flex items-center gap-1"
          >
            RPC <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Main Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Zap className="w-6 h-6 text-slate-950 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight text-white font-mono">
                  PULSE<span className="text-cyan-400">MARKET</span>
                </span>
                <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[10px] font-mono px-1.5 py-0.5 rounded font-bold">
                  AI D-APP
                </span>
              </div>
              <p className="text-[11px] text-slate-400 -mt-0.5">
                Oracle-Free Real-World Prediction Markets on GenLayer
              </p>
            </div>
          </div>

          {/* Right Nav Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="hidden sm:flex items-center gap-1.5 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 font-semibold px-3.5 py-2 rounded-lg text-sm shadow-md shadow-cyan-500/20 transition cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Market</span>
            </button>

            {/* Wallet Connect Button */}
            {walletAddress ? (
              <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 rounded-lg p-1.5 pl-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                  <span className="font-mono text-xs text-slate-200">
                    {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                  </span>
                  <span className="text-[10px] bg-slate-700 text-slate-300 px-1 rounded font-mono">
                    {walletType === 'PRIVATE_KEY' ? 'Key' : 'Web3'}
                  </span>
                </div>
                <button
                  onClick={disconnectWallet}
                  className="text-slate-400 hover:text-rose-400 text-xs px-2 py-1 rounded hover:bg-slate-700/50 transition cursor-pointer"
                  title="Disconnect"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowWalletModal(true)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/40 hover:border-cyan-400 font-semibold px-4 py-2 rounded-lg text-sm transition shadow-sm cursor-pointer"
              >
                <Wallet className="w-4 h-4" />
                <span>Connect Wallet</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Protocol Telemetry Strip */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden group hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase tracking-wider">
              <span>Total Volume Locked</span>
              <Coins className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-black font-mono text-white tracking-tight">
                {formatGen(stats.total_volume_locked)}
              </span>
              <span className="text-xs font-mono text-cyan-400 font-bold">GEN</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-mono">Live on Studionet</div>
            <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-cyan-500/5 rounded-full blur-xl group-hover:bg-cyan-500/10 transition"></div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden group hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase tracking-wider">
              <span>Active Markets</span>
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-black font-mono text-emerald-400 tracking-tight">
                {stats.open_markets}
              </span>
              <span className="text-xs text-slate-400">OPEN</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-mono">Accepting Positions</div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden group hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase tracking-wider">
              <span>Settled Markets</span>
              <Scale className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-black font-mono text-indigo-300 tracking-tight">
                {stats.resolved_markets}
              </span>
              <span className="text-xs text-slate-400">RESOLVED</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-mono">By AI Consensus</div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden group hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase tracking-wider">
              <span>Voided / Refunds</span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-black font-mono text-amber-300 tracking-tight">
                {stats.voided_markets || 0}
              </span>
              <span className="text-xs text-slate-400">VOIDED</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-mono">100% Refunds Open</div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden group hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase tracking-wider">
              <span>Oracle Mechanism</span>
              <ShieldCheck className="w-4 h-4 text-purple-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-xl font-bold font-mono text-purple-300 tracking-tight">
                Equivalence
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-mono">
              Web Scrape + LLM Consensus
            </div>
          </div>
        </section>

        {/* Explainability Banner */}
        <section className="bg-gradient-to-r from-slate-900 via-cyan-950/20 to-slate-900 border border-cyan-800/30 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-300 font-mono">
                  How PulseMarket Works Without Centralized Oracles
                </h2>
              </div>
              <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                Traditional prediction markets rely on centralized multi-sigs, UMA dispute windows, or expensive human committees.
                In <strong>PulseMarket</strong>, when anyone calls{' '}
                <code className="text-cyan-300 bg-slate-800 px-1 rounded">resolve_market()</code>, GenLayer validators independently fetch the live authoritative HTTPS source URL, parse the text, and query an LLM inside an Equivalence Principle block. Settlement is guaranteed by decentralized multi-validator consensus.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={loadProtocolData}
                className="flex items-center gap-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-mono px-3 py-2 rounded-lg border border-slate-700 transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Data</span>
              </button>
            </div>
          </div>
        </section>

        {/* Markets Section Header & Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-cyan-400" />
              Live Prediction Markets
            </h1>
            <span className="text-xs font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded-full border border-slate-800">
              {filteredMarkets.length} of {markets.length}
            </span>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs font-mono">
            <button
              onClick={() => setFilter('ALL')}
              className={`px-3 py-1.5 rounded-md transition ${
                filter === 'ALL'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('OPEN')}
              className={`px-3 py-1.5 rounded-md transition ${
                filter === 'OPEN'
                  ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Open
            </button>
            <button
              onClick={() => setFilter('RESOLVED')}
              className={`px-3 py-1.5 rounded-md transition ${
                filter === 'RESOLVED'
                  ? 'bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Resolved
            </button>
            <button
              onClick={() => setFilter('VOIDED')}
              className={`px-3 py-1.5 rounded-md transition ${
                filter === 'VOIDED'
                  ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Voided
            </button>
          </div>
        </div>

        {/* Markets Cards Grid */}
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
            <p className="font-mono text-sm">Querying GenLayer Studionet Contract State...</p>
          </div>
        ) : filteredMarkets.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl py-16 text-center text-slate-400 space-y-3">
            <Info className="w-8 h-8 mx-auto text-slate-500" />
            <p className="font-mono text-sm">No markets found matching current filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredMarkets.map((market) => {
              const totalPoolWei = BigInt(market.yes_pool) + BigInt(market.no_pool);
              const totalPoolGen = formatGen(totalPoolWei.toString());
              const yesOdds = market.yes_probability;
              const noOdds = market.no_probability;

              const isCutoffPassed = market.deadline_iso
                ? Date.now() >= Date.parse(market.deadline_iso)
                : false;
              const isRefundPassed = market.refund_deadline_iso
                ? Date.now() >= Date.parse(market.refund_deadline_iso)
                : false;
              const isBettingClosed = !market.is_betting_open || isCutoffPassed;
              const canVoidExpired = market.status === 'OPEN' && isRefundPassed;

              return (
                <div
                  key={market.id}
                  className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between hover:border-slate-700/80 transition-all shadow-lg hover:shadow-cyan-950/20 relative group"
                >
                  <div>
                    {/* Header: Market ID, Status Badge & Cutoff */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-cyan-400 font-bold bg-cyan-950/60 border border-cyan-800/40 px-2 py-0.5 rounded">
                          MARKET #{market.id}
                        </span>

                        {market.status === 'OPEN' ? (
                          isBettingClosed ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-300 bg-amber-950/50 border border-amber-800/50 px-2.5 py-0.5 rounded-full font-bold">
                              <Clock className="w-3 h-3 text-amber-400" />
                              BETTING CLOSED (CUTOFF PASSED)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-950/50 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                              OPEN
                            </span>
                          )
                        ) : market.status === 'VOIDED' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-300 bg-amber-950/70 border border-amber-500/50 px-2.5 py-0.5 rounded-full font-bold shadow-sm shadow-amber-500/20">
                            <AlertTriangle className="w-3 h-3 text-amber-400" />
                            VOIDED / REFUNDABLE
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-indigo-300 bg-indigo-950/50 border border-indigo-800/40 px-2 py-0.5 rounded-full font-bold">
                            <CheckCircle2 className="w-3 h-3 text-indigo-400" />
                            RESOLVED: {market.outcome}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Prominent Cutoff & Refund Expiry Dates */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-[11px] font-mono bg-slate-950/70 border border-slate-800/80 px-3 py-2 rounded-xl mb-3.5">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="text-slate-500">Betting Cutoff:</span>
                        <span className={isBettingClosed ? 'text-amber-400 font-bold' : 'text-slate-200'}>
                          {market.deadline_iso ? new Date(market.deadline_iso).toLocaleString() : 'N/A'}
                        </span>
                      </div>
                      {market.refund_deadline_iso && (
                        <>
                          <span className="hidden sm:inline text-slate-700">|</span>
                          <div className="flex items-center gap-1.5 text-slate-400">
                            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <span className="text-slate-500">Refund Expiry:</span>
                            <span className="text-slate-300">
                              {new Date(market.refund_deadline_iso).toLocaleString()}
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Market Question */}
                    <h3 className="text-lg font-bold text-white tracking-tight leading-snug mb-3">
                      {market.question}
                    </h3>

                    {/* Authoritative Resolution Source Link */}
                    <div className="mb-4 flex items-center gap-2 text-xs">
                      <span className="text-slate-400 font-mono text-[11px]">Source URL:</span>
                      <a
                        href={market.resolution_source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-cyan-400 hover:text-cyan-300 underline underline-offset-2 flex items-center gap-1 truncate max-w-xs sm:max-w-md"
                        title={market.resolution_source_url}
                      >
                        <Globe className="w-3 h-3 shrink-0" />
                        <span className="truncate">{market.resolution_source_url}</span>
                        <ArrowUpRight className="w-3 h-3 shrink-0" />
                      </a>
                    </div>

                    {/* Live Implied Probability Bar */}
                    <div className="space-y-1.5 mb-5 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                      <div className="flex items-center justify-between text-xs font-mono font-bold">
                        <span className="text-emerald-400 flex items-center gap-1">
                          YES {yesOdds}%
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({formatGen(market.yes_pool)} GEN)
                          </span>
                        </span>
                        <span className="text-rose-400 flex items-center gap-1">
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({formatGen(market.no_pool)} GEN)
                          </span>
                          NO {noOdds}%
                        </span>
                      </div>

                      {/* Visual Ratio Bar */}
                      <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden flex">
                        <div
                          className="bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                          style={{ width: `${yesOdds}%` }}
                        ></div>
                        <div
                          className="bg-gradient-to-r from-rose-500 to-rose-400 transition-all duration-500"
                          style={{ width: `${noOdds}%` }}
                        ></div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1">
                        <span>Total Pool: {totalPoolGen} GEN</span>
                        <span>{market.total_positions} Positions Placed</span>
                      </div>
                    </div>

                    {/* AI Consensus Resolution Rationale (If Resolved or Voided) */}
                    {market.resolution_rationale && (
                      <div className={`mb-4 rounded-xl p-3 text-xs space-y-1 ${
                        market.status === 'VOIDED'
                          ? 'bg-amber-950/30 border border-amber-800/40 text-amber-200'
                          : 'bg-indigo-950/30 border border-indigo-800/40 text-slate-300'
                      }`}>
                        <div className="flex items-center gap-1.5 font-mono font-semibold">
                          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                          <span>GenLayer Consensus Verdict & Rationale</span>
                        </div>
                        <p className="text-[11px] leading-relaxed italic">
                          &ldquo;{market.resolution_rationale}&rdquo;
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    {market.status === 'VOIDED' ? (
                      <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="text-xs font-mono text-amber-300 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>100% Principal Refunds Enabled</span>
                        </div>
                        <button
                          onClick={() => {
                            setActiveTradeMarket(market);
                            handleClaimRefund(market.id);
                          }}
                          className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs font-mono transition flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Claim Full Refund</span>
                        </button>
                      </div>
                    ) : market.status === 'OPEN' ? (
                      <>
                        {isBettingClosed ? (
                          <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-center">
                            <span className="text-xs font-mono text-amber-400 font-bold flex items-center justify-center gap-1">
                              <Lock className="w-3.5 h-3.5" />
                              Betting Closed (Cutoff Passed)
                            </span>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setActiveTradeMarket(market);
                                setTradeSide('YES');
                              }}
                              className="flex-1 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs font-mono transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950 cursor-pointer"
                            >
                              <span>Buy YES</span>
                              <span className="text-[10px] opacity-80">({yesOdds}%)</span>
                            </button>

                            <button
                              onClick={() => {
                                setActiveTradeMarket(market);
                                setTradeSide('NO');
                              }}
                              className="flex-1 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs font-mono transition flex items-center justify-center gap-1.5 shadow-md shadow-rose-950 cursor-pointer"
                            >
                              <span>Buy NO</span>
                              <span className="text-[10px] opacity-80">({noOdds}%)</span>
                            </button>
                          </>
                        )}

                        <div className="flex items-center gap-2 shrink-0">
                          {canVoidExpired && (
                            <button
                              onClick={() => handleVoidExpiredMarket(market.id)}
                              className="bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-600/50 hover:border-amber-500 font-mono text-xs py-2.5 px-3 rounded-xl transition flex items-center gap-1 cursor-pointer"
                              title="Market past refund window — anyone can void to enable full refunds"
                            >
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                              <span>Void Expired</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleResolveMarket(market)}
                            className="bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400 font-mono text-xs py-2.5 px-3 rounded-xl transition flex items-center gap-1 cursor-pointer"
                            title="Trigger AI Multi-Validator Resolution"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Resolve</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="w-full flex items-center justify-between gap-3">
                        <div className="text-xs font-mono text-slate-400">
                          Outcome Finalized: <strong className="text-white">{market.outcome}</strong>
                        </div>
                        <button
                          onClick={() => {
                            setActiveTradeMarket(market);
                            handleClaimWinnings(market.id);
                          }}
                          className="bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold py-2 px-4 rounded-xl text-xs font-mono transition flex items-center gap-1.5 shadow-md cursor-pointer"
                        >
                          <Coins className="w-3.5 h-3.5" />
                          <span>Claim Payout</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Trade & Position Drawer / Modal */}
      {activeTradeMarket && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setActiveTradeMarket(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition"
            >
              <XCircle className="w-5 h-5" />
            </button>

            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-mono text-xs text-cyan-400 font-bold">
                  MARKET #{activeTradeMarket.id}
                </span>
                <span className="text-xs text-slate-500">|</span>
                <span className="text-xs text-slate-400 font-mono">
                  Pool: {formatGen(BigInt(activeTradeMarket.yes_pool) + BigInt(activeTradeMarket.no_pool))} GEN
                </span>
                {activeTradeMarket.status === 'VOIDED' && (
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded font-mono font-bold">
                    VOIDED / REFUNDS OPEN
                  </span>
                )}
              </div>
              <h2 className="text-base font-bold text-white leading-snug">
                {activeTradeMarket.question}
              </h2>

              {/* Cutoff & Refund Expiry Info in Modal */}
              <div className="mt-2 text-[11px] font-mono text-slate-400 space-y-1 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Betting Cutoff:</span>
                  <span className={
                    (!activeTradeMarket.is_betting_open || (activeTradeMarket.deadline_iso && Date.now() >= Date.parse(activeTradeMarket.deadline_iso)))
                      ? 'text-amber-400 font-bold'
                      : 'text-slate-200'
                  }>
                    {activeTradeMarket.deadline_iso ? new Date(activeTradeMarket.deadline_iso).toLocaleString() : 'N/A'}
                  </span>
                </div>
                {activeTradeMarket.refund_deadline_iso && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Refund Expiry:</span>
                    <span className="text-slate-300">
                      {new Date(activeTradeMarket.refund_deadline_iso).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* If Betting is closed or market is voided */}
            {activeTradeMarket.status === 'VOIDED' ? (
              <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3 text-xs font-mono text-amber-300 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Market Voided — 100% Principal Refund Active</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  {activeTradeMarket.resolution_rationale ||
                    'All participants are entitled to recover 100% of their deposited stakes with zero protocol fees.'}
                </p>
              </div>
            ) : activeTradeMarket.status === 'OPEN' &&
              (!activeTradeMarket.is_betting_open ||
                (activeTradeMarket.deadline_iso && Date.now() >= Date.parse(activeTradeMarket.deadline_iso))) ? (
              <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3 text-xs font-mono text-amber-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Betting is closed for this market as the cutoff deadline has passed. New wagers are rejected by consensus.
                </span>
              </div>
            ) : null}

            {/* Side Selection Tabs (Disabled if closed or voided) */}
            {activeTradeMarket.status === 'OPEN' &&
              activeTradeMarket.is_betting_open &&
              (!activeTradeMarket.deadline_iso || Date.now() < Date.parse(activeTradeMarket.deadline_iso)) && (
                <>
                  <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setTradeSide('YES')}
                      className={`py-2.5 rounded-lg font-mono text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                        tradeSide === 'YES'
                          ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <span>YES</span>
                      <span>({activeTradeMarket.yes_probability}%)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTradeSide('NO')}
                      className={`py-2.5 rounded-lg font-mono text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                        tradeSide === 'NO'
                          ? 'bg-rose-500 text-slate-950 shadow-md shadow-rose-500/20'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <span>NO</span>
                      <span>({activeTradeMarket.no_probability}%)</span>
                    </button>
                  </div>

                  {/* Stake Input Form */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-mono text-slate-300">
                      <span>Enter Stake Amount:</span>
                      <span>Currency: GEN</span>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        min="0.01"
                        value={stakeAmount}
                        onChange={(e) => setStakeAmount(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white font-mono text-lg font-bold focus:outline-none focus:border-cyan-400 transition"
                        placeholder="0.5"
                      />
                      <span className="absolute right-4 top-3.5 font-mono text-xs text-cyan-400 font-bold">
                        GEN
                      </span>
                    </div>

                    {/* Quick Select Buttons */}
                    <div className="flex gap-2 font-mono text-xs">
                      {['0.1', '0.5', '1.0', '5.0'].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setStakeAmount(amt)}
                          className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-1 rounded border border-slate-700 transition"
                        >
                          +{amt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Pari-Mutuel Return Estimator */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs font-mono">
                    <div className="flex justify-between text-slate-400">
                      <span>Estimated Implied Odds After Bet:</span>
                      <span className="text-white font-bold">{returnEstimates.newOdds}%</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Estimated Payout (If {tradeSide} Wins):</span>
                      <span className="text-emerald-400 font-bold">
                        ~{returnEstimates.estimatedPayout} GEN
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Potential Return Multiplier:</span>
                      <span className="text-cyan-400 font-bold">{returnEstimates.multiplier}</span>
                    </div>
                  </div>
                </>
              )}

            {/* User Active Position on this Market */}
            {activeUserPos && (
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 text-xs font-mono space-y-1">
                <div className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  Your Position on this Market
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-300">YES Stake:</span>
                  <span className="text-emerald-400 font-bold">
                    {formatGen(activeUserPos.yes_stake)} GEN
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-300">NO Stake:</span>
                  <span className="text-rose-400 font-bold">
                    {formatGen(activeUserPos.no_stake)} GEN
                  </span>
                </div>
                {activeTradeMarket.status === 'RESOLVED' && (
                  <div className="flex justify-between pt-1 border-t border-slate-700">
                    <span className="text-slate-300">Claimable Payout:</span>
                    <span className="text-cyan-300 font-bold">
                      {formatGen(activeUserPos.claimable_payout)} GEN
                    </span>
                  </div>
                )}
                {activeTradeMarket.status === 'VOIDED' && (
                  <div className="flex justify-between pt-1 border-t border-slate-700">
                    <span className="text-slate-300">Refundable Principal:</span>
                    <span className="text-amber-400 font-bold">
                      {formatGen(activeUserPos.refundable_amount)} GEN
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            {activeTradeMarket.status === 'VOIDED' ? (
              <button
                type="button"
                onClick={() => handleClaimRefund(activeTradeMarket.id)}
                disabled={BigInt(activeUserPos?.refundable_amount || '0') <= 0n}
                className={`w-full py-3 rounded-xl font-mono text-sm font-bold transition shadow-lg ${
                  BigInt(activeUserPos?.refundable_amount || '0') > 0n
                    ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 cursor-pointer shadow-amber-500/20'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                }`}
              >
                {BigInt(activeUserPos?.refundable_amount || '0') > 0n
                  ? `Claim Full Refund (${formatGen(activeUserPos?.refundable_amount || '0')} GEN)`
                  : 'No Refundable Stake or Already Claimed'}
              </button>
            ) : activeTradeMarket.status === 'OPEN' ? (
              (!activeTradeMarket.is_betting_open ||
                (activeTradeMarket.deadline_iso && Date.now() >= Date.parse(activeTradeMarket.deadline_iso))) ? (
                <button
                  disabled
                  className="w-full py-3 rounded-xl font-mono text-sm font-bold bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                >
                  Betting Closed (Cutoff Passed)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePlaceBet}
                  className={`w-full py-3 rounded-xl font-mono text-sm font-bold text-slate-950 transition cursor-pointer shadow-lg ${
                    tradeSide === 'YES'
                      ? 'bg-emerald-400 hover:bg-emerald-300 shadow-emerald-500/20'
                      : 'bg-rose-400 hover:bg-rose-300 shadow-rose-500/20'
                  }`}
                >
                  Confirm {tradeSide} Bet ({stakeAmount} GEN)
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={() => handleClaimWinnings(activeTradeMarket.id)}
                className="w-full py-3 rounded-xl font-mono text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 transition cursor-pointer shadow-lg"
              >
                Claim Payout Now
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4-Stage Consensus Tracker Modal */}
      {consensusModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-6 shadow-2xl relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white tracking-tight">
                  {consensusModal.title}
                </h3>
              </div>
              {consensusModal.stage === 'FINALIZED' || consensusModal.stage === 'ERROR' ? (
                <button
                  onClick={() => setConsensusModal((prev) => ({ ...prev, isOpen: false }))}
                  className="text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              ) : null}
            </div>

            {/* 4-Stage Visual Progress Bar */}
            <div className="space-y-4">
              {[
                {
                  key: 'SUBMITTING',
                  title: 'Stage 1: Mempool Submission',
                  desc: 'Broadcasting transaction to GenLayer Studionet RPC node',
                },
                {
                  key: 'PROPOSING',
                  title: 'Stage 2: Lead Validator Execution',
                  desc: 'Executing gl.nondet.web.get and prompting GenVM LLM',
                },
                {
                  key: 'COMMITTING',
                  title: 'Stage 3: Equivalence Consensus',
                  desc: 'Validators verify equivalence principle & commit cryptographic votes',
                },
                {
                  key: 'FINALIZED',
                  title: 'Stage 4: State Finalization',
                  desc: 'Optimistic consensus reached - state committed permanently on Studionet',
                },
              ].map((stageItem, index) => {
                const stagesOrder = ['SUBMITTING', 'PROPOSING', 'COMMITTING', 'FINALIZED'];
                const currentIdx = stagesOrder.indexOf(consensusModal.stage);
                const stepIdx = stagesOrder.indexOf(stageItem.key);

                const isComplete = currentIdx > stepIdx || consensusModal.stage === 'FINALIZED';
                const isCurrent = consensusModal.stage === stageItem.key;
                const isPending = currentIdx < stepIdx && consensusModal.stage !== 'FINALIZED';

                return (
                  <div
                    key={stageItem.key}
                    className={`flex items-start gap-3 p-3 rounded-xl border transition ${
                      isCurrent
                        ? 'bg-cyan-950/40 border-cyan-500/50'
                        : isComplete
                        ? 'bg-slate-950/40 border-emerald-500/30'
                        : 'bg-slate-950/20 border-slate-800 text-slate-500'
                    }`}
                  >
                    <div className="mt-0.5">
                      {isComplete ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : isCurrent ? (
                        <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border border-slate-700 flex items-center justify-center text-[10px] font-mono">
                          {index + 1}
                        </div>
                      )}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-mono font-bold ${
                            isCurrent
                              ? 'text-cyan-300'
                              : isComplete
                              ? 'text-emerald-300'
                              : 'text-slate-500'
                          }`}
                        >
                          {stageItem.title}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] font-mono bg-cyan-500/20 text-cyan-300 px-1.5 py-0.2 rounded animate-pulse">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">{stageItem.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Error Display */}
            {consensusModal.error && (
              <div className="bg-rose-950/40 border border-rose-800 rounded-xl p-3 text-xs text-rose-300 font-mono space-y-1">
                <div className="flex items-center gap-1 font-bold">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Execution Error:</span>
                </div>
                <p className="text-[11px] break-words">{consensusModal.error}</p>
              </div>
            )}

            {/* Resolution Outcome Result Card (if applicable) */}
            {consensusModal.resultOutcome && (
              <div className="bg-slate-950 border border-indigo-700/50 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">Consensus Outcome:</span>
                  <span
                    className={`font-mono text-sm font-black px-2 py-0.5 rounded ${
                      consensusModal.resultOutcome === 'YES'
                        ? 'bg-emerald-500 text-slate-950'
                        : consensusModal.resultOutcome === 'NO'
                        ? 'bg-rose-500 text-slate-950'
                        : 'bg-amber-500 text-slate-950'
                    }`}
                  >
                    {consensusModal.resultOutcome}
                  </span>
                </div>
                {consensusModal.resultRationale && (
                  <div className="text-xs text-slate-300 italic pt-1 border-t border-slate-800">
                    &ldquo;{consensusModal.resultRationale}&rdquo;
                  </div>
                )}
              </div>
            )}

            {/* Transaction Hash & Close */}
            <div className="space-y-3 pt-2 border-t border-slate-800">
              {consensusModal.txHash && (
                <div className="flex items-center justify-between text-xs font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-400">Tx Hash:</span>
                  <span className="text-cyan-400 truncate max-w-[200px]">
                    {consensusModal.txHash}
                  </span>
                  <button
                    onClick={() => copyToClipboard(consensusModal.txHash)}
                    className="text-slate-400 hover:text-white transition"
                    title="Copy Tx Hash"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {(consensusModal.stage === 'FINALIZED' || consensusModal.stage === 'ERROR') && (
                <button
                  type="button"
                  onClick={() => setConsensusModal((prev) => ({ ...prev, isOpen: false }))}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white font-mono text-xs font-bold py-2.5 rounded-xl transition cursor-pointer"
                >
                  Close Tracker
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Market Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition"
            >
              <XCircle className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-cyan-400" />
              <h2 className="text-lg font-bold text-white tracking-tight">
                Create Real-World Prediction Market
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              Deploy an autonomous market resolved purely by GenLayer AI validators scraping public web data.
            </p>

            <form onSubmit={handleCreateMarket} className="space-y-3 text-xs font-mono">
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Market Question:
                </label>
                <input
                  type="text"
                  required
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  placeholder="e.g. Will Ethereum mainnet activate Pectra before Q3 2026?"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Authoritative HTTPS Source URL:
                </label>
                <input
                  type="url"
                  required
                  value={newSourceUrl}
                  onChange={(e) => setNewSourceUrl(e.target.value)}
                  placeholder="https://eips.ethereum.org/EIPS/eip-7600"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Resolution Rules (Instructions for AI Validators):
                </label>
                <textarea
                  required
                  rows={2}
                  value={newRules}
                  onChange={(e) => setNewRules(e.target.value)}
                  placeholder="Resolves to YES if consensus specs confirm activation. Resolves to NO if officially abandoned. Returns NOT_YET if pending."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-400 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    Deadline (ISO 8601):
                  </label>
                  <input
                    type="text"
                    required
                    value={newDeadline}
                    onChange={(e) => setNewDeadline(e.target.value)}
                    placeholder="2026-12-31T23:59:59Z"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    Initial Seed Liquidity (GEN):
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={newSeedGen}
                    onChange={(e) => setNewSeedGen(e.target.value)}
                    placeholder="1.0"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div className="text-[11px] text-slate-500 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                Seed liquidity will be split 50% / 50% into YES and NO pools to establish initial 1:1 odds.
              </div>

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 font-bold py-3 rounded-xl text-xs font-mono transition cursor-pointer shadow-lg shadow-cyan-500/20"
              >
                Broadcast to Studionet
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Wallet Connection Modal */}
      {showWalletModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setShowWalletModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition"
            >
              <XCircle className="w-5 h-5" />
            </button>

            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <Wallet className="w-5 h-5 text-cyan-400" />
                Connect to Studionet
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Choose your preferred method to sign transactions on GenLayer Studionet.
              </p>
            </div>

            {/* Option 1: Web3 Wallet */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={connectWeb3Wallet}
                disabled={isWalletConnecting}
                className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-cyan-400 text-white font-mono text-xs font-bold py-3 px-4 rounded-xl transition flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-cyan-400" />
                  <span>MetaMask / Rabby / Browser Wallet</span>
                </div>
                <span className="text-[10px] text-cyan-300 bg-cyan-950 px-1.5 py-0.5 rounded">
                  EIP-1193
                </span>
              </button>
              <p className="text-[11px] text-slate-500 px-1">
                Automatically switches your network to GenLayer Studionet (Chain ID: 61999).
              </p>
            </div>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-800"></div>
              <span className="flex-shrink mx-3 text-slate-500 font-mono text-[10px] uppercase">
                OR Instant Key
              </span>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>

            {/* Option 2: Private Key */}
            <div className="space-y-2 text-xs font-mono">
              <label className="block text-slate-300 font-bold">
                Studionet Private Key (Hex):
              </label>
              <input
                type="password"
                value={customPrivateKey}
                onChange={(e) => setCustomPrivateKey(e.target.value)}
                placeholder="0x..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-cyan-400 font-mono"
              />
              <button
                type="button"
                onClick={connectWithPrivateKey}
                className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold py-2.5 rounded-xl transition cursor-pointer"
              >
                Connect with Private Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/80 py-8 px-4 text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-300 font-bold">PulseMarket</span>
            <span>&bull;</span>
            <span>Autonomous Prediction Markets via GenLayer Intelligent Contracts</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/jimmyogb/pulsemarket"
              target="_blank"
              rel="noreferrer"
              className="hover:text-cyan-400 transition"
            >
              GitHub: jimmyogb/pulsemarket
            </a>
            <span>&bull;</span>
            <a
              href="https://genlayer.com"
              target="_blank"
              rel="noreferrer"
              className="hover:text-cyan-400 transition"
            >
              Powered by GenLayer
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
