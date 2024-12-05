import elliptic = require("elliptic");
import {secp256k1} from "./secp256k1";
import { Base58Check } from "../Base58Check";
import {networks} from "./networks";
import BN = require("bn.js");
import Signature = require("elliptic/lib/elliptic/ec/signature");
import { CryptoService } from "../Crypto";

export interface NetworkVersion {
    pubKeyHash: number;
}

export class PublicKey {
    
    key: elliptic.ec.KeyPair&{bitcoinAddress?: string};
    
    constructor(key: elliptic.ec.KeyPair) {
        this.key = key;
    }
    
    static fromDER(der: Buffer): PublicKey {
        return PublicKey.deserialize(der);
    }
    
    toDER(): Buffer {
        return Buffer.from(this.key.getPublic().encodeCompressed());
    }
    
    static async fromBase58DER(base58: string): Promise<PublicKey> {
        return new PublicKey(secp256k1.keyFromPublicBuffer(await Base58Check.decode(base58)));
    }
    
    async toBase58DER(): Promise<string> {
        return Base58Check.encode(this.toDER());
    }
    
    static fromHexDER(hexDer: string): PublicKey {
        return new PublicKey(secp256k1.keyFromPublicBuffer(Buffer.from(hexDer, "hex")));
    }
    
    toHexDER(): string {
        return this.key.getPublic().encodeCompressed("hex");
    }
    
    async toBase58Address(network?: NetworkVersion): Promise<string> {
        network = network || networks.bitcoin;
        if (network == networks.bitcoin && this.key.bitcoinAddress) {
            return this.key.bitcoinAddress;
        }
        const hash = await CryptoService.hash160(Buffer.from(this.key.getPublic().encodeCompressed()));
        const version = network.pubKeyHash;
        const payload = Buffer.alloc(21);
        payload.writeUInt8(version, 0);
        hash.copy(payload, 1);
        const address = await Base58Check.encode(payload);
        if (network == networks.bitcoin) {
            this.key.bitcoinAddress = address;
        }
        return address;
    }
    
    verifyCompactSignature(message: Buffer, signature: Buffer): boolean {
        if (signature.length !== 65) {
            throw new Error("Invalid signature length");
        }
        const recoveryParam = secp256k1.getRecoveryParam(signature.readUInt8(0));
        const r = new BN(signature.slice(1, 33).toString("hex"), 16);
        const s = new BN(signature.slice(33).toString("hex"), 16);
        const sig = new Signature({
            r: r,
            s: s,
            recoveryParam: recoveryParam
        });
        return this.key.verify(message, sig);
    }

    async verifyCompactSignatureWithHash(message: Buffer, signature: Buffer): Promise<boolean> {
        const hash = await CryptoService.sha256(message);
        return this.verifyCompactSignature(hash, signature);
    }
    
    equals(other: PublicKey): boolean {
        return this.toDER().equals(other.toDER());
    }
    
    static deserialize(buf: Buffer): PublicKey {
        return new PublicKey(secp256k1.keyFromPublicBuffer(buf));
    }
    
    serialize(): Buffer {
        return Buffer.from(this.key.getPublic().encode());
    }
    
    static recoverPubKey(message: Buffer, signature: Buffer) {
        return new PublicKey(secp256k1.recoverPubKey(message, signature));
    }
}
