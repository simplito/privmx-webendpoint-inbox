import { AjaxChannel } from "./AjaxChannel";
import { Channel } from "./BaseChannel";
import { PlainSender, TicketSender, TicketsSender } from "./Sender";
import { RpcRequestBuilder } from "./RpcRequestBuilder";
import { ResponseReaderFactory } from "./ResponseReader";
import { Ticket, ApplicationMessage, ApplicationCredentials } from "./Types";

export class SenderFactory {
    
    constructor(
        private rpcRequestBuilder: RpcRequestBuilder,
        private responseReaderFactory: ResponseReaderFactory
    ) {
    }
    
    createPlainSenderHttp(url: string, appCredentials: ApplicationCredentials) {
        return this.createPlainSender(new AjaxChannel(url), appCredentials);
    }
    
    createPlainSender(channel: Channel, appCredentials: ApplicationCredentials) {
        return new PlainSender(channel, appCredentials, this.rpcRequestBuilder, this.responseReaderFactory);
    }
    
    createTicketSender(channel: Channel, ticket: Ticket, appCredentials: ApplicationCredentials, plain: boolean) {
        return new TicketSender(channel, appCredentials, this.rpcRequestBuilder, this.responseReaderFactory, ticket, plain);
    }
    
    createTicketsSenderHttp(url: string, tickets: Ticket[], appCredentials: ApplicationCredentials, plain: boolean) {
        return this.createTicketsSender(new AjaxChannel(url), tickets, appCredentials, plain);
    }
    
    createTicketsSender(channel: Channel, tickets: Ticket[], appCredentials: ApplicationCredentials, plain: boolean) {
        return new TicketsSender(channel, appCredentials, this.rpcRequestBuilder, this.responseReaderFactory, tickets, plain);
    }
    
    serializeApplicationMessage(msg: ApplicationMessage): Buffer {
        return this.rpcRequestBuilder.serializeApplicationMessage(msg);
    }
}
