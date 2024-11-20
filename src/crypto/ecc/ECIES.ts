import {PublicKey} from "./PublicKey";
import {PrivateKey} from "./PrivateKey";
import { CryptoService } from "../Crypto";

export interface Options {
    shortTag?: boolean;
    noKey?: boolean;
}

// PrivMX specific ECIES scheme, use:
// - AES-256-CBC-PKCS7
// - IV generated from private key and message
// - KDF = SHA512 from serialized eccDerive key (32 bytes length with leading zeroes)
// - Encryption Key is first 32 bytes of KDF, Mac Key is next 32 bytes
export class ECIES {
    
    privateKey: PrivateKey;
    publicKey: PublicKey;
    opts: Options;
    pubKeyBuf: Buffer;
    sharedSecret: Promise<Buffer>;
    encryptionKey: Promise<Buffer>;
    signatureKey: Promise<Buffer>;
    
    constructor(privateKey: PrivateKey, publicKey: PublicKey, opts: Options) {
        this.privateKey = privateKey;
        this.publicKey = publicKey;
        this.opts = opts || {};
    }
    
    private getPubKeyBuf(): Buffer {
        if (this.pubKeyBuf == null) {
            this.pubKeyBuf = this.privateKey.getPublicKey().toDER();
        }
        return this.pubKeyBuf;
    }
    
    private getSharedSecret(): Promise<Buffer> {
        if (this.sharedSecret == null) {
            const derived = this.privateKey.derive(this.publicKey);
            this.sharedSecret = CryptoService.sha512(derived.serialize());
        }
        return this.sharedSecret;
    }
    
    private getEncryptionKey(): Promise<Buffer> {
        if (this.encryptionKey == null) {
            this.encryptionKey = this.getSharedSecret().then(x => x.slice(0, 32));
        }
        return this.encryptionKey;
    }
    
    private getSignatureKey(): Promise<Buffer> {
        if (this.signatureKey == null) {
            this.signatureKey = this.getSharedSecret().then(x => x.slice(32, 64));
        }
        return this.signatureKey;
    }
    
    encrypt(message: Buffer, iv?: Buffer): Promise<Buffer> {
        let ivBuf: Buffer, c: Buffer;
        return Promise.resolve().then(() => {
            if (iv === undefined) {
                return Promise.resolve().then(() => {
                    return CryptoService.hmacSha256(this.privateKey.getPrivateEncKey(), message);
                }).then(x => x.slice(0, 16));
            }
            return iv;
        })
        .then(iv => {
            ivBuf = iv;
            return this.getEncryptionKey();
        })
        .then(ke => {
            return CryptoService.aes256CbcPkcs7Encrypt(message, ke, ivBuf);
        })
        .then(enc => {
            c = Buffer.concat([ivBuf, enc]);
            return this.getSignatureKey();
        })
        .then(km => {
            return CryptoService.hmacSha256(km, c);
        })
        .then(d => {
            if (this.opts.shortTag) {
                d = d.slice(0, 4);
            }
            return this.opts.noKey ? Buffer.concat([c, d]) : Buffer.concat([this.getPubKeyBuf(), c, d]);
        });
    }
    
    decrypt(cipher: Buffer): Promise<Buffer> {
        let c: Buffer, d: Buffer;
        return Promise.resolve().then(() => {
            let offset = 0;
            let tagLength = 32;
            if (this.opts.shortTag) {
                tagLength = 4;
            }
            if (!this.opts.noKey) {
                offset = 33;
                this.publicKey = PublicKey.fromDER(cipher.slice(0, 33));
            }
            c = cipher.slice(offset, cipher.length - tagLength);
            d = cipher.slice(cipher.length - tagLength, cipher.length);
            return this.getSignatureKey();
        })
        .then(km => {
            return CryptoService.hmacSha256(km, c);
        })
        .then(d2 => {
            if (this.opts.shortTag) {
                d2 = d2.slice(0, 4);
            }
            let equal = true;
            for (let i = 0; i < d.length; i++) {
                equal = equal && (d[i] === d2[i]);
            }
            if (!equal) {
                throw new Error("Invalid checksum");
            }
            return this.getEncryptionKey();
        })
        .then(ke => {
            return CryptoService.aes256CbcPkcs7Decrypt(c.slice(16), ke, c.slice(0, 16));
        });
    }
}
