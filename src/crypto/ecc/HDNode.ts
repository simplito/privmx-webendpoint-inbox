import {Network, networksMap, networks} from "./networks";
import BN = require("bn.js");
import elliptic = require("elliptic");
import { Base58Check } from "../Base58Check";
import {secp256k1} from "./secp256k1";
import {PublicKey} from "./PublicKey";
import {PrivateKey} from "./PrivateKey";
import { fillWithZeroesTo32 } from "./Utils";
import { CryptoService } from "../Crypto";

export interface EccExtDeriveOptions {
    index: number;
    hardened?: boolean;
    serializePrivWithoutLeadingZeroes?: boolean;
}

export type EccExtDerivePath = EccExtDerivePathPart[];

export interface EccExtDerivePathPart {
    index: number;
    hardened: boolean;
}

export interface EccExtDerivePathOptions {
    path: string|EccExtDerivePath;
    serializePrivWithoutLeadingZeroes?: boolean;
}

export class HDNode {
    
    static MASTER_SECRET = Buffer.from("Bitcoin seed");
    static HIGHEST_BIT = 0x80000000;
    static LENGTH = 78;
    
    chainCode: Buffer;
    depth: number;
    index: number;
    parentFingerprint: number;
    network: Network;
    key: elliptic.ec.KeyPair;
    privKey: BN;
    pubKey: elliptic.curve.base.BasePoint;
    
    constructor(K: BN|PrivateKey|PublicKey, chainCode: Buffer, network?: Network) {
        network = network || networks.bitcoin;
        if (chainCode.length !== 32) {
            throw new Error ("Expected chainCode length of 32, got " + chainCode.length);
        }
        if (!network.bip32) {
            throw new Error ("Unknown BIP32 constants for network");
        }
        this.chainCode = chainCode;
        this.depth = 0;
        this.index = 0;
        this.parentFingerprint = 0x00000000;
        this.network = network;
        if (K instanceof BN) {
            this.key = secp256k1.keyFromPrivateBN(K);
            this.privKey = this.key.getPrivate();
            this.pubKey = this.key.getPublic();
        }
        else if (K instanceof PrivateKey) {
            this.key = K.key;
            this.privKey = this.key.getPrivate();
            this.pubKey = this.key.getPublic();
        }
        else if (K instanceof PublicKey) {
            this.key = K.key;
            this.pubKey = this.key.getPublic();
        }
        else {
            throw new Error("not_implemented");
        }
    }

    static findBIP32NetworkByVersion(version: number): Network {
        for (const name in networksMap) {
            const network = networksMap[name];
            if (version === network.bip32.private || version === network.bip32.public) {
                return network;
            }
        }
        throw new Error("Could not find network for " + version.toString(16));
    }
    
    static async fromSeedBuffer(seed: Buffer): Promise<HDNode> {
        if (seed.length < 16) {
            throw new Error("Seed should be at least 128 bits");
        }
        if (seed.length > 64) {
            throw new Error("Seed should be at most 512 bits");
        }
        const I = await CryptoService.hmacSha512(HDNode.MASTER_SECRET, seed);
        return HDNode.fromRawBuffer(I);
    }
    
    static fromRawBuffer(buffer: Buffer, network?: Network): HDNode {
        if (buffer.length !== 64) {
            throw new Error("Buffer has to be 512 bits");
        }
        const key = buffer.slice(0, 32);
        const chainCode = buffer.slice(32);
        const bn = PrivateKey.getSafeBn(key);
        return new HDNode(bn, chainCode, network);
    }
    
    static async fromBase58(string: string, network?: Network): Promise<HDNode> {
        return HDNode.fromBuffer(await Base58Check.decode(string), network);
    }
    
    static fromBuffer(buffer: Buffer, network?: Network): HDNode {
        if (buffer.length !== HDNode.LENGTH) {
            throw new Error("Invalid buffer length");
        }
        const version = buffer.readUInt32BE(0);
        if (network) {
            if (version !== network.bip32.private && version !== network.bip32.public) {
                throw new Error("Network doesn't match");
            }
        }
        else {
            network = HDNode.findBIP32NetworkByVersion(version);
        }
        const depth = buffer.readUInt8(4);
        const parentFingerprint = buffer.readUInt32BE(5);
        if (depth === 0) {
            if (parentFingerprint !== 0x00000000) {
                throw new Error("Invalid parent fingerprint");
            }
        }
        const index = buffer.readUInt32BE(9);
        if (depth === 0 && index !== 0) {
            throw new Error("Invalid index");
        }
        const chainCode = buffer.slice(13, 45);
        let hd: HDNode;
        if (version === network.bip32.private) {
            if (buffer.readUInt8(45) !== 0x00) {
                throw new Error("Invalid private key");
            }
            const data = buffer.slice(46, 78);
            const d = new BN(data.toString("hex"), 16);
            if (d.isZero() || d.eq(secp256k1.ec.curve.n)) {
                throw new Error("Invalid private key");
            }
            hd = new HDNode(d, chainCode, network);
        }
        else {
            const data = buffer.slice(45, 78);
            const key = secp256k1.keyFromPoint(data);
            const pk = new PublicKey(key);
            hd = new HDNode(pk, chainCode, network);
        }
        hd.depth = depth;
        hd.index = index;
        hd.parentFingerprint = parentFingerprint;
        return hd;
    }
    
