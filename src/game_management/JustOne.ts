import { Game, Phase, Event, Timer } from "./game.js";
import { Client, Interaction, User, time, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, ModalActionRowComponentBuilder, TextInputBuilder, TextInputStyle, SelectMenuBuilder, SelectMenuInteraction } from "discord.js";
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

type JustOneState = {
    word: string,
    guesser: User,
    hints: Map<User, string>,
}

class StartPhase extends Phase {
    name = "start";
    joinable = true;
    timer?: Timer;
    client: Client;
    game: JustOne;
    events = [
        {
            name: "JustOneJoin",
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
                    interaction.reply({content: "You are already in this game", ephemeral: true, components: [row]});
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
            name: "JustOneHurryUp",
            type: "interactionCreate", 
            execute: async (interaction: Interaction) => {
                if (interaction.guildId !== this.game.guildId || interaction.channelId !== this.game.channelId) return;
                if (!interaction.isButton()) return;
                if (interaction.customId !== "JustOneHurryUp") return;
                if (!this.timer?.speedUp(interaction.user)) {
                    interaction.reply({content: "You already sped up the timer", ephemeral: true});
                    return;
                };
                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                    .setCustomId('JustOneHurryUp')
                    .setLabel('Hurry up!')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                    new ButtonBuilder()
                    .setCustomId('JustOneLeave')
                    .setLabel('Leave')
                    .setStyle(ButtonStyle.Danger),
                )
                const update = interaction.message.content + `\nTimer sped up!`;
                interaction.update({content: update, components: [row]});
            }
        },
        {
            name: "JustOneLeave",
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

        if (game.createInteraction.replied) {
            game.rootMessage?.reply({content: `Starting a new Round of Just One\nThe game will start ${time(Math.floor(Date.now() / 1000) + 150, 'R')}`, components: [row]})
            .then(message => {
                this.timer = new Timer(game.players, 150, [message], this.advancePhase.bind(this));
                this.game.rootMessage = message;
            });
        }
        else {
            game.createInteraction.reply(
            {
                content: `Welcome to Just One!\nThe game will start ${time(Math.floor(Date.now() / 1000) + 300, 'R')}!`, 
                components: [row], 
                fetchReply: true
            }).then(reply => {
                this.timer = new Timer(game.players, 300, [reply], this.advancePhase.bind(this));
                this.game.rootMessage = reply;
            });
        }
    }

    advancePhase(): void {
        this.events.forEach(event => {
            this.client.off(event.type, event.execute);
        });
        if (this.game instanceof JustOne) {
            this.game.currentPhase = new GiveHintPhase(this.game);
        }
    }
}

class GiveHintPhase extends Phase {
    name: string = "guess";
    game: JustOne;
    guesser: User;
    helper: Set<User>;
    hints: Map<User, string> = new Map();
    interactions: Map<User, Interaction> = new Map();
    word: string;
    events = [
        {
            name: "JustOneGiveHint",
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
                this.interactions.set(interaction.user, interaction);
            }
        },
        {
            name: "JustOneHintSubmission",
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
            name: "JustOneHurryUp",
            type: "interactionCreate", 
            execute: async (interaction: Interaction) => {
                if (interaction.guildId !== this.game.guildId || interaction.channelId !== this.game.channelId) return;
                if (!interaction.isButton()) return;
                if (interaction.customId !== "JustOneHurryUp") return;
                if (!this.timer.speedUp(interaction.user)) {
                    interaction.reply({content: "You already sped up the timer", ephemeral: true});
                    return;
                };
                const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('JustOneHurryUp')
                        .setLabel('Hurry Up!')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId("JustOneEditHint")
                        .setLabel("Edit Hint")
                        .setStyle(ButtonStyle.Secondary),
                );
                const update = interaction.message.content + `\nTimer sped up!`;
                interaction.update({content: update, components: [row]});
            }
        },
        {
            name: "JustOneEditHint",
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
        this.events.forEach(event => {
            this.game.client.off(event.type, event.execute);
        });
        if (this.game instanceof JustOne) {
            this.game.currentPhase = new RemoveInvalidPhase(this.game, this.interactions, {word: this.word, hints: this.hints, guesser: this.guesser});
        }
    }
    constructor(game: JustOne) {
        super();
        this.game = game;
        this.game.events = this.events;
        this.events.forEach(event => {
            this.game.client.on(event.type, event.execute);
        });

        if (this.game.guessnt.size > 0) {
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
        this.game.rootMessage?.edit({content: `It is ${this.guesser.username}'s turn to guess\n\nHint Submission is over ${time(Math.floor(this.timer.endTime / 1000), 'R')}`, components: [row]});
    }
}

