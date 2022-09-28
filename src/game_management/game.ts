import { Interaction, User, InteractionResponse, Client } from "discord.js";

export type Event = {
    name: string,
    execute: (interaction: Interaction) => Promise<void>
};

export abstract class Game {
    guildId: string;
    channelId: string;
    players: Set<User>;
    abstract events: Array<Event>;
    client: Client;
    abstract currentPhase: Phase;
    constructor(client: Client, guildId: string, channelId: string, players: Set<User>) {
        this.client = client;
        this.guildId = guildId;
        this.channelId = channelId;
        this.players = players;
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
    timeOut: NodeJS.Timeout;
    timeOutFunction: () => void;
    authorisedUsers: Set<User>;
    get timeLeft() {
        return Math.floor((this.endTime - Date.now()) / 1000);
    }

    constructor(users: Set<User>, duration: number, timedMessages: Array<InteractionResponse>, timeOutfunction: () => void) {
        this.authorisedUsers = users;
        this.endTime = Date.now() + duration * 1000;
        this.timedMessages = timedMessages; 
        this.timeOutFunction = timeOutfunction;
        this.timeOut = setTimeout(this.timeOutFunction, duration * 1000);
    }

    speedUp(user:User) {
        if (!this.authorisedUsers.has(user)) return;
        this.authorisedUsers.delete(user);
        if (this.authorisedUsers.size === 0) {
            this.stop();
            return;
        }

        this.endTime = Date.now() + this.timeLeft * 1000 * this.authorisedUsers.size / (this.authorisedUsers.size + 1);
        this.timedMessages.forEach(async reply => {
            const message = await reply.awaitMessageComponent();
            // TODO: Might need extra permissions
            const oldContent = message.message.content;
            const newContent = oldContent.replace(/<t:(\d+):R>/, `<t:${Math.floor(this.endTime / 1000)}:R>`);
            message.update({ content: newContent });
        });
        clearTimeout(this.timeOut);
        this.timeOut = setTimeout(() => this.timeOutFunction, (this.endTime - Date.now()) * 1000);
    }

    stop() {
        clearTimeout(this.timeOut);
        this.timeOutFunction();
    }

    destroy() {
        clearTimeout(this.timeOut);
    }
}