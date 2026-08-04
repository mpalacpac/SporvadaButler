import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import db from '../../utils/database.js';

export default {
    data: new SlashCommandBuilder()
        .setName('map-setup')
        .setDescription('Initialize or update the regional custom map settings.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('map_name')
                .setDescription('The name of your NationStates region or custom world')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('width')
                .setDescription('Width of the map image in pixels (e.g., 4000)')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('height')
                .setDescription('Height of the map image in pixels (e.g., 3000)')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        const guildId = interaction.guild.id;
        const mapName = interaction.options.getString('map_name');
        const width = interaction.options.getInteger('width');
        const height = interaction.options.getInteger('height');

        try {
            const query = `
                INSERT INTO map_configs (guild_id, map_name, width_pixels, height_pixels, grid_resolution)
                VALUES ($1, $2, $3, $4, 100)
                ON CONFLICT (guild_id) 
                DO UPDATE SET map_name = EXCLUDED.map_name, 
                              width_pixels = EXCLUDED.width_pixels, 
                              height_pixels = EXCLUDED.height_pixels;
            `;
            await db.query(query, [guildId, mapName, width, height]);

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🗺️ Regional Map Initialized!')
                .setDescription(`Successfully configured the world map for **${mapName}**.`)
                .addFields(
                    { name: 'Canvas Dimensions', value: `${width}px x ${height}px`, inline: true },
                    { name: 'Grid Resolution', value: '100x100 Micro-Sectors', inline: true }
                )
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error setting up map configuration:', error);
            return interaction.editReply({ content: '❌ An error occurred while saving the map configuration to the database.' });
        }
    },
};