class RemoveInvalidPhase extends Phase {
    name = "removeInvalid";
    events = [
        {
            name: "JustOneInvalid",
            type: "interactionCreate",
            execute: async (interaction: Interaction) => {
                if (interaction.guildId !== this.game.guildId || interaction.channelId !== this.game.channelId) return;
                if (!interaction.isSelectMenu()) return;
                if (interaction.customId !== "JustOneInvalid") return;
                interaction.values.forEach(value => {
                    const user = Array.from(this.game.players).find(user => user.id === value);
                    if (user) {
                        this.invalid.set(user, (this.invalid.get(user) ?? 0) + 1)
                    }
                });

                this.menuInteractions.set(interaction.user, interaction);

                let message = "Marked as invalid:\n";
                this.invalid.forEach((value, key) => {
                    message += `\t${this.state.hints.get(key)}: ${value}\n`;
                });

                const buttons = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('JustOneHurryUp')
                        .setLabel('Hurry Up!')
                        .setStyle(ButtonStyle.Primary));

                this.menuInteractions.forEach(interaction => {
                    interaction.update({content: message, components: [buttons]});
                });
            }
        },
        {
            name: "JustOneHurryUp",
            type: "interactionCreate", 
            execute: async (interaction: Interaction) => {
                if (interaction.guildId !== this.game.guildId || interaction.channelId !== this.game.channelId) return;
                if (!interaction.isButton()) return;
                if (interaction.customId !== "JustOneHurryUp") return;
                if (!this.timer.speedUp(interaction.user)) {
                    interaction.reply({content: "You already sped up the timer", ephemeral: true});
                    return;
                };
                const buttons = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('JustOneHurryUp')
                        .setLabel('Hurry Up!')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true));
                const update = interaction.message.content + `\nTimer sped up!`;
                interaction.update({content: update, components: [buttons]});
            }
        },
    ];
    invalid: Map<User, number> = new Map();
    joinable = false;
    game: JustOne;
    state: JustOneState;
    interactions: Map<User, Interaction>;
    menuInteractions: Map<User, SelectMenuInteraction> = new Map();
    timer: Timer;
    advancePhase(): void {
        this.events.forEach(event => {
            this.game.client.off(event.type, event.execute);
        });
        this.state.hints.forEach((_, key) => {
            if (this.invalid.has(key)) 
                this.state.hints.delete(key);
        });

        this.game.currentPhase = new GuessPhase(this.game, this.state);
    }
    
    constructor(game: JustOne, interactions:Map<User, Interaction>, state: JustOneState) {
        super();
        this.state = state;
        this.interactions = interactions;
        this.game = game;
        this.game.events = this.events;
        this.events.forEach(event => {
            this.game.client.on(event.type, event.execute);
        });

        this.interactions.forEach((interaction, _) => {
            if (!interaction.isButton()) return;

            const selectMenu = new SelectMenuBuilder()
                .setCustomId("JustOneInvalid")
                .setPlaceholder("Select the invalid hints")
                .setMinValues(0)
                .setMaxValues(this.state.hints.size)
            this.state.hints.forEach((hint, user) => {
                selectMenu.addOptions({label: hint, description: `${user.username}'s hint`, value: user.id});
            });
            const select = new ActionRowBuilder<SelectMenuBuilder>()
			.addComponents(selectMenu);
            const buttons = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('JustOneHurryUp')
                    .setLabel('Hurry Up!')
                    .setStyle(ButtonStyle.Primary));
            interaction.followUp({content: `Select all hints that are duplicate or similar to \"${this.state.word}\"`, ephemeral: true, components: [select, buttons]});
        });

        if (!this.game.rootMessage) throw new Error("Something went wrong\nNo rootMessage");

        this.timer = new Timer(new Set(this.game.players), 90, [this.game.rootMessage], this.advancePhase.bind(this));

        this.game.rootMessage?.edit({content: `Please select all hints that are duplicate or similar to the word\n\nTime is over ${time(Math.floor(this.timer.endTime / 1000), "R")}`, components: []});
    }
}

