const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");


describe("MarketPlace Tests", ()=>{
    let MusicalToken, marketPlaceContract, owner, addr1, addr2, addr3, addr4
    beforeEach(async()=>{
        [owner, addr1, addr2, addr3, addr4] = await ethers.getSigners();
        const musicalTokenFactory = await ethers.getContractFactory("MusicalToken")
        MusicalToken = await upgrades.deployProxy(musicalTokenFactory,[owner.address,"hhh"],{initializer:"initialize"});
        await MusicalToken.waitForDeployment();
        //console.log("Musical token deployed",MusicalToken.target)

        const MarketPlaceContract = await ethers.getContractFactory("NFTMarketplace");
        marketPlaceContract = await upgrades.deployProxy(MarketPlaceContract,[owner.address, MusicalToken.target,owner.address], {initializer:"initialize"});
        await marketPlaceContract.waitForDeployment();
        //console.log("Market Place contract deployed");
        await MusicalToken.connect(owner).setMarketplaceContractAddress(marketPlaceContract.target);
        await MusicalToken.connect(owner).mintAndList(addr1.address,6,"hello",ethers.parseEther("1"),2,[addr1.address,addr2.address],[5000,5000]);
        // const listing = await marketPlaceContract.listings(1);
        // console.log(listing)
    })

    describe("Listing an NFT",function(){
        beforeEach(async function(){
            await marketPlaceContract.connect(addr4).purchaseNFT(1,4,{value:ethers.parseEther("4")});
            await MusicalToken.connect(addr4).setApprovalForAll(marketPlaceContract.target,true);
        })
        it("Should List an NFT successfully", async function(){
            const tokenId = 1;
            const price = ethers.parseEther("1");
            const amount = 1;
            console.log(addr4.address)
            console.log(addr1.address)
            expect(await marketPlaceContract.connect(addr4).listNFT(addr1.address,tokenId,price,amount)).to.emit(marketPlaceContract,"NFTListed").withArgs(tokenId,addr4.address,price,amount,1);
            const listing = await marketPlaceContract.listings(2);
            console.log(listing)
            expect(listing.seller).to.be.equal(addr4.address);
            expect(listing.tokenId).to.be.equal(tokenId)
            expect(listing.price).to.be.equal(price);
            expect(listing.amount).to.be.equal(amount);
        })
        it("Should revert if the signer does not own the token", async function(){
            const tokenId = 1;
            const price = ethers.parseEther("1");
            const amount = 1;
            await expect(marketPlaceContract.connect(addr2).listNFT(addr1.address,tokenId,price,amount)).to.be.be.revertedWithCustomError(marketPlaceContract,"NotTokenOwner")
        })
        it("Should revert if the token is not approved",async function(){
            const _uri= "Hello"
            const amount = 1
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentage = [5000,2500,2500]
            const price = ethers.parseEther("1");
            await MusicalToken.connect(owner).mintAndList(addr1.address,6,"hello",price,2,recipients,percentage);
            await marketPlaceContract.connect(addr3).purchaseNFT(2,4,{value:price * ethers.toBigInt(4)});
            const tokenId = 2;
            await expect( marketPlaceContract.connect(addr3).listNFT(addr1.address,tokenId,price,amount)).to.be.be.revertedWithCustomError(marketPlaceContract,"MarketplaceNotApproved")
            // const info = await marketPlaceContract.listings(tokenId)
            // console.log(info)
        })
        it("Should revert if the token is already listed",async function(){
            const tokenId = 1;
            const amount = 1
            const price = ethers.parseEther("1");
            await marketPlaceContract.connect(addr4).listNFT(addr1.address,tokenId,price,amount)
            await expect( marketPlaceContract.connect(addr4).listNFT(addr1.address,tokenId,price,amount)).to.be.revertedWithCustomError(marketPlaceContract,"TokenAlreadyListed").then(console.log).catch(console.error)
        })
        it("Should revert of the price is 0",async function(){
            const tokenId = 1;
            const _uri= "Hello"
            const amount = 1
            const recipients = [addr1.address,addr2.address,addr3.address];
            const price = ethers.parseEther("0");
            const percentages = [8000,1000,1000];
            await MusicalToken.connect(owner).mintAndList(addr1.address,6,"hello",ethers.parseEther("1"),2,recipients,percentages);
            await expect( marketPlaceContract.connect(addr4).listNFT(addr1.address,tokenId,price,amount)).to.be.be.revertedWithCustomError(marketPlaceContract,"InvalidZeroParams")
        })
        it("Should set the isTokenListedBeforeInMarketplace to true when listed", async function(){
            const tokenId = 1;
            const amount = 1;
            const price = ethers.parseEther("10")
            await marketPlaceContract.connect(addr4).listNFT(addr1.address,tokenId,price,amount);
            const info = await marketPlaceContract.isTokenListedBeforeInMarketplace(1);
            console.log(info);
            expect(info).to.be.true;
        })
    })

    //Tests for purtchasing an NFT 
    describe("Purchasing an NFT", function(){
        // beforeEach(async function(){
        //     const tokenId = 1;
        //     const price = ethers.parseEther("1");
        //     const amount = 1;
        //     await marketPlaceContract.connect(addr1).listNFT(tokenId,price,amount);
        // })

        it("Should purchase the NFT",async function(){
            const tokenId = 1;
            const listingId = 1;
            const price = ethers.parseEther("1");
            const amount = 1;
            expect(await marketPlaceContract.connect(addr4).purchaseNFT(listingId,amount,{value:price})).to.emit(marketPlaceContract,"NFTPurchased").withArgs(tokenId,amount,price,addr4.address);
            expect(await MusicalToken.balanceOf(addr1.address,tokenId)).to.equal(0);
            expect(await MusicalToken.balanceOf(addr4.address,tokenId)).to.equal(1);
        })

        it("Should distribute the royalties according to the recipients set prior", async function(){
            const listingId = 1;
            const price = ethers.parseEther("1");
            const amount = 1;
            const balanceBeforeOfAddress1 = await ethers.provider.getBalance(addr1)
            const balanceBeforeOfAddress2 = await ethers.provider.getBalance(addr2)
            await marketPlaceContract.connect(addr4).purchaseNFT(listingId,amount,{value:price});
            const balanceAfterOfAddress1 = await ethers.provider.getBalance(addr1)
            const balanceAfterOfAddress2 = await ethers.provider.getBalance(addr2)
            const finalBalanceOfAddr1 = parseFloat(ethers.formatEther
            (balanceAfterOfAddress1 - balanceBeforeOfAddress1));
            console.log(`Address 1 balance after purchase:- ${finalBalanceOfAddr1}`)
            const finalBalanceOfAddr2 = parseFloat(ethers.formatEther(balanceAfterOfAddress2 - balanceBeforeOfAddress2));
            console.log(`Address 2 balance after purchase:- ${finalBalanceOfAddr2}`)
            console.log(`contract balance:- ${ethers.formatEther(await ethers.provider.getBalance(marketPlaceContract.target))}`);
            expect(finalBalanceOfAddr1).to.equal(0.45);
            expect(finalBalanceOfAddr2).to.equal(0.45);
        })
        
        it("should revert if the NFT is not listed",async function(){
            await expect( marketPlaceContract.connect(addr2).purchaseNFT(2,1,{value:ethers.parseEther("1")})).to.be.revertedWithCustomError(marketPlaceContract,"NFTNotListed");
        })
        
        it("Should Revert is the value is incorrect",async function(){
            await expect( marketPlaceContract.connect(addr2).purchaseNFT(1,1,{value:ethers.parseEther("0.5")})).to.be.revertedWithCustomError(marketPlaceContract,"InsufficientPayment");
        })
        it.skip("Should revert if the owner itself tries to buy the NFT",async function(){
            await expect(marketPlaceContract.connect(addr1).purchaseNFT(1,1,{value:ethers.parseEther("1")})).to.be.revertedWithCustomError(marketPlaceContract,"InvalidBuyer");
        })
        it("Should revert if amount is 0",async function(){
            await expect(marketPlaceContract.connect(addr4).purchaseNFT(1,0,{value:ethers.parseEther("1")})).to.be.revertedWithCustomError(marketPlaceContract,"InvalidZeroParams")
        })
        it("Should revert if the the msg.value is less than the listing price",async function(){
            await expect(marketPlaceContract.connect(addr4).purchaseNFT(1,5,{value:ethers.parseEther("1")})).to.revertedWithCustomError(marketPlaceContract,"InvalidAmountForPurchase")
        })
        it("Should distribute the royalty according to the resell fee config when bought and listed for the 2nd time and again listed",async function(){
            await marketPlaceContract.connect(addr4).purchaseNFT(1,1,{value:ethers.parseEther("1")})
            await MusicalToken.connect(addr4).setApprovalForAll(marketPlaceContract.target,1);
            const tx = await marketPlaceContract.connect(addr4).listNFT(addr4.address,1,ethers.parseEther("1"),1);
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed; 
            // const gasPrice = tx.gasPrice; 

            // // Multiply gasUsed by gasPrice using BigInt arithmetic
            // const totalGasCost = gasUsed * gasPrice;

            // // Convert the total gas cost to Ether for readability
            // const totalGasCostInEther = ethers.formatEther(totalGasCost);

            // console.log(`Gas Used: ${gasUsed.toString()}`); // Gas used as string
            // console.log(`Gas Price: ${gasPrice.toString()} wei`); // Gas price as string
            // console.log(`Total Gas Cost: ${totalGasCost.toString()} wei`); // Total cost in wei
            // console.log(`Total Gas Cost: ${totalGasCostInEther} ETH`); // Total cost in ether

            const balanceBeforeOfAddress1 = await ethers.provider.getBalance(addr1)
            const balanceBeforeOfAddress2 = await ethers.provider.getBalance(addr2)
            const balanceBeforeOfAddress4 = await ethers.provider.getBalance(addr4)
            const txPlusBalanceBefore = balanceBeforeOfAddress4 + gasUsed;
            await marketPlaceContract.connect(addr3).purchaseNFT(2,1,{value:ethers.parseEther("1")})
            const balanceAfterOfAddress1 = await ethers.provider.getBalance(addr1)
            const balanceAfterOfAddress2 = await ethers.provider.getBalance(addr2)
            const balanceAfterOfAddress4 = await ethers.provider.getBalance(addr4)
            const finalBalanceOfAddr1 = parseFloat(ethers.formatEther
                (balanceAfterOfAddress1 - balanceBeforeOfAddress1));
                console.log(`Address 1 balance after purchase:- ${finalBalanceOfAddr1}`)
                const finalBalanceOfAddr2 = parseFloat(ethers.formatEther(balanceAfterOfAddress2 - balanceBeforeOfAddress2));
                console.log(`Address 2 balance after purchase:- ${finalBalanceOfAddr2}`)
                console.log(balanceAfterOfAddress4 - txPlusBalanceBefore)
                console.log(`contract balance:- ${ethers.formatEther(await ethers.provider.getBalance(marketPlaceContract.target))}`);
                expect(finalBalanceOfAddr1).to.equal(0.025);
                expect(finalBalanceOfAddr2).to.equal(0.025);
        })
        it("Should revert of the user tries to buy the same copy of the NFT for more than 5 times ",async function(){
            const listingId = 2;
            const amount = 1;
            const price = ethers.parseEther("1")
            await MusicalToken.connect(owner).mintAndList(addr1.address,8,"hello",ethers.parseEther("1"),2,[addr1.address,addr2.address],[5000,5000]);
            await marketPlaceContract.connect(addr4).purchaseNFT(listingId,amount,{value:price})
            await marketPlaceContract.connect(addr4).purchaseNFT(listingId,amount,{value:price})
            await marketPlaceContract.connect(addr4).purchaseNFT(listingId,amount,{value:price})
            await marketPlaceContract.connect(addr4).purchaseNFT(listingId,amount,{value:price})
            await marketPlaceContract.connect(addr4).purchaseNFT(listingId,amount,{value:price})
            await expect(marketPlaceContract.connect(addr4).purchaseNFT(listingId,amount,{value:price})).to.revertedWith("Purchase exceeds max NFT cap")
        })
        it("Should revert of the user tries to buy the same copy of the NFT for more than 5 at once ",async function(){
            const listingId = 2;
            const amount = 6;
            const price = ethers.parseEther("1")
            await MusicalToken.connect(owner).mintAndList(addr1.address,8,"hello",ethers.parseEther("1"),2,[addr1.address,addr2.address],[5000,5000]);
            await expect(marketPlaceContract.connect(addr4).purchaseNFT(listingId,amount,{value:price})).to.revertedWith("Purchase exceeds max NFT cap")
        })
    })

    describe("Special List",async function(){
       it("Should special List an NFT",async function () {
            const tokenId = 1;
            const price = ethers.parseEther("1");
            expect(await marketPlaceContract.connect(addr1).listSpecialNFT(tokenId,price)).to.emit(marketPlaceContract,"NFTListedForTransferTokenManager").withArgs(tokenId,addr1,price)
            const info = await marketPlaceContract.specialListings(tokenId);
            expect(info.tokenId).to.equal(1);
            expect(info.seller).to.equal(addr1);
            expect(info.price).to.equal(price);
       })
       it("Should revert if the price while listing is 0",async function(){
            const tokenId = 1;
            const price = ethers.parseEther("0");
            await expect(marketPlaceContract.connect(addr1).listSpecialNFT(tokenId,price)).to.be.revertedWithCustomError(marketPlaceContract,"InvalidZeroParams")
       })
       it("Should revert if the msg.sender does not have TokenRoyaltyManager role",async function(){
            const tokenId = 1;
            const price = ethers.parseEther("0");
            await expect(marketPlaceContract.connect(addr2).listSpecialNFT(tokenId,price)).to.be.revertedWithCustomError(marketPlaceContract,"NotTokenRoyaltyManager")
        })
        it("should revert if the marketplace is not approved",async function(){
            const tokenId = 2;
            const price  =ethers.parseEther("1");
            await MusicalToken.connect(addr2).mintAndList(addr2.address,4,"this",price,2,[addr1.address,addr2.address],[5000,5000]);
            await marketPlaceContract.connect(addr2).listSpecialNFT(tokenId,price)
            //await MusicalToken.connect(addr4).setApprovalForAll(marketPlaceContract.target,1)
            await marketPlaceContract.connect(addr3).purchaseNFT(2,1,{value: price});
            await marketPlaceContract.connect(addr3).specialBuy(2,[],[],{value: price});
             //await MusicalToken.connect(addr3).setApprovalForAll(marketPlaceContract.target,1)
            await expect(marketPlaceContract.connect(addr3).listSpecialNFT(tokenId,price)).to.be.revertedWithCustomError(marketPlaceContract,"MarketplaceNotApproved");
        })
    })

    describe("Special buy",function(){
        beforeEach(async function(){
            const tokenId = 1;
            const price = ethers.parseEther("1");
            //console.log("1")       
            await marketPlaceContract.connect(addr1).listSpecialNFT(tokenId,price)
            //console.log("1")      
            //await marketPlaceContract.connect(addr4).purchaseNFT(1,1,{value:price})
            //console.log("1")      
            //console.log(await MusicalToken.connect(addr1).balanceOf(addr1.address,tokenId))
        })
        it("Should Special buy and the new owner should be able to manage recipients",async function(){
            const tokenId = 1;
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
            const info1 = await MusicalToken.getRoyaltyInfo(1);
            console.log(info1)
            expect(info1.recipients).to.deep.equal(recipients);
            expect(info1.percentages).to.deep.equal(percentages);
            console.log(await MusicalToken.balanceOf(addr4.address,0));
        })
        it("Should revert if the token is not listed",async function(){
            const _uri= "Hello"
            const tokenId = 2
            const amount = 3
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [8000,1000,1000];
            const price = ethers.parseEther("1")
            await MusicalToken.mintAndList(addr1.address,amount,_uri,price,1,recipients,percentages);
            await expect(marketPlaceContract.connect(addr1).specialBuy(tokenId,recipients,percentages,{value:price})).to.be.revertedWithCustomError(marketPlaceContract,"NFTNotListed");
        })
        it("Should revert if msg.value is not the same or greater than  the listing price",async function(){
            const tokenId = 1
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [8000,1000,1000];
            const price = ethers.parseEther("2")
            await expect(marketPlaceContract.connect(addr4).specialBuy(tokenId,recipients,percentages,{value:price})).to.be.revertedWithCustomError(marketPlaceContract,"InsufficientPayment");;
        })
        it("Should revert if there is a mismatch between the recipients length and percentage length",async function(){
            const tokenId = 1
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [7000,1000,1000,1000];
            const price = ethers.parseEther("1")
            await expect(marketPlaceContract.connect(addr4).specialBuy(tokenId,recipients,percentages,{value:price})).to.be.revertedWithCustomError(marketPlaceContract,"MismatchedArrayPassed");;
        })
    })

    describe("Update Listing",async function () {
        beforeEach(async function(){
            const _uri= "Hello"
            const amount = 3
            const recipients = [addr1.address,addr2.address,addr3.address];
            const price = ethers.parseEther("2");
            const percentages = [8000,1000,1000];
            //console.log(await MusicalToken.nextTokenId);
            await MusicalToken.mintAndList(addr1.address,amount,_uri,ethers.parseEther("1"),1,recipients,percentages);
            await MusicalToken.connect(addr1).setApprovalForAll(marketPlaceContract.target,true);
            const listing = await marketPlaceContract.listings(1);
            //console.log(listing)
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
            const amount = 3
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [8000,1000,1000];
            await MusicalToken.mintAndList(addr1.address,amount,_uri,ethers.parseEther("1"),1, recipients,percentages);
            console.log(addr4.address)
            console.log(await marketPlaceContract.listings(2))
            await marketPlaceContract.connect(addr4).purchaseNFT(2,2,{value:ethers.parseEther("2")});
            const info2 = await MusicalToken.balanceOf(addr4.address,2);
            console.log(info2)
            await marketPlaceContract.connect(addr1).listSpecialNFT(2,price);
            await marketPlaceContract.connect(addr4).specialBuy(2,[],[],{value:price});
            await MusicalToken.connect(addr4).setApprovalForAll(marketPlaceContract.target,1)
            const info3 = await MusicalToken.balanceOf(addr4.address,2);
            console.log(info3)
            await marketPlaceContract.connect(addr4).listNFT(addr4.address,2,price,2);
            await expect(marketPlaceContract.connect(addr4).updateListedNFT(listingId,tokenAmount,price)).to.be.revertedWithCustomError(marketPlaceContract,"NFTNotListed")
        }) 
        it("Should revert if the seller does not have the authority to update the nft",async function(){
            const listingId = 1
            const tokenAmount = 0
            const price = ethers.parseEther("1")
            const _uri= "Hello"
            const amount = 1
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [8000,1000,1000];
            await marketPlaceContract.connect(addr2).purchaseNFT(1,1,{value:price});
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
            const tokenId = 1;
            const amount = 1;
            const price = ethers.parseEther("1");
            //console.log(await marketPlaceContract.listings(1));
            await marketPlaceContract.connect(addr1).listSpecialNFT(1,price);
            //console.log(await marketPlaceContract.listings(1));
            //console.log(await marketPlaceContract.listings(1));
            await marketPlaceContract.connect(addr4).purchaseNFT(1,4,{value:ethers.parseEther("4")});
            //console.log("special listing ",await marketPlaceContract.specialListings(1))
            //console.log(await marketPlaceContract.listings(1));
            await marketPlaceContract.connect(addr4).specialBuy(1,[],[],{value:price});
            //console.log("special listing ",await marketPlaceContract.specialListings(1))
            //console.log(await marketPlaceContract.listings(1));
            await MusicalToken.connect(addr4).setApprovalForAll(marketPlaceContract.target,1);
            //console.log(await marketPlaceContract.listingId())
            //console.log(await MusicalToken.connect(addr1).balanceOf(addr4.address,1))
            await marketPlaceContract.connect(addr4).listNFT(addr4.address,1,price,1);
            const listing1 = await marketPlaceContract.listings(tokenId);
            console.log(listing1)
        })
        it("Should cancel listing",async function(){
            const listingId = 2;
            const tokenId = 1;
            const listing1 = await marketPlaceContract.listings(tokenId);
            //console.log(listing1)
            expect(await marketPlaceContract.connect(addr4).cancelListing(listingId)).to.emit(marketPlaceContract,"NFTListingCanceled").withArgs(listingId,addr1.sender,0,1);
            const listing = await marketPlaceContract.listings(tokenId);
            console.log(listing)
            expect(listing.seller).to.be.equal(ethers.ZeroAddress);
            expect(listing.price).to.be.equal(0);
        })
        it("Should revert if the NFT is not listed",async function(){
            const tokenId = 1;
            const listing = await marketPlaceContract.listings(tokenId);
            console.log(listing)
            await expect(marketPlaceContract.connect(addr4).cancelListing(tokenId)).to.be.be.revertedWithCustomError(marketPlaceContract,"NFTNotListed")
        })
    })

    describe.skip("Cancle Special Listing",function(){
        beforeEach(async function () {
            const tokenId = 1;
            const price = ethers.parseEther("1");
            //await marketPlaceContract.connect(addr1).listNFT(tokenId,price,1);
            await marketPlaceContract.connect(addr1).listSpecialNFT(tokenId,price)
            //console.log(await marketPlaceContract.specialListings(0))
        })
        it("Should cancel special listing",async function(){
            const tokenId = 1;
            expect(await marketPlaceContract.connect(addr1).cancelSpecialNFTListing(tokenId)).to.emit(marketPlaceContract,"SpecialNFTListingCanceled").withArgs(tokenId,addr1.address);
            const info = await marketPlaceContract.specialListings(tokenId);
            //console.log(info);
            expect(info.seller).to.equal(ethers.ZeroAddress);
        })
        it("Should revert if the token is not listed",async function(){
            const tokenId = 2;
            const tokenAmount = 1
            const _uri= "Hello"
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [8000,1000,1000];
            await MusicalToken.mint(addr1.address,tokenAmount,_uri,recipients,percentages);
            await expect( marketPlaceContract.connect(addr1).cancelSpecialNFTListing(tokenId)).to.revertedWithCustomError(marketPlaceContract,"NFTNotListed")
        })
        it("Should revert if the token is not listed",async function(){
            const tokenId = 1;
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
            const price = ethers.parseEther("4")
            console.log((price));
            await marketPlaceContract.connect(addr1).listSpecialNFT(1,ethers.parseEther("1"));
            console.log("Hello")
            await marketPlaceContract.connect(addr4).purchaseNFT(1,4, { value: price })
            console.log("Hello")
            await MusicalToken.connect(addr1).setApprovalForAll(marketPlaceContract.target,true);
            await marketPlaceContract.connect(addr4).specialBuy(1,recipientsNew,percentagesNew,{value:ethers.parseEther("1")});
            const info = await MusicalToken.getRoyaltyInfo(1);
            expect(await info.recipients).to.deep.equal([addr4.address])
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
        it("Should revert if the percentages / BP does not reach 10,000 BP",async function(){
            await expect( marketPlaceContract.connect(owner).updateResellFee(2000,2000,4000)).to.be.revertedWithCustomError(marketPlaceContract,"InvalidPercentage")
        })
        it("Should distribute the royalties as per the updated resell",async function(){
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [8000,1000,1000];
            // await marketPlaceContract.connect(addr1).listNFT(1,ethers.parseEther("1"),1);
            await marketPlaceContract.connect(addr4).purchaseNFT(1,4,{value:ethers.parseEther("4")});
            await marketPlaceContract.connect(addr1).listSpecialNFT(1,ethers.parseEther("1"));
            await marketPlaceContract.connect(addr4).specialBuy(1,recipients,percentages,{value:ethers.parseEther("1")});
            await marketPlaceContract.connect(owner).updateResellFee(4000,2000,4000);
            await MusicalToken.connect(addr4).setApprovalForAll(marketPlaceContract.target,true);
            await marketPlaceContract.connect(addr4).listNFT(addr1.address,1,ethers.parseEther("1"),1);
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

    
    describe("Exchange NFT",function(){
        beforeEach(async function(){
            const price = ethers.parseEther("4")
            await marketPlaceContract.connect(addr1).listSpecialNFT(1,ethers.parseEther("1"));
            //console.log("Hello")
            await marketPlaceContract.connect(addr4).purchaseNFT(1,4, { value: price })
            //console.log("Hello")
            await MusicalToken.connect(addr4).setApprovalForAll(marketPlaceContract.target,true);
            await marketPlaceContract.connect(addr4).specialBuy(1,[],[],{value:ethers.parseEther("1")});
        })
        it("Should Allow the person to Register NFT for exchange ",async function(){
            const amount = 1
            // await MusicalToken.mint(addr3.address,amount,_uri,recipients,percentages);
            // await MusicalToken.connect(addr3).setApprovalForAll(marketPlaceContract.target,1);
            let tokenId = 1;
            let exchangeId = 0;
            expect(await marketPlaceContract.connect(addr4).registerNftExchange(tokenId,amount,exchangeId)).to.emit(marketPlaceContract,"RegisteredNftForExchange").withArgs(exchangeId,addr1.address,tokenId,amount)
            const info = await marketPlaceContract.exchangeItems(1)
            expect(await info.exchangeId).to.equal(1);
            expect(await info.baseTokenId).to.equal(tokenId);
            expect(await info.baseTokenAmount).to.equal(amount);
            expect(await info.baseUserAddress).to.equal(addr4.address)
            //console.log(await marketPlaceContract.exchangeItems(1));
            // expect(await marketPlaceContract.connect(addr2).registerNftExchange(2,amount,1)).to.emit(marketPlaceContract,"RegisteredNftForExchange")
            // expect(await marketPlaceContract.connect(addr3).registerNftExchange(3,amount,1)).to.emit(marketPlaceContract,"RegisteredNftForExchange")
            //console.log(await marketPlaceContract.exchangeItems(1));
        })
        it("Should add the counter address successfully",async function(){
            const _uri= "Hello"
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [8000,1000,1000];
            let amount = 1;
            await MusicalToken.mintAndList(addr2.address,amount,_uri,ethers.parseEther("1"),0,recipients,percentages);
            const price = ethers.parseEther("4")
            await marketPlaceContract.connect(addr2).listSpecialNFT(2,ethers.parseEther("1"));
            await marketPlaceContract.connect(addr4).purchaseNFT(2,1, { value: ethers.parseEther("1")});
            // await MusicalToken.connect(addr4).setApprovalForAll(marketPlaceContract.target,true);
            await marketPlaceContract.connect(addr4).specialBuy(2,[],[],{value:ethers.parseEther("1")});
            await marketPlaceContract.connect(addr4).registerNftExchange(1,1,0)
            expect(await marketPlaceContract.connect(addr4).registerNftExchange(2,amount,1)).to.emit(marketPlaceContract,"RegisteredNftForExchange").withArgs(1,addr2.address,2,amount);
            const info = await marketPlaceContract.exchangeItems(1)
            console.log(info);
            expect(await info.exchangeId).to.equal(1);
            expect(await info.counterTokenId).to.equal(2);
            expect(await info.counterTokenAmount).to.equal(amount);
            expect(await info.counterUserAddress).to.equal(addr4.address)
        })
        it("Should revert if the amount parameter if 0",async function(){
            let tokenId = 1;
            let amount = 0;
            let exchangeId = 0;
            await expect(marketPlaceContract.connect(addr1).registerNftExchange(tokenId,amount,exchangeId)).to.be.revertedWithCustomError(marketPlaceContract,"InvalidZeroParams")
        })
        it("Should revert if non token owner tries to register the exchange",async function () {
            let tokenId = 1;
            let amount = 1;
            let exchangeId = 0;
            await expect(marketPlaceContract.connect(addr2).registerNftExchange(tokenId,amount,exchangeId)).to.be.revertedWithCustomError(marketPlaceContract,"NotTokenOwner")
        })
        it("Should revert if the marketplace is not approved",async function(){
            const _uri= "Hello"
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [8000,1000,1000];
            let tokenId = 2;
            let amount = 1;
            let exchangeId = 1;
            await MusicalToken.mintAndList(addr2.address,amount,_uri,ethers.parseEther("1"),0,recipients,percentages);
            const price = ethers.parseEther("4")
            await marketPlaceContract.connect(addr2).listSpecialNFT(2,ethers.parseEther("1"));
            await marketPlaceContract.connect(addr3).purchaseNFT(2,1, { value: ethers.parseEther("1")});
            //await MusicalToken.connect(addr3).setApprovalForAll(marketPlaceContract.target,true);
            await marketPlaceContract.connect(addr3).specialBuy(2,[],[],{value:ethers.parseEther("1")});
            await marketPlaceContract.connect(addr4).registerNftExchange(1,1,0)
            await expect(marketPlaceContract.connect(addr3).registerNftExchange(tokenId,amount,exchangeId)).to.be.revertedWithCustomError(marketPlaceContract,"MarketplaceNotApproved")
        })
        it("should revert if both the slots are filled",async function(){
            const amount = 1
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [8000,1000,1000];
            const _uri= "Hello"
            await MusicalToken.mintAndList(addr2.address,amount,_uri,ethers.parseEther("1"),0,recipients,percentages);
            await MusicalToken.mintAndList(addr3.address,amount,_uri,ethers.parseEther("1"),0,recipients,percentages);
            const price = ethers.parseEther("4")
            await marketPlaceContract.connect(addr2).listSpecialNFT(2,ethers.parseEther("1"));
            await marketPlaceContract.connect(addr3).listSpecialNFT(3,ethers.parseEther("1"));
            await marketPlaceContract.connect(addr1).purchaseNFT(2,1, { value: ethers.parseEther("1")});
            await marketPlaceContract.connect(addr3).purchaseNFT(3,1, { value: ethers.parseEther("1")});
            await MusicalToken.connect(addr1).setApprovalForAll(marketPlaceContract.target,true);
            await marketPlaceContract.connect(addr1).specialBuy(2,[],[],{value:ethers.parseEther("1")});
            await marketPlaceContract.connect(addr3).specialBuy(3,[],[],{value:ethers.parseEther("1")});
             await MusicalToken.connect(addr3).setApprovalForAll(marketPlaceContract.target,true);
            await marketPlaceContract.connect(addr4).registerNftExchange(1,1,0);
            await marketPlaceContract.connect(addr1).registerNftExchange(2,1,1);
            await expect(marketPlaceContract.connect(addr3).registerNftExchange(3,amount,1)).to.be.revertedWithCustomError(marketPlaceContract,"InvalidNftExchange")  
        })
    })

    describe("Approval of NFT Exchange",function(){
        beforeEach(async function(){
            const amount = 1
            const _uri= "Hello"
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [8000,1000,1000];
            await MusicalToken.mintAndList(addr2.address,4,_uri,ethers.parseEther("1"),0,recipients,percentages);
             const price = ethers.parseEther("4")
            await marketPlaceContract.connect(addr1).listSpecialNFT(1,ethers.parseEther("1"));
            await marketPlaceContract.connect(addr4).purchaseNFT(1,4, { value: price })
            await MusicalToken.connect(addr4).setApprovalForAll(marketPlaceContract.target,true);
            await marketPlaceContract.connect(addr4).specialBuy(1,[],[],{value:ethers.parseEther("1")});
            await marketPlaceContract.connect(addr2).listSpecialNFT(2,ethers.parseEther("1"));
            await marketPlaceContract.connect(addr3).purchaseNFT(2,4, { value: price })
            await MusicalToken.connect(addr4).setApprovalForAll(marketPlaceContract.target,true);
            await marketPlaceContract.connect(addr3).specialBuy(2,[],[],{value:ethers.parseEther("1")});
            await MusicalToken.connect(addr3).setApprovalForAll(marketPlaceContract.target,1); 
            await marketPlaceContract.connect(addr4).registerNftExchange(1,amount,0);
            await marketPlaceContract.connect(addr3).registerNftExchange(2,amount,1);
        })
        it("Should successfull exchange the NFTS after both the parties have approved",async function(){
            let exchangeID = 1
            //console.log(await MusicalToken.balanceOf(addr1.address,2))
            expect(await marketPlaceContract.connect(addr4).approveNftForExchange(exchangeID)).to.emit(marketPlaceContract,"NftForExchangeApproved").withArgs(exchangeID,addr1.address);
            expect(await marketPlaceContract.connect(addr3).approveNftForExchange(exchangeID)).to.emit(marketPlaceContract,"NftForExchangeApproved").withArgs(exchangeID,addr2.address);
            let info = await  marketPlaceContract.exchangeItems(1);
            expect(info.baseTokenId).to.equal(0)
            expect(info.baseTokenAmount).to.equal(0)
            expect(info.counterTokenId).to.equal(0)
            expect(info.counterTokenAmount).to.equal(0)
            expect(info.baseUserAddress).to.equal(ethers.ZeroAddress)
            expect(info.counterUserAddress).to.equal(ethers.ZeroAddress)
            expect(await MusicalToken.balanceOf(addr4.address,2)).to.equal(1);
            expect(await MusicalToken.balanceOf(addr3.address,1)).to.equal(1);
            //console.log(await MusicalToken.balanceOf(addr1.address,2))
        })
        it("Should revert if the exchangID is 0",async function(){
            await expect(marketPlaceContract.connect(addr1).approveNftForExchange(0)).to.be.revertedWithCustomError(marketPlaceContract,"InvalidNftExchange")
        })
        it("Should revert if there is no counter token listed",async function(){
            const amount = 1
            const _uri= "Hello"
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [8000,1000,1000];
            await MusicalToken.mintAndList(addr3.address,4,_uri,ethers.parseEther("1"),0,recipients,percentages);
             const price = ethers.parseEther("4")
            await marketPlaceContract.connect(addr3).listSpecialNFT(3,ethers.parseEther("1"));
            await marketPlaceContract.connect(addr4).purchaseNFT(3,4, { value: price })
            await MusicalToken.connect(addr4).setApprovalForAll(marketPlaceContract.target,true);
            await marketPlaceContract.connect(addr4).specialBuy(3,[],[],{value:ethers.parseEther("1")}); 
            await marketPlaceContract.connect(addr4).registerNftExchange(3,amount,0);
            await expect(marketPlaceContract.connect(addr4).approveNftForExchange(2)).to.be.revertedWithCustomError(marketPlaceContract,"InvalidCounterToken")
        })
        it("should revert the approval of the counter party if base address participat cancels the listing",async function(){
            await marketPlaceContract.connect(addr4).approveNftForExchange(1);
            await marketPlaceContract.connect(addr4).cancelNftExchange(1);
            await expect(marketPlaceContract.connect(addr3).approveNftForExchange(1)).to.be.revertedWithCustomError(marketPlaceContract,"InvalidBaseToken")  
        })
        it("Should revert if anyone other than the counter / base user tries to approve the deal",async function(){
            let exchangeID = 1
            //console.log(await MusicalToken.balanceOf(addr1.address,2))
            await expect( marketPlaceContract.connect(addr1).approveNftForExchange(exchangeID)).to.be.revertedWithCustomError(marketPlaceContract,"NotValidNftExchangeParticipant");
        })
    })
    
    describe("should cancel the registered NFT excahnge",async function(){
        beforeEach(async function(){
            const amount = 1
            const _uri= "Hello"
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [8000,1000,1000];
            await MusicalToken.mintAndList(addr2.address,4,_uri,ethers.parseEther("1"),0,recipients,percentages);
             const price = ethers.parseEther("4")
            await marketPlaceContract.connect(addr1).listSpecialNFT(1,ethers.parseEther("1"));
            await marketPlaceContract.connect(addr4).purchaseNFT(1,4, { value: price })
            await MusicalToken.connect(addr4).setApprovalForAll(marketPlaceContract.target,true);
            await marketPlaceContract.connect(addr4).specialBuy(1,[],[],{value:ethers.parseEther("1")});
            await marketPlaceContract.connect(addr2).listSpecialNFT(2,ethers.parseEther("1"));
            await marketPlaceContract.connect(addr3).purchaseNFT(2,4, { value: price })
            await MusicalToken.connect(addr4).setApprovalForAll(marketPlaceContract.target,true);
            await marketPlaceContract.connect(addr3).specialBuy(2,[],[],{value:ethers.parseEther("1")});
            await MusicalToken.connect(addr3).setApprovalForAll(marketPlaceContract.target,1); 
            await marketPlaceContract.connect(addr4).registerNftExchange(1,amount,0);
            await marketPlaceContract.connect(addr3).registerNftExchange(2,amount,1);
        })
        it("Should cancel the NFT Exchange and return the NFT to the owner back",async function(){
            //console.log(await MusicalToken.balanceOf(marketPlaceContract.target,1))
            expect(await marketPlaceContract.connect(addr4).cancelNftExchange(1)).to.emit(marketPlaceContract,"NftForExchangeCanceled").withArgs(1);
            const info = await marketPlaceContract.exchangeItems(1);
            expect(info.baseTokenId).to.equal(0);
            expect(info.baseTokenAmount).to.equal(0);
            expect(info.baseUserAddress).to.equal(ethers.ZeroAddress);
            //console.log(await MusicalToken.balanceOf(marketPlaceContract.target,1))
        })
        it("Should revert if the exchange ID is invalid",async function(){
            await expect(marketPlaceContract.connect(addr1).cancelNftExchange(2)).to.be.revertedWithCustomError(marketPlaceContract,"InvalidNftExchange")
        })
        it("Should set the exchange struct to default value on both the parties cancellation", async function(){
            expect(await marketPlaceContract.connect(addr4).cancelNftExchange(1)).to.emit(marketPlaceContract,"NftForExchangeCanceled").withArgs(1);
            expect(await marketPlaceContract.connect(addr3).cancelNftExchange(1)).to.emit(marketPlaceContract,"NftForExchangeCanceled").withArgs(1);
            const info1 = await marketPlaceContract.exchangeItems(1);
            //console.log(info1)
            expect (info1).to.deep.equal([ 
                                            0n,
                                            0n,
                                            0n,
                                            0n,
                                            0n,
                                            false,
                                            false,
                                            '0x0000000000000000000000000000000000000000',
                                            '0x0000000000000000000000000000000000000000'])        
        })
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
    describe("Should register air drop to the person",function(){
        beforeEach(async function(){
            const price = ethers.parseEther("4")
            await marketPlaceContract.connect(addr1).listSpecialNFT(1,ethers.parseEther("1"));
            await marketPlaceContract.connect(addr4).purchaseNFT(1,4, { value: price })
            await MusicalToken.connect(addr4).setApprovalForAll(marketPlaceContract.target,true);
            await marketPlaceContract.connect(addr4).specialBuy(1,[],[],{value:ethers.parseEther("1")});
        })
        it("should register  successfully",async function(){
            const owner = addr4.address;
            const tokenId = 1;
            const amount = 2;
            expect(await marketPlaceContract.connect(addr4).registerAirdrop(owner,tokenId,amount)).to.emit(marketPlaceContract,"AirdropRegistered").withArgs(owner,tokenId,amount,1);
            //console.log(await marketPlaceContract.airdropId());
            //console.log(await marketPlaceContract.airdrops(1));
            let info = await marketPlaceContract.airdrops(2);
            expect(info.owner).to.be.equal(addr4.address);
            expect(info.remainingTokenAmount).to.be.equal(amount);
            expect(info.totalTokenAmount).to.be.equal(amount);
        })
        it("Should revert if the register is not the token owner",async function(){
            const owner = addr3.address;
            const tokenId = 1;
            const amount = 2;
            await expect( marketPlaceContract.connect(addr3).registerAirdrop(owner,tokenId,amount)).to.revertedWithCustomError(marketPlaceContract,"NotTokenOwner")
        })
        it("Should revert if the marketplace is not approved",async function(){
            const _uri= "Hello"
            const recipients = [addr1.address,addr2.address,addr3.address];
            const percentages = [8000,1000,1000];
            await MusicalToken.mintAndList(addr2.address,4,_uri,ethers.parseEther("1"),0,recipients,percentages);
             const price = ethers.parseEther("4")
            await marketPlaceContract.connect(addr2).listSpecialNFT(2,ethers.parseEther("1"));
            await marketPlaceContract.connect(addr3).purchaseNFT(2,4, { value: price })
            await marketPlaceContract.connect(addr3).specialBuy(2,[],[],{value:ethers.parseEther("1")});
            await expect(marketPlaceContract.connect(addr3).registerAirdrop(addr3.address,2,1)).to.revertedWithCustomError(marketPlaceContract,"MarketplaceNotApproved")
        })
        it("Should revert if the amount parameter is 0",async function () {
            const owner = addr3.address;
            const tokenId = 1;
            const amount = 0;
            await MusicalToken.connect(addr3).setApprovalForAll(marketPlaceContract.target,1);
            await expect( marketPlaceContract.connect(addr3).registerAirdrop(owner,tokenId,amount)).to.revertedWithCustomError(marketPlaceContract,"InvalidZeroParams")
        })
        it("should update the AirdropId and the struct when the mintAndList function is used aswell",async function(){
            await MusicalToken.mintAndList(addr1.address,6,"this",ethers.parseEther("1"),3,[addr2.address,addr3.address],[5000,5000]);
            const info = await marketPlaceContract.airdrops(2);
            expect(info.owner).to.equal(addr1.address);
            expect(info.tokenId).to.be.equal(2);
            expect(info.remainingTokenAmount).to.be.equal(3);
            expect(info.totalTokenAmount).to.be.equal(3);
        })
    })
    describe("Claiming Airdrop",async function(){
        beforeEach(async function(){
            const price = ethers.parseEther("4")
            const owner = addr3.address;
            const tokenId = 1;
            const amount = 2;
            await marketPlaceContract.connect(addr1).listSpecialNFT(1,ethers.parseEther("1"));
            await marketPlaceContract.connect(addr4).purchaseNFT(1,4, { value: price })
            await MusicalToken.connect(addr4).setApprovalForAll(marketPlaceContract.target,true);
            await marketPlaceContract.connect(addr4).specialBuy(1,[],[],{value:ethers.parseEther("1")});
            await  marketPlaceContract.connect(addr4).registerAirdrop(owner,tokenId,amount)
        })
        it("Should Successfully claim the airdrop",async function(){
            const info1 = await marketPlaceContract.airdrops(2);
            //console.log(info1);
            expect(await marketPlaceContract.connect(addr1).claimAirdrops(2)).to.emit(marketPlaceContract,"AirdropClaimed").withArgs(2,1,1)
            const info = await marketPlaceContract.airdrops(2);
            expect(info.remainingTokenAmount).to.equal(1)
            //console.log(info);
        })
        it("SHould revert if no airdrop token is remaining to claim",async function(){
            await marketPlaceContract.connect(addr1).claimAirdrops(2)
            await marketPlaceContract.connect(addr2).claimAirdrops(2)
            await expect( marketPlaceContract.connect(addr3).claimAirdrops(2)).to.revertedWithCustomError(marketPlaceContract,"InvalidAirdrop")
        })
        it("SHould revert if no airdrop token is remaining to claim",async function(){
            await marketPlaceContract.connect(addr1).claimAirdrops(2)
            await expect( marketPlaceContract.connect(addr1).claimAirdrops(2)).to.revertedWithCustomError(marketPlaceContract,"AirDropAlreadyClaimed")
        })
        it("Should allow the user to list the claimed airdrop token",async function(){
            await marketPlaceContract.connect(addr1).claimAirdrops(2);
            await marketPlaceContract.connect(addr1).listNFT(addr1.address,1,ethers.parseEther("1"),1);
            const info = await marketPlaceContract.listings(2);
            expect(info.seller).to.equal(addr1.address)
            console.log(info);
        })
        // it("Should allow the user to list the claimed airdrop token",async function(){
        //     await marketPlaceContract.connect(addr1).claimAirdrops(2);
        //     await marketPlaceContract.connect(addr1).registerAirdrop(addr1.address,1,1);
        //     console.log(await marketPlaceContract.airdrops(2))
        // })
    })

    describe("Updating the maxCap",function(){
        it("Should update the maxCap",async function(){
            expect(await marketPlaceContract.updateMaxNFTCap(3)).to.emit(marketPlaceContract,"MaxNFTCapUpdated").withArgs(3);
            const info = await marketPlaceContract.maxNFTCap();
            expect(info).to.equal(3);
        })
        it("Should Allow the user to purchase same nft copies according to the new max cap set",async function(){
            await marketPlaceContract.connect(owner).updateMaxNFTCap(3);
            await marketPlaceContract.connect(addr1).purchaseNFT(1,3,{value:ethers.parseEther("3")});
            const info = await MusicalToken.balanceOf(addr1.address,1);
            expect(info).to.equal(3);
        })
        it("Should revert  to purchase same nft copies according to the new max cap set",async function(){
            await marketPlaceContract.connect(owner).updateMaxNFTCap(3);
            await expect(marketPlaceContract.connect(addr1).purchaseNFT(1,4,{value:ethers.parseEther("3")})).to.revertedWith("Purchase exceeds max NFT cap");
        })
         it("Should update the maxCap",async function(){
            await expect( marketPlaceContract.updateMaxNFTCap(0)).to.revertedWith("Cap must be greater than zero")
        })
    })
})