
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract FundTracker {
    address public owner;
    uint256 public totalContributions;

    mapping(address => uint256) public contributions;

    event ContributionReceived(
        address indexed contributor,
        uint256 amount
    );

    constructor() {
        owner = msg.sender;
    }

    function contribute() external payable {
        require(msg.value > 0, "Contribution must be greater than zero");

        contributions[msg.sender] += msg.value;
        totalContributions += msg.value;

        emit ContributionReceived(msg.sender, msg.value);
    }

    function getMyContribution() external view returns (uint256) {
        return contributions[msg.sender];
    }
}
