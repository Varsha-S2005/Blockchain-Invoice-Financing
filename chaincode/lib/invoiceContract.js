'use strict';

const { Contract } = require('fabric-contract-api');

class AssetTransfer extends Contract {
    // Initialize with a sample Vendor
    async InitLedger(ctx) {
        const assets = [
            { ID: 'V1', Name: 'ElectronicsCorp', Location: 'Chennai', DocType: 'vendor' },
        ];
        for (const asset of assets) {
            await ctx.stub.putState(asset.ID, Buffer.from(JSON.stringify(asset)));
        }
    }

    // Register Vendor for your B2B Network
    async RegisterVendor(ctx, vendorID, name, location) {
        const vendor = { ID: vendorID, Name: name, Location: location, DocType: 'vendor' };
        await ctx.stub.putState(vendorID, Buffer.from(JSON.stringify(vendor)));
    }

    // Create Invoice with Hash for Fraud Prevention
    async CreateInvoice(ctx, id, vendorID, amount, invoiceHash) {
        const invoice = {
            ID: id,
            VendorID: vendorID,
            Amount: parseFloat(amount),
            InvoiceHash: invoiceHash,
            Status: 'PENDING',
            DocType: 'invoice',
        };
        await ctx.stub.putState(id, Buffer.from(JSON.stringify(invoice)));
    }

    // Read any record by ID
    async ReadAsset(ctx, id) {
        const assetJSON = await ctx.stub.getState(id);
        if (!assetJSON || assetJSON.length === 0) {
            throw new Error(`The asset ${id} does not exist`);
        }
        return assetJSON.toString();
    }

    // Get Everything on the Ledger
    async GetAllAssets(ctx) {
        const allResults = [];
        const iterator = await ctx.stub.getStateByRange('', '');
        let result = await iterator.next();
        while (!result.done) {
            allResults.push(JSON.parse(result.value.value.toString('utf8')));
            result = await iterator.next();
        }
        return JSON.stringify(allResults);
    }
}
module.exports = AssetTransfer;