class GuessPhase extends Phase {
    name = "guess";
    events = [
        {
            name: "guessButton",
            type: "interactionCreate",
            execute: async (interaction: Interaction) => {
                if (interaction.guildId !== this.game.guildId || interaction.channelId !== this.game.channelId) return;
                if (!interaction.isButton()) return;
                if (interaction.customId !== "JustOneGuessButton") return;
                if (interaction.user.id !== this.state.guesser.id) {
                    interaction.reply({content: "You are not the guesser", ephemeral: true});
                    return;
                }
                const row = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
                    new TextInputBuilder()
                    .setCustomId('JustOneGuess')
                    .setPlaceholder('Enter your guess here')
                    .setMinLength(1).setMaxLength(100)
                    .setLabel(`Enter your guess`)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true),
                );

                const modal = new ModalBuilder().setTitle(`Submit your guess`).setCustomId("JustOneGuessModal").addComponents(row);
                interaction.showModal(modal);
            }
        },
        {
            name: "guess",
            type: "interactionCreate",
            execute: async (interaction: Interaction) => {
                if (interaction.guildId !== this.game.guildId || interaction.channelId !== this.game.channelId) return;
                if (!interaction.isModalSubmit()) return;
                if (interaction.customId !== "JustOneGuessModal") return;
                this.guess = interaction.fields.getTextInputValue("JustOneGuess");
                if (this.guess.toLowerCase() === this.state.word.toLowerCase()) {
                    this.game.rootMessage?.edit({content: `${this.state.guesser.username} guessed the word correctly\n\nThe word was ${this.state.word}`, components: []});
                    interaction.reply({content: "You guessed the word correctly", ephemeral: true});
                }
                else {
                    this.game.rootMessage?.edit({content: `${this.state.guesser.username} guessed the word incorrectly\n\nThe word was ${this.state.word}`, components: []});
                    interaction.reply({content: "You guessed the word incorrectly", ephemeral: true});
                }
                this.timer.stop();
            }
        }
    ];
    game: JustOne;
    state: JustOneState;
    joinable = false;
    timer: Timer;
    guess?: string = undefined;
    advancePhase(): void {
        this.events.forEach(event => {
            this.game.client.off(event.type, event.execute);
        });
        if (this.guess === undefined) {
            this.game.rootMessage?.edit({content: `${this.state.guesser.username} didn't guess in time!\n\nThe word was ${this.state.word}`, components: []});
        }
        this.game.currentPhase = new StartPhase(this.game);
    }
    
    constructor(game: JustOne, state: JustOneState) {
        super();
        this.game = game;
        this.game.events = this.events;
        this.events.forEach(event => {
            this.game.client.on(event.type, event.execute);
        });
        this.state = state;

        if (!this.game.rootMessage) throw new Error("Something went wrong\nNo rootMessage");

        this.timer = new Timer(new Set(this.game.players), 300, [this.game.rootMessage], this.advancePhase.bind(this));

        // TODO: Improve Message Styling
        let message = `It is ${this.state.guesser.username}'s turn to guess\n\n`;
        this.state.hints.forEach((hint, user) => {
            message += `${user.username}: ${hint}\n`;
        });
        message += `\nTime runs out ${time(Math.floor(this.timer.endTime / 1000), "R")}`;

        const buttons = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('JustOneGuessButton')
                    .setLabel('Guess')
                    .setStyle(ButtonStyle.Primary));

        this.game.rootMessage?.edit({content: message, components: [buttons]});
    }
}