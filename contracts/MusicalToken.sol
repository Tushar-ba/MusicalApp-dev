// SPDX-License-Identifier: MIT

pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import {ERC721BurnableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721BurnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title MusicalToken - An ERC721 Token Contract with Custom Royalty Management
/// @notice This contract allows minting of ERC721 tokens with extended royalty management capabilities
/// @dev Implements UUPSUpgradeable and royalty features
contract MusicalToken is
    Initializable,
    ERC721URIStorageUpgradeable,
    ERC721BurnableUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    uint256 public nextTokenId;
    uint256 public constant MAX_ROYALTY_PERCENTAGE = 2000; // max 20% can be distributed as royalty
    uint96 public constant FEE_DENOMINATOR = 10000;
    address public marketplace;

    struct RoyaltyInfo {
        address[] recipients;
        uint256[] percentages;
        uint256 totalPercentage;
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

    /// @custom:oz-upgrades-unsafe-allow constructor
    // constructor() {
    //     _disableInitializers();
    // }

    /// @notice Initializes the contract with an owner
    /// @param _initialOwner The initial owner of the contract
    function initialize(address _initialOwner) public initializer {
        __ERC721URIStorage_init();
        __ERC721Burnable_init();
        __Ownable_init(_initialOwner);
        __UUPSUpgradeable_init();
    }

    /// @notice Mints a new token to the specified address
    /// @param _to The address to receive the minted token
    /// @param _uri The URI for the token's metadata
    function safeMint(address _to, string memory _uri) external {
        require(address(_to) != address(0), "Invalid Zero address");
        uint256 tokenId = nextTokenId++;
        _safeMint(_to, tokenId);
        _setTokenURI(tokenId, _uri);
        tokenRoyaltyManager[tokenId] = _to;
    }

    /// @notice Updates the URI of a specific token
    /// @param _tokenId The ID of the token
    /// @param _newUri The new URI for the token's metadata
    function setURI(uint256 _tokenId, string memory _newUri) external {
        require(msg.sender == ownerOf(_tokenId), "Not a Valid Owner");
        _setTokenURI(_tokenId, _newUri);
    }

    /// @notice to set theb marketplace contract address
    /// @dev only owner will be able to call this function
    /// @param _marketplace marketplace contract address
    function setMarketplaceContractAddress(
        address _marketplace
    ) external onlyOwner {
        marketplace = _marketplace;
    }

    /// @notice Adds royalty recipients and percentages to a token
    /// @dev Ensures the total percentage does not exceed MAX_ROYALTY_PERCENTAGE
    /// @param _tokenId The ID of the token
    /// @param _recipients Array of addresses to receive royalties
    /// @param _percentages Array of percentages corresponding to each recipient
    function addRoyaltyRecipients(
        uint256 _tokenId,
        address[] calldata _recipients,
        uint256[] calldata _percentages
    ) external {
        require(
            msg.sender == tokenRoyaltyManager[_tokenId],
            "Not authorized to manage royalties"
        );
        require(
            _recipients.length == _percentages.length,
            "Recipients and percentages length mismatch"
        );

        RoyaltyInfo storage info = royalties[_tokenId];
        uint256 currentTotalPercentage = 0;
        uint256 oldTotalPercentage = getRoyaltyTotalPercentage(_tokenId);
        for (uint256 i = 0; i < _recipients.length; i++) {
            require(_percentages[i] > 0, "Percentage must be greater than 0");
            currentTotalPercentage += _percentages[i];
            require(
                currentTotalPercentage + oldTotalPercentage <=
                    MAX_ROYALTY_PERCENTAGE,
                "Total royalty exceeds maximum limit"
            ); // Enforce max royalty limit

            // Append new recipient and percentage to arrays
            info.recipients.push(_recipients[i]);
            info.percentages.push(_percentages[i]);
        }
        info.totalPercentage += currentTotalPercentage;
        emit RoyaltyRecipientsAdded(_tokenId, _recipients, _percentages);
    }

    /// @notice Returns the total royalty percentage for a token
    /// @param _tokenId The ID of the token
    /// @return The total royalty percentage in basis points
    function getRoyaltyTotalPercentage(
        uint256 _tokenId
    ) public view returns (uint256) {
        RoyaltyInfo memory info = royalties[_tokenId];
        return info.totalPercentage;
    }

    /// @notice Removes a royalty recipient from a token
    /// @param _tokenId The ID of the token
    /// @param _recipient The address of the recipient to remove
    function removeRoyaltyRecipient(
        uint256 _tokenId,
        address _recipient
    ) external {
        require(
            msg.sender == tokenRoyaltyManager[_tokenId],
            "Not authorized to manage royalties"
        );

        RoyaltyInfo storage info = royalties[_tokenId];
        uint256 length = info.recipients.length;

        for (uint256 i = 0; i < length; i++) {
            if (info.recipients[i] == _recipient) {
                info.totalPercentage -= info.percentages[i];
                info.recipients[i] = info.recipients[length - 1];
                info.percentages[i] = info.percentages[length - 1];
                info.recipients.pop();
                info.percentages.pop();
                emit RoyaltyRecipientRemoved(_tokenId, _recipient);
                return;
            }
        }

        revert("Recipient not found");
    }

    /// @notice Transfers royalty management of a token to a new manager
    /// @param _tokenId The ID of the token
    /// @param _newManager The address of the new manager
    function transferRoyaltyManagement(
        uint256 _tokenId,
        address _newManager
    ) internal {
        require(
            msg.sender == marketplace,
            "Only marketplace contract is allowed to transfer management"
        );
        require(
            _newManager != address(0),
            "New manager cannot be the zero address"
        );
        address oldManager = tokenRoyaltyManager[_tokenId];
        tokenRoyaltyManager[_tokenId] = _newManager;
        delete royalties[_tokenId];
        emit RoyaltyManagementTransferred(_tokenId, oldManager, _newManager);
    }

    /// @notice Fetches royalty information for a token
    /// @param _tokenId The ID of the token
    /// @return recipients Array of royalty recipient addresses
    /// @return percentages Array of royalty percentages
    /// @return totalPercentage Total royalty percentage in basis points
    function getRoyaltyInfo(
        uint256 _tokenId
    )
        external
        view
        returns (
            address[] memory recipients,
            uint256[] memory percentages,
            uint256 totalPercentage
        )
    {
        RoyaltyInfo memory info = royalties[_tokenId];
        return (info.recipients, info.percentages, info.totalPercentage);
    }

    /// @notice Overrides the tokenURI function to use ERC721URIStorage
    /// @param _tokenId The ID of the token
    /// @return The URI of the token
    function tokenURI(
        uint256 _tokenId
    )
        public
        view
        override(ERC721Upgradeable, ERC721URIStorageUpgradeable)
        returns (string memory)
    {
        return super.tokenURI(_tokenId);
    }

    /// @notice Overrides the supportsInterface function to use ERC721URIStorage
    /// @param interfaceId The interface ID to check
    /// @return True if the interface is supported, false otherwise
    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        override(ERC721Upgradeable, ERC721URIStorageUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /// @notice Authorizes contract upgrades
    /// @param newImplementation The address of the new implementation
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}
}
