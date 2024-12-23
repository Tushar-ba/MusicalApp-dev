const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

/// @notice should include listing cancellation event and should include an require statement to check is the token is listed of not and should make the transferRoyaltyManagement function external currently it is internal;

describe("MarketPlace Tests", ()=>{
    let MusicalToken, marketPlaceContract, owner, addr1, addr2, addr3, addr4
    beforeEach(async()=>{
        [owner, addr1, addr2, addr3, addr4] = await ethers.getSigners();
        const musicalTokenFactory = await ethers.getContractFactory("MusicalToken")
        MusicalToken = await upgrades.deployProxy(musicalTokenFactory,[owner.address],{initializer:"initialize"});
        await MusicalToken.waitForDeployment();
        //console.log("Musical token deployed",MusicalToken.target)


        const MarketPlaceContract = await ethers.getContractFactory("NFTMarketplace");
        marketPlaceContract = await upgrades.deployProxy(MarketPlaceContract,[owner.address, MusicalToken.target], {initializer:"initialize"});
        await marketPlaceContract.waitForDeployment();
        
        //console.log("Market Place contract deployed");

        // Minting NFT and giving approval
        const _tokenURI = "This is a test"
        const tokenId = 0;
        const recipients = [addr2.address,addr3.address];
        const percentage = [1000,1000];
        await MusicalToken.connect(addr1).safeMint(addr1,_tokenURI);
        await MusicalToken.connect(addr1).approve(marketPlaceContract.target, tokenId);
        await MusicalToken.connect(owner).setMarketplaceContractAddress(marketPlaceContract.target);
        await MusicalToken.connect(addr1).addRoyaltyRecipients(tokenId,recipients,percentage);
        //console.log("Minted and Approval granted for the marketplace contract");
    })

    describe("Listing an NFT",function(){
        it("Should List an NFT successfully", async function(){
            const tokenId = 0;
            const price = ethers.parseEther("1");
            expect(await marketPlaceContract.connect(addr1).listNFT(tokenId,price,true)).to.emit(marketPlaceContract,"NFTListed").withArgs(tokenId,addr1.address,price,true);
            const listing = await marketPlaceContract.listings(tokenId);
            expect(listing.seller).to.be.equal(addr1.address);
            expect(listing.price).to.be.equal(price);
            expect(listing.isSpecialBuy).to.be.true;
        })
        it("Should revert if the signer does not own the token", async function(){
            const tokenId = 0;
            const price = ethers.parseEther("1");
            await expect( marketPlaceContract.connect(addr2).listNFT(tokenId,price,true)).to.be.revertedWith("Not the token owner")
        })
        it("Should revert if the token is not approved",async function(){
            await MusicalToken.connect(addr1).safeMint(addr1,"This is a test");
            const tokenId = 1;
            const price = ethers.parseEther("1");
            await expect( marketPlaceContract.connect(addr1).listNFT(tokenId,price,true)).to.be.revertedWith("Marketplace not approved for token")
        })
        it("Should revert of the price is 0",async function(){
            const tokenId = 0;
            const price = ethers.parseEther("0");
            await expect( marketPlaceContract.connect(addr1).listNFT(tokenId,price,true)).to.be.revertedWith("Price must be greater than zero")
        })
    })
    //Tests for purtchasing an NFT 
    describe("Purchasing an NFT", function(){
        beforeEach(async function(){
            const tokenId = 0;
            const price = ethers.parseEther("1");
            await marketPlaceContract.connect(addr1).listNFT(tokenId,price,true);
        })
        it("Should purchase the NFT",async function (){
            const tokenId = 0;
            const price = ethers.parseEther("1");
            expect(await marketPlaceContract.connect(addr4).purchaseNFT(tokenId,{value:price})).to.emit(marketPlaceContract,"NFTPurchased").withArgs(tokenId,addr1.address,price);
        })
        it("should revert if the NFT is not listed",async function(){
            await expect( marketPlaceContract.connect(addr2).purchaseNFT(2,{value:ethers.parseEther("1")})).to.revertedWith("NFT not listed");
        })
        it("Should Revert is the value is incorrect",async function(){
            await expect( marketPlaceContract.connect(addr2).purchaseNFT(0,{value:ethers.parseEther("2")})).to.revertedWith("Incorrect payment amount");
        })
    })
    describe("SpecialBuy",function(){
        beforeEach(async function(){
            const tokenId = 0;
            const price = ethers.parseEther("1");
            await marketPlaceContract.connect(addr1).listNFT(tokenId,price,true);
            //console.log("Listed")
        })
        it("Should special buy", async function () {
            const tokenId = 0;
            const price = ethers.parseEther("1");
            const listing = await marketPlaceContract.listings(tokenId);
            console.log(listing)
            expect(await marketPlaceContract.connect(addr4).specialBuy(tokenId, { value: price })).to.emit(marketPlaceContract, "NFTPurchased").withArgs(tokenId, addr2.address, price);
        });
        
        it("Should revert if the NFT is not listed",async function(){
            await expect( marketPlaceContract.connect(addr2).specialBuy(2,{value:ethers.parseEther("1")})).to.revertedWith("NFT not listed");
        })
        it("Should revert if special buy is not allowed",async function(){
            const tokenId = 1;
            const price = ethers.parseEther("1");
            await MusicalToken.connect(addr1).safeMint(addr1,"_tokenURI");
            await MusicalToken.connect(addr1).approve(marketPlaceContract.target, 1);
            await marketPlaceContract.connect(addr1).listNFT(tokenId,price,false);
            const listing = await marketPlaceContract.listings(tokenId);
            console.log(listing)
            await expect( marketPlaceContract.connect(addr2).specialBuy(1,{value:ethers.parseEther("1")})).to.revertedWith("Not a special buy");
        })
    })
    describe("Cancle Listing",function(){
        beforeEach(async function() {
            const tokenId = 0;
            const price = ethers.parseEther("1");
            await marketPlaceContract.connect(addr1).listNFT(tokenId,price,true);
        })
        it("Should cancel listing",async function(){
            const tokenId = 0;
            expect(await marketPlaceContract.connect(addr1).cancelListing(tokenId));
            const listing = await marketPlaceContract.listings(tokenId);
            expect(listing.seller).to.be.equal(ethers.ZeroAddress);
            expect(listing.price).to.be.equal(0);
            expect(listing.isSpecialBuy).to.be.false;
        })
        it("Should revert is the canceller is not the owner of the token",async function(){
            const tokenId = 0;
            await expect(marketPlaceContract.connect(addr2).cancelListing(tokenId)).to.be.revertedWith("Not the seller")
        })
    }) 
    describe.skip("DistributeRoyalties test cases", function(){
        beforeEach(async function(){
            const _tokenURI = "This is a test"
            const price = ethers.parseEther("1");
            const tokenId = 1;
            const recipients = [addr2.address,addr3.address];
            const percentage = [1000,1000];
            await MusicalToken.connect(addr1).safeMint(addr1,_tokenURI);
            await MusicalToken.connect(addr1).approve(marketPlaceContract.target, 0);
            await MusicalToken.connect(addr1).approve(marketPlaceContract.target, tokenId);
            await MusicalToken.connect(addr1).addRoyaltyRecipients(tokenId,recipients,percentage);
            console.log("add royalty percentages")
            await marketPlaceContract.connect(addr1).listNFT(tokenId,price,true);
            await marketPlaceContract.connect(addr2).purchaseNFT(tokenId,{value:price})
        })
        it("Should distribute royalties accordingly as mentioned in the music contract",async function(){
            const tokenId = 1;
            const price = ethers.parseEther("1");
            expect(await marketPlaceContract.connect(owner)._distributeRoyalties(tokenId,price)).to.changeEtherBalances([addr2.address,addr3.address],[ethers.parseEther("0.1"),ethers.parseEther("0.1")]);
        })
    })
})