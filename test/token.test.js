const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");


describe("MusicalToken Contract", function () {
  let musicalToken, owner, user1, user2, user3;

  beforeEach(async () => {
    [owner, user1, user2, user3] = await ethers.getSigners();

    const MusicalTokenFactory = await ethers.getContractFactory("MusicalToken");
    musicalToken = await upgrades.deployProxy(MusicalTokenFactory, [owner.address], {
      initializer: "initialize",
    });
    await musicalToken.waitForDeployment();
    const MarketPlaceContract = await ethers.getContractFactory("NFTMarketplace");
    const marketplace = await upgrades.deployProxy(MarketPlaceContract,[owner.address,musicalToken.target],{initializer:"initialize",});
    await musicalToken.setMarketplaceContractAddress(marketplace.target);
  });

//   describe("Initialization", function() {
//     it("should initialize with correct owner", async function() {
//         expect(await musicalToken.owner()).to.equal(owner.address);
//     });

//     it("should not allow reinitialization", async function() {
//         await expect(musicalToken.initialize(user1.address))
//         .to.be.revertedWithCustomErrorCustomError(musicalToken, "InvalidInitialization")
//     });

//     it("should initialize with correct starting state", async function() {
//         expect(await musicalToken.nextTokenId()).to.equal(0);
//         expect(await musicalToken.MAX_ROYALTY_PERCENTAGE()).to.equal(2000);
//         expect(await musicalToken.FEE_DENOMINATOR()).to.equal(10000);
//     });

//     it("should support required interfaces after initialization", async function() {
//         const ERC721_INTERFACE_ID = "0x80ac58cd";
//         expect(await musicalToken.supportsInterface(ERC721_INTERFACE_ID)).to.be.true;
//         const ERC721_METADATA_INTERFACE_ID = "0x5b5e139f";
//         expect(await musicalToken.supportsInterface(ERC721_METADATA_INTERFACE_ID)).to.be.true;
//     });
// });


describe("Minting the token",function(){
    it("should mint a token ",async function(){
        const _uri= "Hello"
        expect(await musicalToken.safeMint(user1.address,_uri))
        expect(await musicalToken.ownerOf(0)).to.equal(user1.address);
        expect(await musicalToken.tokenURI(0)).to.equal("Hello");
      })
      it("Should revert if the address field is empty", async function () {
        const _uri = "Hello";
        const AddressZero = ethers.ZeroAddress; 
        //console.log("AddressZero: ", await AddressZero.getAddress());
        await expect(musicalToken.safeMint(AddressZero, _uri))
            .to.be.revertedWithCustomError(musicalToken,"InvalidAddress");
    });
})



   describe("Adding Royalty Recipients",function(){
    beforeEach(async function(){
        const _uri = "Hello"
        await musicalToken.connect(user1).safeMint(user1.address,_uri);
        // console.log(user1.address)
    })
    it("It should add royalty recipients",async function(){
        const tokenId = 0;
        const recipients = [user2.address,user3.address];
        const percentages = [1000,1000];
        // console.log(user1.address)
        expect(await musicalToken.connect(user1).addRoyaltyRecipients(tokenId,recipients,percentages)).to.emit(musicalToken,"RoyaltyRecipientsAdded").withArgs(tokenId,recipients,percentages);
        const info =await musicalToken.getRoyaltyInfo(tokenId);
        // console.log(info)
        expect(info.recipients).to.deep.equal(recipients);
        expect(info.percentages).to.deep.equal(percentages);
    })
    it("Should revert if the anyone other than token owner is trying to add royalty",async function () {
        const tokenId = 0;
        const recipients = [user2.address,user3.address];
        const percentages = [1000,1000];
        await expect(
            musicalToken.connect(user2).addRoyaltyRecipients(tokenId, recipients, percentages)
        ).to.be.revertedWithCustomError(musicalToken,"UnauthorizedAccess");
    })
    it("Should revert if the recipients length and the percentage length is mismatched",async function () {
        const tokenId = 0;
        const recipients = [user2.address,user3.address];
        const percentages = [1000,500,500];
        await expect(
            musicalToken.connect(user1).addRoyaltyRecipients(tokenId, recipients, percentages)
        ).to.be.revertedWithCustomError(musicalToken,"RecipientsAndPercentagesMismatch");
    })
    it("Should revert if the percentage is 0",async function () {
        const tokenId = 0;
        const recipients = [user2.address,user3.address];
        const percentages = [1000,0];
        await expect(
            musicalToken.connect(user1).addRoyaltyRecipients(tokenId, recipients, percentages)
        ).to.be.revertedWith("Percentage must be greater than 0");
    })
    it("Should revert if the percentage is more than 2000BP",async function () {
        const tokenId = 0;
        const recipients = [user2.address,user3.address];
        const percentages = [1000,1500];
        await expect(
            musicalToken.connect(user1).addRoyaltyRecipients(tokenId, recipients, percentages)
        ).to.be.revertedWithCustomError(musicalToken,"TotalRoyaltyExceedsLimit");
    })
   })

   describe("Getting Royalty Info",async function(){
    it("Should Fetch the Roylaty info correctly",async function(){
        const _uri = "Hello"
        await musicalToken.connect(user1).safeMint(user1.address,_uri);
        const tokenId = 0;
        const recipients = [user2.address,user3.address];
        const percentages = [1000,1000];
        await musicalToken.connect(user1).addRoyaltyRecipients(tokenId, recipients, percentages)
        const info =await musicalToken.getRoyaltyInfo(tokenId);
        expect(info.recipients).to.deep.equal(recipients);
        expect(info.percentages).to.deep.equal(percentages);
        expect(info.totalPercentage).to.equal(2000)
    })
   })

   describe("Should get total Royalty percentage",function(){
    it("Should Fetch the Roylaty info correctly",async function(){
        const _uri = "Hello"
        await musicalToken.connect(user1).safeMint(user1.address,_uri);
        const tokenId = 0;
        const recipients = [user2.address,user3.address];
        const percentages = [1000,1000];
        const expectedPercentage = 2000;
        await musicalToken.connect(user1).addRoyaltyRecipients(tokenId, recipients, percentages)
        const info =await musicalToken.getRoyaltyTotalPercentage(tokenId);
       expect(info).to.be.equal(expectedPercentage)
    })
   })

   describe("Remove Royalty Recipients",function(){
    beforeEach(async function(){
        const _uri = "Hello"
        await musicalToken.connect(user1).safeMint(user1.address,_uri);
        const tokenId = 0;
        const recipients = [user2.address,user3.address];
        const percentages = [1000,1000];
        await musicalToken.connect(user1).addRoyaltyRecipients(tokenId,recipients,percentages)
    })
    it("Should remove a royalty recipient",async function(){
        const tokenId = 0;
        const recipient = user2.address;
        expect(await musicalToken.connect(user1).removeRoyaltyRecipient(tokenId,recipient)).to.emit(musicalToken,"RoyaltyRecipientRemoved").withArgs(tokenId,recipient)
        const info =await musicalToken.getRoyaltyInfo(tokenId);
        expect(info.recipients).to.deep.equal([user3.address]);
        expect(info.percentages).to.deep.equal([1000]);
        expect(info.totalPercentage).to.equal(1000);
    })
    it("Should revert if unaurthorized address/ Not owner of the token tries remove the recipient", async function(){
        const tokenId = 0;
        const recipient = user2.address;
        await expect( musicalToken.connect(user3).removeRoyaltyRecipient(tokenId,recipient)).to.be.revertedWithCustomError(musicalToken,"UnauthorizedAccess")
    })
    it("should revert if recipients are not found",async function(){
        const tokenId = 0;
        const recipient = owner.address;
        await expect( musicalToken.connect(user1).removeRoyaltyRecipient(tokenId,recipient)).to.be.revertedWithCustomError(musicalToken,"RecipientNotFound")
    })
   })

   describe("Set Token URI",function(){
    beforeEach(async function(){
        const _uri = "Hello"
        await musicalToken.connect(user1).safeMint(user1.address,_uri);
    })
    it("Should set the URI of the Token",async function(){
        const tokenId = 0;
        const _tokenURI = "thies";
        expect(await musicalToken.connect(user1).setURI(tokenId,_tokenURI));
        const info = await musicalToken.tokenURI(tokenId);
        expect(info).to.equal(_tokenURI)
    })
    it("should revert if other than owner tries to add the URI",async function(){
        const tokenId = 0;
        const _tokenURI = "thies";
        await expect( musicalToken.connect(user2).setURI(tokenId,_tokenURI)).to.be.revertedWithCustomError(musicalToken,"ERC721InvalidOwner")
    })
   })


   describe("supportsInterface", function () {
    it("Should support ERC721 interface", async function () {
        const ERC721_INTERFACE_ID = "0x80ac58cd"; 
        const result = await musicalToken.supportsInterface(ERC721_INTERFACE_ID);
        expect(result).to.be.true;
    });

    it("Should support ERC721URIStorage interface", async function () {
        const ERC721URIStorage_INTERFACE_ID = "0x49064906";
        const result = await musicalToken.supportsInterface(ERC721URIStorage_INTERFACE_ID);
        expect(result).to.be.true;
    });

    it("Should not support a non-existent interface", async function () {
        const NON_EXISTENT_INTERFACE_ID = "0x00000000"; 
        const result = await musicalToken.supportsInterface(NON_EXISTENT_INTERFACE_ID);
        expect(result).to.be.false;
    });
});
});

