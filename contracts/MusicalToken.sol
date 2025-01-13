// SPDX-License-Identifier: MIT

pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155URIStorageUpgradeable.sol";
import {ERC1155BurnableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155BurnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title MusicalToken - An ERC1155 Token Contract with Custom Royalty Management
/// @notice This contract allows minting of ERC1155 tokens with extended royalty management capabilities
/// @dev Implements UUPSUpgradeable and royalty features
contract MusicalToken is
    Initializable,
    ERC1155URIStorageUpgradeable,
    ERC1155BurnableUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    uint256 public nextTokenId;
    uint256 public constant HUNDRED_PERCENT_IN_BPS = 10000; //100%
    uint96 public constant FEE_DENOMINATOR = 10000;
    address public marketplace;

    struct RoyaltyInfo {
        address[] recipients;
        uint256[] percentages;
    }

    mapping(uint256 => address) public tokenRoyaltyManager;
    mapping(uint256 => RoyaltyInfo) private royalties;

    event RoyaltyRecipientsAdded(
        uint256 tokenId,
        address[] recipients,
        uint256[] percentages
    );
    event RoyaltyRecipientRemoved(uint256 tokenId, address recipient);
    event RoyaltyManagementTransferred(
        uint256 tokenId,
        address oldManager,
        address newManager
    );

    // errors
    error UnauthorizedAccess(address caller);
    error InvalidAddress(address addr);
    error TotalRoyaltyExceedsLimit(uint256 attempted, uint256 max);
    error RecipientsAndPercentagesMismatch();
    error RecipientNotFound(address recipient);
    error InvalidPercentage(uint provided, uint required);
    error MaxRoyaltyShareExceed();

    /// @custom:oz-upgrades-unsafe-allow constructor
    // constructor() {
    //     _disableInitializers();
    // }

    /// @notice Initializes the contract with an owner
    /// @param _initialOwner The initial owner of the contract
    function initialize(
        address _initialOwner,
        string memory _baseURI
    ) public initializer {
        __ERC1155_init("");
        _setBaseURI(_baseURI);
        __Ownable_init(_initialOwner);
        __ERC1155Burnable_init();
        __UUPSUpgradeable_init();
    }

    /// @notice Mints a new token to the specified address
    /// @param _to The address to receive the minted token
    /// @param _tokenURI The URI for the token's metadata
    /// @param _recipients Array of addresses to receive royalties
    /// @param _percentages Array of percentages corresponding to each recipient

    function mint(
        address _to,
        uint256 _amount,
        string memory _tokenURI,
        address[] calldata _recipients,
        uint256[] calldata _percentages
    ) external {
        if (address(_to) == address(0)) {
            revert InvalidAddress(_to);
        }
        if (_recipients.length != _percentages.length) {
            revert RecipientsAndPercentagesMismatch();
        }

        uint256 tokenId = ++nextTokenId;
        _mint(_to, tokenId, _amount, "");

        _setURI(tokenId, _tokenURI);
        tokenRoyaltyManager[tokenId] = _to;

        RoyaltyInfo storage info = royalties[tokenId];
        uint256 totalRoyaltyPercentage = 0;

        for (uint256 i = 0; i < _percentages.length; i++) {
            totalRoyaltyPercentage += _percentages[i];
        }
        if (totalRoyaltyPercentage != HUNDRED_PERCENT_IN_BPS) {
            revert InvalidPercentage(
                totalRoyaltyPercentage,
                HUNDRED_PERCENT_IN_BPS
            );
        }
        for (uint256 i = 0; i < _recipients.length; i++) {
            // Append new recipient and percentage to arrays
            info.recipients.push(_recipients[i]);
            info.percentages.push(_percentages[i]);
        }

        emit RoyaltyRecipientsAdded(tokenId, _recipients, _percentages);
    }

    /// @notice to update the base uri contract
    /// @dev only owner will be able to call this function
    /// @param _baseURI URI of base nft metadata
    function updateBaseURI(string memory _baseURI) external onlyOwner {
        _setBaseURI(_baseURI);
    }

    /// @notice to set theb marketplace contract address
    /// @dev only owner will be able to call this function
    /// @param _marketplace marketplace contract address
    function setMarketplaceContractAddress(
        address _marketplace
    ) external onlyOwner {
        marketplace = _marketplace;
    }

    /// @notice update royalty recipients and percentages to a token
    /// @param _tokenId The ID of the token
    /// @param _recipients Array of addresses to receive royalties
    /// @param _percentages Array of percentages corresponding to each recipient

    function updateRoyaltyRecipients(
        uint256 _tokenId,
        address[] calldata _recipients,
        uint256[] calldata _percentages
    ) external {
        if (
            msg.sender != tokenRoyaltyManager[_tokenId] &&
            msg.sender != marketplace
        ) {
            revert UnauthorizedAccess(msg.sender);
        }
        if (_recipients.length != _percentages.length) {
            revert RecipientsAndPercentagesMismatch();
        }

        delete royalties[_tokenId];
        RoyaltyInfo storage info = royalties[_tokenId];
        uint256 totalRoyaltyPercentage = 0;

        for (uint256 i = 0; i < _percentages.length; i++) {
            totalRoyaltyPercentage += _percentages[i];
        }
        if (totalRoyaltyPercentage != HUNDRED_PERCENT_IN_BPS) {
            revert InvalidPercentage(
                totalRoyaltyPercentage,
                HUNDRED_PERCENT_IN_BPS
            );
        }
        for (uint256 i = 0; i < _recipients.length; i++) {
            // Append new recipient and percentage to arrays
            info.recipients.push(_recipients[i]);
            info.percentages.push(_percentages[i]);
        }

        emit RoyaltyRecipientsAdded(_tokenId, _recipients, _percentages);
    }

    /// @notice Transfers royalty management of a token to a new manager
    /// @param _tokenId The ID of the token
    /// @param _newManager The address of the new manager
    function transferRoyaltyManagement(
        uint256 _tokenId,
        address _newManager
    ) external {
        if (msg.sender != marketplace) {
            revert UnauthorizedAccess(msg.sender);
        }
        if (_newManager == address(0)) {
            revert InvalidAddress(_newManager);
        }
        address oldManager = tokenRoyaltyManager[_tokenId];
        tokenRoyaltyManager[_tokenId] = _newManager;

        emit RoyaltyManagementTransferred(_tokenId, oldManager, _newManager);
    }

    /// @notice Fetches royalty information for a token
    /// @param _tokenId The ID of the token
    /// @return recipients Array of royalty recipient addresses
    /// @return percentages Array of royalty percentages
    function getRoyaltyInfo(
        uint256 _tokenId
    )
        external
        view
        returns (address[] memory recipients, uint256[] memory percentages)
    {
        RoyaltyInfo memory info = royalties[_tokenId];
        return (info.recipients, info.percentages);
    }

    /// @notice Overrides the uri function to use ERC155URIStorage
    /// @param _tokenId The ID of the token
    /// @return The URI of the token
    function uri(
        uint256 _tokenId
    )
        public
        view
        override(ERC1155Upgradeable, ERC1155URIStorageUpgradeable)
        returns (string memory)
    {
        return super.uri(_tokenId);
    }

    /// @notice Authorizes contract upgrades
    /// @param newImplementation The address of the new implementation
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}
}
