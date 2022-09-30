import { Game, Phase, Event, Timer } from "./game.js";
import { Client, Interaction, User, time, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, ModalActionRowComponentBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

export class JustOne extends Game {

    currentPhase: Phase;
    events: Array<Event>;
    guessers: Array<User> = [];
    guessnt: Set<User>;
    lastGuesser?: User;
    get players() {
        const players = new Set(this.guessers);
        this.guessnt.forEach(player => players.add(player));
        return players;
    }

    constructor(client: Client, guildId: string, channelId: string, players: Set<User>, createInteraction?: Interaction) {
        super(client, guildId, channelId, createInteraction);
        this.currentPhase = new StartPhase(this);
        this.events = this.currentPhase.events;
        this.guessnt = new Set(players);
    }

}

class StartPhase extends Phase {
    name = "start";
    joinable = true;
    timer?: Timer;
    client: Client;
    game: JustOne;
    events = [
        {
            name: "interactionCreate", 
            execute: async (interaction: Interaction) => {
                if (interaction.guildId !== this.game.guildId || interaction.channelId !== this.game.channelId) return;
                if (!interaction.isButton()) return;
                if (interaction.customId !== "JustOneJoin" ) return;
                if (!this.joinable) {
                    interaction.reply({content: "No more players can currently join this game", ephemeral: true});
                    return;
                }
                if (this.game.players.has(interaction.user)) {
                    interaction.reply({content: "You are already in this game", ephemeral: true});
                    return;
                }

                this.game.guessnt.add(interaction.user);
                this.timer?.authorisedUsers.add(interaction.user);

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                    .setCustomId('JustOneHurryUp')
                    .setLabel('Hurry up!')
                    .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                    .setCustomId('JustOneLeave')
                    .setLabel('Leave')
                    .setStyle(ButtonStyle.Danger),
                )
                interaction.reply({
                    content: `${interaction.user.username} has joined the game!`,
                    ephemeral: true,
                    components: [row],
                });
            }
        },
        {
            name: "interactionCreate", 
            execute: async (interaction: Interaction) => {
                if (interaction.guildId !== this.game.guildId || interaction.channelId !== this.game.channelId) return;
                if (!interaction.isButton()) return;
                if (interaction.customId !== "JustOneHurryUp") return;
                if (!this.timer?.speedUp(interaction.user)) {
                    interaction.reply({content: "You already sped up the timer", ephemeral: true});
                    return;
                };
                interaction.reply({content: "Timer sped up!", ephemeral: true});
            }
        },
        {
            name: "interactionCreate",
            execute: async (interaction: Interaction) => {
                if (interaction.guildId !== this.game.guildId || interaction.channelId !== this.game.channelId) return;
                if (!interaction.isButton()) return;
                if (interaction.customId !== "JustOneLeave") return;
                if (!this.game.players.has(interaction.user)) {
                    interaction.reply({content: "You are not in this game", ephemeral: true});
                    return;
                }
                this.game.players.delete(interaction.user);
                this.timer?.authorisedUsers.delete(interaction.user);
                interaction.reply({content: `${interaction.user.username} has left the game`, ephemeral: true});
            }
        }
    ];
    
    constructor(game: JustOne) {
        super();
        this.game = game;
        this.client = game.client;
        this.events.forEach(event => {
            this.client.on(event.name, event.execute);
        });
        if (!game.createInteraction?.isChatInputCommand()) return;
        const row = new ActionRowBuilder<ButtonBuilder>()
			.addComponents(
				new ButtonBuilder()
					.setCustomId('JustOneJoin')
					.setLabel('Join!')
					.setStyle(ButtonStyle.Primary),
			);

        const reply = game.createInteraction.reply(
            {
                content: `Welcome to Just One!\nThe game will start ${time(Math.floor(Date.now() / 1000) + 300, 'R')}!`, 
                components: [row], 
                fetchReply: true
            }
        ).then(reply => {
            this.timer = new Timer(game.players, 300, [reply], this.advancePhase.bind(this));
            this.game.rootMessage = reply;
        });
    }

    advancePhase(): void {
        this.events.forEach(event => {
            this.client.off(event.name, event.execute);
        });
        if (this.game instanceof JustOne) {
            this.game.currentPhase = new GuessPhase(this.game);
        }
    }
}

type Hint = {
    user: User;
    hint: string;
}

class GuessPhase extends Phase {
    name: string = "guess";
    game: JustOne;
    guesser: User;
    helper: Set<User>;
    events = [
        {
            name: "interactionCreate",
            execute: async (interaction: Interaction) => {
                if (interaction.guildId !== this.game.guildId || interaction.channelId !== this.game.channelId) return;
                if (!interaction.isButton()) return;
                if (interaction.customId !== "JustOneGiveHint") return;
                if (this.helper.has(interaction.user)) {
                    await interaction.reply({content: "You can't give a hint", ephemeral: true});
                    return;
                }

                const row = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
                    // TODO: Replace placeholder text
                    new TextInputBuilder()
                    .setCustomId('JustOneHint')
                    .setPlaceholder('Enter your hint here')
                    .setMinLength(1).setMaxLength(100)
                    .setLabel('Enter your hint for guessing placeholder')
                    .setStyle(TextInputStyle.Short),
                );
                const modal = new ModalBuilder().setTitle("Give a hint").setCustomId("JustOneHintModal").addComponents(row);
                await interaction.showModal(modal);
            }
        },
    ];
    joinable = false;
    timer?: Timer;
    advancePhase(): void {
        throw new Error("Method not implemented.");
    }
    constructor(game: JustOne) {
        super();
        this.game = game;
        this.game.events = this.events;
        this.events.forEach(event => {
            this.game.client.on(event.name, event.execute);
        });
        this.game.rootMessage?.edit({content: "Guess phase"});
        if (this.game.guessnt) {
            this.guesser = this.game.guessnt.values().next().value;
            this.game.guessers.push(this.guesser);
            this.game.guessnt.delete(this.guesser);
            this.game.lastGuesser = this.guesser;
        } else {
            if (!this.game.lastGuesser) throw new Error("Something went wrong\nNo Players left to guess and no lastGuesser");
            this.guesser = this.game.guessers[(this.game.guessers.indexOf(this.game.lastGuesser) + 1) % this.game.guessers.length];
            this.game.lastGuesser = this.guesser;
        }
        this.helper = new Set(this.game.players);
        this.helper.delete(this.guesser);
        if (!this.game.rootMessage) throw new Error("Something went wrong\nNo rootMessage");
        this.timer = new Timer(new Set(this.helper), 180, [this.game.rootMessage], this.advancePhase.bind(this));

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('JustOneGiveHint')
                    .setLabel('Give a hint!')
                    .setStyle(ButtonStyle.Primary),
            );
        this.game.rootMessage?.edit({content: `It is ${this.guesser.username}'s turn to guess\n\nGuessing time is over ${time(Math.floor(this.timer.endTime / 1000), 'R')}`, components: [row]});
    }
}