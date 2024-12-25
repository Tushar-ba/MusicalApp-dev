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
            await expect( marketPlaceContract.connect(addr2).listNFT(tokenId,price,true)).to.be.be.revertedWithCustomError(marketPlaceContract,"NotTokenOwner")
        })
        it("Should revert if the token is not approved",async function(){
            await MusicalToken.connect(addr1).safeMint(addr1,"This is a test");
            const tokenId = 1;
            const price = ethers.parseEther("1");
            await expect( marketPlaceContract.connect(addr1).listNFT(tokenId,price,true)).to.be.be.revertedWithCustomError(marketPlaceContract,"MarketplaceNotApproved")
        })
        it("Should revert of the price is 0",async function(){
            const tokenId = 0;
            const price = ethers.parseEther("0");
            await expect( marketPlaceContract.connect(addr1).listNFT(tokenId,price,true)).to.be.be.revertedWithCustomError(marketPlaceContract,"InvalidPrice")
        })
    })
    //Tests for purtchasing an NFT 
    describe("Purchasing an NFT", function(){
        beforeEach(async function(){
            const tokenId = 0;
            const price = ethers.parseEther("1");
            await marketPlaceContract.connect(addr1).listNFT(tokenId,price,true);
        })
        it("Should purchase the NFT",async function(){
            const tokenId = 0;
            const price = ethers.parseEther("1");
            expect(await marketPlaceContract.connect(addr4).purchaseNFT(tokenId,{value:price})).to.emit(marketPlaceContract,"NFTPurchased").withArgs(tokenId,addr4.address,price);
            expect(await MusicalToken.ownerOf(tokenId)).to.equal(addr4.address);
        })
        it("Should remove the existing royalty recipients when an NFT with special buy option is true",async function(){
            const tokenId = 0;
            const price = ethers.parseEther("1");
            expect(await marketPlaceContract.connect(addr4).purchaseNFT(tokenId,{value:price})).to.emit(marketPlaceContract,"NFTPurchased").withArgs(tokenId,addr4.address,price);
            const info = await MusicalToken.getRoyaltyInfo(tokenId);
            expect(info.recipients).to.deep.equal([]);
            expect(info.percentages).to.deep.equal([]);
            expect(info.totalPercentage).to.equal(0);
            expect(await MusicalToken.ownerOf(tokenId)).to.equal(addr4.address);
        })
        it("Should still contain the royalty recipients if specialBuy is selected false along with there percentages",async function(){
            const tokenId = 1;
             const _tokenURI = "This is a test"
            const price = ethers.parseEther("1");
            const recipients = [addr2.address,addr3.address];
            const percentage = [1000,1000];
            await MusicalToken.connect(addr1).safeMint(addr1,_tokenURI);
            await MusicalToken.connect(addr1).approve(marketPlaceContract.target, tokenId);
            await MusicalToken.connect(addr1).addRoyaltyRecipients(tokenId,recipients,percentage);
            await marketPlaceContract.connect(addr1).listNFT(tokenId,price,false);
            expect(await marketPlaceContract.connect(addr4).purchaseNFT(tokenId,{value:price})).to.emit(marketPlaceContract,"NFTPurchased").withArgs(tokenId,addr4.address,price);
            const info = await MusicalToken.getRoyaltyInfo(tokenId);
            expect(info.recipients).to.deep.equal(recipients);
            expect(info.percentages).to.deep.equal(percentage);
            expect(info.totalPercentage).to.equal(2000);
            expect(await MusicalToken.ownerOf(tokenId)).to.equal(addr4.address);
        })
        it("Should allow the buyer to add royalty recipients after purchase from the special buy",async function(){
            const tokenId = 0;
            const price = ethers.parseEther("1");
            const recipients = ["0x49f51e3c94b459677c3b1e611db3e44d4e6b1d55","0x6803549eBe803518906B54Be4F2f837D39Cb1Cce"]
            const percentage = [1000,1000]
            await marketPlaceContract.connect(addr4).purchaseNFT(tokenId,{value:price});
            expect(await MusicalToken.connect(addr4).addRoyaltyRecipients(tokenId,recipients,percentage)).to.emit(MusicalToken,"RoyaltyRecipientsAdded").withArgs(tokenId,recipients,percentage);
            const info = await MusicalToken.getRoyaltyInfo(tokenId);
            expect(info.recipients).to.deep.equal(recipients);
            expect(info.percentages).to.deep.equal(percentage);
            expect(info.totalPercentage).to.equal(2000);
            expect(await MusicalToken.ownerOf(tokenId)).to.equal(addr4.address);
        })
        it("Should not allow the buyer to add royalty recipients if the special buy is not selected",async function(){
            const tokenId = 1;
             const _tokenURI = "This is a test"
            const price = ethers.parseEther("1");
            const recipients = [addr2.address,addr3.address];
            const newRecipients = ["0x49f51e3c94b459677c3b1e611db3e44d4e6b1d55","0x6803549eBe803518906B54Be4F2f837D39Cb1Cce"]
            const percentage = [1000,1000];
            await MusicalToken.connect(addr1).safeMint(addr1,_tokenURI);
            await MusicalToken.connect(addr1).approve(marketPlaceContract.target, tokenId);
            await MusicalToken.connect(addr1).addRoyaltyRecipients(tokenId,recipients,percentage);
            await marketPlaceContract.connect(addr1).listNFT(tokenId,price,false);
            await marketPlaceContract.connect(addr4).purchaseNFT(tokenId,{value:price});
            await expect( MusicalToken.connect(addr4).addRoyaltyRecipients(tokenId,newRecipients,percentage)).to.revertedWithCustomError(MusicalToken,"UnauthorizedAccess");
        })

        it("Should affect the balances of the buyer and seller after the purchase the NFT", async function () {
            const tokenId = 0;
            const price = ethers.parseEther("10");
            const beforeBalanceAddress1 = BigInt((await ethers.provider.getBalance(addr1.address)).toString());
            const beforeBalanceAddress2 = BigInt((await ethers.provider.getBalance(addr2.address)).toString());
            const beforeBalanceAddress3 = BigInt((await ethers.provider.getBalance(addr3.address)).toString());
            const beforeBalanceAddress4 = BigInt((await ethers.provider.getBalance(addr4.address)).toString());
            console.log(`Buyer balance before: ${ethers.formatEther(beforeBalanceAddress4.toString())}`);
            const tx = await marketPlaceContract.connect(addr4).purchaseNFT(tokenId, { value: price });
            const receipt = await tx.wait();
            const gasPrice = receipt.effectiveGasPrice || tx.gasPrice;
            if (!gasPrice) throw new Error("Gas price not available in transaction receipt or tx object");
        
            const gasUsed = BigInt(receipt.gasUsed.toString()) * BigInt(gasPrice.toString());
            const afterBalanceAddress1 = BigInt((await ethers.provider.getBalance(addr1.address)).toString());
            const afterBalanceAddress2 = BigInt((await ethers.provider.getBalance(addr2.address)).toString());
            const afterBalanceAddress3 = BigInt((await ethers.provider.getBalance(addr3.address)).toString());
            const afterBalanceAddress4 = BigInt((await ethers.provider.getBalance(addr4.address)).toString());
        
            console.log(`Buyer balance after: ${ethers.formatEther(afterBalanceAddress4.toString())}`);
            const sellerBalanceChange = afterBalanceAddress1 - beforeBalanceAddress1;
            const receiptBalanceChange1 = afterBalanceAddress2 - beforeBalanceAddress2;
            const receiptBalanceChange2 = afterBalanceAddress3 - beforeBalanceAddress3;
            const buyerBalanceChange = beforeBalanceAddress4 - afterBalanceAddress4;
        
            console.log(`Seller balance change: ${ethers.formatEther(sellerBalanceChange.toString())}`);
            console.log(`Recipient one balance change: ${ethers.formatEther(receiptBalanceChange1.toString())}`);
            console.log(`Recipient two balance change: ${ethers.formatEther(receiptBalanceChange2.toString())}`);
            console.log(`Buyer balance change (including gas): ${ethers.formatEther(buyerBalanceChange.toString())}`);
    
            expect(ethers.formatUnits(sellerBalanceChange).toString()).to.equal(ethers.formatUnits("8000000000000000000").toString()); 
            expect(ethers.formatUnits(receiptBalanceChange1).toString()).to.equal(ethers.formatUnits("1000000000000000000").toString()); 
            expect(ethers.formatUnits(receiptBalanceChange2).toString()).to.equal(ethers.formatUnits("1000000000000000000").toString()); 
            expect(Number(buyerBalanceChange)).to.be.closeTo(Number(price + gasUsed),Number(ethers.parseEther("0.01")));
        });
           
        it("should revert if the NFT is not listed",async function(){
            await expect( marketPlaceContract.connect(addr2).purchaseNFT(2,{value:ethers.parseEther("1")})).to.be.revertedWithCustomError(marketPlaceContract,"NFTNotListed");
        })
        
        it("Should Revert is the value is incorrect",async function(){
            await expect( marketPlaceContract.connect(addr2).purchaseNFT(0,{value:ethers.parseEther("0.5")})).to.be.revertedWithCustomError(marketPlaceContract,"InsufficientPayment");
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
            await expect(marketPlaceContract.connect(addr2).cancelListing(tokenId)).to.be.be.revertedWithCustomError(marketPlaceContract,"NotSeller")
        })
    }) 
})