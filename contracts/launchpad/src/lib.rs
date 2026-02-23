#![no_std]
use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, contracttype, vec, Address, Env, IntoVal, Symbol,
};
use soroban_sdk::token as xlm_token;
 

mod events;

#[contracttype]
enum DataKey {
    Token,
    FundingToken,
    Target,
    Deadline,
    Funded,
    Success,
    Initialized,
    BuyerBalance(Address),
}

#[derive(PartialEq, Clone, Copy)]
#[contracttype]
pub enum State {
    Running = 0,
    Success = 1,
    Expired = 2,
}

#[contract]
pub struct Launchpad;

#[contractimpl]
impl Launchpad {
 
    pub fn initialize(
        env: Env,
        token: Address,
        funding_token: Address,
        target: i128,
        deadline: u64,
    ) {
 
        assert!(
            !env.storage().instance().has(&DataKey::Initialized),
            "already initialized"
        );
        assert!(target > 0, "target must be positive");
        assert!(
            deadline > env.ledger().timestamp(),
            "deadline must be in the future"
        );

        env.storage().instance().set(&DataKey::Initialized, &true);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::FundingToken, &funding_token);
        env.storage().instance().set(&DataKey::Target, &target);
        env.storage().instance().set(&DataKey::Deadline, &deadline);
        env.storage().instance().set(&DataKey::Funded, &0i128);
        env.storage().instance().set(&DataKey::Success, &false);
    }

    /// Contribute funding_token to the launch. 
    pub fn buy(env: Env, buyer: Address, amount: i128) {
        buyer.require_auth();
        assert!(amount > 0, "amount must be positive");

        let state = Self::get_state_internal(&env);
        assert!(state == State::Running, "launch not running");

        // Pull funding_token from buyer into the contract
        let funding_token: Address = env.storage().instance().get(&DataKey::FundingToken).unwrap();
        let client = xlm_token::Client::new(&env, &funding_token); 
        client.transfer(&buyer, &env.current_contract_address(), &amount);

        // Track total funded
        let mut funded: i128 = env.storage().instance().get(&DataKey::Funded).unwrap();
        funded += amount;
        env.storage().instance().set(&DataKey::Funded, &funded);

        // Track this buyer's individual contribution
        let mut buyer_balance: i128 = env
            .storage()
            .instance()
            .get(&DataKey::BuyerBalance(buyer.clone()))
            .unwrap_or(0);
        buyer_balance += amount;
        env.storage()
            .instance()
            .set(&DataKey::BuyerBalance(buyer.clone()), &buyer_balance);

        // Check if target has been reached
        let target: i128 = env.storage().instance().get(&DataKey::Target).unwrap();
        if funded >= target {
            env.storage().instance().set(&DataKey::Success, &true);
            Self::create_liquidity_pool(&env);
        }

        events::funded(&env, buyer, amount, funded);
    }

    /// Claim project tokens after a successful launch.
    pub fn claim(env: Env, caller: Address) {
        caller.require_auth();
    
        let state = Self::get_state_internal(&env);
        assert!(state == State::Success, "launch not successful");
    
        let balance: i128 = env
            .storage()
            .instance()
            .get(&DataKey::BuyerBalance(caller.clone()))
            .unwrap_or(0);
        assert!(balance > 0, "no tokens to claim");
    
        env.storage()
            .instance()
            .set(&DataKey::BuyerBalance(caller.clone()), &0i128);
    
        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
    
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
    
        env.invoke_contract::<()>(
            &token_addr,
            &Symbol::new(&env, "mint"),
            vec![
                &env,
                caller.clone().into_val(&env),
                balance.into_val(&env),
            ],
        );
    
        events::claimed(&env, caller, balance);
    }

    /// Refund funding_token if the launch expired without hitting target.
    pub fn refund(env: Env, caller: Address) {
        caller.require_auth();

        let state = Self::get_state_internal(&env);
        assert!(state == State::Expired, "launch not expired");

        let balance: i128 = env
            .storage()
            .instance()
            .get(&DataKey::BuyerBalance(caller.clone()))
            .unwrap_or(0);
        assert!(balance > 0, "no funding to refund");

        env.storage()
            .instance()
            .set(&DataKey::BuyerBalance(caller.clone()), &0i128);

        // Return funding_token to the caller
        let funding_token: Address = env.storage().instance().get(&DataKey::FundingToken).unwrap();
        let client = xlm_token::Client::new(&env, &funding_token); 
        client.transfer(&env.current_contract_address(), &caller, &balance);

        events::refunded(&env, caller, balance);
    }

    /// Public state getter — returns 0 (Running), 1 (Success), 2 (Expired).
    pub fn get_state(env: Env) -> u32 {
        match Self::get_state_internal(&env) {
            State::Running => 0,
            State::Success => 1,
            State::Expired => 2,
        }
    }

    /// Read-only view helpers
    pub fn get_funded(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::Funded).unwrap_or(0)
    }

    pub fn get_target(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::Target).unwrap()
    }

    pub fn get_buyer_balance(env: Env, buyer: Address) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::BuyerBalance(buyer))
            .unwrap_or(0)
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /// Internal state resolution — checks success flag first so that a
    /// successful raise is immediately claimable without waiting for deadline.
    fn get_state_internal(env: &Env) -> State {
        let success: bool = env
            .storage()
            .instance()
            .get(&DataKey::Success)
            .unwrap_or(false);

        if success {
            return State::Success;
        }

        let deadline: u64 = env.storage().instance().get(&DataKey::Deadline).unwrap();
        if env.ledger().timestamp() < deadline {
            State::Running
        } else {
            State::Expired
        }
    }

    fn create_liquidity_pool(env: &Env) {
        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let funding_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::FundingToken)
            .unwrap();
        let funded: i128 = env.storage().instance().get(&DataKey::Funded).unwrap();

        // add: AMM contract invocation
        events::pool_created(env, token, funding_token, funded);
    }
}