    neutered(): HDNode {
        const neutered = new HDNode(new PublicKey(this.key), this.chainCode, this.network);
        neutered.depth = this.depth;
        neutered.index = this.index;
        neutered.parentFingerprint = this.parentFingerprint;
        return neutered;
    }
    
    async toBase58(isPrivate?: boolean): Promise<string> {
        return Base58Check.encode(this.toBuffer(isPrivate));
    }
    
    toBuffer(isPrivate?: boolean): Buffer {
        if (isPrivate === undefined) {
            isPrivate = !!this.privKey;
        }
        else {
            console.warn("isPrivate flag is deprecated, please use the .neutered() method instead");
        }
        const version = isPrivate ? this.network.bip32.private : this.network.bip32.public;
        const buffer = Buffer.alloc(HDNode.LENGTH);
        buffer.writeUInt32BE(version, 0);
        buffer.writeUInt8(this.depth, 4);
        buffer.writeUInt32BE(this.parentFingerprint, 5);
        buffer.writeUInt32BE(this.index, 9);
        this.chainCode.copy(buffer, 13);
        if (isPrivate) {
            if (!this.privKey) {
                throw new Error("Missing private key");
            }
            buffer.writeUInt8(0, 45);
            const r = fillWithZeroesTo32(Buffer.from(this.key.getPrivate("hex"), "hex"));
            r.copy(buffer, 46);
        }
        else {
            Buffer.from(this.key.getPublic().encodeCompressed()).copy(buffer, 45);
        }
        return buffer;
    }
    
    getIdentifier(): Promise<Buffer> {
        return CryptoService.hash160(Buffer.from(this.key.getPublic().encodeCompressed()));
    }
    
    getFingerprint(): Promise<Buffer> {
        return this.getIdentifier().then(x => x.slice(0, 4));
    }
    
    derive(options: EccExtDeriveOptions): Promise<HDNode> {
        const index = options.hardened ? options.index + HDNode.HIGHEST_BIT : options.index;
        const serializePrivWithoutLeadingZeroes = !!options.serializePrivWithoutLeadingZeroes;
        let hd: HDNode;
        return Promise.resolve().then(() => {
            const isHardened = index >= HDNode.HIGHEST_BIT;
            const indexBuffer = Buffer.alloc(4);
            indexBuffer.writeUInt32BE(index, 0);
            let data: Buffer;
            if (isHardened) {
                if (!this.privKey) {
                    throw new Error("Could not derive hardened child key");
                }
                const privBuf = Buffer.from(this.key.getPrivate("hex"), "hex");
                const serializedPriv = serializePrivWithoutLeadingZeroes ? privBuf : fillWithZeroesTo32(privBuf);
                data = Buffer.concat([Buffer.from([0x00]), serializedPriv, indexBuffer]);
            }
            else {
                data = Buffer.concat([Buffer.from(this.key.getPublic().encodeCompressed()), indexBuffer]);
            }
            return CryptoService.hmacSha512(this.chainCode, data);
        })
        .then(I => {
            const IL = I.slice(0, 32);
            const IR = I.slice(32);
            const pIL = new BN(IL.toString("hex"), 16);
            if (pIL.cmp(secp256k1.ec.curve.n) >= 0) {
                return this.derive({index: index + 1, serializePrivWithoutLeadingZeroes});
            }
            if (this.privKey) {
                const ki = pIL.add(this.privKey).mod(secp256k1.ec.curve.n);
                if (ki.isZero()) {
                    return this.derive({index: index + 1, serializePrivWithoutLeadingZeroes});
                }
                hd = new HDNode(ki, IR, this.network);
            }
            else {
                throw new Error("derive from public key not implemented");
                /*const Ki = ec.curve.G.mul(pIL).add(this.pubKey);
                if (Ki.inf) {
                    return this.derive(index + 1);
                }
                hd = new HDNode(Ki, IR, this.network);*/
            }
            hd.depth = this.depth + 1;
            hd.index = index;
            return this.getFingerprint().then(fingerprint => {
                hd.parentFingerprint = fingerprint.readUInt32BE(0);
                return hd;
            });
        });
    }
    
    deriveWithPath(options: EccExtDerivePathOptions) {
        return Promise.resolve().then(() => {
            const parts = typeof(options.path) == "string" ? HDNode.parsePath(options.path) : options.path;
            let i = 0;
            const loopStep = (current: HDNode): Promise<HDNode> => {
                if (i >= parts.length) {
                    return Promise.resolve(current);
                }
                const part = parts[i++];
                return current.derive({
                    index: part.index,
                    hardened: part.hardened,
                    serializePrivWithoutLeadingZeroes: options.serializePrivWithoutLeadingZeroes
                }).then(key => {
                    return loopStep(key);
                });
            };
            return loopStep(this);
        });
    }
    
    static parsePath(path: string): EccExtDerivePath {
        const parts = path.split("/");
        if (parts[0] != "m") {
            throw new Error("Invalid path " + path);
        }
        return parts.slice(1).map(x => {
            const hardened = x.endsWith("H");
            return {hardened, index: parseInt(hardened ? x.slice(0, -1) : x, 10)};
        });
    }
}
