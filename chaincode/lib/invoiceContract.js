'use strict';

const { Contract } = require('fabric-contract-api');

class InvoiceContract extends Contract {

    async InitLedger(ctx) {
        console.info('============= START : Initialize Ledger ===========');
        // Initializing with a dummy system record to ensure world state is ready
        await ctx.stub.putState('SYS_INIT', Buffer.from(JSON.stringify({ status: 'ACTIVE', ts: new Date().toISOString() })));
    }

    // --- VENDOR MANAGEMENT ---

    async RegisterVendor(ctx, vendorId, name, maxLimit, authorizedWallet) {
        const exists = await this.AssetExists(ctx, 'VENDOR_' + vendorId);
        if (exists) throw new Error(`Vendor ${vendorId} already exists`);

        const vendor = {
            vendorId,
            name,
            status: 'ACTIVE',
            maxLimit: parseFloat(maxLimit),
            authorizedWallet,
            certifiedIdentity: true,
            misreportingCount: 0, // Added for fraud tracking
            registeredAt: new Date().toISOString()
        };
        await ctx.stub.putState('VENDOR_' + vendorId, Buffer.from(JSON.stringify(vendor)));
    }

    // --- PURCHASE ORDER MANAGEMENT ---

    async CreatePurchaseOrder(ctx, poId, vendorId, buyer, amount) {
        const exists = await this.AssetExists(ctx, 'PO_' + poId);
        if (exists) throw new Error(`Purchase Order ${poId} already exists`);

        const po = {
            poId, vendorId, buyer,
            amount: parseFloat(amount),
            status: 'ACTIVE',
            timestamp: new Date().toISOString()
        };
        await ctx.stub.putState('PO_' + poId, Buffer.from(JSON.stringify(po)));
    }

    // --- INVOICE LOGIC (With Multi-Step Validation) ---

    async CreateInvoice(ctx, invoiceId, vendorId, buyer, amount, purchaseOrderId, deliveryProofHash) {
        // 1. Check if invoice exists
        const exists = await this.AssetExists(ctx, invoiceId);
        if (exists) throw new Error(`The invoice ${invoiceId} already exists`);

        // 2. Validate Vendor
        const vendorBytes = await ctx.stub.getState('VENDOR_' + vendorId);
        if (!vendorBytes || vendorBytes.length === 0) throw new Error(`Vendor ${vendorId} is not registered`);
        const vendor = JSON.parse(vendorBytes.toString());

        // 3. Validate Purchase Order
        const poBytes = await ctx.stub.getState('PO_' + purchaseOrderId);
        if (!poBytes || poBytes.length === 0) throw new Error(`Purchase Order ${purchaseOrderId} does not exist`);
        const po = JSON.parse(poBytes.toString());

        // --- MISREPORTING / FRAUD CHECKS ---
        const invAmount = parseFloat(amount);
        
        // Fraud Check A: Amount Mismatch with PO
        if (invAmount > po.amount) {
            await this._reportMisreporting(ctx, vendorId, `Invoice amount ${amount} exceeds PO amount ${po.amount}`);
            throw new Error('FRAUD ALERT: Invoice amount exceeds PO limit. Misreporting logged.');
        }

        // Fraud Check B: Vendor Limit Check
        if (invAmount > vendor.maxLimit) {
            throw new Error(`Invoice amount exceeds vendor's approved credit limit of ${vendor.maxLimit}`);
        }

        const invoice = {
            invoiceId, vendorId, buyer, amount: invAmount,
            purchaseOrderId, deliveryProofHash,
            status: 'SUBMITTED',
            systemValidated: true,
            buyerApproved: false,
            timestamp: new Date().toISOString()
        };

        await ctx.stub.putState(invoiceId, Buffer.from(JSON.stringify(invoice)));
    }

    // --- APPROVAL & FINANCING ---

    async VerifyInvoice(ctx, invoiceId) {
        const invoice = await this._readInvoice(ctx, invoiceId);
        if (invoice.status !== 'SUBMITTED') throw new Error('Invoice is not in SUBMITTED state');

        invoice.status = 'VALIDATED';
        invoice.buyerApproved = true;
        await ctx.stub.putState(invoiceId, Buffer.from(JSON.stringify(invoice)));
    }

    async ApproveFinancing(ctx, invoiceId) {
        const invoice = await this._readInvoice(ctx, invoiceId);
        if (invoice.status !== 'VALIDATED' || !invoice.buyerApproved) {
            throw new Error('Invoice must be validated and buyer-approved before financing');
        }

        invoice.status = 'FINANCED';
        await ctx.stub.putState(invoiceId, Buffer.from(JSON.stringify(invoice)));
    }

    // --- PAYMENT & DIVERSION PREVENTION ---

    async ProcessPayment(ctx, paymentId, invoiceId, amount, toWallet) {
        const invoice = await this._readInvoice(ctx, invoiceId);
        if (invoice.status !== 'FINANCED') throw new Error('Invoice not approved for financing');

        const vendorBytes = await ctx.stub.getState('VENDOR_' + invoice.vendorId);
        const vendor = JSON.parse(vendorBytes.toString());

        // Rule: Fund Diversion Prevention (Wallet must match registered wallet)
        if (toWallet !== vendor.authorizedWallet) {
            await this._reportMisreporting(ctx, invoice.vendorId, `Attempted diversion to unauthorized wallet: ${toWallet}`);
            throw new Error('SECURITY ALERT: Payment diverted to unauthorized wallet. Transaction blocked.');
        }

        const payment = {
            paymentId, invoiceId, amount, toWallet,
            status: 'COMPLETED',
            timestamp: new Date().toISOString()
        };
        await ctx.stub.putState('PAYMENT_' + paymentId, Buffer.from(JSON.stringify(payment)));
    }

    // --- HELPERS & INTERNAL ---

    async _reportMisreporting(ctx, vendorId, reason) {
        const vendorBytes = await ctx.stub.getState('VENDOR_' + vendorId);
        const vendor = JSON.parse(vendorBytes.toString());
        vendor.misreportingCount += 1;
        vendor.lastViolationReason = reason;
        if (vendor.misreportingCount >= 3) vendor.status = 'BLACKLISTED';
        await ctx.stub.putState('VENDOR_' + vendorId, Buffer.from(JSON.stringify(vendor)));
    }

    async _readInvoice(ctx, id) {
        const bytes = await ctx.stub.getState(id);
        if (!bytes || bytes.length === 0) throw new Error(`${id} does not exist`);
        return JSON.parse(bytes.toString());
    }

    async AssetExists(ctx, id) {
        const bytes = await ctx.stub.getState(id);
        return bytes && bytes.length > 0;
    }

    async GetAllInvoices(ctx) {
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

module.exports = InvoiceContract;
