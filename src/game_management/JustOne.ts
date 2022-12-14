import { Game, Phase, Event, Timer } from "./game.js";
import { Client, Interaction, User, time, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, ModalActionRowComponentBuilder, TextInputBuilder, TextInputStyle, SelectMenuBuilder, SelectMenuInteraction, EmbedBuilder, userMention, bold, italic } from "discord.js";
import wordpools from "../Data/wordpools.json";

export class JustOne extends Game {

    currentPhase: Phase;
    guessers: Array<User> = [];
    guessnt: Set<User>;
    lastGuesser?: User;
    options: JustOneOptions;
    wordpool: Array<string> = [];
    get players() {
        const players = new Set(this.guessers);
        this.guessnt.forEach(player => players.add(player));
        return players;
    }
    events: Array<Event> = [
        {
            name: "JustOneConfig",
            type: "interactionCreate",
            execute: async (interaction: Interaction) => {
                if (interaction.guildId !== this.guildId || interaction.channelId !== this.channelId) return;
                if (!interaction.isChatInputCommand()) return;
                if (interaction.commandName !== "config") return;

                if (interaction.options.getSubcommandGroup() === "wordpool") {
                    if (interaction.options.getSubcommand() === "list") {
                        interaction.reply({ content: "Current wordpools:\n" + this.options.wordpools.map(wordpool => bold(wordpool)).join(", "), ephemeral: true });
                        return;
                    }

                    if (interaction.options.getSubcommand() === "add") {
                        const pool = interaction.options.getInteger("pool");
                        if (pool === null) return;

                        const wordpool = wordpools[this.options.language][pool].name;
                        if (wordpool === undefined) return;
                        if (this.options.wordpools.includes(wordpool)) {
                            interaction.reply({ content: "This wordpool is already in use", ephemeral: true });
                            return;
                        }

                        this.options.wordpools.push(wordpool);
                        interaction.reply({ content: `Added ${wordpool} to the wordpools`, ephemeral: true });

                    } else if (interaction.options.getSubcommand() === "remove") {
                        const pool = interaction.options.getInteger("pool");
                        if (pool === null) return;

                        const wordpool = wordpools[this.options.language][pool].name;

                        const newWordpool = this.options.wordpools.filter(pool => pool !== wordpool);
                        if (newWordpool.length < 1) {
                            interaction.reply({ content: "You cannot remove all wordpools", ephemeral: true });
                            return;
                        }
                        this.options.wordpools = newWordpool;

                        interaction.reply({ content: `Removed ${wordpool} from the wordpools`, ephemeral: true });
                    }

                    const selectedPools = new Set(this.options.wordpools);
                    wordpools[this.options.language].forEach(wordpool => {
                        if (selectedPools.has(wordpool.name))
                            this.wordpool.push(...wordpool.words);
                    });
                }
                if (interaction.options.getSubcommand() === "time") {
                    const start = interaction.options.getInteger("start");
                    if (start) this.options.startTime = start;

                    const hint = interaction.options.getInteger("hint");
                    if (hint) this.options.hintTime = hint;

                    const guess = interaction.options.getInteger("guess");
                    if (guess) this.options.guessTime = guess;

                    const invalidhints = interaction.options.getInteger("invalidhints");
                    if (invalidhints) this.options.invalidHintTime = invalidhints;

                    const restart = interaction.options.getInteger("restart");
                    if (restart) this.options.restartTime = restart;

                    interaction.reply({ content: `Updated the times\nNew Times are:\nstart: ${this.options.startTime} seconds\nhint: ${this.options.hintTime} seconds\ninvalid Hints: ${this.options.invalidHintTime} seconds\nguess: ${this.options.guessTime} seconds\nrestart: ${this.options.restartTime} seconds`, ephemeral: true });
                }
            }
        }
    ]
    constructor(client: Client, guildId: string, channelId: string, players: Set<User>, createInteraction?: Interaction, options?: JustOneOptions) {
        super(client, guildId, channelId, createInteraction);
        this.guessnt = new Set(players);
        this.options = options ?? new JustOneOptions();
        const selectedPools = new Set(this.options.wordpools);
        wordpools[options?.language ?? "de"].forEach(wordpool => {
            if (selectedPools.has(wordpool.name))
                this.wordpool.push(...wordpool.words);
        });
        this.events.forEach(event => {
            this.client.on(event.type, event.execute);
        });
        this.currentPhase = new StartPhase(this);
    }