describe.skip("MusicalToken Contract", function () {
    let MusicalToken;
    let musicalToken;
    let owner;
    let nonOwner;
  
    beforeEach(async function () {
        [owner, nonOwner] = await ethers.getSigners();
        
        MusicalToken = await ethers.getContractFactory("MusicalToken");
        musicalToken = await upgrades.deployProxy(MusicalToken, 
            [owner.address],
            { initializer: "initialize", kind: "uups" }
        );
        
        await musicalToken.waitForDeployment();
    });
  
    it("should allow the owner to authorize the upgrade", async function () {
        const MusicalTokenV2 = await ethers.getContractFactory("MusicalToken", owner);
        const upgradedProxy = await upgrades.upgradeProxy(await musicalToken.getAddress(), MusicalTokenV2);
        const implementationAddress = await upgrades.erc1967.getImplementationAddress(
            await upgradedProxy.getAddress()
        );
        expect(implementationAddress).to.not.equal(await upgrades.erc1967.getImplementationAddress(await musicalToken.getAddress()));
    });
  
    it("should revert if a non-owner tries to authorize the upgrade", async function () {
        const MusicalTokenV2 = await ethers.getContractFactory("MusicalToken", nonOwner);
        
        await expect(
            upgrades.upgradeProxy(await musicalToken.getAddress(), MusicalTokenV2)
        ).to.be.revertedWithCustomErrorCustomError(musicalToken, "OwnableUnauthorizedAccount");
    });
});