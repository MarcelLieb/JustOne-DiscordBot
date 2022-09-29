import { Interaction, User, InteractionResponse, Client } from "discord.js";

export type Event = {
    name: string,
    execute: (interaction: Interaction) => Promise<void>
};

export abstract class Game {
    guildId: string;
    channelId: string;
    players: Set<User>;
    createInteraction?: Interaction;
    abstract events: Array<Event>;
    client: Client;
    abstract currentPhase: Phase;
    constructor(client: Client, guildId: string, channelId: string, players: Set<User>, createInteraction?: Interaction) {
        this.client = client;
        this.guildId = guildId;
        this.channelId = channelId;
        this.players = players;
        this.createInteraction = createInteraction;
    }
}

export abstract class Phase {
    abstract name: string;
    abstract events: Array<Event>;
    abstract joinable: boolean;
    abstract timer?: Timer;
}

export class Timer {
    endTime: number;  // Unix timestamp at which the timer ends
    timedMessages: Array<InteractionResponse>;
    timeout: NodeJS.Timeout;
    timeoutFunction: () => void;
    authorisedUsers: Set<User>;
    get timeLeft() {
        return Math.floor((this.endTime - Date.now()) / 1000);
    }

    constructor(users: Set<User>, duration: number, timedMessages: Array<InteractionResponse>, timeOutfunction: () => void) {
        this.authorisedUsers = users;
        this.endTime = Date.now() + duration * 1000;
        this.timedMessages = timedMessages; 
        this.timeoutFunction = timeOutfunction;
        this.timeout = setTimeout(this.timeoutFunction, duration * 1000);
    }

    speedUp(user:User): Boolean {
        if (!this.authorisedUsers.has(user)) return false;
        this.authorisedUsers.delete(user);
        if (this.authorisedUsers.size === 0) {
            this.stop();
            return true;
        }

        this.endTime = Date.now() + this.timeLeft * 1000 * this.authorisedUsers.size / (this.authorisedUsers.size + 1);
        this.timedMessages.forEach(async reply => {
            const message = await reply.awaitMessageComponent();
            // TODO: Might need extra permissions
            const oldContent = message.message.content;
            const newContent = oldContent.replace(/<t:(\d+):R>/, `<t:${Math.floor(this.endTime / 1000)}:R>`);
            message.update({ content: newContent });
        });
        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => this.timeoutFunction, (this.endTime - Date.now()) * 1000);
        return true;
    }

    stop() {
        clearTimeout(this.timeout);
        this.timeoutFunction();
    }

    destroy() {
        clearTimeout(this.timeout);
    }
}