    async stop() {
        this.currentPhase.timer?.destroy();
        this.events.forEach(event => {
            this.client.off(event.type, event.execute);
        });
        await this.rootMessage?.edit({ content: `This game has been aborted\n\nThis message will destroy itself ${time(Math.floor(Date.now() / 1000) + 10, 'R')}`, embeds: [], components: [] });
        new Timer(new Set([]), 10, [this.rootMessage!], () => {
            this.rootMessage?.edit({ content: bold("Boom"), embeds: [], components: [] });
            setTimeout(() => {
                this.rootMessage?.delete();
            }, 1000);
        });
    }
}

type JustOneState = {
    word: string,
    guesser: User,
    hints: Map<User, string>,
}

class JustOneOptions {
    wordpools: string[] = ["classic_main"];
    language: keyof typeof wordpools = 'de';
    startTime: number = 300;
    hintTime: number = 180;
    invalidHintTime: number = 90;
    guessTime: number = 300;
    restartTime: number = 150;
};

class StartPhase extends Phase {
    name = "start";
    joinable = true;
    timer?: Timer;
    client: Client;
    game: JustOne;

    constructor(game: JustOne) {
        super();
        this.game = game;
        this.client = game.client;
        this.game.events = [...this.game.events, ...this.events];
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
            const embed = new EmbedBuilder()
                .setAuthor({ name: 'Just One' })
                .setTitle('Starting a new Round of Just One!')
                .setDescription(`The game will start ${time(Math.floor(Date.now() / 1000) + this.game.options.restartTime, 'R')}`)
                .setThumbnail('https://cdn.svc.asmodee.net/production-rprod/storage/games/justone/justone-logo-1604323546mSp1o-large.png')
                .setTimestamp()
                .setColor(0x2f3136);
            const leave = new ButtonBuilder()
                .setCustomId('JustOneLeave')
                .setLabel('Leave')
                .setStyle(ButtonStyle.Danger);
            row.addComponents(leave);
            game.rootMessage?.reply({ embeds: [embed], components: [row] })
                .then(message => {
                    this.timer = new Timer(game.players, this.game.options.restartTime, [message], this.advancePhase.bind(this));
                    this.game.rootMessage = message;
                });
        }
        else {
            const embed = new EmbedBuilder()
                .setAuthor({ name: 'Just One' })
                .setTitle('Welcome to Just One!')
                .setDescription(`The game will start ${time(Math.floor(Date.now() / 1000) + this.game.options.startTime, 'R')}`)
                .setThumbnail('https://cdn.svc.asmodee.net/production-rprod/storage/games/justone/justone-logo-1604323546mSp1o-large.png')
                .setTimestamp()
                .setColor(0x2f3136);
            game.createInteraction.reply(
                {
                    embeds: [embed],
                    components: [row],
                    fetchReply: true
                }).then(reply => {
                    this.timer = new Timer(game.players, this.game.options.startTime, [reply], this.advancePhase.bind(this));
                    this.game.rootMessage = reply;
                });
        }
    }

    events = [
        {
            name: "JustOneJoin",
            type: "interactionCreate",
            execute: async (interaction: Interaction) => {
                if (interaction.guildId !== this.game.guildId || interaction.channelId !== this.game.channelId) return;
                if (!interaction.isButton()) return;
                if (interaction.customId !== "JustOneJoin") return;
                if (!this.joinable) {
                    interaction.reply({ content: "No more players can currently join this game", ephemeral: true });
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
                    interaction.reply({ content: "You are already in this game", ephemeral: true, components: [row] });
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
                    interaction.reply({ content: "You already sped up the timer", ephemeral: true });
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
                interaction.update({ content: update, components: [row] });
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
                    interaction.reply({ content: "You are not in this game", ephemeral: true });
                    return;
                }
                if (this.game.guessers.includes(interaction.user)) {
                    this.game.guessers.splice(this.game.guessers.indexOf(interaction.user), 1);
                }
                if (this.game.guessnt.has(interaction.user)) {
                    this.game.guessnt.delete(interaction.user);
                }
                this.timer?.authorisedUsers.delete(interaction.user);
                interaction.reply({ content: `${interaction.user.username} has left the game`, ephemeral: true });
            }
        }
    ];

    advancePhase(): void {
        this.events.forEach(event => {
            this.client.off(event.type, event.execute);
        });
        const oldEvents = new Set(this.events);
        this.game.events = this.game.events.filter(event => !oldEvents.has(event));

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
    joinable = false;
    timer: Timer;

    constructor(game: JustOne) {
        super();
        this.game = game;
        this.game.events = [...this.game.events, ...this.events];
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

        this.word = this.game.wordpool[Math.random() * this.game.wordpool.length | 0];

        if (!this.game.rootMessage) throw new Error("Something went wrong\nNo rootMessage");

        this.timer = new Timer(new Set(this.helper), this.game.options.hintTime, [this.game.rootMessage], this.advancePhase.bind(this));

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('JustOneGiveHint')
                    .setLabel('Give a hint!')
                    .setStyle(ButtonStyle.Primary),
            );
        const embed = new EmbedBuilder()
            .setAuthor({ name: 'Just One', iconURL: (this.guesser.avatarURL() ?? undefined) })
            .setDescription(`${bold("It's " + userMention(this.guesser.id) + "'s turn to guess!")}\n\nSubmit your ${bold("Hints")} now!\n\nHint submission is over ${time(Math.floor(this.timer.endTime / 1000), 'R')}`)
            .setThumbnail('https://cdn.svc.asmodee.net/production-rprod/storage/games/justone/justone-logo-1604323546mSp1o-large.png')
            .setTimestamp()
            .setColor(0x2f3136);
        this.game.rootMessage?.edit({ embeds: [embed], components: [row] });
    }

    events = [
        {
            name: "JustOneGiveHint",
            type: "interactionCreate",
            execute: async (interaction: Interaction) => {
                if (interaction.guildId !== this.game.guildId || interaction.channelId !== this.game.channelId) return;
                if (!interaction.isButton()) return;
                if (interaction.customId !== "JustOneGiveHint") return;
                if (!this.helper.has(interaction.user)) {
                    await interaction.reply({ content: "You can't give a hint", ephemeral: true });
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
            name: "JustOneHintSubmission",
            type: "interactionCreate",
            execute: async (interaction: Interaction) => {
                if (interaction.guildId !== this.game.guildId || interaction.channelId !== this.game.channelId) return;
                if (!interaction.isModalSubmit()) return;
                if (interaction.customId !== "JustOneHintModal") return;
                if (!this.helper.has(interaction.user)) {
                    await interaction.reply({ content: "You can't give a hint", ephemeral: true });
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
                await interaction.reply({ content: `Your Hint for \"${this.word}\" is \"${hint}"`, components: [row], ephemeral: true });
                this.interactions.set(interaction.user, interaction);
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
                    interaction.reply({ content: "You didn't give a hint", ephemeral: true });
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
        },
        {
            name: "JustOneHurryUp",
            type: "interactionCreate",
            execute: async (interaction: Interaction) => {
                if (interaction.guildId !== this.game.guildId || interaction.channelId !== this.game.channelId) return;
                if (!interaction.isButton()) return;
                if (interaction.customId !== "JustOneHurryUp") return;
                if (!this.timer.speedUp(interaction.user)) {
                    interaction.reply({ content: "You already sped up the timer", ephemeral: true });
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
                interaction.update({ content: update, components: [row] });
            }
        }
    ];

    advancePhase(): void {
        this.events.forEach(event => {
            this.game.client.off(event.type, event.execute);
        });
        const oldEvents = new Set(this.events);
        this.game.events = this.game.events.filter(event => !oldEvents.has(event));

        if (this.game instanceof JustOne) {
            this.game.currentPhase = new RemoveInvalidPhase(this.game, this.interactions, { word: this.word, hints: this.hints, guesser: this.guesser });
        }
    }
}

class RemoveInvalidPhase extends Phase {
    name = "removeInvalid";
    invalid: Map<User, number> = new Map();
    joinable = false;
    game: JustOne;
    state: JustOneState;
    interactions: Map<User, Interaction>;
    menuInteractions: Map<User, SelectMenuInteraction> = new Map();
    timer: Timer;

    constructor(game: JustOne, interactions: Map<User, Interaction>, state: JustOneState) {
        super();
        this.state = state;
        this.interactions = interactions;
        this.game = game;
        this.game.events = [...this.game.events, ...this.events];
        this.events.forEach(event => {
            this.game.client.on(event.type, event.execute);
        });

        this.interactions.forEach((interaction, _) => {
            if (!interaction.isModalSubmit()) return;

            const selectMenu = new SelectMenuBuilder()
                .setCustomId("JustOneInvalid")
                .setPlaceholder("Select the invalid hints")
                .setMinValues(0)
                .setMaxValues(this.state.hints.size)
            this.state.hints.forEach((hint, user) => {
                selectMenu.addOptions({ label: hint, description: `${user.username}'s hint`, value: user.id });
            });
            const select = new ActionRowBuilder<SelectMenuBuilder>()
                .addComponents(selectMenu);
            const buttons = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('JustOneHurryUp')
                        .setLabel('Hurry Up!')
                        .setStyle(ButtonStyle.Primary));
            interaction.followUp({ content: `Select all hints that are duplicate or similar to \"${this.state.word}\"`, ephemeral: true, components: [select, buttons] });
        });

        if (!this.game.rootMessage) throw new Error("Something went wrong\nNo rootMessage");

        this.timer = new Timer(new Set(this.game.players), this.game.options.invalidHintTime, [this.game.rootMessage], this.advancePhase.bind(this));
        const embed = new EmbedBuilder()
            .setAuthor({ name: 'Just One', iconURL: (this.state.guesser.avatarURL() ?? undefined) })
            .setTitle(`${this.state.guesser.username} is the guesser`)
            .setDescription(`Please select all hints that are duplicate or similar to the word.\nPress \"Hurry up!\" if all are valid.\n\nTime is over ${time(Math.floor(this.timer.endTime / 1000), "R")}`)
            .setThumbnail('https://cdn.svc.asmodee.net/production-rprod/storage/games/justone/justone-logo-1604323546mSp1o-large.png')
            .setTimestamp()
            .setColor(0x2f3136);
        this.game.rootMessage?.edit({ embeds: [embed], components: [] });
    }

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
                    interaction.update({ content: message, components: [buttons] });
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
                    interaction.reply({ content: "You already sped up the timer", ephemeral: true });
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
                interaction.update({ content: update, components: [buttons] });
            }
        },
    ];

    advancePhase(): void {
        this.events.forEach(event => {
            this.game.client.off(event.type, event.execute);
        });
        const oldEvents = new Set(this.events);
        this.game.events = this.game.events.filter(event => !oldEvents.has(event));

        this.state.hints.forEach((_, key) => {
            if (this.invalid.has(key))
                this.state.hints.delete(key);
        });

        this.game.currentPhase = new GuessPhase(this.game, this.state);
    }
}

