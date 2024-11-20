export const networks: Networks = {
    bitcoin: {
        magicPrefix: '\x18Bitcoin Signed Message:\n',
        bip32: {
            public: 0x0488b21e,
            private: 0x0488ade4
        },
        pubKeyHash: 0x00,
        scriptHash: 0x05,
        wif: 0x80,
        dustThreshold: 546,
        feePerKb: 10000,
        estimateFee: estimateFee('bitcoin')
    },
    testnet: {
        magicPrefix: '\x18Bitcoin Signed Message:\n',
        bip32: {
            public: 0x043587cf,
            private: 0x04358394
        },
        pubKeyHash: 0x6f,
        scriptHash: 0xc4,
        wif: 0xef,
        dustThreshold: 546,
        feePerKb: 10000,
        estimateFee: estimateFee('testnet')
    },
    litecoin: {
        magicPrefix: '\x19Litecoin Signed Message:\n',
        bip32: {
            public: 0x019da462,
            private: 0x019d9cfe
        },
        pubKeyHash: 0x30,
        scriptHash: 0x05,
        wif: 0xb0,
        dustThreshold: 0,
        dustSoftThreshold: 100000,
        feePerKb: 100000,
        estimateFee: estimateFee('litecoin')
    },
    dogecoin: {
        magicPrefix: '\x19Dogecoin Signed Message:\n',
        bip32: {
            public: 0x02facafd,
            private: 0x02fac398
        },
        pubKeyHash: 0x1e,
        scriptHash: 0x16,
        wif: 0x9e,
        dustThreshold: 0,
        dustSoftThreshold: 100000000,
        feePerKb: 100000000,
        estimateFee: estimateFee('dogecoin')
    },
    viacoin: {
        magicPrefix: '\x18Viacoin Signed Message:\n',
        bip32: {
            public: 0x0488b21e,
            private: 0x0488ade4
        },
        pubKeyHash: 0x47,
        scriptHash: 0x21,
        wif: 0xc7,
        dustThreshold: 560,
        dustSoftThreshold: 100000,
        feePerKb: 100000,
        estimateFee: estimateFee('viacoin')
    },
    viacointestnet: {
        magicPrefix: '\x18Viacoin Signed Message:\n',
        bip32: {
            public: 0x043587cf,
            private: 0x04358394
        },
        pubKeyHash: 0x7f,
        scriptHash: 0xc4,
        wif: 0xff,
        dustThreshold: 560,
        dustSoftThreshold: 100000,
        feePerKb: 100000,
        estimateFee: estimateFee('viacointestnet')
    },
    gamerscoin: {
        magicPrefix: '\x19Gamerscoin Signed Message:\n',
        bip32: {
            public: 0x019da462,
            private: 0x019d9cfe
        },
        pubKeyHash: 0x26,
        scriptHash: 0x05,
        wif: 0xA6,
        dustThreshold: 0,
        dustSoftThreshold: 100000,
        feePerKb: 100000,
        estimateFee: estimateFee('gamerscoin')
    },
    jumbucks: {
        magicPrefix: '\x19Jumbucks Signed Message:\n',
        bip32: {
            public: 0x037a689a,
            private: 0x037a6460
        },
        pubKeyHash: 0x2b,
        scriptHash: 0x05,
        wif: 0xab,
        dustThreshold: 0,
        dustSoftThreshold: 10000,
        feePerKb: 10000,
        estimateFee: estimateFee('jumbucks')
    },
    zetacoin: {
        magicPrefix: '\x18Zetacoin Signed Message:\n',
        bip32: {
            public: 0x0488b21e,
            private: 0x0488ade4
        },
        pubKeyHash: 0x50,
        scriptHash: 0x09,
        wif: 0xe0,
        dustThreshold: 546,
        feePerKb: 10000,
        estimateFee: estimateFee('zetacoin')
    }
};

export const networksMap = <{[name: string]: Network}><any>networks;

export interface Networks {
    bitcoin: Network;
    testnet: Network;
    litecoin: Network;
    dogecoin: Network;
    viacoin: Network;
    viacointestnet: Network;
    gamerscoin: Network;
    jumbucks: Network;
    zetacoin: Network;
}

export interface Network {
    magicPrefix: string;
    bip32: {
        public: number;
        private: number;
    };
    pubKeyHash: number;
    scriptHash: number;
    wif: number;
    dustThreshold: number;
    dustSoftThreshold?: number;
    feePerKb: number;
    estimateFee: (tx: Transaction) => number;
}

export interface Transaction {
    outs: {value: number}[];
    toBuffer(): Buffer;
}

export function estimateFee(type: keyof Networks): (tx: Transaction) => number {
    return (tx: Transaction) => {
        const network = networks[type];
        const baseFee = network.feePerKb;
        const byteSize = tx.toBuffer().length;
        let fee = baseFee * Math.ceil(byteSize / 1000);
        if (network.dustSoftThreshold === undefined) {
            return fee;
        }
        tx.outs.forEach(e => {
            if (e.value < network.dustSoftThreshold) {
                fee += baseFee;
            }
        });
        return fee;
    };
}
