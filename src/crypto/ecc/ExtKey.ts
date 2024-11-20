import {EccExtDeriveOptions, EccExtDerivePathOptions, HDNode} from "./HDNode";
import BN = require("bn.js");
import {PublicKey} from "./PublicKey";
import {PrivateKey} from "./PrivateKey";
import { fillWithZeroesTo32 } from "./Utils";
import { CryptoService } from "../Crypto";

export class ExtKey {
    
    key: HDNode;
    
    constructor(key: HDNode) {
        this.key = key;
    }
    
    static async fromBase58(base58: string): Promise<ExtKey> {
        return new ExtKey(await HDNode.fromBase58(base58));
    }
    
    static async fromSeed(seed: Buffer): Promise<ExtKey> {
        const key = await HDNode.fromSeedBuffer(seed);
        return new ExtKey(key);
    }
    
    static generateRandom(): ExtKey {
        return ExtKey.generateFromBuffer(CryptoService.randomBytes(64));
    }
    
    static generateFromBuffer(buffer: Buffer): ExtKey {
        return new ExtKey(HDNode.fromRawBuffer(buffer));
    }
    
    isPrivate(): boolean {
        return !!this.key.privKey;
    }
    
    getPrivatePartAsBase58(): Promise<string> {
        return this.key.toBase58();
    }
    
    getPublicPartAsBase58(): Promise<string> {
        return this.key.neutered().toBase58();
    }
    
    getPublicKey(): PublicKey {
        return new PublicKey(this.key.key);
    }
    
    getPrivateKey(): PrivateKey {
        return new PrivateKey(this.key.key);
    }
    
    getChainCode(): Buffer {
        return this.key.chainCode;
    }
    
    async derive(options: EccExtDeriveOptions): Promise<ExtKey> {
        const key = await this.key.derive(options);
        return new ExtKey(key);
    }
    
    async deriveWithPath(options: EccExtDerivePathOptions): Promise<ExtKey> {
        const key = await this.key.deriveWithPath(options);
        return new ExtKey(key);
    }
    
    static deserialize(buf: Buffer): ExtKey {
        return new ExtKey(new HDNode(new BN(buf.slice(0, 32).toString("hex"), 16), buf.slice(32)));
    }
    
    serialize(): Buffer {
        const r = fillWithZeroesTo32(Buffer.from(this.key.key.getPrivate("hex"), "hex"));
        return Buffer.concat([r, Buffer.from(this.key.chainCode.toString("hex"), "hex")]);
    }
}
