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
    uint256 public exchangeId;

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
        uint256 amount;
        bool isFirstTimeListing;
    }

    struct NftExchange {
        uint256 exchangeId;
        uint256 baseTokenId;
        uint256 baseTokenAmount;
        uint256 counterTokenId;
        uint256 counterTokenAmount;
        bool baseUserApproved;
        bool counterUserApproved;
        address baseUserAddress;
        address counterUserAddress;
    }

    struct FeeConfig {
        uint256 platformFee; // Platform fee in basis points (bps)
        uint256 splits; // Splits in basis points (bps)
        uint256 sellerShare; // Seller share in basis points (bps)
    }
    mapping(uint256 => SpecialListing) public specialListings;
    mapping(uint256 => Listing) public listings; // Maps listing ID to Listing
    mapping(uint256 => NftExchange) public exchangeItems; // exchange Id => exchange items
    //itemOwner => tokenId => result (listingId)
    mapping(address => mapping(uint => uint)) public isTokenListed;
    mapping(uint => bool) public isTokenListedBeforeInMarketplace;
    mapping(uint => bool) public isTokenListedBeforeForSpecialListing;

    mapping(address => uint256) public undistributedFunds;

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
    error MismatchedArrayPassed();
    error InvalidNftExchange();
    error NotValidNftExchangeParticipant();
    error InvalidCounterToken();
    error InvalidBaseToken();

    event NFTListed(
        uint256 tokenId,
        address seller,
        uint256 price,
        uint amount,
        uint listingId
    );
    event NFTListedSpecial(
        uint256 tokenId,
        address seller,
        uint256 price,
        uint256 userTokenBalance
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
        uint256 amount,
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
        uint royaltyToBeDistributed,
        address recipient
    );

    event FeeConfigUpdated(
        string saleType,
        uint256 platformFee,
        uint256 splits,
        uint256 sellerShare
    );

    event PlatformFeeReceiverUpdated(address oldReceiver, address newReceiver);
    event PlatformFeeReceived(address feeReceiver, uint256 amount);

    event ListingSellerUpdated(
        uint256 listingId,
        address oldSeller,
        address newSeller
    );

    event sellerAmountReceived(
        uint listingId,
        uint listingPrice,
        uint receivedAmount
    );

    event RoyaltyDistributionFailed(address recipient, uint256 amount);
    event FundsWithdrawn(address account, uint256 amount);

    event RegisteredNftForExchange(
        uint exchangeId,
        address UserAddress,
        uint TokenId,
        uint TokenAmount
    );

    event NftForExchangeCanceled(uint exchangeId);
    event NftForExchangeApproved(uint exchangeId, address approver);
    event NftForExchangeSucceed(uint exchangeId);
    event NftForExchangeRemoved(uint exchangeId);

    /// @custom:oz-upgrades-unsafe-allow constructor
    // constructor() {
    //     _disableInitializers();
    // }

    /// @notice Initializes the marketplace contract
    /// @param _initialOwner The initial owner of the contract
    /// @param _musicalTokenAddress The address of the MusicalToken contract
    /// @param _platformFeeReceiver The address to receive platform fees
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

            musicalToken.safeTransferFrom(
                msg.sender,
                address(this),
                listing.tokenId,
                _tokenAmount,
                ""
            );

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

        // Transfer the NFT to the marketplace contract

        uint tokenBalance = musicalToken.balanceOf(msg.sender, _tokenId);

        musicalToken.safeTransferFrom(
            msg.sender,
            address(this),
            _tokenId,
            tokenBalance,
            ""
        );

        specialListings[_tokenId] = SpecialListing({
            tokenId: _tokenId,
            seller: msg.sender,
            price: _price,
            amount: tokenBalance,
            isFirstTimeListing: !isTokenListedBeforeForSpecialListing[_tokenId]
        });

        if (!isTokenListedBeforeForSpecialListing[_tokenId]) {
            isTokenListedBeforeForSpecialListing[_tokenId] = true;
        }

        emit NFTListedSpecial(_tokenId, msg.sender, _price, tokenBalance);
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
        if (msgValue != totalPrice) {
            revert InsufficientPayment(msgValue, totalPrice);
        }

        // Handle payment
        uint amountForPlatformFee;
        uint amountForSplits;
        uint amountForSeller;
        if (listing.isFirstTimeListing) {
            //calculate the platformFee
            amountForPlatformFee =
                (totalPrice * firstTimeSaleFeeDetails.platformFee) /
                musicalToken.FEE_DENOMINATOR();

            //calculate the splits
            amountForSplits =
                (totalPrice * firstTimeSaleFeeDetails.splits) /
                musicalToken.FEE_DENOMINATOR();
        } else {
            //calculate the platformFee
            amountForPlatformFee =
                (totalPrice * resellFeeDetails.platformFee) /
                musicalToken.FEE_DENOMINATOR();

            //calculate the splits
            amountForSplits =
                (totalPrice * resellFeeDetails.splits) /
                musicalToken.FEE_DENOMINATOR();

            //calculate seller share
            amountForSeller =
                (totalPrice * resellFeeDetails.sellerShare) /
                musicalToken.FEE_DENOMINATOR();
        }

        //pay the recipients

        //platform
        (bool success, ) = payable(platformFeeReceiver).call{
            value: amountForPlatformFee
        }("");
        require(success, "platform fee transfer failed");

        emit PlatformFeeReceived(platformFeeReceiver, amountForPlatformFee);

        //splits

        _distributeRoyalties(listing.tokenId, amountForSplits);

        //seller
        if (amountForSeller != 0) {
            (success, ) = payable(listing.seller).call{value: amountForSeller}(
                ""
            );
            require(success, "Royalty transfer failed");

            emit sellerAmountReceived(
                _listingId,
                listing.amount,
                amountForSeller
            );
        }

        // Transfer the NFT to the buyer
        musicalToken.safeTransferFrom(
            address(this),
            msg.sender,
            listing.tokenId,
            _amount,
            ""
        );

        emit NFTPurchased(listing.tokenId, _amount, totalPrice, msg.sender);

        if (listing.amount == _amount) {
            delete isTokenListed[listing.seller][listing.tokenId];
            delete listings[_listingId];
        } else {
            listings[_listingId].amount -= _amount;
        }
    }

    /// @notice Facilitates the purchase of a special listing for a token and updates its royalty details
    /// @dev Transfers ownership of the token, updates royalty management, and transfers the sale amount to the seller.
    /// Updates royalty recipients and their percentages. Removes the listing after the purchase.
    /// @param _tokenId The ID of the token being purchased
    /// @param _recipients The array of addresses to receive royalties
    /// @param _percentages The array of percentages (in basis points) for each royalty recipient
    function specialBuy(
        uint256 _tokenId,
        address[] calldata _recipients,
        uint256[] calldata _percentages
    ) external payable nonReentrant {
        SpecialListing memory specialListing = specialListings[_tokenId];
        if (specialListing.price == 0) {
            revert NFTNotListed(_tokenId);
        }

        // Validate lengths before updating royalty recipients
        if (_recipients.length != _percentages.length) {
            revert MismatchedArrayPassed();
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

        musicalToken.safeTransferFrom(
            address(this),
            msg.sender,
            _tokenId,
            specialListing.amount,
            ""
        );

        //transfer the royalty management
        musicalToken.transferRoyaltyManagement(_tokenId, msg.sender);

        // If both arrays are empty, default to full royalty for msg.sender
        // Build final arrays for recipients & percentages
        address[] memory finalRecipients;
        uint256[] memory finalPercentages;

        // If both are empty, default to [msg.sender, 100% bps]
        if (_recipients.length == 0 && _percentages.length == 0) {
            finalRecipients = new address[](1);
            finalRecipients[0] = msg.sender;

            finalPercentages = new uint256[](1);
            finalPercentages[0] = 10000; // 100% in basis points
        } else {
            // Use the provided arrays
            finalRecipients = _recipients;
            finalPercentages = _percentages;
        }

        // Update royalty recipients
        musicalToken.updateRoyaltyRecipients(
            _tokenId,
            finalRecipients,
            finalPercentages
        );

        //transfer the amount to platform and seller
        uint amountForPlatformFee;

        if (specialListing.isFirstTimeListing) {
            amountForPlatformFee =
                (specialListing.price * firstTimeSaleFeeDetails.platformFee) /
                musicalToken.FEE_DENOMINATOR();
        } else {
            amountForPlatformFee =
                (specialListing.price * resellFeeDetails.platformFee) /
                musicalToken.FEE_DENOMINATOR();
        }

        uint amountForSeller = specialListing.price - amountForPlatformFee;

        (bool success, ) = payable(platformFeeReceiver).call{
            value: amountForPlatformFee
        }("");
        require(success, "platform fee transfer failed");

        emit PlatformFeeReceived(platformFeeReceiver, amountForPlatformFee);

        (success, ) = payable(specialListing.seller).call{
            value: amountForSeller
        }("");
        require(success, "seller transfer failed");

        emit SpecialPurchased(
            _tokenId,
            amountForSeller,
            specialListing.seller,
            msg.sender
        );
        // Remove the listing
        delete specialListings[_tokenId];
    }

    function registerNftExchange(
        uint _tokenId,
        uint _amount,
        uint _exchangeId
    ) external nonReentrant {
        if (_amount == 0) {
            revert InvalidZeroParams();
        }
        if (musicalToken.balanceOf(msg.sender, _tokenId) < _amount) {
            revert NotTokenOwner(msg.sender);
        }

        if (!musicalToken.isApprovedForAll(msg.sender, address(this))) {
            revert MarketplaceNotApproved(msg.sender);
        }

        // Transfer the NFT to the marketplace contract
        musicalToken.safeTransferFrom(
            msg.sender,
            address(this),
            _tokenId,
            _amount,
            ""
        );
        //register in new exchange
        if (_exchangeId == 0) {
            exchangeId++;
            exchangeItems[exchangeId] = NftExchange({
                exchangeId: exchangeId,
                baseTokenId: _tokenId,
                baseTokenAmount: _amount,
                counterTokenId: 0,
                counterTokenAmount: 0,
                baseUserApproved: false,
                counterUserApproved: false,
                baseUserAddress: msg.sender,
                counterUserAddress: address(0)
            });

            emit RegisteredNftForExchange(
                exchangeId,
                msg.sender,
                _tokenId,
                _amount
            );
        } else {
            //register in old exchange
            NftExchange storage exchangeItem = exchangeItems[_exchangeId];

            // Revert if both slots are filled or both are empty
            if (
                (exchangeItem.baseTokenId == 0) ==
                (exchangeItem.counterTokenId == 0)
            ) {
                revert InvalidNftExchange();
            }
            if (exchangeItem.baseTokenId == 0) {
                exchangeItem.baseTokenId = _tokenId;
                exchangeItem.baseTokenAmount = _amount;
                exchangeItem.baseUserAddress = msg.sender;
            } else {
                exchangeItem.counterTokenId = _tokenId;
                exchangeItem.counterTokenAmount = _amount;
                exchangeItem.counterUserAddress = msg.sender;
            }

            emit RegisteredNftForExchange(
                _exchangeId,
                msg.sender,
                _tokenId,
                _amount
            );
        }
    }

    // Approve participation in an exchange
    function approveNftForExchange(uint256 _exchangeId) external nonReentrant {
        NftExchange storage exchangeItem = exchangeItems[_exchangeId];
        if (exchangeItem.exchangeId == 0) {
            revert InvalidNftExchange();
        }

        if (msg.sender == exchangeItem.baseUserAddress) {
            if (exchangeItem.counterTokenId == 0) {
                revert InvalidCounterToken();
            }
            exchangeItem.baseUserApproved = true;
        } else if (msg.sender == exchangeItem.counterUserAddress) {
            if (exchangeItem.baseTokenId == 0) {
                revert InvalidBaseToken();
            }
            exchangeItem.counterUserApproved = true;
        } else {
            revert NotValidNftExchangeParticipant();
        }
        emit NftForExchangeApproved(_exchangeId, msg.sender);

        // if both the party agree then transfer the nft
        if (exchangeItem.baseUserApproved && exchangeItem.counterUserApproved) {
            //transfer the nft vice-versa
            // Transfer the NFT to the base user
            musicalToken.safeTransferFrom(
                address(this),
                exchangeItem.baseUserAddress,
                exchangeItem.counterTokenId,
                exchangeItem.counterTokenAmount,
                ""
            );

            // Transfer the NFT to the counter user
            musicalToken.safeTransferFrom(
                address(this),
                exchangeItem.counterUserAddress,
                exchangeItem.baseTokenId,
                exchangeItem.baseTokenAmount,
                ""
            );

            delete exchangeItems[_exchangeId];

            emit NftForExchangeSucceed(_exchangeId);
        }
    }

    // Cancel an exchange
    function cancelNftExchange(uint256 _exchangeId) external nonReentrant {
        NftExchange storage exchangeItem = exchangeItems[_exchangeId];
        if (exchangeItem.exchangeId == 0) {
            revert InvalidNftExchange();
        }

        if (msg.sender == exchangeItem.baseUserAddress) {
            // Transfer the NFT to the user
            musicalToken.safeTransferFrom(
                address(this),
                msg.sender,
                exchangeItem.baseTokenId,
                exchangeItem.baseTokenAmount,
                ""
            );

            exchangeItem.baseTokenId = 0;
            exchangeItem.baseTokenAmount = 0;
            exchangeItem.baseUserApproved = false;
            exchangeItem.baseUserAddress = address(0);

            emit NftForExchangeCanceled(_exchangeId);
        } else if (msg.sender == exchangeItem.counterUserAddress) {
            // Transfer the NFT to the  user
            musicalToken.safeTransferFrom(
                address(this),
                msg.sender,
                exchangeItem.counterTokenId,
                exchangeItem.counterTokenAmount,
                ""
            );

            exchangeItem.counterTokenId = 0;
            exchangeItem.counterTokenAmount = 0;
            exchangeItem.counterUserApproved = false;
            exchangeItem.counterUserAddress = address(0);

            emit NftForExchangeCanceled(_exchangeId);
        } else {
            revert NotValidNftExchangeParticipant();
        }

        //if both the party canceled the nft for exchange the delete it
        if (exchangeItem.counterTokenId == 0 && exchangeItem.baseTokenId == 0) {
            delete exchangeItems[_exchangeId];
            emit NftForExchangeRemoved(_exchangeId);
        }
    }

    /// @notice Distributes royalties for a token sale to the respective recipients
    /// @dev This function calculates and sends royalties to all recipients based on their percentages.
    /// If a transfer fails, the royalty amount is added to `undistributedFunds` for that recipient.
    /// @param _tokenId The ID of the token for which royalties are being distributed
    /// @param _amountToBeDistributed The total amount available for distribution as royalties
    /// @return remainingAmount The amount left undistributed after attempting all transfers
    function _distributeRoyalties(
        uint256 _tokenId,
        uint256 _amountToBeDistributed
    ) internal returns (uint256 remainingAmount) {
        (
            address[] memory recipients,
            uint256[] memory percentages
        ) = musicalToken.getRoyaltyInfo(_tokenId);

        uint256 totalRoyaltiesDistributed = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            uint256 royalty = (_amountToBeDistributed * percentages[i]) /
                musicalToken.FEE_DENOMINATOR();

            (bool success, ) = payable(recipients[i]).call{value: royalty}("");

            if (!success) {
                undistributedFunds[recipients[i]] += royalty;
                emit RoyaltyDistributionFailed(recipients[i], royalty);
                continue; // Skip failed transfers
            }

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
        delete isTokenListed[listing.seller][listing.tokenId];
        delete listings[_listingId];
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

        // Transfer the NFT back to the seller
        musicalToken.safeTransferFrom(
            address(this),
            msg.sender,
            specialListing.tokenId,
            specialListing.amount,
            ""
        );

        emit SpecialNFTListingCanceled(_tokenId, msg.sender);
        // Remove the listing
        delete specialListings[_tokenId];
    }

    /// @notice Updates the fee configuration for first-time sales
    /// @dev This function sets the platform fee, splits, and seller share percentages
    /// for first-time sales. The sum of these percentages must equal 10000 basis points (100%).
    /// @param _platformFee The percentage (in basis points) allocated as the platform fee
    /// @param _splits The percentage (in basis points) allocated to royalty splits
    /// @param _sellerShare The percentage (in basis points) allocated to the seller
    function updateFirstTimeSaleFee(
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

    /// @notice Updates the fee configuration for resales
    /// @dev This function sets the platform fee, splits, and seller share percentages
    /// for resales. The sum of these percentages must equal 10000 basis points (100%).
    /// @param _platformFee The percentage (in basis points) allocated as the platform fee
    /// @param _splits The percentage (in basis points) allocated to royalty splits
    /// @param _sellerShare The percentage (in basis points) allocated to the seller
    function updateResellFee(
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

    /// @notice Updates the address that receives platform fees
    /// @dev This function allows the owner to update the platform fee receiver address.
    /// The new address must not be the zero address.
    /// @param _newPlatformFeeReceiver The new address to receive platform fees
    function updatePlatformFeeReceiver(
        address _newPlatformFeeReceiver
    ) external onlyOwner {
        require(_newPlatformFeeReceiver != address(0), "Invalid address");
        address oldReceiver = platformFeeReceiver;
        platformFeeReceiver = _newPlatformFeeReceiver;

        emit PlatformFeeReceiverUpdated(oldReceiver, _newPlatformFeeReceiver);
    }

    /// @notice Withdraws undistributed royalty funds for a specific recipient
    /// @dev This function allows the contract owner to withdraw the undistributed funds
    /// for a specified recipient. The recipient must have undistributed funds available.
    /// @param recipient The address of the recipient to withdraw funds for
    function withdrawUndistributedFunds(address recipient) external onlyOwner {
        uint256 amount = undistributedFunds[recipient];
        require(amount > 0, "No funds to withdraw");
        undistributedFunds[recipient] = 0;
        (bool success, ) = payable(recipient).call{value: amount}("");
        require(success, "Transfer failed");
        emit FundsWithdrawn(recipient, amount);
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
