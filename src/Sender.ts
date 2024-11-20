import { RequestBuilderCallback, ResponseCallback, ChannelType, Ticket, ApplicationMessage, ApplicationCredentials } from "./Types";
import { RpcRequestBuilder } from "./RpcRequestBuilder";
import { RpcRequest } from "./RpcRequest";
import { ResponseReaderFactory } from "./ResponseReader";
import { Channel } from "./BaseChannel";
import { ConnectionError } from "./ConnectionError";

export interface SendOptions<T> {
    messagePriority: number;
    timeout: number;
    requestBuilder: RequestBuilderCallback;
    onResponse: ResponseCallback<T>;
}

export interface SendOptionsEx<T> {
    channelType: ChannelType;
    messagePriority: number;
    timeout: number;
    requestBuilder: RequestBuilderCallback;
    onResponse: ResponseCallback<T>;
}

export interface SendRequestOptions<T> {
    channelType: ChannelType;
    request: RpcRequest;
    onResponse: ResponseCallback<T>;
}

export interface Sender {
    
    send<T>(options: SendOptions<T>): Promise<T>;
}

export interface SenderEx {
    
    send<T>(options: SendOptionsEx<T>): Promise<T>;
    serializeApplicationMessage(msg: ApplicationMessage): Buffer;
}

export class PlainSender implements Sender {
    
    constructor(
        protected channel: Channel,
        protected appCredentials: ApplicationCredentials,
        protected rpcRequestBuilder: RpcRequestBuilder,
        protected responseReaderFactory: ResponseReaderFactory
    ) {
    }
    
    async send<T>(options: SendOptions<T>): Promise<T> {
        const request = await this.createRequest(options.messagePriority, options.timeout, options.requestBuilder);
        const response = await this.sendRequest(request);
        return this.readResponse(request, response, options.onResponse);
    }
    
    protected async createRequest(messagePriority: number, timeout: number, requestBuilder: RequestBuilderCallback) {
        const request = await this.rpcRequestBuilder.createPlainRpcRequest(this.appCredentials, messagePriority, timeout);
        await requestBuilder(request);
        return request;
    }
    
    protected async sendRequest(request: RpcRequest) {
        try {
            return await this.channel.send(request.getBuffer(), request.getPriority(), request.getTimeout());
        }
        catch (e) {
            throw new ConnectionError(e);
        }
    }
    
    protected async readResponse<T>(request: RpcRequest, response: Buffer, onResponse: ResponseCallback<T>) {
        const reader = this.responseReaderFactory.create(response);
        const state = request.getCipherState();
        if (state.rwStates.readState.initialized) {
            await reader.readChangeCipherSpecFrame(state.rwStates.readState);
        }
        const result = await onResponse(reader, request);
        reader.checkEof();
        return result;
    }
}

export class TicketSender extends PlainSender {
    
    constructor(
        channel: Channel,
        appCredentials: ApplicationCredentials,
        rpcRequestBuilder: RpcRequestBuilder,
        responseReaderFactory: ResponseReaderFactory,
        private ticket: Ticket,
        private plain: boolean,
    ) {
        super(channel, appCredentials, rpcRequestBuilder, responseReaderFactory);
    }
    
    protected async createRequest(messagePriority: number, timeout: number, requestBuilder: RequestBuilderCallback) {
        const request = await this.rpcRequestBuilder.createTicketHandshakeRequest(this.ticket, this.appCredentials, messagePriority, timeout, this.plain);
        await requestBuilder(request);
        return request;
    }
}

export class TicketsSender extends PlainSender {
    
    constructor(
        channel: Channel,
        appCredentials: ApplicationCredentials,
        rpcRequestBuilder: RpcRequestBuilder,
        responseReaderFactory: ResponseReaderFactory,
        private tickets: Ticket[],
        private plain: boolean,
    ) {
        super(channel, appCredentials, rpcRequestBuilder, responseReaderFactory);
    }
    
    protected async createRequest(messagePriority: number, timeout: number, requestBuilder: RequestBuilderCallback) {
        if (this.tickets.length == 0) {
            throw new Error("No tickets");
        }
        const ticket = this.tickets.shift();
        const request = await this.rpcRequestBuilder.createTicketHandshakeRequest(ticket, this.appCredentials, messagePriority, timeout, this.plain);
        await requestBuilder(request);
        return request;
    }
}
