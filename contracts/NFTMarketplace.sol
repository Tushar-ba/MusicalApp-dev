// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "../Interface/IMusicalToken.sol";

/// @title NFT Marketplace for MusicalToken
/// @notice Enables purchase and special buy of MusicalToken NFTs with royalty management and distribution
contract NFTMarketplace is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable,
    IERC1155Receiver,
    ERC165
{
    IMusicalToken public musicalToken;
    uint256 public listingId;

    // Fee configurations
    FeeConfig public firstTimeSaleFeeDetails;
    FeeConfig public resellFeeDetails;
    // Platform fee receiver
    address public platformFeeReceiver;

    struct Listing {
        address seller;
        uint256 tokenId;
        uint256 price;
        uint256 amount;
        bool isFirstTimeListing;
    }

    struct SpecialListing {
        uint256 tokenId;
        address seller;
        uint256 price;
    }

    struct FeeConfig {
        uint256 platformFee; // Platform fee in basis points (bps)
        uint256 splits; // Splits in basis points (bps)
        uint256 sellerShare; // Seller share in basis points (bps)
    }
    mapping(uint256 => SpecialListing) public specialListings;
    mapping(uint256 => Listing) public listings; // Maps listing ID to Listing
    //itemOwner => tokenId => result (listingId)
    mapping(address => mapping(uint => uint)) public isTokenListed;
    mapping(uint => bool) public isTokenListedBeforeInMarketplace;
    // Errors
    error NotTokenOwner(address caller);
    error NotTokenRoyaltyManager(address caller);
    error MarketplaceNotApproved(address caller);
    error NoAuthorityToUpdateListing(uint listingId);
    error InvalidZeroParams();
    error InvalidAmountForPurchase(uint available, uint requested);
    error NFTNotListed(uint256 tokenId);
    error InsufficientPayment(uint256 provided, uint256 required);
    error NotSeller(address caller);
    error TokenAlreadyListed();
    error InvalidBuyer(address buyer);
    error InvalidPercentage(uint provided, uint required);

    event NFTListed(
        uint256 tokenId,
        address seller,
        uint256 price,
        uint amount,
        uint listingId
    );
    event NFTListedForTransferTokenManager(
        uint256 tokenId,
        address seller,
        uint256 price
    );
    event NFTListUpdated(
        uint256 tokenId,
        address seller,
        uint256 price,
        uint amount,
        uint listingId
    );
    event NFTPurchased(
        uint256 tokenId,
        uint256 amount,
        uint256 totalPrice,
        address buyer
    );
    event SpecialPurchased(
        uint256 tokenId,
        address oldTokenManager,
        address newTokenManager
    );

    event NFTListingCanceled(
        uint256 listingId,
        address seller,
        uint256 tokenId,
        uint256 amount
    );
    event SpecialNFTListingCanceled(uint256 tokenId, address seller);
    event RoyaltyDistributed(
        uint totalAmount,
        uint royaltytoBeDistributed,
        address recipient
    );

    event FeeConfigUpdated(
        string saleType,
        uint256 platformFee,
        uint256 splits,
        uint256 sellerShare
    );

    event PlatformFeeReceiverUpdated(address oldReceiver, address newReceiver);

    event ListingSellerUpdated(
        uint256 listingId,
        address oldSeller,
        address newSeller
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    // constructor() {
    //     _disableInitializers();
    // }

    /// @notice Initializes the contract with an owner
    /// @param _initialOwner The initial owner of the contract
    /// @param _platformFeeReceiver The initial platform receiver address
    function initialize(
        address _initialOwner,
        address _musicalTokenAddress,
        address _platformFeeReceiver
    ) public initializer {
        __Ownable_init(_initialOwner);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        musicalToken = IMusicalToken(_musicalTokenAddress);

        firstTimeSaleFeeDetails = FeeConfig({
            platformFee: 1000, // 10%
            splits: 9000, // 90%
            sellerShare: 0 // 0%
        });

        // Initialize resell fees
        resellFeeDetails = FeeConfig({
            platformFee: 500, // 5%
            splits: 500, // 5%
            sellerShare: 9000 // 90%
        });
        platformFeeReceiver = _platformFeeReceiver;
    }

    /// @notice Lists an NFT for sale
    /// @param _tokenId The ID of the token to list
    /// @param _price The sale price of the token in Wei
    /// @param _amount Amount Of token for sale
    function listNFT(
        uint256 _tokenId,
        uint256 _price,
        uint256 _amount
    ) external {
        if (musicalToken.balanceOf(msg.sender, _tokenId) < _amount) {
            revert NotTokenOwner(msg.sender);
        }

        if (!musicalToken.isApprovedForAll(msg.sender, address(this))) {
            revert MarketplaceNotApproved(msg.sender);
        }
        if (isTokenListed[msg.sender][_tokenId] != 0) {
            revert TokenAlreadyListed();
        }

        if (_price == 0 || _amount == 0) {
            revert InvalidZeroParams();
        }

        // Transfer the NFT to the marketplace contract
        musicalToken.safeTransferFrom(
            msg.sender,
            address(this),
            _tokenId,
            _amount,
            ""
        );

        // Increment the listing counter to create a unique ID
        listingId++;

        listings[listingId] = Listing({
            seller: msg.sender,
            tokenId: _tokenId,
            price: _price,
            amount: _amount,
            isFirstTimeListing: !isTokenListedBeforeInMarketplace[_tokenId]
        });

        isTokenListed[msg.sender][_tokenId] = listingId;

        if (!isTokenListedBeforeInMarketplace[_tokenId]) {
            isTokenListedBeforeInMarketplace[_tokenId] = true;
        }

        emit NFTListed(_tokenId, msg.sender, _price, _amount, listingId);
    }

    /// @notice Updates the listing details
    /// @param _listingId The unique identifier of the token listing to be updated.
    /// @param _tokenAmount The additional amount of tokens to be made available in the listing.
    /// @param _price  The Price of the listing.
    /// @dev This function allows the owner of a token listing to update the available token amount and price
    function updateListedNFT(
        uint256 _listingId,
        uint256 _tokenAmount,
        uint256 _price
    ) external {
        Listing storage listing = listings[_listingId];

        if (listing.price == 0) {
            revert NFTNotListed(_listingId);
        }
        if (listing.seller != msg.sender) {
            revert NoAuthorityToUpdateListing(_listingId);
        }

        if (_price == 0 && _tokenAmount == 0) {
            revert InvalidZeroParams();
        }

        if (_price != 0) {
            listing.price = _price;
        }
        if (_tokenAmount != 0) {
            if (
                musicalToken.balanceOf(msg.sender, listing.tokenId) <
                _tokenAmount
            ) {
                revert NotTokenOwner(msg.sender);
            }

            listing.amount += _tokenAmount;
        }

        emit NFTListUpdated(
            listing.tokenId,
            msg.sender,
            listing.price,
            listing.amount,
            _listingId
        );
    }

    /// @notice to transfer the token managerRole .To handle royalty of the contract
    /// @param _tokenId The ID of the token to list
    /// @param _price The sale price
    function listSpecialNFT(uint256 _tokenId, uint256 _price) external {
        if (musicalToken.tokenRoyaltyManager(_tokenId) != msg.sender) {
            revert NotTokenRoyaltyManager(msg.sender);
        }

        if (_price == 0) {
            revert InvalidZeroParams();
        }

        if (!musicalToken.isApprovedForAll(msg.sender, address(this))) {
            revert MarketplaceNotApproved(msg.sender);
        }

        specialListings[_tokenId] = SpecialListing({
            tokenId: _tokenId,
            seller: msg.sender,
            price: _price
        });

        emit NFTListedForTransferTokenManager(_tokenId, msg.sender, _price);
    }

    /// @notice Purchases a listed NFT
    /// @param _listingId The ID of the listing
    /// @param _amount amount of token for purchasing
    function purchaseNFT(
        uint256 _listingId,
        uint256 _amount
    ) external payable nonReentrant {
        Listing storage listing = listings[_listingId];
        if (listing.price == 0) {
            revert NFTNotListed(_listingId);
        }

        if (_amount == 0) {
            revert InvalidZeroParams();
        }

        if (listing.amount < _amount) {
            revert InvalidAmountForPurchase(listing.amount, _amount);
        }

        if (listing.seller == msg.sender) {
            revert InvalidBuyer(msg.sender);
        }

        uint msgValue = msg.value;
        uint256 totalPrice = listing.price * _amount;
        if (msgValue < totalPrice) {
            revert InsufficientPayment(msgValue, totalPrice);
        }

        // Handle payment
        uint amountForPlatformFee;
        uint amountForSplits;
        uint amountForSeller;
        if (listing.isFirstTimeListing) {
            //pay the platformFee
            amountForPlatformFee =
                (totalPrice * firstTimeSaleFeeDetails.platformFee) /
                musicalToken.FEE_DENOMINATOR();
            payable(platformFeeReceiver).transfer(amountForPlatformFee);
            //distribute the splits
            amountForSplits =
                (totalPrice * firstTimeSaleFeeDetails.splits) /
                musicalToken.FEE_DENOMINATOR();
            _distributeRoyalties(listing.tokenId, amountForSplits);
        } else {
            //pay the platformFee
            amountForPlatformFee =
                (totalPrice * resellFeeDetails.platformFee) /
                musicalToken.FEE_DENOMINATOR();

            //distribute the splits
            amountForSplits =
                (totalPrice * resellFeeDetails.splits) /
                musicalToken.FEE_DENOMINATOR();

            //seller share
            amountForSeller =
                (totalPrice * resellFeeDetails.sellerShare) /
                musicalToken.FEE_DENOMINATOR();

            _distributeRoyalties(listing.tokenId, amountForSplits);
            payable(listing.seller).transfer(amountForSeller);
        }

        // Transfer the NFT to the buyer
        musicalToken.safeTransferFrom(
            address(this),
            msg.sender,
            listing.tokenId,
            _amount,
            ""
        );

        if (listing.amount == _amount) {
            delete listings[_listingId];
            delete isTokenListed[msg.sender][listing.tokenId];
        } else {
            listings[_listingId].amount -= _amount;
        }

        emit NFTPurchased(listing.tokenId, _amount, totalPrice, msg.sender);
    }

    /// @dev special Buy for token royalty
    /// @param _tokenId tokenId of the NFT
    function specialBuy(
        uint256 _tokenId,
        address[] calldata _recipients,
        uint256[] calldata _percentages,
        uint _royaltySharePercentageInBPS
    ) external payable nonReentrant {
        SpecialListing memory specialListing = specialListings[_tokenId];
        if (specialListing.price == 0) {
            revert NFTNotListed(_tokenId);
        }

        uint msgValue = msg.value;
        if (msgValue != specialListing.price) {
            revert InsufficientPayment(msgValue, specialListing.price);
        }

        uint sellerListingId = isTokenListed[specialListing.seller][_tokenId];
        if (sellerListingId != 0) {
            Listing storage listing = listings[sellerListingId];
            listing.seller = msg.sender;
            delete isTokenListed[specialListing.seller][_tokenId];
            isTokenListed[msg.sender][_tokenId] = sellerListingId;
            emit ListingSellerUpdated(
                sellerListingId,
                specialListing.seller,
                msg.sender
            );
        }
        // Transfer the NFT to the new token manager
        uint tokenbalance = musicalToken.balanceOf(
            specialListing.seller,
            _tokenId
        );
        musicalToken.safeTransferFrom(
            specialListing.seller,
            msg.sender,
            _tokenId,
            tokenbalance,
            ""
        );

         //transfer the royalty management
        musicalToken.transferRoyaltyManagement(_tokenId, msg.sender);

        //transafer the royalty details
        musicalToken.updateRoyaltyRecipients(
            _tokenId,
            _recipients,
            _percentages,
            _royaltySharePercentageInBPS
        );

        //transfer the amount to seller
        payable(specialListing.seller).transfer(msgValue);

        emit SpecialPurchased(_tokenId, specialListing.seller, msg.sender);
        // Remove the listing
        delete specialListings[_tokenId];
    }

    /// @dev Distributes royalties for a token sale
    /// @param _tokenId The ID of the token sold
    /// @param _amountToBeDistributed The total sale price
    /// @return remainingAmount The total amount distributed as royalties
    function _distributeRoyalties(
        uint256 _tokenId,
        uint256 _amountToBeDistributed
    ) internal returns (uint256 remainingAmount) {
        (
            address[] memory recipients,
            uint256[] memory percentages,

        ) = musicalToken.getRoyaltyInfo(_tokenId);

        uint256 totalRoyaltiesDistributed = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            uint256 royalty = (_amountToBeDistributed * percentages[i]) /
                musicalToken.FEE_DENOMINATOR();
            payable(recipients[i]).transfer(royalty); 
            emit RoyaltyDistributed(
                _amountToBeDistributed,
                royalty,
                recipients[i]
            );
            totalRoyaltiesDistributed += royalty;
        }

        remainingAmount = _amountToBeDistributed - totalRoyaltiesDistributed;
    }

    /// @notice Cancels a listing
    /// @param _listingId The ID of the listing to delist
    function cancelListing(uint256 _listingId) external {
        Listing memory listing = listings[_listingId];

        if (listing.price == 0) {
            revert NFTNotListed(_listingId);
        }

        if (listing.seller != msg.sender) {
            revert NotSeller(msg.sender);
        }

        // Transfer the NFT back to the seller
        musicalToken.safeTransferFrom(
            address(this),
            msg.sender,
            listing.tokenId,
            listing.amount,
            ""
        );

        emit NFTListingCanceled(
            _listingId,
            msg.sender,
            listing.tokenId,
            listing.amount
        );
        // Remove the listing
        delete listings[_listingId];
        delete isTokenListed[msg.sender][listing.tokenId];
    }

    /// @notice Cancels a listing
    /// @param _tokenId The ID of the listing to delist
    function cancelSpecialNFTListing(uint256 _tokenId) external {
        SpecialListing memory specialListing = specialListings[_tokenId];

        if (specialListing.price == 0) {
            revert NFTNotListed(_tokenId);
        }
        if (specialListing.seller != msg.sender) {
            revert NotSeller(msg.sender);
        }
        emit SpecialNFTListingCanceled(_tokenId, msg.sender);
        // Remove the listing
        delete specialListings[_tokenId];
    }

    // Function to update first-time sale fee configuration
    function updateFirstTimeSale(
        uint256 _platformFee,
        uint256 _splits,
        uint256 _sellerShare
    ) external onlyOwner {
        if (_platformFee + _splits + _sellerShare != 10000) {
            revert InvalidPercentage(
                _platformFee + _splits + _sellerShare,
                10000
            );
        }
        firstTimeSaleFeeDetails = FeeConfig({
            platformFee: _platformFee,
            splits: _splits,
            sellerShare: _sellerShare
        });

        emit FeeConfigUpdated(
            "FirstTimeSale",
            _platformFee,
            _splits,
            _sellerShare
        );
    }

    // Function to update resell fee configuration
    function updateResell(
        uint256 _platformFee,
        uint256 _splits,
        uint256 _sellerShare
    ) external onlyOwner {
        if (_platformFee + _splits + _sellerShare != 10000) {
            revert InvalidPercentage(
                _platformFee + _splits + _sellerShare,
                10000
            );
        }
        resellFeeDetails = FeeConfig({
            platformFee: _platformFee,
            splits: _splits,
            sellerShare: _sellerShare
        });

        emit FeeConfigUpdated("Resell", _platformFee, _splits, _sellerShare);
    }

    // Function to update the platform fee receiver
    function updatePlatformFeeReceiver(
        address _newReceiver
    ) external onlyOwner {
        address oldReceiver = platformFeeReceiver;
        platformFeeReceiver = _newReceiver;

        emit PlatformFeeReceiverUpdated(oldReceiver, _newReceiver);
    }

    /// @notice Authorizes contract upgrades
    /// @param newImplementation The address of the new implementation
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    function onERC1155Received(
        address /* operator */,
        address /* from */,
        uint256 /* id */,
        uint256 /* value */,
        bytes calldata /* data */
    ) external pure override returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address /* operator */,
        address /* from */,
        uint256[] calldata /* ids */,
        uint256[] calldata /* values */,
        bytes calldata /* data */
    ) external pure override returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    // Override supportsInterface to include IERC1155Receiver
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(IERC165, ERC165) returns (bool) {
        return
            interfaceId == type(IERC1155Receiver).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
