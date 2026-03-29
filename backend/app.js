const express = require('express');
const grpc = require('@grpc/grpc-js');
const { connect, signers } = require('@hyperledger/fabric-gateway');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const mspId = 'Org1MSP';
const cryptoPath = path.resolve(__dirname, '../../../test-network/organizations/peerOrganizations/org1.example.com');
const keyPath = path.resolve(cryptoPath, 'users/User1@org1.example.com/msp/keystore/priv_sk');
const certPath = path.resolve(cryptoPath, 'users/User1@org1.example.com/msp/signcerts/User1@org1.example.com-cert.pem');
const tlsCertPath = path.resolve(cryptoPath, 'peers/peer0.org1.example.com/tls/ca.crt');

async function getContract() {
    const tlsRootCert = fs.readFileSync(tlsCertPath);
    const client = new grpc.Client('127.0.0.1:7051', grpc.credentials.createSsl(tlsRootCert), {
        'grpc.ssl_target_name_override': 'peer0.org1.example.com'
    });

    // Ensure we read the key as a UTF-8 string
    const privateKeyPem = fs.readFileSync(keyPath, 'utf8');
    const privateKey = crypto.createPrivateKey(privateKeyPem);

    const gateway = connect({
        client,
        identity: { mspId, credentials: fs.readFileSync(certPath) },
        signer: signers.newPrivateKeySigner(privateKey),
        evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
        submitOptions: () => ({ deadline: Date.now() + 5000 }),
    });

    return gateway.getNetwork('mychannel').getContract('invoice');
}

app.post('/init', async (req, res) => {
    try {
        const contract = await getContract();
        await contract.submitTransaction('InitLedger');
        res.json({ message: 'Ledger Initialized Successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/allAssets', async (req, res) => {
    try {
        const contract = await getContract();
        const resultBytes = await contract.evaluateTransaction('GetAllAssets');
        res.json(JSON.parse(Buffer.from(resultBytes).toString()));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(3000, () => console.log('🚀 API running at http://localhost:3000'));
