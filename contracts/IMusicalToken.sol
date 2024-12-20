// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @title Interface for MusicalToken
interface IMusicalToken {
    function ownerOf(uint256 tokenId) external view returns (address);
    function getApproved(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
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
