// SPDX-License-Identifier: MIT

pragma solidity ^0.8.22;

/// @title Interface for Musical Marketplace

interface IMusicalMarketplace {
    function listNFT(
        address _seller,
        uint256 _tokenId,
        uint256 _price,
        uint256 _amount
    ) external;

    function registerAirdrop(
        address _owner,
        uint _tokenId,
        uint _amount
    ) external;
}
