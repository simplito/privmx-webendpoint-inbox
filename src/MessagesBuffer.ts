import { RpcUtils } from "./RpcUtils";

export class MessagesBuffer {
    
    private messages: Buffer[];
    private messagesSize: number;
    
    constructor() {
        this.messages = [];
        this.messagesSize = 0;
    }
    
    addMessage(message: Buffer): void {
        this.messages.push(message);
        this.messagesSize += message.length;
    }
    
    getMessageSize() {
        return this.messagesSize;
    }
    
    getMessagesCount() {
        return this.messages.length;
    }
    
    getBuffer() {
        return RpcUtils.concatBuffers(this.messages);
    }
}