class GuessPhase extends Phase {
    name = "guess";
    game: JustOne;
    state: JustOneState;
    joinable = false;
    timer: Timer;
    guess?: string = undefined;

    constructor(game: JustOne, state: JustOneState) {
        super();
        this.game = game;
        this.game.events = [...this.game.events, ...this.events];
        this.events.forEach(event => {
            this.game.client.on(event.type, event.execute);
        });
        this.state = state;

        if (!this.game.rootMessage) throw new Error("Something went wrong\nNo rootMessage");

        this.timer = new Timer(new Set(this.game.players), this.game.options.guessTime, [this.game.rootMessage], this.advancePhase.bind(this));

        const buttons = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('JustOneGuessButton')
                    .setLabel('Guess')
                    .setStyle(ButtonStyle.Primary));

        const embed = new EmbedBuilder()
            .setAuthor({ name: 'Just One', iconURL: (this.state.guesser.avatarURL() ?? undefined) })
            .setTitle(`Time to guess!`)
            .setDescription(`${userMention(this.state.guesser.id)} can now guess the word!\n\nYour time runs out ${time(Math.floor(this.timer.endTime / 1000), "R")}\n\n\n${bold("Your hints are:")}`)
            .setThumbnail('https://cdn.svc.asmodee.net/production-rprod/storage/games/justone/justone-logo-1604323546mSp1o-large.png')
            .setTimestamp()
            .setColor(0x2f3136);
        this.state.hints.forEach((hint, user) => {
            embed.addFields({ name: hint, value: userMention(user.id), inline: true });
        });
        this.game.rootMessage?.edit({ embeds: [embed], components: [buttons] });
    }

    events = [
        {
            name: "guessButton",
            type: "interactionCreate",
            execute: async (interaction: Interaction) => {
                if (interaction.guildId !== this.game.guildId || interaction.channelId !== this.game.channelId) return;
                if (!interaction.isButton()) return;
                if (interaction.customId !== "JustOneGuessButton") return;
                if (interaction.user.id !== this.state.guesser.id) {
                    interaction.reply({ content: "You are not the guesser", ephemeral: true });
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
                this.guess = this.guess.trimStart().trimEnd();
                const embed = new EmbedBuilder()
                    .setAuthor({ name: 'Just One', iconURL: (this.state.guesser.avatarURL() ?? undefined) })
                    .setThumbnail('https://cdn.svc.asmodee.net/production-rprod/storage/games/justone/justone-logo-1604323546mSp1o-large.png')
                    .setTimestamp()
                    .setColor(0x2f3136)
                    .setDescription(`The word was ${italic(this.state.word)}\n\n${bold("The hints were:")}`);
                this.state.hints.forEach((hint, user) => {
                    embed.addFields({ name: hint, value: userMention(user.id), inline: true });
                });
                if (this.guess.toLowerCase() === this.state.word.toLowerCase()) {
                    embed.setTitle(`${this.state.guesser.username} guessed ${this.state.word} correctly!`);
                    this.game.rootMessage?.edit({ embeds: [embed], components: [] });
                    interaction.reply({ content: "Your guess was right!", ephemeral: true });
                }
                else {
                    embed.setTitle(`${this.state.guesser.username} guessed ${this.guess}`);
                    this.game.rootMessage?.edit({ embeds: [embed], components: [] });
                    interaction.reply({ content: "Your guess was wrong", ephemeral: true });
                }
                this.timer.stop();
            }
        }
    ];

    advancePhase(): void {
        this.events.forEach(event => {
            this.game.client.off(event.type, event.execute);
        });
        const oldEvents = new Set(this.events);
        this.game.events = this.game.events.filter(event => !oldEvents.has(event));

        if (this.guess === undefined) {
            const embed = new EmbedBuilder()
                .setAuthor({ name: 'Just One', iconURL: (this.state.guesser.avatarURL() ?? undefined) })
                .setThumbnail('https://cdn.svc.asmodee.net/production-rprod/storage/games/justone/justone-logo-1604323546mSp1o-large.png')
                .setTimestamp()
                .setColor(0x2f3136)
                .setTitle(`${this.state.guesser.username} did not guess in time!`)
                .setDescription(`The word was ${italic(this.state.word)}\n\n${bold("The hints were:")}`);
            this.game.rootMessage?.edit({ embeds: [embed], components: [] });
        }
        this.game.currentPhase = new StartPhase(this.game);
    }
}