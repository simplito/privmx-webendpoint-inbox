import elliptic = require("elliptic");
import BN = require("bn.js");
const ec = <EllipticEcEx>elliptic.ec("secp256k1");

export interface EllipticEcEx extends elliptic.ec {
    recoverPubKey(msg: BN.ConvertibleToBN, signature: elliptic.ec.ConvertibleToSignature, j: number): elliptic.curve.base.BasePoint;
}

export const secp256k1 = {
    
    ec: ec,
    
    nSub(bn: BN) {
        return ec.curve.n.sub(bn);
    },
    
    keyFromPrivAndPublicBuffer(priv: Buffer, pub: Buffer) {
        return secp256k1.enrichKey(ec.keyPair({pub: pub, priv: priv}));
    },
    
    keyFromPublicBuffer(pub: Buffer) {
        return secp256k1.enrichKey(ec.keyFromPublic(pub));
    },
    
    keyFromPrivateBN(priv: BN) {
        return secp256k1.enrichKey(ec.keyFromPrivate(priv));
    },
    
    keyFromPrivateBuffer(priv: Buffer) {
        return secp256k1.enrichKey(ec.keyFromPrivate(priv));
    },
    
    keyFromPoint(data: Buffer) {
        const point = ec.curve.decodePoint(data);
        return secp256k1.keyFromPointObj(point);
    },
    
    keyFromPointObj(point: elliptic.curve.base.BasePoint) {
        return secp256k1.enrichKey(ec.keyPair({pub: point}));
    },
    
    recoverPubKey(message: Buffer, signature: Buffer) {
        if (signature.length != 65) {
            throw new Error("Invalid signature buffer");
        }
        const sig = {
            r: signature.slice(1, 33).toString("hex"),
            s: signature.slice(33).toString("hex")
        };
        const recoveryParam = secp256k1.getRecoveryParam(signature[0]);
        const pubPoint = ec.recoverPubKey(message, sig, recoveryParam);
        return secp256k1.keyFromPointObj(pubPoint);
    },
    
    getRecoveryParam(value: number) {
        if (value >= 27 && value <= 30) {
            return value - 27;
        }
        if (value >= 31 && value <= 34) {
            return value - 31;
        }
        if (value >= 35 && value <= 38) {
            return value - 35;
        }
        if (value >= 39 && value <= 42) {
            return value - 39;
        }
        throw new Error("Invalid recovery param value");
    },
    
    enrichKey(key: elliptic.ec.KeyPair) {
        return key;
    }
}
