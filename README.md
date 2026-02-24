# Stellar Token Launchpad

A decentralized token launchpad (IDO) built on Stellar/Soroban. Contributors fund a raise using native XLM. If the target is hit before the deadline, the launch succeeds and contributors claim project tokens. If not, everyone gets a full refund.

## Live Demo

> [https://s-token-launchpad.vercel.app](https://s-token-launchpad.vercel.app)

---

## Screenshots

### Mobile Responsive View
> ![Mobile Responsive View](app/screenshot/mobile-responsive.png)

### CI/CD Pipeline
>

---

## Architecture

The project is split into two Soroban smart contracts and a Next.js frontend.

```
.
├── contracts/
│   ├── launchpad/        # IDO logic — buy, claim, refund, state
│   └── token/            # Custom project token — mint, transfer, balance
└── app/                  # Next.js frontend
```

### Contract Flow

```
1. Deploy token contract
2. Deploy launchpad contract
3. Initialize token  →  admin = launchpad contract address
4. Initialize launchpad  →  token, funding_token, target, deadline
5. Users call buy()  →  XLM transferred to launchpad, contribution tracked
6. If funded >= target  →  state flips to Success automatically
7. Users call claim()  →  launchpad mints project tokens 1:1 to contributor
8. If deadline passes without hitting target  →  state = Expired
9. Users call refund()  →  XLM returned to contributor
```

### Inter-Contract Call

The key pattern is the launchpad minting tokens on behalf of users after a successful raise. This uses Soroban's `authorize_as_current_contract` to pre-authorize the cross-contract mint call:

```rust
env.authorize_as_current_contract(vec![
    &env,
    InvokerContractAuthEntry::Contract(SubContractInvocation {
        context: ContractContext {
            contract: token_addr.clone(),
            fn_name: Symbol::new(&env, "mint"),
            args: (caller.clone(), balance).into_val(&env),
        },
        sub_invocations: vec![&env],
    }),
]);
```

---

## Contract Addresses (Testnet)

| Contract | Address |
|---|---|
| Token | `CB5VGFF6XPOYTN6SEQ5OE3DQBDYGULNECDYMK3CTOR4DL5NIVIEWRPVR` |
| Launchpad | `CAIO6PTUCO7NMIF67T4I7QFWHZSYWVVZ3WVFLRD7LEUQI64RKDLQD4VH` |
| Funding Token (XLM SAC) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |

---

## Contract Functions

### Launchpad

| Function | Description |
|---|---|
| `initialize(token, funding_token, target, deadline)` | Set up the raise parameters |
| `buy(buyer, amount)` | Contribute XLM to the raise |
| `claim(caller)` | Claim project tokens after successful raise |
| `refund(caller)` | Get XLM back after expired raise |
| `get_state()` | Returns 0 (Running), 1 (Success), 2 (Expired) |
| `get_funded()` | Total XLM raised so far |
| `get_target()` | Raise target in stroops |
| `get_buyer_balance(buyer)` | Individual contribution amount |

### Token

| Function | Description |
|---|---|
| `initialize(admin)` | Set admin — must be launchpad contract address |
| `mint(to, amount)` | Mint tokens — only callable by admin (launchpad) |
| `balance(addr)` | Get token balance |
| `transfer(from, to, amount)` | Transfer tokens between addresses |
| `total_supply()` | Total tokens minted |
| `approve(owner, spender, amount)` | Approve spender allowance |
| `allowance(owner, spender)` | Check allowance |

---

## Getting Started

### Prerequisites

- Rust + `wasm32-unknown-unknown` target
- Stellar CLI
- Node.js 18+

```bash
rustup target add wasm32-unknown-unknown
cargo install --locked stellar-cli --features opt
```

### Build Contracts

```bash
cargo clean && cargo build --target wasm32-unknown-unknown --release
```

Compiled contracts output to:
```
target/wasm32-unknown-unknown/release/token.wasm
target/wasm32-unknown-unknown/release/launchpad.wasm
```

### Deploy to Testnet

```bash
# Set up identity
stellar keys generate deployer --network testnet
stellar keys fund deployer --network testnet
export DEPLOYER=$(stellar keys address deployer)

# Deploy
stellar contract deploy --wasm target/wasm32-unknown-unknown/release/token.wasm --source deployer --network testnet
export TOKEN_ID=<printed_id>

stellar contract deploy --wasm target/wasm32-unknown-unknown/release/launchpad.wasm --source deployer --network testnet
export LAUNCHPAD_ID=<printed_id>

# Initialize token — admin MUST be launchpad address
stellar contract invoke --id $TOKEN_ID --source deployer --network testnet \
  -- initialize --admin $LAUNCHPAD_ID

# Initialize launchpad
export FUNDING_TOKEN=$(stellar contract id asset --asset native --network testnet)
export DEADLINE=$(( $(date +%s) + 86400 ))

stellar contract invoke --id $LAUNCHPAD_ID --source deployer --network testnet \
  -- initialize \
  --token $TOKEN_ID \
  --funding_token $FUNDING_TOKEN \
  --target 10000000 \
  --deadline $DEADLINE
```

### Run Frontend

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Testing the Full Flow

```bash
# 1. Buy — contribute 1 XLM (10000000 stroops)
stellar contract invoke --id $LAUNCHPAD_ID --source deployer --network testnet --send yes \
  -- buy --buyer $DEPLOYER --amount 10000000

# 2. Check state (should return 1 = Success if target hit)
stellar contract invoke --id $LAUNCHPAD_ID --source deployer --network testnet \
  -- get_state

# 3. Claim project tokens
stellar contract invoke --id $LAUNCHPAD_ID --source deployer --network testnet --send yes \
  -- claim --caller $DEPLOYER

# 4. Check token balance
stellar contract invoke --id $TOKEN_ID --source deployer --network testnet \
  -- balance --addr $DEPLOYER

# 5. Try to claim again (should fail: "no tokens to claim")
stellar contract invoke --id $LAUNCHPAD_ID --source deployer --network testnet \
  -- claim --caller $DEPLOYER
```

---

## State Machine

```
                    ┌─────────┐
                    │ Running │  timestamp < deadline && !success
                    └────┬────┘
                         │ funded >= target
                         ▼
                    ┌─────────┐
                    │ Success │  claim() available
                    └─────────┘

                    ┌─────────┐
                    │ Expired │  timestamp >= deadline && !success
                    └─────────┘  refund() available
```

---

## Tech Stack

- **Smart Contracts** — Rust, Soroban SDK 21
- **Blockchain** — Stellar Testnet
- **Frontend** — Next.js 14, TypeScript
- **Styling** — Tailwind CSS
- **Deployment** — Vercel

---

## CI/CD

GitHub Actions runs on every push to `main`:

```yaml
# .github/workflows/ci.yml
- Build and lint contracts
- Run Soroban unit tests
- Build Next.js frontend
- Deploy to Vercel on success
```

---