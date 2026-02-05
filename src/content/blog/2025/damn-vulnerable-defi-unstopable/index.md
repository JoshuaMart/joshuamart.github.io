---
title: 'Damn Vulnerable Defi : Unstoppable'
date: 2025-04-08
description: 'Solving the Unstoppable challenge from Damn Vulnerable DeFi.'
tags: ['web3', 'solidity', 'ctf']
image: '/images/blog/2025/damn-vulnerable-defi-unstopable.png'
---

In this article, we'll dive deep into the "Unstoppable" challenge from Damn Vulnerable DeFi v4, exploring a subtle but devastating vulnerability in a tokenized vault contract. We'll examine Ethereum token standards, investigate how a single token transfer can permanently break a financial protocol, and unravel the mechanics of this attack.

A great challenge for beginners as it allows you to see different importants concepts

## The Challenge

The "Unstoppable" challenge presents us with a scenario where a vault has been deployed with a million DVT tokens. The vault offers flash loans to users but includes a vulnerability that allows an attacker to permanently disable this functionality.

The challenge description states:

> There's a tokenized vault with a million DVT tokens deposited. It's offering flash loans for free, until the grace period ends.
>
> To catch any bugs before going 100% permissionless, the developers decided to run a live beta in testnet. There's a monitoring contract to check liveness of the flashloan feature.
>
> Starting with 10 DVT tokens in balance, show that it's possible to halt the vault. It must stop offering flash loans.

Our objective is to find a way to break the flash loan feature, rendering the vault "unstoppable."

## Understanding the Relevant Standards

Before diving into the vulnerability, let's understand the two standards that form the foundation of this vault contract.

### ERC4626: The Tokenized Vault Standard

ERC4626 is an extension of the ERC20 token standard that standardizes tokenized vaults. The key concept behind ERC4626 is simple but powerful:

1. Users deposit an underlying token (the "asset") into the vault
2. The vault issues "shares" (another token) that represent the user's proportional ownership of the vault
3. These shares can be later redeemed for the underlying assets, potentially with accumulated yield

The standard defines several key functions:
- `deposit()`: Deposit assets and receive shares
- `withdraw()`: Withdraw assets by burning shares
- `redeem()`: Redeem shares for assets
- `totalAssets()`: Return the total amount of underlying assets in the vault
- `convertToShares()`: Convert a given amount of assets to an equivalent amount of shares
- `convertToAssets()`: Convert a given amount of shares to an equivalent amount of assets

The primary benefit of ERC4626 is standardization, it creates a unified interface for yield-generating vaults across different protocols, making them more composable and user-friendly.

### ERC3156: The Flash Loan Standard

ERC3156 standardizes flash loans, a DeFi primitive that allows borrowing assets without collateral, provided they are returned within the same transaction.

The standard defines two main interfaces:
- `IERC3156FlashLender`: Implemented by contracts that offer flash loans
- `IERC3156FlashBorrower`: Implemented by contracts that want to borrow via flash loans

Key functions in the lender interface include:
- `maxFlashLoan()`: Returns the maximum amount available for a flash loan
- `flashFee()`: Calculates the fee for a flash loan
- `flashLoan()`: Executes the flash loan

The standard ensures that flash loan providers and consumers can interact seamlessly, regardless of which protocols they belong to.

## The Vulnerable Contract

The `UnstoppableVault` contract combines both the ERC4626 and ERC3156 standards. It's a tokenized vault that also offers flash loans of its underlying asset.

Here's the flash loan function where the vulnerability resides:

```solidity
function flashLoan(IERC3156FlashBorrower receiver, address _token, uint256 amount, bytes calldata data)
    external
    returns (bool)
{
    if (amount == 0) revert InvalidAmount(0); // fail early
    if (address(asset) != _token) revert UnsupportedCurrency(); // enforce ERC3156 requirement
    uint256 balanceBefore = totalAssets();
    if (convertToShares(totalSupply) != balanceBefore) revert InvalidBalance(); // enforce ERC4626 requirement

    // transfer tokens out + execute callback on receiver
    ERC20(_token).safeTransfer(address(receiver), amount);

    // callback must return magic value, otherwise assume it failed
    uint256 fee = flashFee(_token, amount);
    if (
        receiver.onFlashLoan(msg.sender, address(asset), amount, fee, data)
            != keccak256("IERC3156FlashBorrower.onFlashLoan")
    ) {
        revert CallbackFailed();
    }

    // pull amount + fee from receiver, then pay the fee to the recipient
    ERC20(_token).safeTransferFrom(address(receiver), address(this), amount + fee);
    ERC20(_token).safeTransfer(feeRecipient, fee);

    return true;
}
```

The vulnerability lies in this specific check:

```solidity
uint256 balanceBefore = totalAssets();
if (convertToShares(totalSupply) != balanceBefore) revert InvalidBalance(); // enforce ERC4626 requirement
```

And here's the `totalAssets()` function it calls:

```solidity
function totalAssets() public view override nonReadReentrant returns (uint256) {
    return asset.balanceOf(address(this));
}
```

