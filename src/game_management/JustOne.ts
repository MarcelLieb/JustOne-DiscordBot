import { Game, Phase } from "./game.js";
import { User } from "discord.js";

class JustOne extends Game {

    currentPhase: Phase;
    constructor(guildId: string, channelId: string, players: Set<User>) {
        super(guildId, channelId, players);
        this.currentPhase = new JustOneStartPhase();
    }

}

class JustOneStartPhase extends Phase {
    name = "start";
    events = [];
    joinable = true;
    timer = undefined;
}