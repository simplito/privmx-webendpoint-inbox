import { IOC } from "../IOC";
import * as Ecc from "../crypto/ecc";
import { CryptoService } from "../crypto/Crypto";
import { ConnectionOptions } from "../Types";
import { AlertError } from "../AlertError";
// import * as RootLogger from "simplito-logger";
// RootLogger.get("privmx-rpc").setLevel(RootLogger.DEBUG);

async function go() {
    const ioc = new IOC();
    const connectionManager = ioc.getConnectionManager();
    const connectionOptions: ConnectionOptions = {
        url: "http://lukas2/api/v2.0",
        host: "lukas2",
        mainChannel: "ajax",
        websocket: true,
        notifications: true,
        tickets: {
            ticketsCount: 20
        },
        serverAgentValidator: agent => {
            console.log("Server agent", agent)
        },
        websocketOptions: {
            onHeartBeatCallback: event => console.log("HeartBeat", event.latency)
        }
    };
    const ecdhexKey = await Ecc.PrivateKey.fromWIF("L3ZcrvuPSYaWUnb4sfhxz3bDfvTEQ6Zmntt2BjaWDnfc1mBAhKMV"); // Pub 64dGCs7myoFrZDnP5pgvmBNKF1za22b5iBQaEpeBcGWiTUCA3c
    
    const ecdhe = await connectionManager.createEcdheConnection({}, connectionOptions);
    console.log("ECDHE", !!ecdhe);
    
    const ecdhex = await connectionManager.createEcdhexConnection({key: ecdhexKey}, connectionOptions);
    console.log("ECDHEX", !!ecdhex, ecdhex.getInfo());
    
    const srp = await connectionManager.createSrpConnection({username: "admin", password: "qwerty", properties: {}}, connectionOptions);
    console.log("SRP", !!srp);
    
    const privKey = await getPrivKeyFromMnemonic("story affair crew olympic unfair square asthma settle seven barely garment calm priority cage update always tomato note fury vessel pair private symbol profit");
    const key = await connectionManager.createKeyConnection({key: privKey, properties: {}}, connectionOptions);
    console.log("KEY", !!key);
    
    let connection = key;
    function bindEvents() {
        connection.addEventListener("notification", event => console.log("Notification", event));
        connection.addEventListener("connected", async event => console.log("Connected", event));
        connection.addEventListener("disconnected", async event => console.log("Disconnected", event));
        connection.addEventListener("sessionLost", async event => {
            console.log("Session lost", event);
            connection.destroy();
            while (true) {
                try {
                    await connectionManager.probe(connectionOptions.url, connectionOptions.appCredentials);
                    const info = connection.getInfo();
                    if (info.type == "ecdhe") {
                        connection = await connectionManager.createEcdheConnection({}, connectionOptions);
                    }
                    else if (info.type == "ecdhex") {
                        connection = await connectionManager.createEcdhexConnection({key: ecdhexKey}, connectionOptions);
                    }
                    else if (info.sessionKey) {
                        connection = await connectionManager.createSessionConnection({sessionId: info.sessionId, sessionKey: info.sessionKey, username: info.username, properties: info.properties}, connectionOptions);
                    }
                    else {
                        connection = await connectionManager.createKeyConnection({key: privKey, properties: info.properties}, connectionOptions);
                    }
                    bindEvents();
                    console.log("RELOGIN");
                    return;
                }
                catch (e) {
                    console.log("Relogin error", e);
                    if (e instanceof AlertError && e.isError("Unknown session")) {
                        const info = connection.getInfo();
                        if (info.type != "ecdhe" && info.type != "ecdhex") {
                            info.sessionKey = null;
                        }
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        });
    }
    bindEvents();
    while (true) {
        try {
            console.log("CONFIG", JSON.stringify(await Promise.all([
                connection.call("getConfig", {}),
                connection.call("getConfig", {}),
                connection.call("getConfig", {})
            ])).substring(0, 150) + "...");
        }
        catch (e) {
            console.log("ERROR", e);
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

async function getPrivKeyFromMnemonic(mnemonic: string) {
    const bip39 = await CryptoService.bip39FromMnemonic(mnemonic);
    return bip39.extKey.getPrivateKey();
}

go().catch(e => console.log(e));
