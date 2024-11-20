import * as RootLogger from "simplito-logger";
import { TicketInfo, TicketsManagerConfig, Ticket } from "./Types";
const Logger = RootLogger.get("privmx-rpc.TicketsManager");

export class TicketsManager {
    
    private minTTL: number;
    private maxTTL: number;
    
    constructor(
        private tickets: Ticket[],
        private config: TicketsManagerConfig
    ) {
        this.refreshTTL();
    }
    
    setTickets(tickets: Ticket[]) {
        this.clear();
        this.addTickets(tickets);
    }
    
    addTickets(tickets: Ticket[]) {
        this.tickets = this.tickets.concat(tickets);
        this.refreshTTL();
        Logger.info(`add ${tickets.length} new tickets, all tickets: ${this.tickets.length}`);
    }
    
    private refreshTTL() {
        this.minTTL = null;
        this.maxTTL = null;
        for (const ticket of this.tickets) {
            const ttl = ticket.ttl.getTime();
            if (this.minTTL == null || ttl < this.minTTL) {
                this.minTTL = ttl;
            }
            if (this.maxTTL == null || ttl > this.maxTTL) {
                this.maxTTL = ttl;
            }
        }
    }
    
    needNewTickets(): boolean {
        this.dropExpiredTickets();
        return this.tickets.length < this.config.minTicketsCount || (this.maxTTL != null && this.maxTTL - this.config.ttlThreshold < Date.now());
    }
    
    popFirstTicketForHandshake(): TicketInfo {
        Logger.info(`ticket handshake, tickets left: ${this.tickets.length}`);
        this.checkTicketsPresent();
        const ticket = this.tickets.shift();
        const ticketId = ticket.id.toString("hex");
        return {ticketId, ticket};
    }
    
    popAllTickets(): Ticket[] {
        const tickets = this.tickets;
        this.tickets = [];
        this.refreshTTL();
        return tickets;
    }
    
    checkTicketsPresent() {
        if (!this.hasTickets()) {
            throw new Error("No tickets");
        }
    }
    
    hasTickets() {
        this.dropExpiredTickets();
        return this.tickets.length > 0;
    }
    
    clear() {
        this.tickets = [];
        this.refreshTTL();
    }
    
    private dropExpiredTickets() {
        const ttl = Date.now() + this.config.minTicketTTL;
        if (this.minTTL != null && ttl > this.minTTL) {
            const ticketsCount = this.tickets.length;
            this.tickets = this.tickets.filter(x => x.ttl.getTime() > ttl);
            this.refreshTTL();
            const count = ticketsCount - this.tickets.length;
            Logger.debug(`Deleted ${count} expired tickets`);
        }
    }
}
