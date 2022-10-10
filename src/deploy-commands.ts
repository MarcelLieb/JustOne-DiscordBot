import { REST, SlashCommandBuilder, Routes } from 'discord.js';
import wordpools from "./Data/wordpools.json";
import dotenv from 'dotenv';
dotenv.config();
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
if (!token || !clientId || !guildId) {
    throw new Error('Missing environment variables');
}

const wordpoolOptions: Map<string, string[]> = new Map();
for (const language of Object.keys(wordpools) as (keyof typeof wordpools)[]) {
	wordpoolOptions.set(language, wordpools[language].map<string>(wordpool => wordpool.name));
}

const config = new SlashCommandBuilder()
	.setName('config')
	.setDescription('Configures the current game in this channel')
	.addSubcommandGroup(group => group
		.setName('wordpool')
		.setDescription('Configures the wordpool for the current game')
		.addSubcommand((cmd) => cmd
			.setName('add')
			.setDescription('Adds a wordpool to the current game')
			.addIntegerOption( option => option
				.setName('pool')
				.setDescription('The wordpool to add')
				// TODO: Find solution for dynamic language, could use autocomplete
				.addChoices(...wordpoolOptions.get('de')!.map((wordpool, index) => {return {name: wordpool, value: index}}))
				.setRequired(true)
			)
		)
		.addSubcommand((cmd) => cmd
			.setName('remove')
			.setDescription('Removes a wordpool from the current game')
			.addIntegerOption(option => option
				.setName('pool')
				.setDescription('The wordpool to remove')
				// TODO: Find Solution for dynamic language, could use autocomplete
				.addChoices(...wordpoolOptions.get('de')!.map((wordpool, index) => {return {name: wordpool, value: index}}))
				.setRequired(true)
			)
		)
		.addSubcommand((cmd) => cmd
			.setName('list')
			.setDescription('Lists all wordpools in the current game')
		)
	)
	.addSubcommand((cmd) => cmd
		.setName('time')
		.setDescription('Configures the time limit for each phase')
		.addIntegerOption(option => option
			.setName('start')
			.setDescription('How long it will take for a new game to start in seconds (Defaults to 300)')
			.setMaxValue(15*50)
			.setMinValue(15)
		)
		.addIntegerOption(option => option
			.setName('hint')
			.setDescription('How long you will be able to submit hints in seconds (Defaults to 180)')
			.setMaxValue(15*50)
			.setMinValue(15)
		)
		.addIntegerOption(option => option
			.setName('invalidhints')
			.setDescription('How long you have to mark invalid hints in seconds (Defaults to 90)')
			.setMaxValue(15*50)
			.setMinValue(15)
		)
		.addIntegerOption(option => option
			.setName('guess')
			.setDescription('How long you have to submit a guess in seconds (Defaults to 300)')
			.setMaxValue(15*50)
			.setMinValue(15)
		)
		.addIntegerOption(option => option
			.setName('restart')
			.setDescription('How long it will take for another round to start in seconds  (Defaults to 150)')
			.setMaxValue(15*50)
			.setMinValue(15)
		)
	)
	/*
	Uncomment if there are more languages
	.addSubcommand((cmd) => cmd
		.setName('language')
		.setDescription('Sets the language for the current game')
		.addStringOption(option => option
			.setName('language')
			.setDescription('The language to use')
			.addChoices(...Object.keys(wordpools).map((language) => {
				return {name: language, value: language}
			}))
			.setRequired(true)
		)
	)*/
const commands = [
	new SlashCommandBuilder().setName('start').setDescription('Start a new JustOne Game').setDMPermission(false),
	new SlashCommandBuilder().setName('stop').setDescription('Stops the current game in this channel').setDMPermission(false),
	config,
]
	.map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands })
	.then((data) => console.log(`Successfully registered application commands.`))
	.catch(console.error);