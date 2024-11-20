import { Channel } from "./BaseChannel";
import { Ticket, AdditionalLoginStepCallback, ApplicationCredentials } from "./Types";
import { RpcUtils } from "./RpcUtils";
import { AlertError } from "./AlertError";
import { SessionLostError } from "./SessionLostError";
import { SenderFactory } from "./SenderFactory";
import { AppHandler } from "./AppHandler";

export class AdditionalLoginStepHandler {
    
    constructor(
        private senderFactory: SenderFactory
    ) {
    }
    
    async onAdditionalLoginStep(channel: Channel, appCredentials: ApplicationCredentials, host: string, requestTimeout: number, additionalLoginStep: any, tickets: Ticket[], onAdditionalLoginStep: AdditionalLoginStepCallback) {
        const defer = RpcUtils.defer<void>();
        const promiseResult = RpcUtils.watchPromise(defer.promise);
        let requestId = 1;
        const send = async (method: string, params: any) => {
            if (promiseResult.status != "pending") {
                throw new Error("2FA already resolved");
            }
            if (tickets.length == 0) {
                defer.reject(new Error("No tickets"));
                throw new Error("No tickets");
            }
            const ticket = tickets.shift();
            const sender = this.senderFactory.createTicketSender(channel, ticket, appCredentials, false);
            try {
                return await AppHandler.sendApplicationFrame(sender, 2, requestTimeout, requestId++, method, params);
            }
            catch (e) {
                if (e instanceof AlertError && e.isError("Invalid ticket")) {
                    defer.reject(new SessionLostError("Invalid ticket"));
                }
                throw e;
            }
        };
        onAdditionalLoginStep(additionalLoginStep, {
            getHost: () => {
                return host;
            },
            confirm: async (model: any): Promise<void> => {
                await send("twofaChallenge", model);
                defer.resolve();
            },
            resendCode: async (): Promise<void> => {
                await send("twofaResendCode", {});
            },
            reject: (e: any): void => {
                defer.reject(e);
            }
        });
        return defer.promise;
    }
}
