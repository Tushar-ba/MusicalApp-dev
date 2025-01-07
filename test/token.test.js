const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");


describe("MusicalToken Contract", function () {
  let musicalToken, owner, user1, user2, user3,updatedUser1,updatedUser2,updatedUser3;

  beforeEach(async () => {
    [owner, user1, user2, user3,updatedUser1,updatedUser2,updatedUser3] = await ethers.getSigners();

    const MusicalTokenFactory = await ethers.getContractFactory("MusicalToken");
    musicalToken = await upgrades.deployProxy(MusicalTokenFactory, [owner.address,""], {
      initializer: "initialize",
    });
    await musicalToken.waitForDeployment();
    const MarketPlaceContract = await ethers.getContractFactory("NFTMarketplace");
    const marketplace = await upgrades.deployProxy(MarketPlaceContract,[owner.address,musicalToken.target,owner.address],{initializer:"initialize",});
    await musicalToken.setMarketplaceContractAddress(marketplace.target);
  });


    describe("Minting the token",function(){
        it("should mint a token ",async function(){
            const _uri= "Hello"
            const amount = 1
            const recipients = [user1.address,user2.address,user3.address];
            const percentages = [8000,1000,1000];
            const royaltyPercentageInBPS = 2000;
            expect(await musicalToken.mint(user1.address,amount,_uri,recipients,percentages,royaltyPercentageInBPS)).to.emit(musicalToken,"RoyaltyRecipientsAdded").withArgs(0,recipients,percentages,royaltyPercentageInBPS);
            expect(await musicalToken.balanceOf(user1.address,0)).to.equal(amount);
            const info = await musicalToken.getRoyaltyInfo(0);
            expect(info.recipients).to.deep.equal(recipients);
            expect(info.percentages).to.deep.equal(percentages);
            expect(info.royaltySharePercentageInBPS).to.equal(royaltyPercentageInBPS);
        })
        it("Should revert if the address field is empty", async function () {
            const _uri = "Hello";
            const AddressZero = ethers.ZeroAddress; 
            const amount = 1
            const recipients = [user1.address,user2.address,user3.address];
            const percentages = [8000,1000,1000];
            const royaltyPercentageInBPS = 2000;
            //console.log("AddressZero: ", await AddressZero.getAddress());
            await expect(musicalToken.mint(AddressZero,amount, _uri,recipients,percentages,royaltyPercentageInBPS))
                .to.be.revertedWithCustomError(musicalToken,"InvalidAddress");
        });
        it("Should revert if there is a mismatch with recipients and percentages length",async function(){
            const _uri = "Hello";
            const amount = 1
            const recipients = [user1.address,user2.address,user3.address];
            const percentages = [8000,1000,500,500];
            const royaltyPercentageInBPS = 2000;
            //console.log("AddressZero: ", await AddressZero.getAddress());
            await expect(musicalToken.mint(user1.address,amount, _uri,recipients,percentages,royaltyPercentageInBPS))
                .to.be.revertedWithCustomError(musicalToken,"RecipientsAndPercentagesMismatch");
        })
        it("Should revert if the royaltyPercentageInBPS is more than the MAX_ROYALTY_PERCENTAGE",async function(){
            const _uri = "Hello";
            const AddressZero = ethers.ZeroAddress; 
            const amount = 1
            const recipients = [user1.address,user2.address,user3.address];
            const percentages = [8000,1000,1000];
            const royaltyPercentageInBPS = 3000;
            await expect(musicalToken.mint(user1.address,amount, _uri,recipients,percentages,royaltyPercentageInBPS))
                .to.be.revertedWithCustomError(musicalToken,"MaxRoyaltyShareExceed");
        })
        it("Should revert if the percentage is invalid",async function(){
            const _uri = "Hello";
            const AddressZero = ethers.ZeroAddress; 
            const amount = 1
            const recipients = [user2.address,user3.address];
            const percentages = [1000,1000];
            const royaltyPercentageInBPS = 2000;
            await expect(musicalToken.mint(user1.address,amount, _uri,recipients,percentages,royaltyPercentageInBPS))
                .to.be.revertedWithCustomError(musicalToken,"InvalidPercentage");
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
            const amount = 1
            const recipients = [user1.address,user2.address,user3.address];
            const percentages = [8000,1000,1000];
            const royaltyPercentageInBPS = 2000;
            await musicalToken.mint(user1.address,amount,_uri,recipients,percentages,royaltyPercentageInBPS);
        })
        it("Should successfully update the royalty recipients",async function(){
            const updatedUserArry = [owner.address,updatedUser1.address,updatedUser2.address];
            const percentage = [6000,2000,2000];
            const royaltyPercentageInBPS = 1000;
            const tokenId = 0;
            const info1 = await musicalToken.getRoyaltyInfo(0);
            console.log("before",info1)
            expect(await musicalToken.connect(user1).updateRoyaltyRecipients(tokenId,updatedUserArry,percentage,royaltyPercentageInBPS)).to.emit(musicalToken,"RoyaltyRecipientsAdded").withArgs(tokenId,updatedUser1,percentage,royaltyPercentageInBPS);
            const info = await musicalToken.getRoyaltyInfo(0);
            console.log("after",info)
            //expect(info.recipients).to.deep.equal(updatedUserArry);
            expect(info.percentages).to.deep.equal(percentage);
            expect(info.royaltySharePercentageInBPS).to.equal(royaltyPercentageInBPS);
        })
        it("Should revert if the other than the token owner tries to update the token",async function(){
            const updatedUserArry = [owner.address,updatedUser1.address,updatedUser2.address];
            const percentage = [6000,2000,2000];
            const royaltyPercentageInBPS = 1000;
            const tokenId = 0;
            expect(await musicalToken.connect(user2).updateRoyaltyRecipients(tokenId,updatedUserArry,percentage,royaltyPercentageInBPS)).to.be.revertedWithCustomError(musicalToken,"UnauthorizedAccess");
        })
        it("Should revert if the percentage and recipients length mismatches",async function(){
            const updatedUserArry = [updatedUser1.address,updatedUser2.address];
            const percentage = [6000,2000,2000];
            const royaltyPercentageInBPS = 1000;
            const tokenId = 0;
            expect(await musicalToken.connect(user1).updateRoyaltyRecipients(tokenId,updatedUserArry,percentage,royaltyPercentageInBPS)).to.be.revertedWithCustomError(musicalToken,"RecipientsAndPercentagesMismatch");
        })
        it("Should revert if royalty share percent in BPS exceeds 2000",async function(){
            const updatedUserArry = [owner.address,updatedUser1.address,updatedUser2.address];
            const percentage = [6000,2000,2000];
            const royaltyPercentageInBPS = 3000;
            const tokenId = 0;
            expect(await musicalToken.connect(user1).updateRoyaltyRecipients(tokenId,updatedUserArry,percentage,royaltyPercentageInBPS)).to.be.revertedWithCustomError(musicalToken,"MaxRoyaltyShareExceed");
        })
        it("Should revert if the total percentage will not be equal to 10000 BPS",async function(){
            const updatedUserArry = [owner.address,updatedUser1.address,updatedUser2.address];
            const percentage = [6000,1000,1000];
            const royaltyPercentageInBPS = 3000;
            const tokenId = 0;
            expect(await musicalToken.connect(user1).updateRoyaltyRecipients(tokenId,updatedUserArry,percentage,royaltyPercentageInBPS)).to.be.revertedWithCustomError(musicalToken,"InvalidPercentage");
        })
    })


   describe("Getting Royalty Info",async function(){
    it("Should Fetch the Roylaty info correctly",async function(){
        const _uri= "Hello"
        const amount = 1
        const recipients = [user1.address,user2.address,user3.address];
        const percentages = [8000,1000,1000];
        const royaltyPercentageInBPS = 2000;
        await musicalToken.mint(user1.address,amount,_uri,recipients,percentages,royaltyPercentageInBPS);
 
        const info =await musicalToken.getRoyaltyInfo(0);
        console.log(info)
        expect(info.recipients).to.deep.equal(recipients);
        expect(info.percentages).to.deep.equal(percentages);
        expect(info.royaltySharePercentageInBPS).to.equal(royaltyPercentageInBPS)
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

