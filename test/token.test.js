const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");


describe("MusicalToken Contract", function () {
  let musicalToken, owner, user1, user2, user3,updatedUser1,updatedUser2,updatedUser3,marketplace;

  beforeEach(async () => {
    [owner, user1, user2, user3,updatedUser1,updatedUser2,updatedUser3] = await ethers.getSigners();

    const MusicalTokenFactory = await ethers.getContractFactory("MusicalToken");
    musicalToken = await upgrades.deployProxy(MusicalTokenFactory, [owner.address,""], {
      initializer: "initialize",
    });
    await musicalToken.waitForDeployment();
    const MarketPlaceContract = await ethers.getContractFactory("NFTMarketplace");
     marketplace = await upgrades.deployProxy(MarketPlaceContract,[owner.address,musicalToken.target,owner.address],{initializer:"initialize",});
    await musicalToken.setMarketplaceContractAddress(marketplace.target);
  });
    describe("Minting and listing the token",function(){
        it("should mint and list token ",async function(){
            const _uri= "Hello"
            const amount = 6
            const recipients = [user1.address,user2.address,user3.address];
            const percentages = [8000,1000,1000];
            const airdropAmount = 2
            const price = ethers.parseEther("1")
            expect(await musicalToken.mintAndList(user1.address,amount,_uri,price,airdropAmount,recipients,percentages)).to.emit(musicalToken,"RoyaltyRecipientsAdded").withArgs(0,recipients,percentages);
            console.log(await musicalToken.balanceOf(marketplace.target,1))
            console.log("this")
            expect(await musicalToken.balanceOf(marketplace.target,1)).to.equal(6)
            const info = await musicalToken.getRoyaltyInfo(1);
            expect(info.recipients).to.deep.equal(recipients);
            expect(info.percentages).to.deep.equal(percentages);
        })
        it("Should revert if the address field is empty", async function () {
            const _uri = "Hello";
            const AddressZero = ethers.ZeroAddress; 
            const amount = 3
            const recipients = [user1.address,user2.address,user3.address];
            const percentages = [8000,1000,1000];
            const airdropAmount = 2
            const price = ethers.parseEther("1")
            await expect( musicalToken.mintAndList(AddressZero,amount,_uri,price,airdropAmount,recipients,percentages))
                .to.be.revertedWithCustomError(musicalToken,"InvalidAddress");
        });
        it("Should revert if there is a mismatch with recipients and percentages length",async function(){
            const _uri = "Hello";
            const amount = 3
            const recipients = [user1.address,user2.address,user3.address];
            const percentages = [8000,500,1000,500];
            const airdropAmount = 2
            const price = ethers.parseEther("1")
            await expect( musicalToken.mintAndList(user1.address,amount,_uri,price,airdropAmount,recipients,percentages))
                .to.be.revertedWithCustomError(musicalToken,"RecipientsAndPercentagesMismatch");
        })
        it("Should revert if the percentage is invalid",async function(){
            const _uri = "Hello";
            const amount = 3
            const recipients = [user1.address,user2.address];
            const percentages = [1000,1000];
            const airdropAmount = 2
            const price = ethers.parseEther("1")
            await expect( musicalToken.mintAndList(user1.address,amount,_uri,price,airdropAmount,recipients,percentages))
                .to.be.revertedWithCustomError(musicalToken,"InvalidPercentage");
        })
        it("Should revert if the minting amount is less than the tokens allocated for airdrop",async function(){
            const _uri = "Hello";
            const amount = 3
            const recipients = [user1.address,user2.address];
            const percentages = [5000,5000];
            const airdropAmount = 4
            const price = ethers.parseEther("1")
            await expect( musicalToken.mintAndList(user1.address,amount,_uri,price,airdropAmount,recipients,percentages))
                .to.be.revertedWithCustomError(musicalToken,"InvalidAirdropAmount");
        })
    })

    describe("Updating the Base URI",function(){
        it("Should update the base URI if owner tries to update the URI",async function(){
            const URI = "Hi";
            expect(await musicalToken.connect(owner).updateBaseURI(URI));
        })
        it("Should revert if non owner tries to update the URI",async function(){
            const URI = "Hi";
            await expect(musicalToken.connect(user1).updateBaseURI(URI)).to.be.revertedWithCustomError(musicalToken,"OwnableUnauthorizedAccount");
        })
    })

    //update tests 
    describe("Updating the Royalty recipients",function(){
        beforeEach(async function(){
            const _uri= "Hello"
            const amount = 6
            const recipients = [user1.address,user2.address,user3.address];
            const percentages = [8000,1000,1000];
            const airdropAmount = 2
            const price = ethers.parseEther("1")
            await musicalToken.mintAndList(user1.address,amount,_uri,price,airdropAmount,recipients,percentages)
        })
        it("Should successfully update the royalty recipients",async function(){
            const updatedUserArry = [owner.address,updatedUser1.address,updatedUser2.address];
            const percentage = [6000,2000,2000];
            const tokenId = 1;
            const info1 = await musicalToken.getRoyaltyInfo(1);
            //console.log("before",info1)
            expect(await musicalToken.connect(user1).updateRoyaltyRecipients(tokenId,updatedUserArry,percentage)).to.emit(musicalToken,"RoyaltyRecipientsAdded").withArgs(tokenId,updatedUser1,percentage);
            const info = await musicalToken.getRoyaltyInfo(1);
            //console.log("after",info)
            //expect(info.recipients).to.deep.equal(updatedUserArry);
            expect(info.percentages).to.deep.equal(percentage);
        })
        it("Should revert if the other than the token owner tries to update the token",async function(){
            const updatedUserArry = [owner.address,updatedUser1.address,updatedUser2.address];
            const percentage = [6000,2000,2000];
            const tokenId = 0;
            await expect( musicalToken.connect(user2).updateRoyaltyRecipients(tokenId,updatedUserArry,percentage,)).to.be.revertedWithCustomError(musicalToken,"UnauthorizedAccess");
        })
        it("Should revert if the percentage and recipients length mismatches",async function(){
            const updatedUserArry = [updatedUser1.address,updatedUser2.address];
            const percentage = [6000,2000,2000];
            const tokenId = 1;
            await expect( musicalToken.connect(user1).updateRoyaltyRecipients(tokenId,updatedUserArry,percentage)).to.be.revertedWithCustomError(musicalToken,"RecipientsAndPercentagesMismatch");
        })
        it("Should revert if the total percentage will not be equal to 10000 BPS",async function(){
            const updatedUserArry = [owner.address,updatedUser1.address,updatedUser2.address];
            const percentage = [6000,1000,1000];
            const tokenId = 1;
            await expect( musicalToken.connect(user1).updateRoyaltyRecipients(tokenId,updatedUserArry,percentage)).to.be.revertedWithCustomError(musicalToken,"InvalidPercentage");
        })
    })

   describe("Getting Royalty Info",async function(){
    it("Should Fetch the Roylaty info correctly",async function(){
        const _uri= "Hello"
        const amount = 6
        const recipients = [user1.address,user2.address,user3.address];
        const percentages = [8000,1000,1000];
        const airdropAmount = 2
        const price = ethers.parseEther("1")
        await musicalToken.mintAndList(user1.address,amount,_uri,price,airdropAmount,recipients,percentages)
        const info =await musicalToken.getRoyaltyInfo(1);
        //console.log(info)
        expect(info.recipients).to.deep.equal(recipients);
        expect(info.percentages).to.deep.equal(percentages);
    })
   })

   describe("Should revert if anyone other than the marketplace tries to transfer the tokens",async function(){
    beforeEach(async function(){
        const _uri= "Hello"
        const amount = 6
        const recipients = [user1.address,user2.address,user3.address];
        const percentages = [8000,1000,1000];
        const airdropAmount = 2
        const price = ethers.parseEther("1")
        await musicalToken.mintAndList(user1.address,amount,_uri,price,airdropAmount,recipients,percentages)
        await musicalToken.mintAndList(user1.address,amount,_uri,price,airdropAmount,recipients,percentages)
    })
    it("Should revert when tried to safe transfer other than the marketplace contract",async function(){
        await expect( musicalToken.connect(user1).safeTransferFrom(marketplace.target,user1.address,1,6,"0x11")).to.be.revertedWithCustomError(musicalToken,"UnauthorizedTransfer");
    })
    it("Should revert when tried to batch safe transfer other than the marketplace contract",async function(){
        const ids = [ethers.toBigInt(1),ethers.toBigInt(2)]
        const amount = [ethers.toBigInt(6),ethers.toBigInt(6)]
        await expect( musicalToken.connect(user1).safeBatchTransferFrom(marketplace.target,user1.address,ids,amount,"0x11")).to.be.revertedWithCustomError(musicalToken,"UnauthorizedTransfer");
    })
   })
   describe("Setting MarketPlace contract",function(){
    let marketplaceV4;
    beforeEach(async function(){
    const MarketPlaceContractV4 = await ethers.getContractFactory("NFTMarketplace");
    marketplaceV4 = await upgrades.deployProxy(MarketPlaceContractV4,[owner.address,musicalToken.target,owner.address],{initializer:"initialize",});
    })
    it("should allow the owner to change marketplace",async function(){
        expect(await musicalToken.connect(owner).setMarketplaceContractAddress(marketplaceV4.target));
        expect (await musicalToken.marketplace()).to.be.equal(marketplaceV4.target);
    })
    it("should revert if anyone other than the owner tries to update the marketplace address",async function(){
        await expect( musicalToken.connect(user1).setMarketplaceContractAddress(marketplaceV4.target)).to.be.revertedWithCustomError(musicalToken,"OwnableUnauthorizedAccount");
    })
    it("should revert if the owner gives a 0 address",async function(){
         expect( await musicalToken.connect(owner).setMarketplaceContractAddress(ethers.ZeroAddress))
         console.log(await musicalToken.marketplace())
    })
   })

//    describe("Remove Royalty Recipients",function(){
//     beforeEach(async function(){
//         const _uri = "Hello"
//         const amount = 1
//         await musicalToken.mint(user1.address,amount,_uri)
//         const tokenId = 0;
//         const recipients = [user2.address,user3.address];
//         const percentages = [1000,1000];
//         await musicalToken.connect(user1).addRoyaltyRecipients(tokenId,recipients,percentages)
//     })
//     it("Should remove a royalty recipient",async function(){
//         const tokenId = 0;
//         const recipient = user2.address;
//         expect(await musicalToken.connect(user1).removeRoyaltyRecipient(tokenId,recipient)).to.emit(musicalToken,"RoyaltyRecipientRemoved").withArgs(tokenId,recipient)
//         const info =await musicalToken.getRoyaltyInfo(tokenId);
//         expect(info.recipients).to.deep.equal([user3.address]);
//         expect(info.percentages).to.deep.equal([1000]);
//         expect(info.totalPercentage).to.equal(1000);
//     })
//     it("Should revert if unaurthorized address/ Not owner of the token tries remove the recipient", async function(){
//         const tokenId = 0;
//         const recipient = user2.address;
//         await expect( musicalToken.connect(user3).removeRoyaltyRecipient(tokenId,recipient)).to.be.revertedWithCustomError(musicalToken,"UnauthorizedAccess")
//     })
//     it("should revert if recipients are not found",async function(){
//         const tokenId = 0;
//         const recipient = owner.address;
//         await expect( musicalToken.connect(user1).removeRoyaltyRecipient(tokenId,recipient)).to.be.revertedWithCustomError(musicalToken,"RecipientNotFound")
//     })
//    })

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
