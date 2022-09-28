import { CacheType, Interaction, User, MessageComponentInteraction, InteractionResponse } from "discord.js";

export type Event = [
    eventType: String,
    listener: (interaction: Interaction) => void
];

export abstract class Game {
    guildId: string;
    channelId: string;
    players: Set<User>;
    events: Array<Event>;
    abstract currentPhase: Phase;
    constructor(guildId: string, channelId: string, players: Set<User>) {
        this.guildId = guildId;
        this.channelId = channelId;
        this.players = players;
        this.events = [];
    }
}

export abstract class Phase {
    abstract name: string;
    abstract events: Array<Event>;
    abstract joinable: boolean;
    abstract timer?: Timer;
}

export class Timer {
    private speedUpAmount: number;
    // Unix timestamp at which the timer ends
    endTime: number;
    timedMessages: Array<InteractionResponse>;
    timeOut: NodeJS.Timeout;
    timeOutFunction: () => void;
    

    constructor(duration: number, timedMessages: Array<InteractionResponse>, speedUpAmount: number = 5, timeOutfunction: () => void) {
        this.endTime = Date.now() + duration * 1000;
        this.timedMessages = timedMessages; 
        this.speedUpAmount = speedUpAmount;
        this.timeOutFunction = timeOutfunction;
        this.timeOut = setTimeout(this.timeOutFunction, duration * 1000);
    }

    speedUp(speedUp: number = this.speedUpAmount) {
        this.endTime -= speedUp * 1000;
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
}