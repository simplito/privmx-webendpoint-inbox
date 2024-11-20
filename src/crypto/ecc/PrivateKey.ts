import elliptic = require("elliptic");
import {secp256k1} from "./secp256k1";
import {PublicKey} from "./PublicKey";
import {networks} from "./networks";
import { Base58Check } from "../Base58Check";
import BN = require("bn.js");
import {ECIES} from "./ECIES";
import { fillWithZeroesTo32 } from "./Utils";
import { CryptoService } from "../Crypto";

export class PrivateKey {
    
    key: elliptic.ec.KeyPair;
    
    constructor(key: elliptic.ec.KeyPair) {
        this.key = key;
    }
    
    static getSafeBn(buffer: Buffer): BN {
        if (buffer.length != 32) {
            throw new Error("Expected 32-bytes length buffer");
        }
        let d = new BN(buffer);
        d = d.mod(secp256k1.nSub(new BN(2)));
        if (d.isZero()) {
            d.iaddn(1);
        }
        return d;
    }
    
    static generateRandom(): PrivateKey {
        return PrivateKey.generateFromBuffer(CryptoService.randomBytes(32));
    }
    
    static generateFromBuffer(buffer: Buffer): PrivateKey {
        return new PrivateKey(secp256k1.keyFromPrivateBN(PrivateKey.getSafeBn(buffer)));
    }
    
    static async fromWIF(wif: string): Promise<PrivateKey> {
        let payload = await Base58Check.decode(wif);
        payload = payload.slice(1);
        if (payload.length === 33) {
            if (payload[32] !== 0x01) {
                throw new Error("Invalid compression flag");
            }
            payload = payload.slice(0, -1);
        }
        if (payload.length !== 32) {
            throw new Error("Invalid WIF payload length");
        }
        return new PrivateKey(secp256k1.keyFromPrivateBuffer(payload));
    }
    
    async toWIF(): Promise<string> {
        const network = networks.bitcoin;
        const bufferLen = 34;
        const buffer = Buffer.alloc(bufferLen);
        buffer.writeUInt8(network.wif, 0);
        let b = Buffer.from(this.key.getPrivate("hex"), "hex");
        if (b.length < 32) {
            b = Buffer.concat([Buffer.alloc(32 - b.length).fill(0), b]);
        }
        b.copy(buffer, 1);
        buffer.writeUInt8(0x01, 33);
        return Base58Check.encode(buffer);
    }
    
    signToCompactSignature(message: Buffer): Buffer {
        const s = <elliptic.ec.Signature&{recoveryParam: number}>this.key.sign(message);
        const compact = 27 + s.recoveryParam;
        const buffer = Buffer.alloc(65);
        buffer.writeUInt8(compact, 0);
        Buffer.from(s.r.toArray("be", 32)).copy(buffer, 1);
        Buffer.from(s.s.toArray("be", 32)).copy(buffer, 33);
        return buffer;
    }
    
    getPublicKey(): PublicKey {
        return new PublicKey(this.key);
    }
    
    getPrivateEncKey() {
        return this.serialize();
    }
    
    derive(publicKey: PublicKey) {
        const derived = this.key.derive(publicKey.key.getPublic());
        return new PrivateKey(secp256k1.keyFromPrivateBN(derived));
    }
    
    eciesEncrypt(publicKey: PublicKey, data: Buffer): Promise<Buffer> {
        return new ECIES(this, publicKey, {
            noKey: true,
            shortTag: true
        }).encrypt(data);
    }
    
    eciesDecrypt(publicKey: PublicKey, data: Buffer): Promise<Buffer> {
        return new ECIES(this, publicKey, {
            noKey: true,
            shortTag: true
        }).decrypt(data);
    }
    
    static deserialize(buf: Buffer): PrivateKey {
        return new PrivateKey(secp256k1.keyFromPrivateBuffer(buf));
    }
    
    serialize(): Buffer {
        return fillWithZeroesTo32(Buffer.from(this.key.getPrivate("hex"), "hex"));
    }
}
