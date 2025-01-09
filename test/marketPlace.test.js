const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");


describe("MarketPlace Tests", ()=>{
    let MusicalToken, marketPlaceContract, owner, addr1, addr2, addr3, addr4
    beforeEach(async()=>{
        [owner, addr1, addr2, addr3, addr4] = await ethers.getSigners();
        const musicalTokenFactory = await ethers.getContractFactory("MusicalToken")
        MusicalToken = await upgrades.deployProxy(musicalTokenFactory,[owner.address,""],{initializer:"initialize"});
        await MusicalToken.waitForDeployment();
        //console.log("Musical token deployed",MusicalToken.target)

        const MarketPlaceContract = await ethers.getContractFactory("NFTMarketplace");
        marketPlaceContract = await upgrades.deployProxy(MarketPlaceContract,[owner.address, MusicalToken.target,owner.address], {initializer:"initialize"});
        await marketPlaceContract.waitForDeployment();
        //console.log("Market Place contract deployed");

        // Minting NFT and giving approval
        const _uri= "Hello"
        const amount = 1
        const recipients = [addr1.address,addr2.address,addr3.address];
        const percentages = [8000,1000,1000];
        await MusicalToken.mint(addr1.address,amount,_uri,recipients,percentages);
        //console.log(await MusicalToken.balanceOf(addr1.address,0))
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
            const listing = await marketPlaceContract.listings(1);
            console.log(listing)
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
            const _uri= "Hello"
            const amount = 1
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentage = [5000,2500,2500]
            await MusicalToken.mint(addr2.address,amount,_uri,recipients,percentage);
            const tokenId = 1;
            const price = ethers.parseEther("1");
            await expect( marketPlaceContract.connect(addr2).listNFT(tokenId,price,amount)).to.be.be.revertedWithCustomError(marketPlaceContract,"MarketplaceNotApproved")
            // const info = await marketPlaceContract.listings(tokenId)
            // console.log(info)
        })
        it("Should revert if the token is already listed",async function(){
            const tokenId = 0;
            const amount = 1
            const price = ethers.parseEther("1");
            await marketPlaceContract.connect(addr1).listNFT(tokenId,price,amount)
            await expect( marketPlaceContract.connect(addr1).listNFT(tokenId,price,amount)).to.be.revertedWithCustomError(marketPlaceContract,"TokenAlreadyListed").then(console.log).catch(console.error)
        })
        it("Should revert of the price is 0",async function(){
            const tokenId = 0;
            const _uri= "Hello"
            const amount = 1
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [8000,1000,1000];
            await MusicalToken.mint(addr1.address,amount,_uri,recipients,percentages);
            const price = ethers.parseEther("0");
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
            const listingId = 1;
            const price = ethers.parseEther("1");
            const amount = 1;
            expect(await marketPlaceContract.connect(addr4).purchaseNFT(listingId,amount,{value:price})).to.emit(marketPlaceContract,"NFTPurchased").withArgs(tokenId,amount,price,addr4.address);
            expect(await MusicalToken.balanceOf(addr1.address,tokenId)).to.equal(0);
            expect(await MusicalToken.balanceOf(addr4.address,tokenId)).to.equal(1);
        })

        it("Should distribute the royalties according to the recipients set prior", async function(){
            const tokenId = 0;
            const listingId = 1;
            const price = ethers.parseEther("1");
            const amount = 1;
            const balanceBeforeOfAddress1 = await ethers.provider.getBalance(addr1)
            const balanceBeforeOfAddress2 = await ethers.provider.getBalance(addr2)
            const balanceBeforeOfAddress3 = await ethers.provider.getBalance(addr3)
            await marketPlaceContract.connect(addr4).purchaseNFT(listingId,amount,{value:price});
            const balanceAfterOfAddress1 = await ethers.provider.getBalance(addr1)
            const balanceAfterOfAddress2 = await ethers.provider.getBalance(addr2)
            const balanceAfterOfAddress3 = await ethers.provider.getBalance(addr3)
            const finalBalanceOfAddr1 = parseFloat(ethers.formatEther
            (balanceAfterOfAddress1 - balanceBeforeOfAddress1));
            console.log(`Address 1 balance after purchase:- ${finalBalanceOfAddr1}`)
            const finalBalanceOfAddr2 = parseFloat(ethers.formatEther(balanceAfterOfAddress2 - balanceBeforeOfAddress2));
            console.log(`Address 2 balance after purchase:- ${finalBalanceOfAddr2}`)
            const finalBalanceOfAddr3 = parseFloat(ethers.formatEther(balanceAfterOfAddress3 - balanceBeforeOfAddress3));
            console.log(`Address 3 balance after purchase:- ${finalBalanceOfAddr3}`)
            console.log(`contract balance:- ${ethers.formatEther(await ethers.provider.getBalance(marketPlaceContract.target))}`);
            expect(finalBalanceOfAddr1).to.equal(0.72);
            expect(finalBalanceOfAddr2).to.equal(0.09);
            expect(finalBalanceOfAddr3).to.equal(0.09);
        })
        
        it("should revert if the NFT is not listed",async function(){
            await expect( marketPlaceContract.connect(addr2).purchaseNFT(2,1,{value:ethers.parseEther("1")})).to.be.revertedWithCustomError(marketPlaceContract,"NFTNotListed");
        })
        
        it("Should Revert is the value is incorrect",async function(){
            await expect( marketPlaceContract.connect(addr2).purchaseNFT(1,1,{value:ethers.parseEther("0.5")})).to.be.revertedWithCustomError(marketPlaceContract,"InsufficientPayment");
        })
        it("Should revert if the owner itself tries to buy the NFT",async function(){
            await expect(marketPlaceContract.connect(addr1).purchaseNFT(1,1,{value:ethers.parseEther("1")})).to.be.revertedWithCustomError(marketPlaceContract,"InvalidBuyer");
        })
        it("Should revert if amount is 0",async function(){
            await expect(marketPlaceContract.connect(addr4).purchaseNFT(1,0,{value:ethers.parseEther("1")})).to.be.revertedWithCustomError(marketPlaceContract,"InvalidZeroParams")
        })
        it("Should revert if the the msg.value is less than the listing price",async function(){
            await expect(marketPlaceContract.connect(addr4).purchaseNFT(1,2,{value:ethers.parseEther("0.5")})).to.revertedWithCustomError(marketPlaceContract,"InvalidAmountForPurchase")
        })
    })

    describe("Special List",async function(){
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
       it("Should revert if the msg.sender does not have TokenRoyaltyManager role",async function(){
            const tokenId = 0;
            const price = ethers.parseEther("0");
            await expect(marketPlaceContract.connect(addr2).listSpecialNFT(tokenId,price)).to.be.revertedWithCustomError(marketPlaceContract,"NotTokenRoyaltyManager")
        })
        it("should revert if the marketplace is not approved",async function(){
            const tokenId = 1;
            const price  =ethers.parseEther("1");
            await MusicalToken.connect(addr2).mint(addr2.address,1,"this",[addr1.address,addr2.address],[5000,5000]);
            await expect(marketPlaceContract.connect(addr2).listSpecialNFT(tokenId,price)).to.be.revertedWithCustomError(marketPlaceContract,"MarketplaceNotApproved");
        })
    })

    describe("Special buy",function(){
        beforeEach(async function(){
            const tokenId = 0;
            const price = ethers.parseEther("1");
            await marketPlaceContract.connect(addr1).listNFT(tokenId,price,1)
            //console.log("1")       
            await marketPlaceContract.connect(addr1).listSpecialNFT(tokenId,price)
            //console.log("1")      
            //await marketPlaceContract.connect(addr4).purchaseNFT(1,1,{value:price})
            //console.log("1")      
            //console.log(await MusicalToken.connect(addr1).balanceOf(addr1.address,tokenId))
        })
        it("Should Special buy and the new owner should be able to manage recipients",async function(){
            const tokenId = 0;
            const price = ethers.parseEther("1")
            const recipients = [addr4.address,"0x5c6B0f7Bf3E7ce046039Bd8FABdfD3f9F5021678","0x03C6FcED478cBbC9a4FAB34eF9f40767739D1Ff7"]
            const percentages = [6000,2000,2000]
            const balanceBeforeOfAddress1 = await ethers.provider.getBalance(addr1)
            const balanceBeforeOfAddress2 = await ethers.provider.getBalance(addr2)
            const balanceBeforeOfAddress3 = await ethers.provider.getBalance(addr3)
            //console.log(addr4.address)
            //console.log(marketPlaceContract.target)
            const info = await MusicalToken.getRoyaltyInfo(0);
            //console.log(info)
            //await marketPlaceContract.connect(addr4).purchaseNFT(1,1,{value:ethers.parseEther("1")});
            expect(await marketPlaceContract.connect(addr4).specialBuy(tokenId,recipients,percentages,{value:price})).to.emit(marketPlaceContract,"SpecialPurchased").withArgs(tokenId,addr1.address,addr4.address).and.to.emit(marketPlaceContract,"updateRoyaltyRecipients").withArgs(tokenId,recipients,percentages);
            const balanceAfterOfAddress1 = await ethers.provider.getBalance(addr1)
            const balanceAfterOfAddress2 = await ethers.provider.getBalance(addr2)
            const balanceAfterOfAddress3 = await ethers.provider.getBalance(addr3)
            const finalBalanceOfAddr1 = parseFloat(ethers.formatEther
                (balanceAfterOfAddress1 - balanceBeforeOfAddress1));
                //console.log(`Address 1 balance after purchase:- ${finalBalanceOfAddr1}`)
                const finalBalanceOfAddr2 = parseFloat(ethers.formatEther(balanceAfterOfAddress2 - balanceBeforeOfAddress2));
                //console.log(`Address 2 balance after purchase:- ${finalBalanceOfAddr2}`)
                const finalBalanceOfAddr3 = parseFloat(ethers.formatEther(balanceAfterOfAddress3 - balanceBeforeOfAddress3));
                //console.log(`Address 3 balance after purchase:- ${finalBalanceOfAddr3}`)
                //console.log(`contract balance:- ${ethers.formatEther(await ethers.provider.getBalance(marketPlaceContract.target))}`);
            const info1 = await MusicalToken.getRoyaltyInfo(0);
            console.log(info1)
            expect(info1.recipients).to.deep.equal(recipients);
            expect(info1.percentages).to.deep.equal(percentages);
            console.log(await MusicalToken.balanceOf(addr4.address,0));
        })
        it("Should revert if the token is not listed",async function(){
            const _uri= "Hello"
            const tokenId = 1
            const amount = 1
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [8000,1000,1000];
            const price = ethers.parseEther("1")
            await MusicalToken.mint(addr1.address,amount,_uri,recipients,percentages);
            await expect(marketPlaceContract.connect(addr4).specialBuy(tokenId,recipients,percentages,{value:price})).to.be.revertedWithCustomError(marketPlaceContract,"NFTNotListed");
        })
        it("Should revert if msg.value is not the same or greater than  the listing price",async function(){
            const tokenId = 0
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [8000,1000,1000];
            const price = ethers.parseEther("2")
            await expect(marketPlaceContract.connect(addr4).specialBuy(tokenId,recipients,percentages,{value:price})).to.be.revertedWithCustomError(marketPlaceContract,"InsufficientPayment");;
        })
        it("Should revert if there is a mismatch between the recipients length and percentage length",async function(){
            const tokenId = 0
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [7000,1000,1000,1000];
            const price = ethers.parseEther("1")
            await expect(marketPlaceContract.connect(addr4).specialBuy(tokenId,recipients,percentages,{value:price})).to.be.revertedWithCustomError(marketPlaceContract,"MismatchedArrayPassed");;
        })
    })

    describe("Update Listing",async function () {
        beforeEach(async function(){
            const _uri= "Hello"
            const amount = 1
            const recipients = [addr1.address,addr2.address,addr3.address];
            const price = ethers.parseEther("2");
            const percentages = [8000,1000,1000];
            //console.log(await MusicalToken.nextTokenId);
            await MusicalToken.mint(addr1.address,amount,_uri,recipients,percentages);
            await MusicalToken.connect(addr1).setApprovalForAll(marketPlaceContract.target,true);
            await marketPlaceContract.connect(addr1).listNFT(1,price,1);
            const listing = await marketPlaceContract.listings(1);
            console.log(listing)
            //console.log(await MusicalToken.connect(addr1).balanceOf(addr1.address,tokenId))
        })
        it("Should update the listed NFT successfully",async function(){
            const listingId = 1
            const tokenAmount = 0
            const price = ethers.parseEther("2")
            expect(await marketPlaceContract.connect(addr1).updateListedNFT(listingId,tokenAmount,price)).to.emit(marketPlaceContract,"NFTListUpdated").withArgs(0,addr1.address,price,tokenAmount,listingId);
            const infoAfter = await marketPlaceContract.listings(listingId);
            expect(infoAfter.price).to.equal(price)
        }) 
        it("Should revert if the NFT is not listed",async function(){
            const listingId = 2
            const tokenAmount = 0
            const price = ethers.parseEther("2")
            const _uri= "Hello"
            const amount = 1
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [8000,1000,1000];
            await MusicalToken.mint(addr1.address,amount,_uri,recipients,percentages);
            await expect(marketPlaceContract.connect(addr1).updateListedNFT(listingId,tokenAmount,price)).to.be.revertedWithCustomError(marketPlaceContract,"NFTNotListed")
        }) 
        it("Should revert if the seller does not have the authority to update the nft",async function(){
            const listingId = 1
            const tokenAmount = 0
            const price = ethers.parseEther("2")
            const _uri= "Hello"
            const amount = 1
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [8000,1000,1000];
            await MusicalToken.mint(addr1.address,amount,_uri,recipients,percentages);
            await marketPlaceContract.connect(addr1).listNFT(2,price,1);
            await marketPlaceContract.connect(addr2).purchaseNFT(2,1,{value:price});
            const listing = await marketPlaceContract.listings(2);
            console.log(listing)
            await expect(marketPlaceContract.connect(addr2).updateListedNFT(listingId,tokenAmount,price)).to.be.revertedWithCustomError(marketPlaceContract,"NoAuthorityToUpdateListing")
        }) 
        it("Should revert if the msg.value is 0",async function(){
            const listingId = 1
            const tokenAmount = 0
            const price = ethers.parseEther("0")
            const _uri= "Hello"
            const amount = 1
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [8000,1000,1000];
            await MusicalToken.mint(addr1.address,amount,_uri,recipients,percentages);
            await expect(marketPlaceContract.connect(addr1).updateListedNFT(listingId,tokenAmount,price)).to.be.revertedWithCustomError(marketPlaceContract,"InvalidZeroParams")
        }) 
        it("Should revert if other than the tokne owner tries to update the token",async function(){
            const listingId = 1
            const tokenAmount = 2
            const price = ethers.parseEther("0")
            await expect(marketPlaceContract.connect(addr1).updateListedNFT(listingId,tokenAmount,price)).to.be.revertedWithCustomError(marketPlaceContract,"NotTokenOwner")
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
            const listingId = 1;
            const tokenId = 0;
            expect(await marketPlaceContract.connect(addr1).cancelListing(listingId)).to.emit(marketPlaceContract,"NFTListingCanceled").withArgs(listingId,addr1.sender,0,1);
            const listing = await marketPlaceContract.listings(tokenId);
            //console.log(listing)
            expect(listing.seller).to.be.equal(ethers.ZeroAddress);
            expect(listing.price).to.be.equal(0);
        })
        it("Should revert is the canceller is not the owner of the token",async function(){
            const tokenId = 1;
            await expect(marketPlaceContract.connect(addr2).cancelListing(tokenId)).to.be.be.revertedWithCustomError(marketPlaceContract,"NotSeller")
        })
        it("Should revert if the NFT is not listed",async function(){
            const _uri= "Hello"
            const amount = 1
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [8000,1000,1000];
            await MusicalToken.mint(addr1.address,amount,_uri,recipients,percentages);
            await expect(marketPlaceContract.connect(addr1).cancelListing(2)).to.be.be.revertedWithCustomError(marketPlaceContract,"NFTNotListed")
        })
    })
    describe("Cancle Special Listing",function(){
        beforeEach(async function () {
            const tokenId = 0;
            const price = ethers.parseEther("1");
            await marketPlaceContract.connect(addr1).listNFT(tokenId,price,1);
            await marketPlaceContract.connect(addr1).listSpecialNFT(tokenId,price)
            //console.log(await marketPlaceContract.specialListings(0))
        })
        it("Should cancel special listing",async function(){
            const tokenId = 0;
            expect(await marketPlaceContract.connect(addr1).cancelSpecialNFTListing(tokenId)).to.emit(marketPlaceContract,"SpecialNFTListingCanceled").withArgs(tokenId,addr1.address);
            const info = await marketPlaceContract.specialListings(tokenId);
            //console.log(info);
            expect(info.seller).to.equal(ethers.ZeroAddress);
        })
        it("Should revert if the token is not listed",async function(){
            const tokenId = 1;
            const tokenAmount = 1
            const _uri= "Hello"
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [8000,1000,1000];
            await MusicalToken.mint(addr1.address,tokenAmount,_uri,recipients,percentages);
            await expect( marketPlaceContract.connect(addr1).cancelSpecialNFTListing(tokenId)).to.revertedWithCustomError(marketPlaceContract,"NFTNotListed")
        })
        it("Should revert if the token is not listed",async function(){
            const tokenId = 0;
            await expect(marketPlaceContract.connect(addr2).cancelSpecialNFTListing(tokenId)).to.revertedWithCustomError(marketPlaceContract,"NotSeller")
        })
    })

    describe("Updating the platformFee for first Time sale",function(){
        it("Should allow owner to update the platformFee for first time sale",async function(){
            expect(await marketPlaceContract.connect(owner).updateFirstTimeSaleFee(1500,1500,7000)).to.emit(marketPlaceContract,"FeeConfigUpdated").withArgs("",1500,1500,7000);
            const info = await marketPlaceContract.firstTimeSaleFeeDetails();
            console.log(info);
            expect(info.platformFee).to.equal(1500);
            expect(info.splits).to.equal(1500);
            expect(info.sellerShare).to.equal(7000);
        })
        it("Should revert if the total percentage is less",async function(){
            await expect( marketPlaceContract.connect(owner).updateFirstTimeSaleFee(150,1500,7000)).to.be.revertedWithCustomError(marketPlaceContract,"InvalidPercentage");
        })
        it("Should distribute the royalties according to the updated prices",async function(){
            await marketPlaceContract.connect(addr1).listNFT(0,ethers.parseEther("1"),1);
            console.log(await marketPlaceContract.listings(1));
            console.log(`contract balance:-${ethers.formatEther(await ethers.provider.getBalance(marketPlaceContract.target))}`)
            console.log(await marketPlaceContract.firstTimeSaleFeeDetails());
            await marketPlaceContract.connect(owner).updateFirstTimeSaleFee(5000,5000,0);
            const balanceBeforeOfAddress1 = ethers.formatEther(await ethers.provider.getBalance(addr1));
            const balanceBeforeOfAddress2 = ethers.formatEther(await ethers.provider.getBalance(addr2));
            const balanceBeforeOfAddress3 = ethers.formatEther(await ethers.provider.getBalance(addr3));
            const balanceBeforeOfOwner = ethers.formatEther(await ethers.provider.getBalance(owner));
            await marketPlaceContract.connect(addr4).purchaseNFT(1,1,{value:ethers.parseEther("1")});
            const balanceAfterOfAddress1 = ethers.formatEther(await ethers.provider.getBalance(addr1));
            const balanceAfterOfAddress2 = ethers.formatEther(await ethers.provider.getBalance(addr2));
            const balanceAfterOfAddress3 = ethers.formatEther(await ethers.provider.getBalance(addr3));
            const balanceAfterOfOwner = ethers.formatEther(await ethers.provider.getBalance(owner));
            console.log(await marketPlaceContract.firstTimeSaleFeeDetails());
            const finalWalletbalanceAddr1 = balanceAfterOfAddress1 - balanceBeforeOfAddress1;
            const finalWalletbalanceAddr2 = balanceAfterOfAddress2 - balanceBeforeOfAddress2;
            const finalWalletbalanceAddr3 = balanceAfterOfAddress3 - balanceBeforeOfAddress3;
            const finalWalletbalanceOwner = balanceAfterOfOwner - balanceBeforeOfOwner;
            console.log(`contract balance:-${ethers.formatEther(await ethers.provider.getBalance(marketPlaceContract.target))}`) 
            console.log("Address 1 balance:- ",finalWalletbalanceAddr1,addr1.address)
            console.log("Address 2 balance:- ",finalWalletbalanceAddr2)
            console.log("Address 3 balance:- ",finalWalletbalanceAddr3)
            console.log("Owner  balance:- ",finalWalletbalanceOwner)
        })
    })

    describe("Special List",async function(){
        it("Should assign the ownership to the buyer by default if not recipients or percentages are mentioned",async function(){
            const _uri= "Hello"
            const amount = 5
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [8000,1000,1000];
            const recipientsNew = [];
            const percentagesNew = [];
            const price = ethers.parseEther("10")
            console.log((price));
            await MusicalToken.mint(addr1.address,amount,_uri,recipients,percentages);
            await MusicalToken.connect(addr1).setApprovalForAll(marketPlaceContract.target,true);
            await marketPlaceContract.connect(addr1).listNFT(1,price,1); 
            console.log("Hello")
            await marketPlaceContract.connect(addr1).listSpecialNFT(1,price);
            console.log("Hello")
            await marketPlaceContract.connect(addr4).purchaseNFT(1,1, { value: price })
            console.log("Hello")
            await marketPlaceContract.connect(addr4).specialBuy(1,recipientsNew,percentagesNew,{value:ethers.parseEther("10")});
            const info = await MusicalToken.getRoyaltyInfo(1);
            console.log(info)
        })
    })

    describe("Updating the Resell fee",function(){
        it("Should Allow the owner to update the Resell fee",async function(){
            expect(await marketPlaceContract.connect(owner).updateResellFee(4000,2000,4000)).to.emit(marketPlaceContract,"FeeConfigUpdated").withArgs("Resell",4000,2000,4000)
            const info = await marketPlaceContract.resellFeeDetails();
            expect(info.platformFee).to.equal(4000);
            expect(info.splits).to.equal(2000);
            expect(info.sellerShare).to.equal(4000);
        })
        it("Should Allow the owner to update the Resell fee",async function(){
            await expect( marketPlaceContract.connect(owner).updateResellFee(2000,2000,4000)).to.be.revertedWithCustomError(marketPlaceContract,"InvalidPercentage")
        })
        it("Should distribute the royalties as per the updated resell",async function(){
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [8000,1000,1000];
            await marketPlaceContract.connect(addr1).listNFT(0,ethers.parseEther("1"),1);
            await marketPlaceContract.connect(addr4).purchaseNFT(1,1,{value:ethers.parseEther("1")});
            await marketPlaceContract.connect(addr1).listSpecialNFT(0,ethers.parseEther("1"));
            await marketPlaceContract.connect(addr4).specialBuy(0,recipients,percentages,{value:ethers.parseEther("1")});
            await marketPlaceContract.connect(owner).updateResellFee(4000,2000,4000);
            await MusicalToken.connect(addr4).setApprovalForAll(marketPlaceContract.target,true);
            await marketPlaceContract.connect(addr4).listNFT(0,ethers.parseEther("1"),1);
            const balanceBeforeOfAddress1 = await ethers.provider.getBalance(addr1);
            const balanceBeforeOfAddress2 = await ethers.provider.getBalance(addr2);
            const balanceBeforeOfAddress3 = await ethers.provider.getBalance(addr3);
            const balanceBeforeOfAddress4 = await ethers.provider.getBalance(addr4);
            const tx = await marketPlaceContract.connect(addr1).purchaseNFT(2,1,{value:ethers.parseEther("1")});
            const txRecipt = await tx.wait();
            const gasUsed = txRecipt.gasUsed;
            const txHash = await ethers.provider.getTransaction(tx.hash);
            const gasFee = txHash.gasPrice
            const feeUsedInWei = gasUsed * gasFee;
            const feeUsedInEth = ethers.formatEther(feeUsedInWei);
            console.log(feeUsedInEth);
            const balanceAfterOfAddress1 = await ethers.provider.getBalance(addr1);
            const balanceAfterOfAddress2 = await ethers.provider.getBalance(addr2);
            const balanceAfterOfAddress3 = await ethers.provider.getBalance(addr3);
            const balanceAfterOfAddress4 = await ethers.provider.getBalance(addr4);
            const addr1Balance = balanceBeforeOfAddress1 - (ethers.parseEther(feeUsedInEth) + ethers.parseEther("1"));
            console.log(ethers.formatEther(addr1Balance))
            console.log(ethers.formatEther(balanceAfterOfAddress1))
            const finalBalanceOfAddr1 = balanceAfterOfAddress1 - addr1Balance;
            const finalBalanceOfAddr2 = balanceAfterOfAddress2 - balanceBeforeOfAddress2;
            const finalBalanceOfAddr3 = balanceAfterOfAddress3 - balanceBeforeOfAddress3;
            const finalBalanceOfAddr4 = balanceAfterOfAddress4 - balanceBeforeOfAddress4;
            console.log(`Address 1:- ${ethers.formatEther(finalBalanceOfAddr1)}`)
            console.log(`Address 2:- ${ethers.formatEther(finalBalanceOfAddr2)}`)
            console.log(`Address 3:- ${ethers.formatEther(finalBalanceOfAddr3)}`)
            console.log(`Address 4:- ${ethers.formatEther(finalBalanceOfAddr4)}`)
        })
        //it("should allow the perdsoneto ")
    })

    describe("onERC1155recived",async function(){
        it("Should return bytes on ERC1155recived",async function(){
            const result = await marketPlaceContract.onERC1155Received(ethers.ZeroAddress,ethers.ZeroAddress,0,0,"0x")
            //console.log(result);
            expect(result).to.equal(marketPlaceContract.interface.getFunction("onERC1155Received").selector);
            //console.log(marketPlaceContract.interface.getFunction("onERC1155Received").selector)
        })
        it("Should return bytes on ERC1155BatchRecived", async function () {
            const result = await marketPlaceContract.onERC1155BatchReceived(ethers.ZeroAddress,ethers.ZeroAddress,[],[],"0x");
            expect(result).to.equal(marketPlaceContract.interface.getFunction("onERC1155BatchReceived").selector);
        });
    })
    describe("Marketplace Contract upgradability", function () {
        let MarketPlace;
        let marketplace;
        let owner;
        let nonOwner;
        let MusicalToken;
        let musicalToken;
      
        beforeEach(async function () {
            [owner, nonOwner] = await ethers.getSigners();
            MusicalToken = await ethers.getContractFactory("MusicalToken");
            musicalToken = await upgrades.deployProxy(MusicalToken, 
                [owner.address,"Hello"],
                { initializer: "initialize", kind: "uups" }
            );
            const MusicalTokenAddress = await musicalToken.waitForDeployment();
            MarketPlace = await ethers.getContractFactory("NFTMarketplace");
            marketplace = await upgrades.deployProxy(MarketPlace, 
                [owner.address,MusicalTokenAddress.target,owner.address],
                { initializer: "initialize", kind: "uups" }
            );
            await marketplace.waitForDeployment();
        });
      
        it("should allow the owner to authorize the upgrade", async function () {
            const beforeImpl = await upgrades.erc1967.getImplementationAddress(
                await marketplace.getAddress()
            );
            MarketPlace = await ethers.getContractFactory("NFTMarketplaceV2");
            marketplace = await upgrades.deployProxy(MarketPlace, 
                [owner.address,musicalToken.target,owner.address],
                { initializer: "initialize", kind: "uups" }
            );
            //console.log("Before upgrade:", beforeImpl);
            const MarketPlaceV2 = await ethers.getContractFactory("NFTMarketplaceV2",owner);
            const upgradedProxy = await upgrades.upgradeProxy(await marketplace.getAddress(), MarketPlaceV2);
            //const implementationAddress = await upgrades.erc1967.getImplementationAddress( await upgradedProxy.getAddress());
            //console.log(implementationAddress)
            const afterImpl = await upgrades.erc1967.getImplementationAddress(await upgradedProxy.getAddress());
            //console.log("After upgrade:", afterImpl);
            expect(beforeImpl).to.not.equal(afterImpl);
        });
      
        it("should revert if a non-owner tries to authorize the upgrade", async function () {
            const MarketPlaceV2 = await ethers.getContractFactory("NFTMarketplaceV2", nonOwner);
            await expect(upgrades.upgradeProxy(await marketplace.getAddress(), MarketPlaceV2)).to.be.revertedWithCustomError(marketPlaceContract, "OwnableUnauthorizedAccount");
        });
    });
})