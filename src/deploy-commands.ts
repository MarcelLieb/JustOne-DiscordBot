import { REST, SlashCommandBuilder, Routes } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
if (!token || !clientId || !guildId) {
    throw new Error('Missing environment variables');
}

const commands = [
	new SlashCommandBuilder().setName('start').setDescription('Start a new JustOne Game').setDMPermission(false),
	new SlashCommandBuilder().setName('stop').setDescription('Stops the current game in this channel').setDMPermission(false),
]
	.map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands })
	.then((data) => console.log(`Successfully registered application commands.`))
	.catch(console.error);