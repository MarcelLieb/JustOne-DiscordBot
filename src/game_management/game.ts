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

    constructor(users: Set<User>, duration: number, timedMessages: Array<Message>, timeOutfunction: () => void) {
        this.authorisedUsers = new Set(users);
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
            this.timedMessages.forEach(async message => {
                // TODO: Might need extra permissions
                const oldContent = message.content;
                const newContent = oldContent.replace(/<t:(\d+):R>/, 'now');
                await message.edit({ content: newContent });
            });
            return true;
        }

        this.endTime = Date.now() + this.timeLeft * 1000 * this.authorisedUsers.size / (this.authorisedUsers.size + 1);
        this.timedMessages.forEach(async message => {
            // TODO: Might need extra permissions
            const oldContent = message.content;
            const newContent = oldContent.replace(/<t:(\d+):R>/, `<t:${Math.floor(this.endTime / 1000)}:R>`);
            await message.edit({ content: newContent });
        });
        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => this.timeoutFunction, (this.endTime - Date.now()) * 1000);
        return true;
    }

    stop() {
        this.endTime = Date.now();
        clearTimeout(this.timeout);
        this.timeoutFunction();
    }

    destroy() {
        clearTimeout(this.timeout);
    }
}