import { AppHandler } from "./AppHandler";
import { IdGenerator } from "./IdGenerator";
import { SenderEx } from "./Sender";
import { AppHandlerOptions, ChannelType, MessageSendOptionsEx } from "./Types";

export class PlainConnection {
    
    private idGenerator: IdGenerator;
    private appHandler: AppHandler;
    
    constructor(
        private sender: SenderEx,
        private options: {mainChannel: ChannelType, appHandler: AppHandlerOptions}
    ) {
        this.idGenerator = new IdGenerator();
        this.appHandler = new AppHandler(this.sender, this.idGenerator, this.options.appHandler);
    }
    
    async call<T = any>(method: string, params: any, options?: MessageSendOptionsEx): Promise<T> {
        const opts: MessageSendOptionsEx = {channelType: this.options.mainChannel, ...(options || {})};
        return this.appHandler.call(method, params, opts);
    }
}
