import { Game, Phase, Event, Timer } from "./game.js";
import { Client, Interaction, User, time, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, ModalActionRowComponentBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import wordpools from "../Data/wordpools.json";

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
            type: "interactionCreate", 
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
            type: "interactionCreate", 
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
            type: "interactionCreate",
            execute: async (interaction: Interaction) => {
                if (interaction.guildId !== this.game.guildId || interaction.channelId !== this.game.channelId) return;
                if (!interaction.isButton()) return;
                if (interaction.customId !== "JustOneLeave") return;
                if (!this.game.players.has(interaction.user)) {
                    interaction.reply({content: "You are not in this game", ephemeral: true});
                    return;
                }
                if (this.game.guessers.includes(interaction.user)) {
                    this.game.guessers.splice(this.game.guessers.indexOf(interaction.user), 1);
                }
                if (this.game.guessnt.has(interaction.user)) {
                    this.game.guessnt.delete(interaction.user);
                }
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
            this.client.on(event.type, event.execute);
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
            this.client.off(event.type, event.execute);
        });
        if (this.game instanceof JustOne) {
            this.game.currentPhase = new GuessPhase(this.game);
        }
    }
}

class GuessPhase extends Phase {
    name: string = "guess";
    game: JustOne;
    guesser: User;
    helper: Set<User>;
    hints: Map<User, string> = new Map();
    word: string;
    events = [
        {
            type: "interactionCreate",
            execute: async (interaction: Interaction) => {
                if (interaction.guildId !== this.game.guildId || interaction.channelId !== this.game.channelId) return;
                if (!interaction.isButton()) return;
                if (interaction.customId !== "JustOneGiveHint") return;
                // TODO: invert if after debugging
                if (this.helper.has(interaction.user)) {
                    await interaction.reply({content: "You can't give a hint", ephemeral: true});
                    return;
                }

                const row = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
                    new TextInputBuilder()
                    .setCustomId('JustOneHint')
                    .setPlaceholder('Enter your hint here')
                    .setMinLength(1).setMaxLength(100)
                    .setLabel(`Enter your hint for guessing \"${this.word}\"`)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true),
                );
                const modal = new ModalBuilder().setTitle(`The word is \"${this.word}\"`).setCustomId("JustOneHintModal").addComponents(row);
                await interaction.showModal(modal);
            }
        },
        {
            type: "interactionCreate",
            execute: async (interaction: Interaction) => {
                if (interaction.guildId !== this.game.guildId || interaction.channelId !== this.game.channelId) return;
                if (!interaction.isModalSubmit()) return;
                if (interaction.customId !== "JustOneHintModal") return;
                // TODO: invert if after debugging
                if (this.helper.has(interaction.user)) {
                    await interaction.reply({content: "You can't give a hint", ephemeral: true});
                    return;
                }
                const hint = interaction.fields.getTextInputValue("JustOneHint");
                this.hints.set(interaction.user, hint);

                const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('JustOneHurryUp')
                        .setLabel('Hurry Up!')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId("JustOneEditHint")
                        .setLabel("Edit Hint")
                        .setStyle(ButtonStyle.Secondary),
                );
                await interaction.reply({content: `Your Hint for \"${this.word}\" is \"${hint}"`, components: [row], ephemeral: true});
            }
        },
        {
            type: "interactionCreate", 
            execute: async (interaction: Interaction) => {
                if (interaction.guildId !== this.game.guildId || interaction.channelId !== this.game.channelId) return;
                if (!interaction.isButton()) return;
                if (interaction.customId !== "JustOneHurryUp") return;
                if (!this.timer.speedUp(interaction.user)) {
                    interaction.reply({content: "You already sped up the timer", ephemeral: true});
                    return;
                };
                interaction.reply({content: "Timer sped up!", ephemeral: true});
            }
        },
        {
            type: "interactionCreate",
            execute: async (interaction: Interaction) => {
                if (interaction.guildId !== this.game.guildId || interaction.channelId !== this.game.channelId) return;
                if (!interaction.isButton()) return;
                if (interaction.customId !== "JustOneEditHint") return;
                if (!this.hints.has(interaction.user)) {
                    interaction.reply({content: "You didn't give a hint", ephemeral: true});
                    return;
                }
                const row = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
                    new TextInputBuilder()
                    .setCustomId('JustOneHint')
                    .setPlaceholder('Enter your hint here')
                    .setMinLength(1).setMaxLength(100)
                    .setLabel(`Enter your hint for guessing \"${this.word}\"`)
                    .setStyle(TextInputStyle.Short)
                    .setValue(this.hints.get(interaction.user) ?? "")
                    .setRequired(true),
                );
                const modal = new ModalBuilder().setTitle(`The word is \"${this.word}\"`).setCustomId("JustOneHintModal").addComponents(row);
                await interaction.showModal(modal);
            }
        }
    ];
    joinable = false;
    timer: Timer;
    advancePhase(): void {
        throw new Error("Method not implemented.");
    }
    constructor(game: JustOne) {
        super();
        this.game = game;
        this.game.events = this.events;
        this.events.forEach(event => {
            this.game.client.on(event.type, event.execute);
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

        // TODO: Make wordpool configurable
        this.word = wordpools["classic_main"]["words"][Math.random() * wordpools["classic_main"]["words"].length | 0];

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