This check is verifying that the vault's accounting is consistent, the total shares (represented by `totalSupply`) converted to assets should equal the actual balance of assets in the vault.

## The Inheritance Structure

To fully understand the vulnerability, we need to trace where `totalSupply` comes from. The contract doesn't explicitly define this function, so it must be inherited.

The inheritance chain looks like this:

```
UnstoppableVault
  ↳ ERC4626 (from Solmate)
      ↳ ERC20 (from Solmate)
```

The `totalSupply()` function comes from the ERC20 standard, which is the foundation for ERC4626. In a typical ERC20 implementation, `totalSupply()` returns the total number of tokens that have been minted minus the number that have been burned.

In the context of our ERC4626 vault:
- When users deposit assets, the vault mints shares, increasing `totalSupply`
- When users withdraw assets, the vault burns shares, decreasing `totalSupply`

The crucial relationship is that `totalSupply` should always correspond to the number of shares that have been issued in exchange for assets.

## The Exploit

The vulnerability exploits a fundamental assumption in the vault's design: that tokens can only enter the vault through the official deposit functions.

Here's the exploit, remarkably simple yet devastatingly effective:

```solidity
function test_unstoppable() public checkSolvedByPlayer {
    token.transfer(address(vault), 1);
}
```

What this does is transfer a token directly to the vault's address, bypassing the standard deposit mechanism. Let's break down why this breaks the vault:

1. The attacker transfers 1 token directly to the vault
2. This increases `totalAssets()` by 1, as this function simply returns the vault's token balance
3. However, since no shares were minted, `totalSupply` remains unchanged
4. Now the check `convertToShares(totalSupply) != balanceBefore` will always evaluate to true
5. This causes all future flash loan calls to revert with `InvalidBalance()`

The vault is now permanently broken - it cannot offer flash loans anymore!

**Side note : 1 ether vs 1 Unit Confusion**

A common confusion when examining this exploit revolves around this line:

```solidity
token.transfer(address(vault), 1 ether);
```

Some might wonder: Are we transferring Ether (ETH) here? The answer is no. In Solidity, `1 ether` is simply a way to write the number 10^18 (1 followed by 18 zeros). It's a convenience notation similar to how we might write `1 million`.

For most ERC20 tokens that use 18 decimals (as the DVT token does in this challenge), `1 ether` corresponds to exactly 1 whole token. So:

- `token.transfer(address(vault), 1);` transfers 1 base unit of the token, which is 0.000000000000000001 DVT
- `token.transfer(address(vault), 1 ether);` transfers 10^18 base units, which is 1 whole DVT

Both approaches work to exploit the vulnerability, as they both create a discrepancy between `totalAssets()` and `convertToShares(totalSupply)`. The difference is merely the size of the discrepancy.

## What Happens Under the Hood in token.transfer()

When we call `token.transfer(address(vault), 1)`, several operations occur:

1. The ERC20 token contract checks if the sender has enough tokens
2. It decreases the sender's balance by the specified amount (1 in this case)
3. It increases the recipient's balance by the same amount
4. It emits a `Transfer` event recording this operation

Importantly, the recipient (in this case, the vault) does not need to do anything special to receive these tokens. There's no `receive()` function required as there would be for receiving Ether. The token contract simply updates its internal accounting to record that the vault now owns more tokens.

This is why direct token transfers can bypass the vault's deposit mechanism, they update the token balances but don't trigger any of the vault's internal accounting functions.

## How to Fix the Vulnerability

Several approaches could be used to fix this vulnerability:

1. **Use an internal counter for assets**: Maintain a separate variable to track deposited assets instead of using the actual token balance.

```solidity
contract UnstoppableVault {
    uint256 private _internalAssetCount;

    function totalAssets() public view override returns (uint256) {
        return _internalAssetCount;
    }

    function deposit(uint256 assets, address receiver) public override returns (uint256) {
        // Existing logic
        _internalAssetCount += assets;
        return shares;
    }

    function withdraw(uint256 assets, address receiver, address owner) public override returns (uint256) {
        // Existing logic
        _internalAssetCount -= assets;
        return shares;
    }
}
```

2. **Modify the check to allow for donations**: Change the validation to allow the actual balance to be greater than (but never less than) the expected balance.

```solidity
if (convertToShares(totalSupply) > balanceBefore) revert InvalidBalance();
```

3. **Add a reconciliation function**: Create a function that can reconcile the vault's state when "orphaned" tokens are detected.

## Conclusion

The "Unstoppable" challenge from Damn Vulnerable DeFi beautifully illustrates how even simple design assumptions can lead to critical vulnerabilities. A single direct token transfer, an operation that seems harmless can permanently break the functionality of an entire protocol.

This vulnerability also showcases the importance of understanding the deeper mechanics of Ethereum standards and their interactions. The combination of ERC4626 and ERC3156 created a tension that, when exploited, rendered the vault unstoppable.

As DeFi protocols grow more complex and standards continue to evolve, keeping these fundamental security principles in mind becomes increasingly important for developers and auditors alike.
