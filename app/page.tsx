"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "./contexts/WalletContext";
import {
  rpc as StellarRpc,
  TransactionBuilder,
  Networks,
  Address,
  scValToNative,
  Contract,
  nativeToScVal,
} from "@stellar/stellar-sdk";
import {
  Rocket,
  Clock,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Coins,
  RotateCcw,
  AlertCircle,
  ExternalLink,
  X,
  Zap,
  Users,
  BarChart3,
} from "lucide-react";
import { FaWallet } from "react-icons/fa";
import { AnimatePresence, motion } from "framer-motion";

// ─── Contract Config ───────────────────────────────────────────────────────────
const LAUNCHPAD_ID = "CAIO6PTUCO7NMIF67T4I7QFWHZSYWVVZ3WVFLRD7LEUQI64RKDLQD4VH";
const TOKEN_ID = "CB5VGFF6XPOYTN6SEQ5OE3DQBDYGULNECDYMK3CTOR4DL5NIVIEWRPVR";
const RPC_URL = "https://soroban-testnet.stellar.org:443";

const server = new StellarRpc.Server(RPC_URL);
const networkPassphrase = Networks.TESTNET;

// ─── Helpers ───────────────────────────────────────────────────────────────────
function stroopsToXlm(stroops: bigint | number): string {
  return (Number(stroops) / 10_000_000).toFixed(2);
}

function xlmToStroops(xlm: string): bigint {
  return BigInt(Math.floor(parseFloat(xlm) * 10_000_000));
}

function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function pct(funded: bigint, target: bigint): number {
  if (target === 0n) return 0;
  return Math.min(100, Number((funded * 100n) / target));
}

const STATE_LABEL: Record<number, string> = {
  0: "LIVE",
  1: "SUCCESS",
  2: "EXPIRED",
};

const STATE_COLOR: Record<number, string> = {
  0: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  1: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10",
  2: "text-rose-400 border-rose-500/30 bg-rose-500/10",
};

