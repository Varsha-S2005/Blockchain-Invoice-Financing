const express = require('express');
const grpc = require('@grpc/grpc-js');
const { connect, signers } = require('@hyperledger/fabric-gateway');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const mspId = 'Org1MSP';
const cryptoPath = '/home/sv/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com';
const keyPath = path.resolve(cryptoPath, 'users/User1@org1.example.com/msp/keystore/priv_sk');
const certPath = path.resolve(cryptoPath, 'users/User1@org1.example.com/msp/signcerts/User1@org1.example.com-cert.pem');
const tlsCertPath = path.resolve(cryptoPath, 'peers/peer0.org1.example.com/tls/ca.crt');

async function getContract() {
    const tlsRootCert = fs.readFileSync(tlsCertPath);
    const client = new grpc.Client('127.0.0.1:7051', grpc.credentials.createSsl(tlsRootCert), {
        'grpc.ssl_target_name_override': 'peer0.org1.example.com'
    });
    const privateKey = crypto.createPrivateKey(fs.readFileSync(keyPath, 'utf8'));
    const gateway = connect({
        client,
        identity: { mspId, credentials: fs.readFileSync(certPath) },
        signer: signers.newPrivateKeySigner(privateKey),
    });
    return gateway.getNetwork('mychannel').getContract('invoice');
}

// 1. Initialize
app.post('/api/init', async (req, res) => {
    try {
        const contract = await getContract();
        await contract.submitTransaction('InitLedger');
        res.json({ message: "Ledger Initialized" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Create Invoice
app.post('/api/invoice', async (req, res) => {
    try {
        const { id, amount, customer } = req.body;
        const contract = await getContract();
        await contract.submitTransaction('CreateInvoice', id, amount.toString(), customer);
        res.json({ status: "Created", id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. Finance (Status Change)
app.post('/api/finance', async (req, res) => {
    try {
        const { id, financierName } = req.body;
        const contract = await getContract();
        await contract.submitTransaction('FinanceInvoice', id, financierName);
        res.json({ status: "Financed", id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. Transfer (Change Customer)
app.post('/api/transfer', async (req, res) => {
    try {
        const { id, newCustomer } = req.body;
        const contract = await getContract();
        await contract.submitTransaction('TransferInvoice', id, newCustomer);
        res.json({ status: "Transferred", id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 5. Delete
app.delete('/api/invoice/:id', async (req, res) => {
    try {
        const contract = await getContract();
        await contract.submitTransaction('DeleteInvoice', req.params.id);
        res.json({ status: "Deleted", id: req.params.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 6. Read All
app.get('/api/assets', async (req, res) => {
    try {
        const contract = await getContract();
        const resultBytes = await contract.evaluateTransaction('GetAllAssets');
        res.json(JSON.parse(Buffer.from(resultBytes).toString()));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(3000, () => console.log('🚀 API running at http://localhost:3000'));
