import { RwState } from "./RwState";
import { ResponseReader } from "./ResponseReader";
import { RpcRequest } from "./RpcRequest";
import * as Ecc from "./crypto/ecc";
import { WebSocketChannel } from "./WebSocketChannel";

export type GatewayProperties = {[name: string]: any}

export enum ContentType {
    CHANGE_CIPHER_SPEC = 20,
    ALERT = 21,
    HANDSHAKE = 22,
    APPLICATION_DATA = 23,
    HELLO = 24
}

export interface HeaderInfo {
    frameSeed: Buffer;
    frameContentType: ContentType;
    frameLength: number;
    iv: Buffer;
    headerLength: number;
    macLength: number;
}

export interface TicketsPacket {
    tickets: Buffer[];
    ttl: number;
}

export interface SrpExchangePacket extends TicketsPacket {
    M2: string;
    additionalLoginStep?: any;
}

export interface KeyExchangePacket extends TicketsPacket {
    additionalLoginStep?: any;
}

export interface EcdheHandshakePacket {
    key: Buffer;
    agent: string;
}

export interface EcdhexHandshakePacket {
    key: Buffer;
    agent: string;
    host: string;
}

export interface SessionHandshakePacket {
    key: Buffer;
    agent: string;
}

export interface KeyInitPacket {
    I: string;
    pub: string;
    sessionId: string;
    agent: string;
}

export interface SrpInitPacket {
    g: string;
    N: string;
    s: string;
    B: string;
    loginData: string;
    sessionId: string;
    agent: string;
}

export interface RWStates {
    readState: RwState;
    writeState: RwState;
}

export interface Ticket {
    id: Buffer;
    data: SerializedTicketData;
    ttl: Date;
}

export interface SerializedTicketData {
    masterSecret: Buffer;
}

export interface TicketInfo {
    ticketId: string;
    ticket: Ticket;
}

export interface TicketState {
    ticketId: string;
    readState: RwState;
}

export interface ApplicationMessage {
    id: number;
    method: string;
    params: any;
}

export interface ApplicationResponse<T = any> {
    id: number;
    result?: T;
    error?: any;
}

export type Frame = ChangeCipherSpecFrame|AlertFrame|HandshakeFrame|ApplicationFrame

export interface ChangeCipherSpecFrame {
    type: ContentType.CHANGE_CIPHER_SPEC;
}

export interface AlertFrame {
    type: ContentType.ALERT;
    message: string;
}

export interface HandshakeFrame<T = any> {
    type: ContentType.HANDSHAKE;
    data: T;
}

export interface ApplicationFrame<T = any> {
    type: ContentType.APPLICATION_DATA;
    data: ApplicationResponse<T>;
}

export interface CipherState {
    masterSecret: Buffer;
    rwStates: RWStates;
    clientRandom: Buffer;
    serverRandom: Buffer;
}

export interface KeyBigK {
    raw: Buffer;
    encrypted: string;
}

export interface SrpExchangeStep1 {
    A: Buffer;
    M1: Buffer;
    M2: Buffer;
    K: Buffer;
    sessionId: string;
}

export interface KeyExchangeStep1 {
    username: string;
    K: KeyBigK;
    nonce: string;
    timestamp: string;
    signature: Buffer;
    sessionId: string;
}

export interface SrpExchangeResult {
    tickets: Ticket[];
    additionalLoginStep: any;
}

export interface KeyExchangeResult {
    tickets: Ticket[];
    username: string;
    additionalLoginStep: any;
}

export interface EcdheResult {
    tickets: Ticket[];
}

export type ResponseCallback<T> = (reader: ResponseReader, request: RpcRequest) => Promise<T>;

export type RequestBuilderCallback = (request: RpcRequest) => Promise<void>;

export interface Deferred<T = any> {
    resolve: (value?: T) => void;
    reject: (e: any) => void;
    promise: Promise<T>;
}

export type PromiseStatus<T> = PromisePendingStatus<T>|PromiseSettledResult<T>;
export interface PromisePendingStatus<T> {
    promise: Promise<T>;
    status: "pending";
}

export interface MessageSendOptions {
    priority?: number;
    timeout?: number;
    sendAlone?: boolean;
}

export interface MessageSendOptionsEx {
    channelType?: ChannelType;
    priority?: number;
    timeout?: number;
    sendAlone?: boolean;
}

export interface ConnectedEvent {
    type: "connected";
}

export interface DisconnectEvent {
    type: "disconnected";
    cause: any;
}

export interface SessionLostEvent {
    type: "sessionLost";
    cause: any;
}

export interface NotificationEvent {
    type: "notification";
    notificationType: string;
    data: any;
}

export interface Notification2Event {
    type: "notification2";
    data: any;
}

export interface NotificationData {
    type: string;
    data: any;
}

export type ChannelType = "ajax"|"websocket";

export type AdditionalLoginStepCallback = (data: any, result: SecondFactorService) => any;
export type ServerAgentValidator = (serverAgent: string) => void;

export interface SecondFactorService {
    getHost(): string;
    confirm(model: any): Promise<void>;
    resendCode(): Promise<void>;
    reject(e: any): void;
}

export interface ApplicationCredentials {
    id: string;
    secret: string;
}

