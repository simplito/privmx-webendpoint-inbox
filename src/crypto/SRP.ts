import BN = require("bn.js");
import { CryptoService } from "./Crypto";

export interface RegisterResult {
    s: Buffer;
    v: BN;
}

export interface ServerInitResult {
    b: BN;
    B: BN;
}

export interface ServerExchangeResult {
    S: BN;
    u: BN;
    K: BN;
    M2: BN;
}

export interface LoginStep1Result {
    A: BN;
    u: BN;
    S: BN;
    K: BN;
    M1: BN;
    M2: BN;
}

export class SrpUtils {

    static PAD(x: BN, N: BN): Buffer {
        return x.toArrayLike(Buffer, "be", N.byteLength());
    }

    static async H(x: Buffer): Promise<Buffer> {
        return CryptoService.hash("sha256", x);
    }

    static  async HBN(x: Buffer): Promise<BN> {
        const hash = await SrpUtils.H(x);
        return new BN(hash);
    }
}

export class SrpLogicBase {
    
    static get_a(): BN {
        return new BN(CryptoService.randomBytes(64));
    }
    
    static get_b(): BN {
        return new BN(CryptoService.randomBytes(64));
    }
    
    static get_s(): Buffer {
        return CryptoService.randomBytes(16);
    }
    
    static get_k(N: BN, g: BN): Promise<BN> {
        return SrpUtils.HBN(Buffer.concat([SrpUtils.PAD(N, N), SrpUtils.PAD(g, N)]));
    }
    
    static get_v(g: BN, N: BN, x: BN): BN {
        const red = BN.red(N);
        return g.toRed(red).redPow(x).fromRed();
    }
    
    static async get_x(s: Buffer, I: string, P: string): Promise<BN> {
        const hash = await SrpUtils.H(Buffer.from(I + ":" + P, "utf8"));
        return SrpUtils.HBN(Buffer.concat([s, hash]));
    }
    
    static get_A(g: BN, N: BN, a: BN): BN {
        const red = BN.red(N);
        g = g.toRed(red);
        return g.redPow(a).fromRed();
    }
    
    static get_B(g: BN, N: BN, k: BN, b: BN, v: BN): BN {
        const red = BN.red(N);
        k = k.toRed(red);
        v = v.toRed(red);
        g = g.toRed(red);
        return k.redMul(v).redAdd(g.redPow(b)).fromRed();
    }
    
    static get_u(A: BN, B: BN, N: BN): Promise<BN> {
        return SrpUtils.HBN(Buffer.concat([SrpUtils.PAD(A, N), SrpUtils.PAD(B, N)]));
    }
    
    static getClient_S(B: BN, k: BN, v: BN, a: BN, u: BN, x: BN, N: BN): BN {
        const red = BN.red(N);
        B = B.toRed(red);
        k = k.toRed(red);
        v = v.toRed(red);
        return B.redSub(k.redMul(v)).redPow(a.add(u.mul(x))).fromRed();
    }
    
    static getServer_S(A: BN, v: BN, u: BN, b: BN, N: BN): BN {
        const red = BN.red(N);
        A = A.toRed(red);
        v = v.toRed(red);
        return A.redMul(v.redPow(u)).redPow(b).fromRed();
    }
    
    static get_M1(A: BN, B: BN, S: BN, N: BN): Promise<BN> {
        return SrpUtils.HBN(Buffer.concat([SrpUtils.PAD(A, N), SrpUtils.PAD(B, N), SrpUtils.PAD(S, N)]));
    }
    
    static get_M2(A: BN, M1: BN, S: BN, N: BN): Promise<BN> {
        return SrpUtils.HBN(Buffer.concat([SrpUtils.PAD(A, N), SrpUtils.PAD(M1, N), SrpUtils.PAD(S, N)]));
    }
    
    static get_K(S: BN, N: BN): Promise<BN> {
        return SrpUtils.HBN(SrpUtils.PAD(S, N));
    }
    
    static valid_A(A: BN, N: BN): boolean {
        return A.mod(N).eqn(0) === false;
    }
    
    static valid_B(B: BN, N: BN): boolean {
        return B.mod(N).eqn(0) === false;
    }
    
    static async register(N: BN, g: BN, I: string, P: string, s: Buffer): Promise<RegisterResult> {
        const x = await SrpLogicBase.get_x(s, I, P);
        const v = SrpLogicBase.get_v(g, N, x);
        return {
            s: s,
            v: v
        };
    }
    
    static registerEx(N: BN, g: BN, I: string, P: string): Promise<RegisterResult> {
        return SrpLogicBase.register(N, g, I, P, SrpLogicBase.get_s());
    }
    
    static async server_init(N: BN, g: BN, v: BN, b: BN): Promise<ServerInitResult> {
        const k = await SrpLogicBase.get_k(N, g);
        const B = SrpLogicBase.get_B(g, N, k, b, v);
        return {
            b: b,
            B: B
        };
    }
    
    static server_initEx(N: BN, g: BN, v: BN): Promise<ServerInitResult> {
        return SrpLogicBase.server_init(N, g, v, SrpLogicBase.get_b());
    }
    
    static async server_exchange(N: BN, A: BN, M1: BN, v: BN, B: BN, b: BN): Promise<ServerExchangeResult> {
        const u = await SrpLogicBase.get_u(A, B, N);
        const S = SrpLogicBase.getServer_S(A, v, u, b, N);
        const M2 = await SrpLogicBase.get_M2(A, M1, S, N);
        const K = await SrpLogicBase.get_K(S, N);
        return {
            S: S,
            u: u,
            K: K,
            M2: M2
        };
    }
    