// ─── Component ─────────────────────────────────────────────────────────────────
export default function LaunchpadPage() {
  const { address: connectedAddress, walletsKit, setAddress } = useWallet();

  const [mounted, setMounted] = useState(false);

  // contract state
  const [state, setState] = useState<number | null>(null);
  const [funded, setFunded] = useState<bigint>(0n);
  const [target, setTarget] = useState<bigint>(0n);
  const [buyerBalance, setBuyerBalance] = useState<bigint>(0n);
  const [tokenBalance, setTokenBalance] = useState<bigint>(0n);
  const [xlmBalance, setXlmBalance] = useState<string>("0");

  // ui state
  const [buyAmount, setBuyAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [txStatus, setTxStatus] = useState<{
    type: "success" | "error" | "pending";
    msg: string;
    hash?: string;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // ── Reads ─────────────────────────────────────────────────────────────────────
  const readContract = useCallback(async () => {
    if (typeof window === "undefined") return;
    try {
      setRefreshing(true);
      const sourceAddress =
        connectedAddress ||
        "GDXK7EYVBXTITLBW2ZCODJW3B7VTVCNNNWDDEHKJ7Y67TZVW5VKRRMU6";
      const account = await server.getAccount(sourceAddress);
      const contract = new Contract(LAUNCHPAD_ID);

      const sim = async (method: string, ...args: any[]) => {
        const tx = new TransactionBuilder(account, {
          fee: "1000",
          networkPassphrase,
        })
          .addOperation(contract.call(method, ...args))
          .setTimeout(30)
          .build();
        const result = await server.simulateTransaction(tx);
        if (StellarRpc.Api.isSimulationSuccess(result)) {
          return scValToNative(result.result!.retval);
        }
        return null;
      };

      const [rawState, rawFunded, rawTarget] = await Promise.all([
        sim("get_state"),
        sim("get_funded"),
        sim("get_target"),
      ]);

      if (rawState !== null) setState(Number(rawState));
      if (rawFunded !== null) setFunded(BigInt(rawFunded));
      if (rawTarget !== null) setTarget(BigInt(rawTarget));

      if (connectedAddress) {
        const userScVal = new Address(connectedAddress).toScVal();

        const [rawBuyerBal, rawTokenBal] = await Promise.all([
          sim("get_buyer_balance", userScVal),
          (async () => {
            const tokenContract = new Contract(TOKEN_ID);
            const tokenTx = new TransactionBuilder(account, {
              fee: "1000",
              networkPassphrase,
            })
              .addOperation(tokenContract.call("balance", userScVal))
              .setTimeout(30)
              .build();
            const tokenSim = await server.simulateTransaction(tokenTx);
            return StellarRpc.Api.isSimulationSuccess(tokenSim)
              ? scValToNative(tokenSim.result!.retval)
              : null;
          })(),
        ]);

        if (rawBuyerBal !== null) setBuyerBalance(BigInt(rawBuyerBal));
        if (rawTokenBal !== null) setTokenBalance(BigInt(rawTokenBal));
      }
    } catch (e) {
      console.error("Read error:", e);
    } finally {
      setRefreshing(false);
    }
  }, [connectedAddress]);

  const loadXlmBalance = useCallback(async () => {
    if (!connectedAddress || typeof window === "undefined") return;
    try {
      const res = await fetch(
        `https://horizon-testnet.stellar.org/accounts/${connectedAddress}`
      );
      const data = await res.json();
      const native = data.balances?.find((b: any) => b.asset_type === "native");
      setXlmBalance(native ? parseFloat(native.balance).toFixed(2) : "0");
    } catch {}
  }, [connectedAddress]);

  useEffect(() => {
    if (!mounted) return;
    readContract();
  }, [readContract, mounted]);

  useEffect(() => {
    if (!mounted) return;
    loadXlmBalance();
  }, [loadXlmBalance, mounted]);

  // auto-dismiss tx status
  useEffect(() => {
    if (txStatus && txStatus.type !== "pending") {
      const t = setTimeout(() => setTxStatus(null), 10000);
      return () => clearTimeout(t);
    }
  }, [txStatus]);

  // ── Writes ────────────────────────────────────────────────────────────────────
  const sendTx = async (method: string, ...args: any[]) => {
    if (!connectedAddress || !walletsKit) return;
    setLoading(true);
    setTxStatus({ type: "pending", msg: `Broadcasting ${method}...` });
    try {
      const account = await server.getAccount(connectedAddress);
      const contract = new Contract(LAUNCHPAD_ID);
      const tx = new TransactionBuilder(account, {
        fee: "10000",
        networkPassphrase,
      })
        .addOperation(contract.call(method, ...args))
        .setTimeout(30)
        .build();

      const prepared = await server.prepareTransaction(tx);
      const { signedTxXdr } = await walletsKit.signTransaction(prepared.toXDR());
      const response = await server.sendTransaction(
        TransactionBuilder.fromXDR(signedTxXdr, networkPassphrase)
      );

      if (response.status === "ERROR") {
        throw new Error(`Transaction rejected: ${response.status}`);
      }

      // Poll until confirmed — as recommended in the official guide
      const hash = response.hash;
      let getResponse = await server.getTransaction(hash);
      while (getResponse.status === "NOT_FOUND") {
        await new Promise((r) => setTimeout(r, 1000));
        getResponse = await server.getTransaction(hash);
      }

      if (getResponse.status === "SUCCESS") {
        setTxStatus({
          type: "success",
          msg: "Transaction confirmed!",
          hash,
        });
        await readContract();
        await loadXlmBalance();
      } else {
        throw new Error(`Transaction failed: ${getResponse.status}`);
      }
    } catch (err: any) {
      console.error(err);
      setTxStatus({ type: "error", msg: err.message || `${method} failed` });
    } finally {
      setLoading(false);
    }
  };

  const handleBuy = () => {
    if (!buyAmount || parseFloat(buyAmount) <= 0) return;
    const stroops = xlmToStroops(buyAmount);
    sendTx(
      "buy",
      new Address(connectedAddress!).toScVal(),
      nativeToScVal(stroops, { type: "i128" })
    );
    setBuyAmount("");
  };

  const handleClaim = () => {
    sendTx("claim", new Address(connectedAddress!).toScVal());
  };

  const handleRefund = () => {
    sendTx("refund", new Address(connectedAddress!).toScVal());
  };

  // ── Derived UI Values ──────────────────────────────────────────────────────────
  const progress = pct(funded, target);
  const fundedXlm = stroopsToXlm(funded);
  const targetXlm = stroopsToXlm(target);
  const myContrib = stroopsToXlm(buyerBalance);
  const myTokens = stroopsToXlm(tokenBalance);
  const canBuy = state === 0 && connectedAddress;
  const canClaim = state === 1 && buyerBalance > 0n && connectedAddress;
  const canRefund = state === 2 && buyerBalance > 0n && connectedAddress;

  if (!mounted) return null;


  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#040407] text-zinc-200 font-mono selection:bg-emerald-500/30">
      {/* Background grid */}
      <div
        className="fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(#10b981 1px, transparent 1px), linear-gradient(90deg, #10b981 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative max-w-2xl mx-auto px-4 py-10 pb-32 space-y-6">
        {/* ── Header ── */}
        <header className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Rocket size={28} className="text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-widest text-white uppercase">
              Token Launch
            </h1>
            {state !== null && (
              <span
                className={`ml-auto text-[10px] font-bold px-3 py-1 rounded-full border tracking-widest ${STATE_COLOR[state]}`}
              >
                {STATE_LABEL[state]}
              </span>
            )}
          </div>
   
        </header>

        {/* ── Progress Card ── */}
        <div className="border border-zinc-800 rounded-2xl p-6 space-y-5 bg-zinc-900/30 backdrop-blur">
          {/* Amounts */}
          <div className="flex justify-between items-end">
            <div>
              <p className="text-[10px] text-zinc-500 tracking-widest uppercase mb-1">
                Raised
              </p>
              <p className="text-4xl font-bold text-white tabular-nums">
                {fundedXlm}
                <span className="text-lg text-zinc-500 ml-2">XLM</span>
              </p>
            </div>
           
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-zinc-600 tracking-wider">
              <span>{progress.toFixed(1)}% funded</span>
              <span>
                {target > 0n ? stroopsToXlm(target - funded) : "—"} XLM
                remaining
              </span>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-zinc-800/50">
            <div className="space-y-1">
              <p className="text-[9px] text-zinc-600 uppercase tracking-widest flex items-center gap-1">
                <BarChart3 size={10} /> State
              </p>
              <p
                className={`text-xs font-bold ${
                  state !== null
                    ? STATE_COLOR[state].split(" ")[0]
                    : "text-zinc-500"
                }`}
              >
                {state !== null ? STATE_LABEL[state] : "—"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[9px] text-zinc-600 uppercase tracking-widest flex items-center gap-1">
                <TrendingUp size={10} /> Staked
              </p>
              <p className="text-xs font-bold text-zinc-300">
                {connectedAddress ? `${myContrib} XLM` : "—"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[9px] text-zinc-600 uppercase tracking-widest flex items-center gap-1">
                <Coins size={10} /> My Tokens
              </p>
              <p className="text-xs font-bold text-zinc-300">
                {connectedAddress ? myTokens : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* ── Buy Panel ── */}
        {canBuy && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="border border-zinc-800 rounded-2xl p-6 space-y-4 bg-zinc-900/20"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold tracking-widest text-zinc-400 uppercase flex items-center gap-2">
                <Zap size={14} className="text-emerald-400" />
                Participate
              </h2>
              <span className="text-[10px] text-zinc-600">
                Balance: <span className="text-zinc-400">{xlmBalance} XLM</span>
              </span>
            </div>

            <div className="flex gap-3">
              <div className="relative flex-1">
                <input
                  type="number"
                  placeholder="0.00"
                  value={buyAmount}
                  onChange={(e) => setBuyAmount(e.target.value)}
                  className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-lg font-bold outline-none focus:border-emerald-500/50 transition-colors pr-16"
                />
                <button
                  onClick={() =>
                    setBuyAmount(
                      String(Math.max(0, parseFloat(xlmBalance) - 1).toFixed(2))
                    )
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-emerald-500 hover:text-emerald-400 tracking-wider"
                >
                  MAX
                </button>
              </div>
              <span className="flex items-center text-zinc-500 text-sm font-bold px-2">
                XLM
              </span>
            </div>

            <button
              onClick={handleBuy}
              disabled={
                loading ||
                !buyAmount ||
                parseFloat(buyAmount) <= 0 ||
                parseFloat(buyAmount) > parseFloat(xlmBalance)
              }
              className="w-full py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black tracking-widest uppercase text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RotateCcw size={16} className="animate-spin" />{" "}
                  Broadcasting...
                </>
              ) : parseFloat(buyAmount || "0") > parseFloat(xlmBalance) ? (
                <>
                  <AlertCircle size={16} /> Insufficient Balance
                </>
              ) : (
                <>
                  <Rocket size={16} /> Buy Tokens
                </>
              )}
            </button>
          </motion.div>
        )}

        {/* ── Claim Panel ── */}
        {canClaim && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="border border-cyan-500/20 rounded-2xl p-6 space-y-4 bg-cyan-500/5"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} className="text-cyan-400" />
              <h2 className="text-xs font-bold tracking-widest text-cyan-400 uppercase">
                Launch Successful — Claim Your Tokens
              </h2>
            </div>
            <p className="text-zinc-400 text-sm">
              You contributed{" "}
              <span className="text-white font-bold">{myContrib} XLM</span>.
              Claim your project tokens now.
            </p>
            <button
              onClick={handleClaim}
              disabled={loading}
              className="w-full py-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-black tracking-widest uppercase text-sm transition-all disabled:opacity-40 active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RotateCcw size={16} className="animate-spin" /> Claiming...
                </>
              ) : (
                <>
                  <Coins size={16} /> Claim {myContrib} Tokens
                </>
              )}
            </button>
          </motion.div>
        )}

        {/* ── Refund Panel ── */}
        {canRefund && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="border border-rose-500/20 rounded-2xl p-6 space-y-4 bg-rose-500/5"
          >
            <div className="flex items-center gap-2">
              <XCircle size={18} className="text-rose-400" />
              <h2 className="text-xs font-bold tracking-widest text-rose-400 uppercase">
                Launch Expired — Claim Refund
              </h2>
            </div>
            <p className="text-zinc-400 text-sm">
              The target was not reached. You can refund your{" "}
              <span className="text-white font-bold">{myContrib} XLM</span>.
            </p>
            <button
              onClick={handleRefund}
              disabled={loading}
              className="w-full py-4 rounded-xl border border-rose-500/30 hover:bg-rose-500/10 text-rose-400 font-black tracking-widest uppercase text-sm transition-all disabled:opacity-40 active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RotateCcw size={16} className="animate-spin" /> Processing...
                </>
              ) : (
                <>
                  <RotateCcw size={16} /> Refund {myContrib} XLM
                </>
              )}
            </button>
          </motion.div>
        )}

        {/* ── Wallet-gated states ── */}
        {!connectedAddress && state === 0 && (
          <div className="border border-dashed border-zinc-800 rounded-2xl p-8 text-center space-y-2">
            <Users size={32} className="mx-auto text-zinc-700" />
            <p className="text-zinc-500 text-sm">
              Connect your wallet to participate
            </p>
          </div>
        )}

        {/* ── Contract Info ── */}
        <div className="border border-zinc-800/50 rounded-2xl p-5 space-y-3">
          <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
            Contract Info
          </h3>
          <div className="space-y-2">
            {[
              { label: "Launchpad", addr: LAUNCHPAD_ID },
              { label: "Token", addr: TOKEN_ID },
            ].map(({ label, addr }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-600 uppercase tracking-wider">
                  {label}
                </span>
                <a
                  href={`https://stellar.expert/explorer/testnet/contract/${addr}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-mono text-zinc-500 hover:text-emerald-400 transition-colors flex items-center gap-1"
                >
                  {formatAddress(addr)}
                  <ExternalLink size={10} />
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Connect Wallet Button ── */}
      {!connectedAddress && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-full max-w-xs px-4 z-50">
          <button
            onClick={() =>
              walletsKit.openModal({
                onWalletSelected: async (option) => {
                  const { address } = await walletsKit.getAddress();
                  setAddress(address);
                  return option;
                },
              })
            }
            className="group relative w-full overflow-hidden rounded-2xl bg-zinc-950 p-[1.5px] transition-all hover:scale-105 active:scale-95 shadow-[0_0_40px_-10px_rgba(16,185,129,0.3)]"
          >
            <div className="absolute inset-[-1000%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#10b981_0%,#064e3b_50%,#10b981_100%)]" />
            <div className="relative flex h-full w-full items-center justify-center gap-3 rounded-[15px] bg-zinc-950 px-8 py-4 transition-all group-hover:bg-zinc-900/50 backdrop-blur-xl">
              <FaWallet className="text-emerald-500 text-lg shrink-0" />
              <span className="text-sm font-black tracking-widest text-emerald-500 uppercase">
                Connect Wallet
              </span>
            </div>
          </button>
        </div>
      )}

      {/* ── TX Status Toast ── */}
      <AnimatePresence>
        {txStatus && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`fixed bottom-28 left-1/2 -translate-x-1/2 w-full max-w-sm mx-4 p-4 rounded-2xl flex items-center justify-between gap-4 border z-50 backdrop-blur ${
              txStatus.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : txStatus.type === "error"
                ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                : "bg-cyan-500/10 border-cyan-500/20 text-cyan-400"
            }`}
          >
            <div className="flex items-center gap-3 font-bold text-sm">
              <AlertCircle size={16} />
              <span className="text-xs">{txStatus.msg}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {txStatus.hash && (
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${txStatus.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <ExternalLink size={14} />
                </a>
              )}
              <button
                onClick={() => setTxStatus(null)}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-zinc-500"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
