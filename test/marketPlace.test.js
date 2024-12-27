const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

/// @notice should include listing cancellation event and should include an require statement to check is the token is listed of not and should make the transferRoyaltyManagement function external currently it is internal;

describe("MarketPlace Tests", ()=>{
    let MusicalToken, marketPlaceContract, owner, addr1, addr2, addr3, addr4
    beforeEach(async()=>{
        [owner, addr1, addr2, addr3, addr4] = await ethers.getSigners();
        const musicalTokenFactory = await ethers.getContractFactory("MusicalToken")
        MusicalToken = await upgrades.deployProxy(musicalTokenFactory,[owner.address,""],{initializer:"initialize"});
        await MusicalToken.waitForDeployment();
        //console.log("Musical token deployed",MusicalToken.target)

        const MarketPlaceContract = await ethers.getContractFactory("NFTMarketplace");
        marketPlaceContract = await upgrades.deployProxy(MarketPlaceContract,[owner.address, MusicalToken.target], {initializer:"initialize"});
        await marketPlaceContract.waitForDeployment();
        //console.log("Market Place contract deployed");

        // Minting NFT and giving approval
        const _uri = "Hello"
        const amount = 1
        await MusicalToken.mint(addr1.address,amount,_uri)
        const tokenId = 0;
        const recipients = [addr2.address,addr3.address];
        const percentages = [1000,1000];
        await MusicalToken.connect(addr1).addRoyaltyRecipients(tokenId, recipients, percentages)
        await MusicalToken.connect(owner).setMarketplaceContractAddress(await marketPlaceContract.getAddress());
        await MusicalToken.connect(addr1).setApprovalForAll(marketPlaceContract.target,true);
        //console.log("Minted and Approval granted for the marketplace contract");
    })

    describe("Listing an NFT",function(){
        it("Should List an NFT successfully", async function(){
            const tokenId = 0;
            const price = ethers.parseEther("1");
            const amount = 1;
            expect(await marketPlaceContract.connect(addr1).listNFT(tokenId,price,amount)).to.emit(marketPlaceContract,"NFTListed").withArgs(tokenId,addr1.address,price,amount,1);
            const listing = await marketPlaceContract.listings(tokenId);
            expect(listing.seller).to.be.equal(addr1.address);
            expect(listing.tokenId).to.be.equal(tokenId)
            expect(listing.price).to.be.equal(price);
            expect(listing.amount).to.be.equal(amount);
        })
        it("Should revert if the signer does not own the token", async function(){
            const tokenId = 0;
            const price = ethers.parseEther("1");
            const amount = 1;
            await expect( marketPlaceContract.connect(addr2).listNFT(tokenId,price,amount)).to.be.be.revertedWithCustomError(marketPlaceContract,"NotTokenOwner")
        })
        it("Should revert if the token is not approved",async function(){
            const amount = 1;
            await MusicalToken.connect(addr1).mint(addr2.address,amount,"This is a test");
            const tokenId = 1;
            const price = ethers.parseEther("1");
            await expect( marketPlaceContract.connect(addr2).listNFT(tokenId,price,amount)).to.be.be.revertedWithCustomError(marketPlaceContract,"MarketplaceNotApproved")
            // const info = await marketPlaceContract.listings(tokenId)
            // console.log(info)
        })
        it("Should revert of the price is 0",async function(){
            const tokenId = 0;
            const price = ethers.parseEther("0");
            const amount = 1;
            await expect( marketPlaceContract.connect(addr1).listNFT(tokenId,price,amount)).to.be.be.revertedWithCustomError(marketPlaceContract,"InvalidZeroParams")
        })
    })
    //Tests for purtchasing an NFT 
    describe("Purchasing an NFT", function(){
        beforeEach(async function(){
            const tokenId = 0;
            const price = ethers.parseEther("1");
            const amount = 1;
            await marketPlaceContract.connect(addr1).listNFT(tokenId,price,amount);
        })

        it("Should purchase the NFT",async function(){
            const tokenId = 0;
            const listingId = 0;
            const price = ethers.parseEther("1");
            const amount = 1;
            expect(await marketPlaceContract.connect(addr4).purchaseNFT(listingId,amount,{value:price})).to.emit(marketPlaceContract,"NFTPurchased").withArgs(tokenId,amount,price,addr4.address);
            expect(await MusicalToken.balanceOf(addr1.address,tokenId)).to.equal(0);
        })
        
        it("should revert if the NFT is not listed",async function(){
            await expect( marketPlaceContract.connect(addr2).purchaseNFT(2,1,{value:ethers.parseEther("1")})).to.be.revertedWithCustomError(marketPlaceContract,"NFTNotListed");
        })
        
        it("Should Revert is the value is incorrect",async function(){
            await expect( marketPlaceContract.connect(addr2).purchaseNFT(0,1,{value:ethers.parseEther("0.5")})).to.be.revertedWithCustomError(marketPlaceContract,"InsufficientPayment");
        })
        it("Should revert if the owner itself tries to buy the NFT",async function(){
            await expect(marketPlaceContract.connect(addr1).purchaseNFT(0,1,{value:ethers.parseEther("1")})).to.be.revertedWithCustomError(marketPlaceContract,"InvalidBuyer");
        })
        it("Should revert if amount is 0",async function(){
            await expect(marketPlaceContract.connect(addr4).purchaseNFT(0,0,{value:ethers.parseEther("1")})).to.be.revertedWithCustomError(marketPlaceContract,"InvalidZeroParams")
        })
        it("Should revert if the the msg.value is less than the listing price",async function(){
            await expect(marketPlaceContract.connect(addr4).purchaseNFT(0,2,{value:ethers.parseEther("0.5")})).to.revertedWithCustomError(marketPlaceContract,"InvalidAmountForPurchase")
        })
    })

    describe("List Special NFT",async function(){
       it("Should special List an NFT",async function () {
            const tokenId = 0;
            const price = ethers.parseEther("1");
            expect(await marketPlaceContract.connect(addr1).listSpecialNFT(tokenId,price)).to.emit(marketPlaceContract,"NFTListedForTransferTokenManager").withArgs(tokenId,addr1,price)
            const info = await marketPlaceContract.specialListings(tokenId);
            expect(info.tokenId).to.equal(0);
            expect(info.seller).to.equal(addr1);
            expect(info.price).to.equal(price);
       })
       it("Should revert if the price while listing is 0",async function(){
        const tokenId = 0;
        const price = ethers.parseEther("0");
        await expect(marketPlaceContract.connect(addr1).listSpecialNFT(tokenId,price)).to.be.revertedWithCustomError(marketPlaceContract,"InvalidZeroParams")
       })
    })

    describe("Special buy",function(){
        beforeEach(async function(){
            const tokenId = 0;
            const price = ethers.parseEther("1");
            await marketPlaceContract.connect(addr1).listSpecialNFT(tokenId,price)
        })
        it("Should Special buy",async function(){
            const tokenId = 0;
            const price = ethers.parseEther("1")
            expect(await marketPlaceContract.connect(addr4).specialBuy(tokenId,{value:price})).to.emit(marketPlaceContract,"SpecialPurchased").withArgs(tokenId,addr1.address,addr4.address);
            //const info = await marketPlaceContract.specialListings(tokenId);
            //expect(info).to.be.equal(0,ethers.provider.ZeroAddress,0);
            expect(await MusicalToken.balanceOf(addr4.address,tokenId)).to.equal(1)
        })
        it("Should revert if the token is not listed",async function(){
            const _uri = "Hello"
            const amount = 1
            await MusicalToken.mint(addr1.address,amount,_uri)
            const tokenId = 1;
            const recipients = [addr2.address,addr3.address];
            const percentages = [1000,1000];
            await MusicalToken.connect(addr1).addRoyaltyRecipients(tokenId, recipients, percentages)
            await MusicalToken.connect(addr1).setApprovalForAll(marketPlaceContract.target,true);
            const price = ethers.parseEther("1")
            await expect(marketPlaceContract.connect(addr1).specialBuy(tokenId,{value:price})).to.be.revertedWithCustomError(marketPlaceContract,"NFTNotListed");
        })
        it("Should revert if msg.value is not the same or greater than  the listing price",   async function(){
            const tokenId = 0;
            const price = ethers.parseEther("0.5")
            await expect(marketPlaceContract.connect(addr4).specialBuy(tokenId,{value:price})).to.be.revertedWithCustomError(marketPlaceContract,"InsufficientPayment");
        })
    })

    describe("Update Listing",async function () {
        beforeEach(async function(){
            const tokenId = 0;
            const price = ethers.parseEther("1");
            const amount = 1;
            await marketPlaceContract.connect(addr1).listNFT(tokenId,price,amount);
        })
        it("Should update the listed NFT successfully",async function(){
            const listingId = 0
            const tokenAmount = 1
            const price = ethers.parseEther("2")
            expect(await marketPlaceContract.connect(addr1).updateListedNFT(listingId,tokenAmount,price)).to.emit(marketPlaceContract,"NFTListUpdated").withArgs(0,addr1.address,price,tokenAmount,listingId);
            const info = await marketPlaceContract.listings(listingId);
            expect(info.price).to.equal(price)
        })
    })

    describe("Cancle Listing",function(){
        beforeEach(async function() {
            const tokenId = 0;
            const amount = 1;
            const price = ethers.parseEther("1");
            await marketPlaceContract.connect(addr1).listNFT(tokenId,price,amount);
        })
        it("Should cancel listing",async function(){
            const listingId = 0;
            const tokenId = 0;
            expect(await marketPlaceContract.connect(addr1).cancelListing(listingId)).to.emit(marketPlaceContract,"NFTListingCanceled").withArgs(listingId,addr1.sender,0,1);
            const listing = await marketPlaceContract.listings(tokenId);
            console.log(listing)
            expect(listing.seller).to.be.equal(ethers.ZeroAddress);
            expect(listing.price).to.be.equal(0);
        })
        it("Should revert is the canceller is not the owner of the token",async function(){
            const tokenId = 0;
            await expect(marketPlaceContract.connect(addr2).cancelListing(tokenId)).to.be.be.revertedWithCustomError(marketPlaceContract,"NotSeller")
        })
    }) 
})