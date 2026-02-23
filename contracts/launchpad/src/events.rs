use soroban_sdk::{symbol_short, Address, Env};

pub fn funded(env: &Env, buyer: Address, amount: i128, total: i128) {
    env.events()
        .publish((symbol_short!("funded"), buyer), (amount, total));
}

pub fn claimed(env: &Env, caller: Address, amount: i128) {
    env.events()
        .publish((symbol_short!("claimed"), caller), amount);
}

pub fn refunded(env: &Env, caller: Address, amount: i128) {
    env.events()
        .publish((symbol_short!("refunded"), caller), amount);
}

pub fn pool_created(env: &Env, token: Address, funding_token: Address, amount: i128) {
    env.events()
        .publish((symbol_short!("pool"), token, funding_token), amount);
}