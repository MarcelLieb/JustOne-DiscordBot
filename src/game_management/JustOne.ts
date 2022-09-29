import { Game, Phase, Event, Timer } from "./game.js";
import { Client, Interaction, User, time, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export class JustOne extends Game {

    currentPhase: Phase;
    events: Array<Event>;
    constructor(client: Client, guildId: string, channelId: string, players: Set<User>, createInteraction?: Interaction) {
        super(client, guildId, channelId, players, createInteraction);
        this.currentPhase = new JustOneStartPhase(this);
        this.events = this.currentPhase.events;
    }

}

class JustOneStartPhase extends Phase {
    name = "start";
    joinable = true;
    timer?: Timer;
    client: Client;
    game: Game;
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

                this.game.players.add(interaction.user);
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
    
    constructor(game: Game) {
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
            this.timer = new Timer(game.players, 300, [reply], () => {});
            this.game.rootMessage = reply;
        });
    }
}