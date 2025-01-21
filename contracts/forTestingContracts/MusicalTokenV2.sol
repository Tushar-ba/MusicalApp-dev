// SPDX-License-Identifier: MIT

pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155URIStorageUpgradeable.sol";
import {ERC1155BurnableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155BurnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../../Interface/IMusicalMarketplace.sol";

/// @title MusicalToken - An ERC1155 Token Contract with Custom Royalty Management
/// @notice This contract allows minting of ERC1155 tokens with extended royalty management capabilities
/// @dev Implements UUPSUpgradeable and royalty features
contract MusicalTokenV2 is
    Initializable,
    ERC1155URIStorageUpgradeable,
    ERC1155BurnableUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    uint256 public nextTokenId;
    uint256 public constant HUNDRED_PERCENT_IN_BPS = 10000; //100%
    uint96 public constant FEE_DENOMINATOR = 10000;
    IMusicalMarketplace public marketplace;

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
    error InvalidZeroParams();
    error UnauthorizedTransfer(address operator);
    error InvalidAirdropAmount();

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
    /// @param _tokenOwner The address to receive the minted token
    /// @param _tokenURI The URI for the token's metadata
    /// @param _recipients Array of addresses to receive royalties
    /// @param _percentages Array of percentages corresponding to each recipient

    function mintAndList(
        address _tokenOwner,
        uint256 _amount,
        string memory _tokenURI,
        uint256 _price,
        uint _airdropAmount,
        address[] calldata _recipients,
        uint256[] calldata _percentages
    ) external {
        if (address(_tokenOwner) == address(0)) {
            revert InvalidAddress(_tokenOwner);
        }

        if (_price == 0) {
            revert InvalidZeroParams();
        }
        if (_recipients.length != _percentages.length) {
            revert RecipientsAndPercentagesMismatch();
        }

        if (_airdropAmount > _amount) {
            revert InvalidAirdropAmount();
        }

        uint256 tokenId = ++nextTokenId;
        _mint(_tokenOwner, tokenId, _amount, "");

        _setURI(tokenId, _tokenURI);
        tokenRoyaltyManager[tokenId] = _tokenOwner;

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

        // Approve the marketplace to transfer the token
        _setApprovalForAll(_tokenOwner, address(marketplace), true);

        // Automatically list the token on the marketplace
        uint listingAmount = _amount - _airdropAmount;
        IMusicalMarketplace(marketplace).listNFT(
            _tokenOwner,
            tokenId,
            _price,
            listingAmount
        );

        //Airdrop amount
        if (_airdropAmount > 0) {
            IMusicalMarketplace(marketplace).registerAirdrop(
                _tokenOwner,
                tokenId,
                _airdropAmount
            );
        }
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
        IMusicalMarketplace _marketplace
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
            msg.sender != address(marketplace)
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
        if (msg.sender != address(marketplace)) {
            revert UnauthorizedAccess(msg.sender);
        }
        if (_newManager == address(0)) {
            revert InvalidAddress(_newManager);
        }
        address oldManager = tokenRoyaltyManager[_tokenId];
        tokenRoyaltyManager[_tokenId] = _newManager;

        emit RoyaltyManagementTransferred(_tokenId, oldManager, _newManager);
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 value,
        bytes memory data
    ) public virtual override {
        // Restrict transfers to only the marketplace
        if (_msgSender() != address(marketplace)) {
            revert UnauthorizedTransfer(_msgSender());
        }

        // Call the original implementation
        super.safeTransferFrom(from, to, id, value, data);
    }

    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values,
        bytes memory data
    ) public virtual override {
        // Restrict transfers to only the marketplace
        if (_msgSender() != address(marketplace)) {
            revert UnauthorizedTransfer(_msgSender());
        }

        // Call the original implementation
        super.safeBatchTransferFrom(from, to, ids, values, data);
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

       
    function _new(uint __new) public pure returns(uint) {
        return __new;
    }
}

 

