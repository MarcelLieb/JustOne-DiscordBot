// Require the necessary discord.js classes
import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import { Game } from './game_management/game.js';
import { JustOne } from './game_management/JustOne.js';
dotenv.config();
const token = process.env.DISCORD_TOKEN;

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// When the client is ready, run this code (only once)
client.once('ready', () => {
	console.log('Ready!');
});

const games = new Array<Game>();

client.on('interactionCreate', async interaction => {
	if (!interaction.isChatInputCommand()) return;

	const { commandName } = interaction;

	if (commandName === 'start') {
		if (games.find(game => game.guildId === interaction.guildId && game.channelId === interaction.channelId)) {
			await interaction.reply({ content: 'There is already a game in this channel', ephemeral: true });
			return;
		}
		if (interaction.guildId === null) return;
		const game = new JustOne(client, interaction.guildId, interaction.channelId, new Set(), interaction);
		games.push(game);
	}
	if (commandName === 'stop') {
		const game = games.find(game => game.guildId === interaction.guildId && game.channelId === interaction.channelId);
		if (game) {
			await game.stop();
			games.splice(games.indexOf(game), 1);
			interaction.reply({ content: 'Game stopped', ephemeral: true });
			return;
		}
		interaction.reply({ content: 'There is no game in this channel', ephemeral: true });
	}
});

// Login to Discord with your client's token
client.login(token);
