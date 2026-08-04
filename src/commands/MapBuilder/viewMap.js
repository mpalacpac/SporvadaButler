import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { db } from '../../utils/database.js';

export default {
    data: new SlashCommandBuilder()
        .setName('view-map')
        .setDescription('View the current regional map statistics, configuration, and nation territories.'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        const guildId = interaction.guild.id;

        try {
            if (!db.initialized) {
                await db.initialize();
            }

            if (!db.isAvailable() || typeof db.db?.pool?.query !== 'function') {
                return interaction.editReply({ content: '❌ PostgreSQL database pool is not available.' });
            }

            const configResult = await db.db.pool.query('SELECT * FROM map_configs WHERE guild_id = $1', [guildId]);
            if (configResult.rows.length === 0) {
                return interaction.editReply({ content: '❌ The regional map has not been initialized yet. Run `/map-setup` first.' });
            }

            const mapConfig = configResult.rows[0];

            const sectorsResult = await db.db.pool.query(
                'SELECT terrain_type, COUNT(*) as count FROM map_sectors WHERE guild_id = $1 GROUP BY terrain_type',
                [guildId]
            );

            let landCount = 0;
            let oceanCount = 0;
            sectorsResult.rows.forEach(row => {
                if (row.terrain_type === 'land') landCount = parseInt(row.count);
                if (row.terrain_type === 'ocean') oceanCount = parseInt(row.count);
            });

            const nationsResult = await db.db.pool.query(`
                SELECT n.nation_name, COUNT(s.sector_code) as claimed_sectors 
                FROM map_nations n 
                LEFT JOIN map_sectors s ON n.id = s.owner_nation_id 
                WHERE n.guild_id = $1 
                GROUP BY n.id, n.nation_name
                ORDER BY claimed_sectors DESC
            `, [guildId]);

            let nationsList = 'No nations registered yet.';
            if (nationsResult.rows.length > 0) {
                nationsList = nationsResult.rows
                    .map(n => `• **${n.nation_name}**: ${n.claimed_sectors} micro-sector(s)`)
                    .join('\n');
            }

            const embed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle(`🗺️ Regional Overview: ${mapConfig.map_name}`)
                .setDescription('Current geographic and political breakdown of the custom world grid.')
                .addFields(
                    { name: 'Canvas Size', value: `${mapConfig.width_pixels}px × ${mapConfig.height_pixels}px`, inline: true },
                    { name: 'Grid Resolution', value: `${mapConfig.grid_resolution}×${mapConfig.grid_resolution} Matrix`, inline: true },
                    { name: 'Terrain Breakdown', value: `🟩 Land Sectors: ${landCount}\n🟦 Ocean Sectors: ${oceanCount}`, inline: false },
                    { name: 'Registered Nations & Territories', value: nationsList, inline: false }
                )
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error viewing map stats:', error);
            return interaction.editReply({ content: '❌ An error occurred while retrieving map statistics from the database.' });
        }
    },
};