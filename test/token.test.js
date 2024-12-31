const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");


describe("MusicalToken Contract", function () {
  let musicalToken, owner, user1, user2, user3;

  beforeEach(async () => {
    [owner, user1, user2, user3] = await ethers.getSigners();

    const MusicalTokenFactory = await ethers.getContractFactory("MusicalToken");
    musicalToken = await upgrades.deployProxy(MusicalTokenFactory, [owner.address,""], {
      initializer: "initialize",
    });
    await musicalToken.waitForDeployment();
    const MarketPlaceContract = await ethers.getContractFactory("NFTMarketplace");
    const marketplace = await upgrades.deployProxy(MarketPlaceContract,[owner.address,musicalToken.target],{initializer:"initialize",});
    await musicalToken.setMarketplaceContractAddress(marketplace.target);
  });


describe("Minting the token",function(){
    it("should mint a token ",async function(){
        const _uri= "Hello"
        const amount = 1
        expect(await musicalToken.mint(user1.address,amount,_uri))
        expect(await musicalToken.balanceOf(user1.address,0)).to.equal(amount);
      })
      it("Should revert if the address field is empty", async function () {
        const _uri = "Hello";
        const AddressZero = ethers.ZeroAddress; 
        const amount = 1
        //console.log("AddressZero: ", await AddressZero.getAddress());
        await expect(musicalToken.mint(AddressZero,amount, _uri))
            .to.be.revertedWithCustomError(musicalToken,"InvalidAddress");
    });
})

   describe("Adding Royalty Recipients",function(){
    beforeEach(async function(){
        const _uri = "Hello"
        const amount = 1
        await musicalToken.mint(user1.address,amount,_uri)
        // console.log(user1.address)
    })
    it("It should add royalty recipients",async function(){
        const tokenId = 0;
        const recipients = [user2.address,user3.address];
        const percentages = [1000,1000];
        expect(await musicalToken.connect(user1).addRoyaltyRecipients(tokenId,recipients,percentages)).to.emit(musicalToken,"RoyaltyRecipientsAdded").withArgs(tokenId,recipients,percentages);
        const info =await musicalToken.getRoyaltyInfo(tokenId);
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
        const amount = 1
        await musicalToken.mint(user1.address,amount,_uri)
        const tokenId = 0;
        const recipients = [user2.address,user3.address];
        const percentages = [1000,1000];
        await musicalToken.connect(user1).addRoyaltyRecipients(tokenId, recipients, percentages)
        const info =await musicalToken.getRoyaltyInfo(tokenId);
        expect(info.recipients).to.deep.equal(recipients);
        expect(info.percentages).to.deep.equal(percentages);
        //expect(info.amount).to.equal(amount)
        expect(info.totalPercentage).to.equal(2000)
    })
   })

   describe("Should get total Royalty percentage",function(){
    it("Should Fetch the Roylaty info correctly",async function(){
        const _uri = "Hello"
        const amount = 1
        await musicalToken.mint(user1.address,amount,_uri)
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
        const amount = 1
        await musicalToken.mint(user1.address,amount,_uri)
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
   describe("MusicalToken Contract upgradability", function () {
    let MusicalToken;
    let musicalToken;
    let owner;
    let nonOwner;
  
    beforeEach(async function () {
        [owner, nonOwner] = await ethers.getSigners();
        
        MusicalToken = await ethers.getContractFactory("MusicalToken");
        musicalToken = await upgrades.deployProxy(MusicalToken, 
            [owner.address,"Hello"],
            { initializer: "initialize", kind: "uups" }
        );
        
        await musicalToken.waitForDeployment();
        //console.log(await musicalToken.getAddress())
    });
  
    it("should allow the owner to authorize the upgrade", async function () {
        const beforeImpl = await upgrades.erc1967.getImplementationAddress(
            await musicalToken.getAddress()
        );
        //console.log("Before upgrade:", beforeImpl);
        const MusicalTokenV2 = await ethers.getContractFactory("MusicalTokenV2",owner);
        const upgradedProxy = await upgrades.upgradeProxy(await musicalToken.getAddress(), MusicalTokenV2);
        const implementationAddress = await upgrades.erc1967.getImplementationAddress( await upgradedProxy.getAddress());
        //console.log(implementationAddress)
        const afterImpl = await upgrades.erc1967.getImplementationAddress(await upgradedProxy.getAddress());
        //console.log("After upgrade:", afterImpl);
        expect(beforeImpl).to.not.equal(afterImpl);
    });
  
    it("should revert if a non-owner tries to authorize the upgrade", async function () {
        const MusicalTokenV2 = await ethers.getContractFactory("MusicalToken", nonOwner);
        
        await expect(
            upgrades.upgradeProxy(await musicalToken.getAddress(), MusicalTokenV2)
        ).to.be.revertedWithCustomError(musicalToken, "OwnableUnauthorizedAccount");
    });
});
});

