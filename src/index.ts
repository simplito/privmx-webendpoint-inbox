import * as ajax from "./ajax/AjaxRequester";
import { AdditionalLoginStepHandler } from "./AdditionalLoginStepHandler";
import { AjaxChannel } from "./AjaxChannel";
import { AlertError } from "./AlertError";
import { AppHandler } from "./AppHandler";
import { AuthorizedConnection } from "./AuthorizedConnection";
import { Channel, BaseChannel } from "./BaseChannel";
import { ConnectionError } from "./ConnectionError";
import { ConnectionManager } from "./ConnectionManager";
import { ECUtils } from "./ECUtils";
import { EventBinder } from "./EventBinder";
import { EventDispatcher } from "./EventDispatcher";
import { FrameSerializer } from "./FrameSerializer";
import { IdGenerator } from "./IdGenerator";
import { IOC } from "./IOC";
import { KeyService } from "./KeyService";
import { KeyUtils } from "./KeyUtils";
import { LoginService } from "./LoginService";
import { MessagesBuffer } from "./MessagesBuffer";
import { ProxyConnectionManager } from "./ProxyConnectionManager";
import { ProxyManager } from "./ProxyManager";
import { ResponseReaderFactory, ResponseReader } from "./ResponseReader";
import { RpcRequest } from "./RpcRequest";
import { RpcRequestBuilder } from "./RpcRequestBuilder";
import { RpcUtils } from "./RpcUtils";
import { RwState } from "./RwState";
import { Scheduler } from "./Scheduler";
import { SendOptions, SendOptionsEx, Sender, SenderEx, PlainSender, TicketSender, TicketsSender } from "./Sender";
import { SenderFactory } from "./SenderFactory";
import { SessionLostError } from "./SessionLostError";
import { SrpService } from "./SrpService";
import { SrpUtils } from "./SrpUtils";
import { TicketsManager } from "./TicketsManager";
import * as Types from "./Types";
import { WebSocketChannel } from "./WebSocketChannel";
import { PlainConnection } from "./PlainConnection";
import * as crypto from "./crypto";
import { Buffer } from "buffer";
import { Inbox } from "./Inbox";

const ioc = new IOC();
const rpc = ioc.getConnectionManager();
const proxy = ioc.getProxyConnectionManager();
const inbox = ioc.getInbox();

export {
    ajax,
    crypto,
    Buffer,
    AdditionalLoginStepHandler,
    AjaxChannel,
    AlertError,
    AppHandler,
    AuthorizedConnection,
    Channel, BaseChannel,
    ConnectionError,
    ConnectionManager,
    ECUtils,
    EventBinder,
    EventDispatcher,
    FrameSerializer,
    IdGenerator,
    IOC,
    KeyService,
    KeyUtils,
    LoginService,
    MessagesBuffer,
    PlainConnection,
    ProxyConnectionManager,
    ProxyManager,
    ResponseReaderFactory, ResponseReader,
    RpcRequest,
    RpcRequestBuilder,
    RpcUtils,
    RwState,
    Scheduler,
    SendOptions, SendOptionsEx, Sender, SenderEx, PlainSender, TicketSender, TicketsSender,
    SenderFactory,
    SessionLostError,
    SrpService,
    SrpUtils,
    TicketsManager,
    Types,
    WebSocketChannel,
    ioc,
    rpc,
    proxy,
    Inbox,
    inbox,
}
