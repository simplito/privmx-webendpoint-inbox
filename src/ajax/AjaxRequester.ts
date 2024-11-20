import * as http from "http";
import * as https from "https";
import * as url from "url";
import { RpcUtils } from "../RpcUtils";

export interface AjaxOptions {
    method: string;
    url: string;
    data: Buffer;
    contentType: string;
    timeout?: number;
    priority: number;
}

export interface AjaxResponse {
    statusCode: number;
    data: ArrayBuffer|Buffer;
}

export interface Agent {
    http: http.Agent;
    https: https.Agent;
}

export type AgentFactory = (priority: number) => Agent;

export class AjaxRequester {
    
    static INSTANCE = new AjaxRequester();
    
    private agents: {[priority: number]: Agent} = {};
    private agentFactory: AgentFactory;
    
    setAgentFactory(agentFactory: AgentFactory) {
        this.agentFactory = agentFactory;
    }
    
    resetAgents() {
        for (const priority in this.agents) {
            this.agents[priority].http.destroy();
            this.agents[priority].https.destroy();
        }
        this.agents = {};
    }
    
    send(options: AjaxOptions): Promise<AjaxResponse> {
        return new Promise<AjaxResponse>((resolve, reject) => {
            const reqUrl = new url.URL(options.url);
            const requester = this.getRequester(reqUrl.protocol, options.priority);
            const request = requester.requester.request({
                hostname: reqUrl.hostname,
                port: reqUrl.port,
                path: reqUrl.pathname + reqUrl.search,
                method: options.method,
                headers: this.getHeaders(options.contentType),
                agent: requester.agent
            });
            if (options.timeout) {
                request.setTimeout(options.timeout, () => reject({type: "timeout", target: {}}));
            }
            request.on("response", (response: http.IncomingMessage): any => {
                const statusCode = response.statusCode;
                if (this.isRedirectStatusCode(statusCode)) {
                    return this.send({
                        method: "GET",
                        url: response.headers["location"],
                        data: null,
                        contentType: null,
                        timeout: options.timeout,
                        priority: options.priority
                    }).then(resolve, reject);
                }
                this.readResponseData(response)
                    .then(buffer => resolve({statusCode: statusCode, data: buffer}))
                    .catch(e => reject({type: "error", target: {nodeError: e}}));
            });
            request.on("error", (error: any) => reject({type: "error", target: {nodeError: error}}));
            if (options.data) {
                request.write(options.data);
            }
            request.end();
        });
    }
    
    private getRequester(protocol: string, priority: number): {requester: {request: (options: http.RequestOptions) => http.ClientRequest}, agent: http.Agent} {
        const thePriority = priority == null ? 2 : priority;
        const agent = this.getAgentByPriority(thePriority);
        if (protocol === "http:") {
            http.request;
            return {
                requester: http,
                agent: agent.http
            };
        }
        else if (protocol === "https:") {
            return {
                requester: https,
                agent: agent.https
            };
        }
        throw new Error("Unsupported protocol '" + protocol + "'");
    }
    
    private getAgentByPriority(priority: number) {
        if (!(priority in this.agents)) {
            this.agents[priority] = this.createAgent(priority);
        }
        return this.agents[priority];
    }
    
    private createAgent(priority: number) {
        if (typeof(this.agentFactory) == "function") {
            const agent = this.agentFactory(priority);
            if (!this.isValidAgent(agent)) {
                throw new Error("Invalid agent returned from agentFactory for priority " + priority);
            }
            return agent;
        }
        return {
            http: new http.Agent({keepAlive: true}),
            https: new https.Agent({keepAlive: true})
        };
    }
    
    private isValidAgent(agent: Agent) {
        return !!agent && agent.http instanceof http.Agent && agent.https instanceof https.Agent;
    }
    
    private getHeaders(contentType: string) {
        return contentType ? {"Content-Type": contentType} : {};
    }
    
    private isRedirectStatusCode(statusCode: number) {
        return [301, 302, 303, 307, 308].indexOf(statusCode) != -1;
    }
    
    private readResponseData(response: http.IncomingMessage) {
        return new Promise<Buffer>((resolve, reject) => {
            const parts: Buffer[] = [];
            response.on("data", (data: Buffer) => parts.push(data));
            response.on("end", () => resolve(RpcUtils.concatBuffers(parts)));
            response.on("close", (error: any) => reject(error));
        });
    }
}
