import { Deferred, ApplicationResponse, MessageSendOptionsEx, ChannelType, AppHandlerOptions } from "./Types";
import { RpcUtils } from "./RpcUtils";
import * as RootLogger from "simplito-logger";
import { Scheduler } from "./Scheduler";
import { SenderEx, Sender } from "./Sender";
import { IdGenerator } from "./IdGenerator";
const Logger = RootLogger.get("privmx-rpc.AppHandler");

interface RpcQueue {
    priority: number;
    scheduleId: NodeJS.Timer;
    entries: Map<number, RpcEntry>;
    entriesSize: number;
}

interface RpcEntry<T = any> {
    id: number;
    createdAt: number;
    timeout: number;
    method: string;
    params: any;
    serializedMessage: Buffer;
    priority: number;
    deferred: Deferred<T>;
}

export class AppHandler {
    
    private timeoutChecker: Scheduler;
    private messagesQueue: Map<number, RpcQueue>;
    private singleEntries: Map<number, RpcEntry>;
    
    constructor(
        private sender: SenderEx,
        private idGenerator: IdGenerator,
        private options: AppHandlerOptions
    ) {
        this.messagesQueue = new Map();
        this.singleEntries = new Map();
        this.timeoutChecker = new Scheduler(this.options.timeoutTimerValue, () => this.checkTimeouts);
    }
    
    call<T = any>(method: string, params: any, options: MessageSendOptionsEx): Promise<T> {
        const priority = options.priority != null ? options.priority : this.options.defaultMessagePriority;
        const rpcEntry = this.createRpcEntry<T>(method, params, priority, options.timeout);
        if (options.channelType == "websocket" || options.sendAlone) {
            this.singleEntries.set(rpcEntry.id, rpcEntry);
            this.sendRightNow(rpcEntry, options.channelType);
        }
        else {
            const queue = this.getOrCreateQueueByPriority(priority);
            this.addRpcEntry(rpcEntry, queue);
        }
        this.scheduleTimeoutsCheck();
        return rpcEntry.deferred.promise;
    }
    
    private getOrCreateQueueByPriority(priority: number) {
        if (this.messagesQueue.has(priority)) {
            return this.messagesQueue.get(priority);
        }
        const queue: RpcQueue =  {priority: priority, scheduleId: null, entries: new Map(), entriesSize: 0};
        this.messagesQueue.set(priority, queue);
        return queue;
    }
    
    private createRpcEntry<T>(method: string, params: any, priority: number, timeout: number): RpcEntry<T> {
        const id = this.idGenerator.generateNewId();
        const rpcEntry: RpcEntry<T> = {
            id: id,
            createdAt: Date.now(),
            timeout: timeout != null ? timeout : this.options.defaultTimeout,
            method: method,
            params: params,
            serializedMessage: this.sender.serializeApplicationMessage({id, method, params}),
            priority: priority,
            deferred: RpcUtils.defer<T>()
        };
        return rpcEntry;
    }
    
    private addRpcEntry(rpcEntry: RpcEntry, queue: RpcQueue) {
        if (queue.entries.size >= this.options.maxMessagesCount || queue.entriesSize >= this.options.maxMessagesSize) {
            this.clearScheduleAndFlushMessagesFromQueue(queue);
        }
        queue.entries.set(rpcEntry.id, rpcEntry);
        queue.entriesSize += rpcEntry.serializedMessage.length;
        this.scheduleSend(queue);
    }
    
    private scheduleSend(queue: RpcQueue) {
        if (queue.scheduleId) {
            return;
        }
        queue.scheduleId = setTimeout(() => this.flushMessagesFromQueue(queue), 1);
    }
    
    private async clearScheduleAndFlushMessagesFromQueue(queue: RpcQueue) {
        if (queue.scheduleId) {
            clearTimeout(queue.scheduleId);
        }
        this.flushMessagesFromQueue(queue);
    }
    
    private flushMessagesFromQueue(queue: RpcQueue) {
        queue.scheduleId = null;
        const entries = queue.entries;
        queue.entries = new Map();
        queue.entriesSize = 0;
        this.flushMessages(entries, "ajax", queue.priority);
    }
    
    private async flushMessages(entries: Map<number, RpcEntry>, channelType: ChannelType, priority: number) {
        try {
            const values = [...entries.values()];
            const timeout = RpcUtils.getMax(values, x => x.timeout, this.options.defaultTimeout);
            const result = await this.sendMessages(values.map(x => x.serializedMessage), channelType, priority, timeout);
            for (const res of result) {
                const entry = entries.get(res.id);
                if (!entry) {
                    Logger.warn("No matching RpcCall for", res.id);
                }
                entries.delete(res.id);
                if (res.error) {
                    entry.deferred.reject(res.error);
                }
                else {
                    entry.deferred.resolve(res.result);
                }
            }
            for (const entry of entries.values()) {
                entry.deferred.reject(new Error("No response"));
            }
        }
        catch (e) {
            for (const entry of entries.values()) {
                entry.deferred.reject(e);
            }
        }
    }
    
    private sendRightNow(entry: RpcEntry, channelType: ChannelType) {
        const map = new Map<number, RpcEntry>();
        map.set(entry.id, entry);
        this.flushMessages(map, channelType, entry.priority)
    }
    
    private async sendMessages(msgs: Buffer[], channelType: ChannelType, priority: number, timeout: number): Promise<ApplicationResponse[]> {
        return this.sender.send({
            channelType: channelType,
            messagePriority: priority,
            timeout: timeout,
            requestBuilder: async request => {
                for (const msg of msgs) {
                    await request.addSerializedApplicationMessage(msg);
                }
            },
            onResponse: async reader => {
                const result: ApplicationResponse[] = [];
                while (reader.hasFrame()) {
                    const frame = await reader.readApplicationFrame();
                    result.push(frame.data);
                }
                return result;
            }
        });
    }
    
    private checkTimeouts() {
        let hasMessages = false;
        for (const queue of this.messagesQueue.values()) {
            this.checkTimeoutsInMap(queue.entries);
            hasMessages = hasMessages || queue.entries.size > 0;
        }
        this.checkTimeoutsInMap(this.singleEntries);
        hasMessages = hasMessages || this.singleEntries.size > 0;
        if (hasMessages) {
            this.scheduleTimeoutsCheck();
        }
    }
    
    private checkTimeoutsInMap(map: Map<number, RpcEntry>) {
        const now = Date.now();
        const toRemove: number[] = [];
        for (const entry of map.values()) {
            if (entry.createdAt < now - entry.timeout) {
                entry.deferred.reject("timeout ( " + entry.method + ")");
                toRemove.push(entry.id);
            }
        }
        for (const id of toRemove) {
            map.delete(id);
        }
    }
    
    private scheduleTimeoutsCheck() {
        this.timeoutChecker.schedule();
    }
    
    static sendApplicationFrame<T = any>(sender: Sender, messagePriority: number, timeout: number, id: any, method: string, params: any): Promise<T> {
        return sender.send({
            messagePriority: messagePriority,
            timeout: timeout,
            requestBuilder: async request => {
                await request.addApplicationMessage({id, method, params})
            },
            onResponse: async reader => {
                return reader.readAndProcessApplicationFrame<T>();
            }
        });
    }
}