    static async login_step1(N: BN, g: BN, s: Buffer, B: BN, I: string, P: string, a: BN): Promise<LoginStep1Result> {
        if (!SrpLogicBase.valid_B(B, N)) {
            throw new Error("InvalidBException");
        }
        const k = await SrpLogicBase.get_k(N, g);
        const A = SrpLogicBase.get_A(g, N, a);
        const x = await SrpLogicBase.get_x(s, I, P);
        const v = SrpLogicBase.get_v(g, N, x);
        const u = await SrpLogicBase.get_u(A, B, N);
        const S = SrpLogicBase.getClient_S(B, k, v, a, u, x, N);
        const M1 = await SrpLogicBase.get_M1(A, B, S, N);
        const K = await SrpLogicBase.get_K(S, N);
        const M2 = await SrpLogicBase.get_M2(A, M1, S, N);
        return {
            A: A,
            u: u,
            S: S,
            K: K,
            M1: M1,
            M2: M2
        };
    }
    
    static login_step1Ex(N: BN, g: BN, s: Buffer, B: BN, I: string, P: string): Promise<LoginStep1Result> {
        return SrpLogicBase.login_step1(N, g, s, B, I, P, SrpLogicBase.get_a());
    }
    
    static login_step2(clientM2: BN, serverM2: BN): void {
        if (!clientM2.eq(serverM2)) {
            throw new Error("DifferentM2Exception - " + clientM2 + ", " + serverM2);
        }
    }
}

export class SrpLogic {
    
    get_k(N: BN, g: BN): Promise<BN> {
        return SrpLogicBase.get_k(N, g);
    }
    
    get_v(g: BN, N: BN, x: BN): BN {
        return SrpLogicBase.get_v(g, N, x);
    }
    
    get_x(s: Buffer, I: string, P: string): Promise<BN> {
        return SrpLogicBase.get_x(s, I, P);
    }
    
    get_A(g: BN, N: BN, a: BN): BN {
        return SrpLogicBase.get_A(g, N, a);
    }
    
    get_B(g: BN, N: BN, k: BN, b: BN, v: BN): BN {
        return SrpLogicBase.get_B(g, N, k, b, v);
    }
    
    get_u(A: BN, B: BN, N: BN): Promise<BN> {
        return SrpLogicBase.get_u(A, B, N);
    }
    
    getClient_S(B: BN, k: BN, v: BN, a: BN, u: BN, x: BN, N: BN): BN {
        return SrpLogicBase.getClient_S(B, k, v, a, u, x, N);
    }
    
    getServer_S(A: BN, v: BN, u: BN, b: BN, N: BN): BN {
        return SrpLogicBase.getServer_S(A, v, u, b, N);
    }
    
    get_M1(A: BN, B: BN, S: BN, N: BN): Promise<BN> {
        return SrpLogicBase.get_M1(A, B, S, N);
    }
    
    get_M2(A: BN, M1: BN, S: BN, N: BN): Promise<BN> {
        return SrpLogicBase.get_M2(A, M1, S, N);
    }
    
    get_K(S: BN, N: BN): Promise<BN> {
        return SrpLogicBase.get_K(S, N);
    }
    
    valid_A(A: BN, N: BN): boolean {
        return SrpLogicBase.valid_A(A, N);
    }
    
    valid_B(B: BN, N: BN): boolean {
        return SrpLogicBase.valid_B(B, N);
    }
    
    register(N: BN, g: BN, I: string, P: string, s: Buffer): Promise<RegisterResult> {
        return SrpLogicBase.register(N, g, I, P, s);
    }
    
    server_init(N: BN, g: BN, v: BN, b: BN): Promise<ServerInitResult> {
        return SrpLogicBase.server_init(N, g, v, b);
    }
    
    server_exchange(N: BN, A: BN, M1: BN, v: BN, B: BN, b: BN): Promise<ServerExchangeResult> {
        return SrpLogicBase.server_exchange(N, A, M1, v, B, b);
    }
    
    login_step1(N: BN, g: BN, s: Buffer, B: BN, I: string, P: string, a: BN): Promise<LoginStep1Result> {
        return SrpLogicBase.login_step1(N, g, s, B, I, P, a);
    }
    
    static login_step2(clientM2: BN, serverM2: BN): void {
        return SrpLogicBase.login_step2(clientM2, serverM2);
    }
}

export class SrpLogicEx extends SrpLogic {
    
    get_a(): BN {
        return SrpLogicBase.get_a();
    }
    
    get_b(): BN {
        return SrpLogicBase.get_b();
    }
    
    get_s(): Buffer {
        return SrpLogicBase.get_s();
    }
    
    registerEx(N: BN, g: BN, I: string, P: string): Promise<RegisterResult> {
        return SrpLogicBase.registerEx(N, g, I, P);
    }
    
    server_initEx(N: BN, g: BN, v: BN): Promise<ServerInitResult> {
        return SrpLogicBase.server_initEx(N, g, v);
    }
    
    login_step1Ex(N: BN, g: BN, s: Buffer, B: BN, I: string, P: string): Promise<LoginStep1Result> {
        return SrpLogicBase.login_step1Ex(N, g, s, B, I, P);
    }
}
