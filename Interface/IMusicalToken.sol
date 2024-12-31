// SPDX-License-Identifier: MIT

pragma solidity ^0.8.22;

/// @title Interface for MusicalToken
interface IMusicalToken {
    function balanceOf(
        address account,
        uint256 id
    ) external view returns (uint256);
    function isApprovedForAll(
        address account,
        address operator
    ) external view returns (bool);
    function tokenRoyaltyManager(
        uint256 tokenId
    ) external view returns (address);
    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 value,
        bytes memory data
    ) external;
    function getRoyaltyInfo(
        uint256 tokenId
    )
        external
        view
        returns (
            address[] memory recipients,
            uint256[] memory percentages,
            uint256 totalPercentage
        );
    function FEE_DENOMINATOR() external view returns (uint96);
    function transferRoyaltyManagement(
        uint256 tokenId,
        address newManager
    ) external;
}
