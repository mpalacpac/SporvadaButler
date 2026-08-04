import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { db } from '../../utils/database.js';

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
        await interaction.deferReply({ flags: 0 });

        const guildId = interaction.guild.id;
        const mapName = interaction.options.getString('map_name');
        const width = interaction.options.getInteger('width');
        const height = interaction.options.getInteger('height');

        try {
            if (!db.initialized) {
                await db.initialize();
            }

            if (!db.isAvailable() || typeof db.db?.pool?.query !== 'function') {
                return interaction.editReply({ content: '❌ PostgreSQL database pool is not available.' });
            }

            // Automatically create missing tables on the fly
            await db.db.pool.query(`
                CREATE TABLE IF NOT EXISTS map_configs (
                    guild_id VARCHAR(32) PRIMARY KEY,
                    map_name VARCHAR(100) NOT NULL,
                    width_pixels INTEGER NOT NULL,
                    height_pixels INTEGER NOT NULL,
                    grid_resolution INTEGER DEFAULT 100,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS map_nations (
                    id SERIAL PRIMARY KEY,
                    guild_id VARCHAR(32) NOT NULL,
                    nation_name VARCHAR(100) NOT NULL,
                    owner_discord_id VARCHAR(32) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS map_sectors (
                    id SERIAL PRIMARY KEY,
                    guild_id VARCHAR(32) NOT NULL,
                    sector_code VARCHAR(10) NOT NULL,
                    coord_x INTEGER DEFAULT 0,
                    coord_y INTEGER DEFAULT 0,
                    terrain_type VARCHAR(20) NOT NULL DEFAULT 'land',
                    owner_nation_id INTEGER REFERENCES map_nations(id) ON DELETE SET NULL,
                    UNIQUE(guild_id, sector_code)
                );
            `);

            const queryText = `
                INSERT INTO map_configs (guild_id, map_name, width_pixels, height_pixels, grid_resolution)
                VALUES ($1, $2, $3, $4, 100)
                ON CONFLICT (guild_id) 
                DO UPDATE SET map_name = EXCLUDED.map_name, 
                              width_pixels = EXCLUDED.width_pixels, 
                              height_pixels = EXCLUDED.height_pixels;
            `;
            await db.db.pool.query(queryText, [guildId, mapName, width, height]);

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