// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "./IMusicalToken.sol";

/// @title NFT Marketplace for MusicalToken
/// @notice Enables purchase and special buy of MusicalToken NFTs with royalty management and distribution
contract NFTMarketplace is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    IMusicalToken public musicalToken;

    struct Listing {
        address seller;
        uint256 price;
        bool isSpecialBuy;
    }

    mapping(uint256 => Listing) public listings; // Tracks listings by token ID

    event NFTListed(
        uint256 indexed tokenId,
        address indexed seller,
        uint256 price,
        bool isSpecialBuy
    );
    event NFTPurchased(
        uint256 indexed tokenId,
        address indexed buyer,
        uint256 price
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    // constructor() {
    //     _disableInitializers();
    // }

    /// @notice Initializes the contract with an owner
    /// @param _initialOwner The initial owner of the contract
    function initialize(
        address _initialOwner,
        address _musicalTokenAddress
    ) public initializer {
        __Ownable_init(_initialOwner);
        __UUPSUpgradeable_init();
        musicalToken = IMusicalToken(_musicalTokenAddress);
    }

    /// @notice Lists an NFT for sale
    /// @param _tokenId The ID of the token to list
    /// @param _price The sale price of the token in Wei
    /// @param _isSpecialBuy If true, the buyer becomes the new royalty manager
    function listNFT(
        uint256 _tokenId,
        uint256 _price,
        bool _isSpecialBuy
    ) external {
        require(
            musicalToken.ownerOf(_tokenId) == msg.sender,
            "Not the token owner"
        );
        require(
            musicalToken.getApproved(_tokenId) == address(this),
            "Marketplace not approved for token"
        );
        require(_price > 0, "Price must be greater than zero");

        // Transfer the NFT to the marketplace contract
        musicalToken.transferFrom(msg.sender, address(this), _tokenId);

        listings[_tokenId] = Listing({
            seller: msg.sender,
            price: _price,
            isSpecialBuy: _isSpecialBuy
        });

        emit NFTListed(_tokenId, msg.sender, _price, _isSpecialBuy);
    }

    /// @notice Purchases a listed NFT
    /// @param _tokenId The ID of the token to purchase
    function purchaseNFT(uint256 _tokenId) external payable {
        Listing memory listing = listings[_tokenId];
        require(listing.price > 0, "NFT not listed");
        require(msg.value == listing.price, "Incorrect payment amount");

        // Handle royalty distribution
        _distributeRoyalties(_tokenId, msg.value);

        // Transfer the NFT to the buyer
        musicalToken.transferFrom(address(this), msg.sender, _tokenId);

        // Pay the seller
        payable(listing.seller).transfer(msg.value);

        // Remove the listing
        delete listings[_tokenId];

        emit NFTPurchased(_tokenId, msg.sender, listing.price);
    }

    /// @notice Special purchase where royalty management is transferred to the buyer
    /// @param _tokenId The ID of the token to purchase
    function specialBuy(uint256 _tokenId) external payable {
        Listing memory listing = listings[_tokenId];
        require(listing.price > 0, "NFT not listed");
        require(listing.isSpecialBuy, "Not a special buy");
        require(msg.value == listing.price, "Incorrect payment amount");

        // Handle royalty distribution
        _distributeRoyalties(_tokenId, msg.value);

        // Transfer the NFT to the buyer
        musicalToken.transferFrom(address(this), msg.sender, _tokenId);

        // Transfer royalty management to the buyer
        musicalToken.transferRoyaltyManagement(_tokenId, msg.sender);

        // Pay the seller
        payable(listing.seller).transfer(msg.value);

        // Remove the listing
        delete listings[_tokenId];

        emit NFTPurchased(_tokenId, msg.sender, listing.price);
    }

    /// @dev Distributes royalties for a token sale
    /// @param _tokenId The ID of the token sold
    /// @param _salePrice The total sale price
    function _distributeRoyalties(
        uint256 _tokenId,
        uint256 _salePrice
    ) internal {
        (
            address[] memory recipients,
            uint256[] memory percentages,

        ) = musicalToken.getRoyaltyInfo(_tokenId);

        uint256 totalRoyalties;
        for (uint256 i = 0; i < recipients.length; i++) {
            uint256 royalty = (_salePrice * percentages[i]) /
                musicalToken.FEE_DENOMINATOR();
            payable(recipients[i]).transfer(royalty);
            totalRoyalties += royalty;
        }

        // Ensure the royalties do not exceed the total sale price
        require(totalRoyalties <= _salePrice, "Royalties exceed sale price");
    }

    /// @notice Cancels a listing
    /// @param _tokenId The ID of the token to delist
    function cancelListing(uint256 _tokenId) external {
        Listing memory listing = listings[_tokenId];
        require(listing.seller == msg.sender, "Not the seller");

        // Transfer the NFT back to the seller
        musicalToken.transferFrom(address(this), msg.sender, _tokenId);

        // Remove the listing
        delete listings[_tokenId];
    }

    /// @notice Authorizes contract upgrades
    /// @param newImplementation The address of the new implementation
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}
}