export interface ConnectionOptionsFull {
    url: string;
    host: string;
    agent: string;
    mainChannel: ChannelType;
    websocket: boolean;
    websocketOptions: WebSocketOptions;
    notifications: boolean;
    overEcdhe: boolean;
    restorableSession: boolean;
    connectionRequestTimeout: number;
    serverAgentValidator: ServerAgentValidator;
    tickets: TicketConfig;
    appHandler: AppHandlerOptions;
    appCredentials?: ApplicationCredentials;
    plain: boolean;
}

export interface WebSocketOptions {
    connectTimeout: number;
    pingTimeout: number;
    onHeartBeatCallback: (event: HeartBeatEvent) => void;
    heartBeatTimeout: number;
    disconnectOnHeartBeatTimeout: boolean;
    url?: string;
}

export interface HeartBeatEvent {
    type: "heartBeat";
    latency: number;
    websocket: WebSocketChannel;
}

export interface TicketConfig extends TicketsManagerConfig {
    ticketsCount: number;
    checkerEnabled: boolean;
    checkerInterval: number;
    checkTickets: boolean;
    fetchTicketsTimeout: number;
}

export interface ConnectionOptions {
    url: string;
    host: string;
    agent?: string;
    mainChannel?: ChannelType;
    websocket?: boolean;
    websocketOptions?: Partial<WebSocketOptions>;
    notifications?: boolean;
    overEcdhe?: boolean;
    restorableSession?: boolean;
    connectionRequestTimeout?: number;
    serverAgentValidator?: ServerAgentValidator;
    tickets?: Partial<TicketConfig>;
    appHandler?: Partial<AppHandlerOptions>;
    appCredentials?: ApplicationCredentials;
    plain?: boolean;
}

export interface ProxyConnectionOptions {
    url?: string;
    host: string;
    agent?: string;
    mainChannel?: ChannelType;
    websocket?: boolean;
    websocketOptions?: Partial<WebSocketOptions>;
    notifications?: boolean;
    overEcdhe?: boolean;
    restorableSession?: boolean;
    connectionRequestTimeout?: number;
    serverAgentValidator?: ServerAgentValidator;
    tickets?: Partial<TicketConfig>;
    appHandler?: Partial<AppHandlerOptions>;
}

export interface AppHandlerOptions {
    timeoutTimerValue: number;
    defaultTimeout: number;
    defaultMessagePriority: number;
    maxMessagesCount: number;
    maxMessagesSize: number;
}

export interface EcdheOptions {
    key?: Ecc.PrivateKey;
    solution?: string;
}

export interface EcdhexOptions {
    key: Ecc.PrivateKey;
    solution?: string;
}

export interface SrpOptions {
    username: string;
    password: string;
    properties: GatewayProperties;
    onAdditionalLoginStep?: AdditionalLoginStepCallback;
}

export interface KeyOptions {
    key: Ecc.PrivateKey;
    properties: GatewayProperties;
    onAdditionalLoginStep?: AdditionalLoginStepCallback;
}

export interface SessionRestoreOptions {
    sessionId: string;
    sessionKey: Ecc.PrivateKey;
}

export interface SessionRestoreOptionsEx {
    sessionId: string;
    sessionKey: Ecc.PrivateKey;
    username: string;
    properties: GatewayProperties;
}

export type ConnectionInfo = EcdheConnectionInfo | EcdhexConnectionInfo| SrpConnectionInfo | KeyConnectionInfo | SessionConnectionInfo;

export interface EcdheConnectionInfo {
    type: "ecdhe";
    key: Ecc.PublicKey;
}

export interface EcdhexConnectionInfo {
    type: "ecdhex";
    key: Ecc.PublicKey;
    host: string;
}

export interface SrpConnectionInfo {
    type: "srp";
    sessionId: string;
    sessionKey: Ecc.PrivateKey;
    username: string;
    mixed: Buffer;
    properties: GatewayProperties;
}

export interface KeyConnectionInfo {
    type: "key";
    sessionId: string;
    sessionKey: Ecc.PrivateKey;
    key: Ecc.PublicKey;
    username: string;
    properties: GatewayProperties;
}

export interface SessionConnectionInfo {
    type: "session";
    sessionId: string;
    sessionKey: Ecc.PrivateKey;
    username: string;
    properties: GatewayProperties;
}

export interface TicketsManagerConfig {
    ttlThreshold: number; // threshold before tickets TTL when connection should ask for new tickets
    minTicketTTL: number; // if ticket ttl is lower than minTicketTTL, then ticket is dropped
    minTicketsCount: number
}

export interface SrpHandshakeResult {
    tickets: Ticket[];
    sessionId: string;
    sessionKey: Ecc.PrivateKey;
    mixed: Buffer;
    additionalLoginStep: any;
}

export interface SessionHandshakeResult {
    tickets: Ticket[];
}

export interface KeyHandshakeResult {
    username: string;
    tickets: Ticket[];
    sessionId: string;
    sessionKey: Ecc.PrivateKey;
    additionalLoginStep: any;
}

export interface EcdheHandshakeResult {
    tickets: Ticket[];
}

export interface EcdhexHandshakeResult {
    tickets: Ticket[];
    host: string;
}